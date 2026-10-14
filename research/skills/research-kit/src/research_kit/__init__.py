"""research_kit —— 研究层的 kernel 侧只读工具箱。

纯函数，读 server 维护的派生缓存 register.json；`counters` 额外只读 journal.jsonl
（它本来就是唯一权威，分歧时以 MCP `research_state` 为准）。本模块**绝不写**
`.proma-research/`——写路径只有 research-mcp（第二个写者会触发 P3.3 防篡改，
且失去 UI 可见性）。

kernel 跨压缩存活：`anchor()` 的结果同时存进模块变量 `LAST`，压缩后
`print(research_kit.LAST)` 一行找回信念状态，不必重新拉取。
"""

from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path
from typing import Any

from . import anchor_parts
from .jobs import collect, field, job_name, new_job, parse_status, wait

LAST: str = ""


def _root(run: str) -> Path:
    """run 名解析：绝对路径/含分隔符/目录里真有 register.json 时当路径用，
    否则接 cwd/.proma-research/——否则 anchor("research") 会撞上同名源码目录。"""
    candidate = Path(run)
    if candidate.is_absolute() or "/" in run or (candidate / "register.json").is_file():
        return candidate
    return Path.cwd() / ".proma-research" / run


def _register(run: str) -> dict[str, Any]:
    path = _root(run) / "register.json"
    if not path.is_file():
        raise FileNotFoundError(
            f"register.json 不存在：{path} —— run 未初始化（先 research_init）或 run 名/路径不对"
        )
    return json.loads(path.read_text(encoding="utf-8"))


def _prereg(run: str, pid: str) -> dict[str, Any] | None:
    path = _root(run) / "prereg" / f"{pid}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _journal(run: str) -> list[dict[str, Any]]:
    """只读 journal.jsonl；坏行跳过（防伪造是 trace gate 的职责，不是这里的）。"""
    path = _root(run) / "journal.jsonl"
    if not path.is_file():
        return []
    events: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


# 攻击债的清偿事件按 kind 分开：new_h 攻击要求一次 claim.propose（把替代解释
# 登记成正式假设）；constraint 攻击要求一次设计变更（prereg.write 带上对应控制）
# 或 propose；report.declare 把余债落成报告的收窄声明。这是可数代理，不是语义
# 判定——server 分不出"消化了这条攻击的 prereg"和"无关的 prereg"，天花板照实说。
_CLEARS_NEW_H = frozenset({"claim.propose", "report.declare"})
_CLEARS_CONSTRAINT = frozenset({"claim.propose", "prereg.write", "report.declare"})


def counters(run: str) -> dict[str, Any]:
    """元认知计数器：锁死框架的 agent 注意不到自己的前提，但它会数数。

    全部从 journal 只读计算（存量取 register），调度表在 research-moves 的
    SKILL.md：

    - ``landed_since_transition``：最近一次信念变化（claim.transition 或
      claim.propose）之后成功落地（exit 0）的探针数。连续落地而信念不动 =
      装饰性探针流。
    - ``attack_debt``：未清偿的 new_h/constraint 攻击数。mode run 读 register 的
      ``debts``（MCP 按 claim 记）；legacy 按 journal 代理计（清偿事件按 kind 分开，
      见 ``_CLEARS_*``）。债未清不开新方向（research-loop 纪律的可数形式）。
    - ``deaths_by_probe``：REFUTED/SCOPED 按 by_probe 分组。同一探针杀死多条
      假设，说明它们可能不是独立机制。
    - ``live`` / ``graveyard``：存量；mode run 的 ``live`` 是活集（含 lead / narrowed /
      SUPPORTED，与 MCP ``isAlive`` 一致），legacy 只数 LIVE。
    - ``concluded``：已有通过的 gate 裁决（战役已结案，提示不再触发）。
    """
    events = _journal(run)
    last_belief_change = max(
        (
            i
            for i, e in enumerate(events)
            if e.get("op") in ("claim.transition", "claim.propose")
        ),
        default=-1,
    )
    landed_since = sum(
        1
        for e in events[last_belief_change + 1 :]
        if e.get("op") == "probe.land" and e.get("exit_code") == 0
    )
    last_new_h_clear = max(
        (i for i, e in enumerate(events) if e.get("op") in _CLEARS_NEW_H), default=-1
    )
    last_constraint_clear = max(
        (i for i, e in enumerate(events) if e.get("op") in _CLEARS_CONSTRAINT), default=-1
    )
    attack_debt = sum(
        1
        for i, e in enumerate(events)
        if e.get("op") == "attack.record"
        and (
            (e.get("kind") == "new_h" and i > last_new_h_clear)
            or (e.get("kind") == "constraint" and i > last_constraint_clear)
        )
    )
    reg = _register(run)
    if isinstance(reg.get("debts"), list):
        # mode run：MCP 按 claim 记债（点名该 claim 的 prereg / report_declare 才清），以它为准
        attack_debt = len(reg["debts"])
    deaths: dict[str, int] = {}
    for e in events:
        if e.get("op") == "claim.transition" and e.get("to") in ("REFUTED", "SCOPED"):
            pid = str(e.get("by_probe") or "?")
            deaths[pid] = deaths.get(pid, 0) + 1
    verdicts = reg.get("gateVerdicts", [])
    mode = anchor_parts.intake(reg, events)["mode"]
    return {
        "landed_since_transition": landed_since,
        "attack_debt": attack_debt,
        "deaths_by_probe": deaths,
        "live": len(anchor_parts.alive_claims(reg, mode)),
        "graveyard": len(reg.get("graveyard", [])),
        "concluded": bool(verdicts) and bool(verdicts[-1].get("passed")),
    }


def _counter_lines(c: dict[str, Any]) -> list[str]:
    """anchor 的 COUNTERS 段：一行数据 + 命中阈值才出现的 ⚠ 调度提示。"""
    tail = " · 已结案" if c["concluded"] else ""
    lines = [
        f"COUNTERS: 落地未迁移={c['landed_since_transition']} · 攻击债={c['attack_debt']}"
        f" · LIVE={c['live']}/坟场={c['graveyard']}{tail}"
    ]
    if c["concluded"]:
        return lines
    if c["attack_debt"] >= 1:
        lines.append(
            f"⚠ 攻击债 {c['attack_debt']} 未清 → 先消化"
            "（new_h 走 abduce 登记；constraint 进下一个 prereg 的控制臂；"
            "收尾余债落成 report 的收窄声明），再开新方向"
        )
    if c["landed_since_transition"] >= 2:
        lines.append(
            f"⚠ 连续 {c['landed_since_transition']} 个探针落地而信念未动"
            " → skill research-moves 的 references/reframe.md"
        )
    multi = {pid: n for pid, n in c["deaths_by_probe"].items() if n >= 2}
    for pid, n in sorted(multi.items()):
        lines.append(
            f"⚠ {pid} 一次杀死 {n} 条假设：它们可能不是独立机制"
            " → skill research-moves 的 references/reframe.md"
        )
    if c["live"] == 0 and c["graveyard"] > 0:
        lines.append(
            "⚠ 无 LIVE 假设且坟场非空 → 坟场已足以回答战役问题则 research-report；"
            "否则 research-abduce（reframe 供机制来源）"
        )
    return lines


def anchor(run: str) -> str:
    """紧凑信念锚（≈1k token）：MODE/谓词 · LIVE · 约束块（坟场禁令 · LIVE (narrowed) · 等价类 ·
    lessons）· 探针 · 攻击计数 · 元认知计数器（命中阈值时带 ⚠）· nugget · NEXT 行。

    graveyard 按 Arbor constraints-block 的教训渲染成**禁令**而非数据：
    重提共享同一隐藏假设的想法必须在 conflicts 里明确反驳该教训。有 mode 的 run 里活集与 MCP
    `isAlive` 一致（LIVE ∪ CONTESTED ∪ SUPPORTED ∪ narrowed SCOPED）：被封顶的终态请求渲染成 LEAD 段、
    SCOPED 渲染成 LIVE (narrowed)，都不进禁令，也都算进 NEXT 的存活数。
    """
    root = _root(run)
    reg = _register(run)
    events = _journal(run)
    info = anchor_parts.intake(reg, events)
    base = anchor_parts.base_dir(root)
    through, lessons = anchor_parts.read_lessons(base, root.name)
    nugget, equiv = anchor_parts.read_rulings(base)
    lines: list[str] = [f"== 信念锚 · {reg.get('run', run)} ==", anchor_parts.mode_line(info)]

    alive = anchor_parts.alive_claims(reg, info["mode"])
    narrowed = [c for c in alive if c.get("state") == "SCOPED"]
    lead = [c for c in alive if c.get("lead") and c.get("state") == "CONTESTED"]
    live = [c for c in alive if c not in narrowed and c not in lead]
    lines.append(f"LIVE ({len(live)}):")
    for c in live:
        predicts = " | ".join(c.get("predicts", []))
        tag = "" if c.get("state") == "LIVE" else f" [{c.get('state')}]"
        lines.append(f"  {c['id']}{tag}: {c.get('statement', '')} → {predicts}")
    lines.extend(anchor_parts.lead_lines(lead))

    alive_ids = {c["id"] for c in alive} if info["mode"] else set()
    graveyard = [g for g in reg.get("graveyard", []) if g["id"] not in alive_ids]
    if graveyard:
        lines.append(f"GRAVEYARD ({len(graveyard)}) —— 以下方向已死，禁止换装重提；"
                     "复活/相邻想法必须点名反驳其死因：")
        for g in graveyard:
            by = f"（{g.get('byProbe')}）" if g.get("byProbe") else ""
            lines.append(f"  {g['id']} {g.get('state', '')}{by}: {g.get('statement', '')}")
    lines.extend(anchor_parts.constraint_lines(narrowed, equiv, lessons))

    probes = reg.get("probes", [])
    if probes:
        lines.append("PROBES:")
        for p in probes:
            metric = f" metric={p['metric']}" if p.get("metric") is not None else ""
            lines.append(f"  {p['pid']} {p.get('status', '')}{metric}")

    attacks = reg.get("attacks", [])
    lines.append(f"ATTACKS: {len(attacks)} 条 typed 攻击在案")

    c = counters(run)
    lines.extend(_counter_lines(c))
    if nugget:
        lines.append(f"NUGGET: {nugget}")
    elif info["mode"] == "open" and not c["concluded"]:
        lines.append("⚠ nugget 行为空 → RULINGS.md 写一行 nugget: <一句洞见>（HYPOTHETICAL，O7）")
    synthesis = None if c["concluded"] else anchor_parts.synthesis_line(events, through, root.name)
    if synthesis:
        lines.append(synthesis)
    lines.append(anchor_parts.next_line(info["mode"], reg, events, c, root.name, equiv))

    global LAST
    LAST = "\n".join(lines)
    return LAST


def claim_view(run: str, claim_id: str) -> str:
    """对抗者上下文：claim + 证据探针 + graveyard，**不含 transition notes**。

    信息不对称是结构而非纪律：对抗者看得到主张与证据，看不到提出者为它辩护
    的推理——给了推理，对抗就退化成复读。
    """
    reg = _register(run)
    claim = next((c for c in reg.get("claims", []) if c.get("id") == claim_id), None)
    if claim is None:
        raise KeyError(f"未知 claim: {claim_id}")

    lines: list[str] = [
        f"== 待攻击主张 · {claim_id} ==",
        f"statement: {claim.get('statement', '')}",
        f"state: {claim.get('state', '')}",
        "predicts: " + " | ".join(claim.get("predicts", [])),
    ]

    evidence_pids: set[str] = set()
    if claim.get("byProbe"):
        evidence_pids.add(claim["byProbe"])
    for p in reg.get("probes", []):
        spec = _prereg(run, p["pid"])
        if spec and any(b.get("target") == claim_id for b in spec.get("branches", [])):
            evidence_pids.add(p["pid"])

    if evidence_pids:
        lines.append("evidence probes:")
        for pid in sorted(evidence_pids):
            probe = next((p for p in reg.get("probes", []) if p["pid"] == pid), None)
            spec = _prereg(run, pid)
            question = spec.get("question", "") if spec else ""
            band = spec.get("bands", {}).get(claim_id) if spec else None
            status = probe.get("status", "?") if probe else "?"
            metric = probe.get("metric") if probe else None
            lines.append(
                f"  {pid} [{status}] q={question} band[{claim_id}]={band} observed={metric}"
            )

    graveyard = reg.get("graveyard", [])
    if graveyard:
        lines.append("graveyard（必须点名，装看不见即失职）:")
        for g in graveyard:
            lines.append(f"  {g['id']} {g.get('state', '')}: {g.get('statement', '')}")

    return "\n".join(lines)


def disjoint_pairs(bands: dict[str, tuple[float, float] | list[float]]) -> list[tuple[str, str]]:
    """频段表 → 不重叠的假设对。SELECT 用：≥2 个候选探针各算一次，选对数多、成本低的。

    >>> disjoint_pairs({"H1": (0.8, 1.0), "H2": (0.0, 0.6)})
    [('H1', 'H2')]
    """
    pairs: list[tuple[str, str]] = []
    for (a, ab), (b, bb) in combinations(sorted(bands.items()), 2):
        a_lo, a_hi = float(ab[0]), float(ab[1])
        b_lo, b_hi = float(bb[0]), float(bb[1])
        if a_hi < b_lo or b_hi < a_lo:
            pairs.append((a, b))
    return pairs


def collect_attacks(session_dir: str, filename: str = "attacks.md") -> list[str]:
    """回收对抗子代理写下的攻击行，对子会话目录的几种落点都成立。

    Prime 只在存在持久 artifact 目录时才设 `RLM_SESSION_DIR`；没有时该变量**根本不存在**，
    子代理会把文件写到别处（P4.3 实测落在 `/tmp/attacks.md`）。所以父代理必须把
    `handle.session_dir` 的**绝对路径**直接写进 prompt，不让子代理自己去查环境变量。
    本函数在此之上兜底：给定目录 → 其 `sub-*` 子目录。

    **不向上找父目录**：`sub-XXXX` 的父级可能是 `/tmp` 这类共享目录，会把无关战役的
    attacks.md 收进来（这条是本函数自己的测试抓出来的）。

    返回去重后的攻击行（保留顺序）；找不到就是空列表——空不是错误，是"子代理还没写完"，
    `rlm()` 在**准入**时就返回了，父代理要在后续轮次再读。
    """
    base = Path(session_dir)
    candidates = [base / filename]
    candidates.extend(sorted(base.glob(f"sub-*/{filename}")))

    lines: list[str] = []
    seen: set[str] = set()
    for path in candidates:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or line in seen:
                continue
            seen.add(line)
            lines.append(line)
    return lines


def calibration(run: str) -> str:
    """校准账本：每个 LANDED 探针的预登记频段 vs 观测值（内/外）。

    这是"品味"的可测数据：预测总在带内 = 频段太松；总在带外 = 判断失准。
    report 的校准段直接引用本输出。
    """
    reg = _register(run)
    lines: list[str] = ["== 校准账本 =="]
    landed = [p for p in reg.get("probes", []) if p.get("status") == "LANDED"]
    if not landed:
        lines.append("（无落地探针）")
    for p in landed:
        spec = _prereg(run, p["pid"])
        observed = p.get("metric")
        if spec is None or observed is None:
            lines.append(f"  {p['pid']}: 预登记或观测缺失，跳过")
            continue
        for claim_id, band in sorted(spec.get("bands", {}).items()):
            lo, hi = float(band[0]), float(band[1])
            inside = lo <= float(observed) <= hi
            mark = "内" if inside else "外"
            lines.append(f"  {p['pid']} × {claim_id}: 预测 [{lo}, {hi}] · 观测 {observed} · 带{mark}")
    return "\n".join(lines)
