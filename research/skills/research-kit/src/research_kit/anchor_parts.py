"""锚的 P2 段（01-统一架构 §3.0 mode、§6.3 约束块、§6.4 W5 回传、§6.5 NEXT 行、§12 Q1 等价类出口）。

只读：register.json / journal.jsonl（MCP 写）、`<cwd>/research-work/<run>/lessons.md` 与
`<cwd>/RULINGS.md`（父会话写）。NEXT 是"状态 + mode → 一步建议"，不是第二套导航状态：
模型可以不照做，但要在 RULINGS 里说明（01 §7.2）。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

_TERMINAL = frozenset({"SUPPORTED", "REFUTED", "SCOPED"})
# mode run 的活集与 MCP `isAlive` 同一份定义（packages/research-mcp/src/state.ts）：SCOPED 是 narrowed
_ALIVE_IN_MODE = frozenset({"LIVE", "CONTESTED", "SUPPORTED", "SCOPED"})
_LESSON_RE = re.compile(r"^\s*[-*]\s*\[(global|direction|leaf)\]\s*(.+?)\s*$")
_THROUGH_RE = re.compile(r"through-seq:\s*(\d+)")
_NUGGET_RE = re.compile(r"^\s*(?:Ruling:\s*)?nugget\s*[:=]\s*(.+?)\s*$", re.I)
_EQUIV_RE = re.compile(r"equiv\{([^}]*)\}")
_LEVELS = ("global", "direction", "leaf")
_MAX_LESSONS = 12  # 锚预算 ≈1k token；更早的教训仍在 lessons.md 里
# W5 每 N 次落地或每次终态迁移触发（01 §6.4，N=3）
_LANDED_PER_SYNTHESIS = 3
H0 = "H0"  # research_init 内置登记的对照（identify null / score incumbent）


def base_dir(root: Path) -> Path | None:
    """研究工作目录（`.proma-research/` 的父目录）；归档 run 没有这个布局，返回 None。"""
    return root.parent.parent if root.parent.name == ".proma-research" else None


def intake(reg: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    """K0 冻结在 research_init 的字段：先看 register（宿主可能缓存），再看 journal 的 run.init。"""
    init = next((e for e in events if e.get("op") == "run.init"), {})

    def pick(*keys: str) -> Any:
        for source in (reg, init):
            for key in keys:
                value = source.get(key)
                if value not in (None, ""):
                    return value
        return None

    return {
        "mode": pick("mode"),
        "predicate": pick("success_predicate", "successPredicate"),
        "depth": pick("depth"),
        "recall": pick("recall"),
    }


def mode_line(info: dict[str, Any]) -> str:
    if not info["mode"]:
        return "MODE: legacy（无 mode 字段：旧规则，按 research-loop 阶段表路由）"
    parts = [f"MODE: {info['mode']}", f"谓词: {info['predicate'] or '（K0 未写）'}"]
    parts += [f"{key}={info[key]}" for key in ("depth", "recall") if info[key]]
    return " · ".join(parts)


def read_lessons(base: Path | None, run_name: str) -> tuple[int, list[tuple[str, str]]]:
    """(已综合到的 journal 序号, [(level, text)])；文件不存在 = (0, [])。"""
    path = base / "research-work" / run_name / "lessons.md" if base else None
    if path is None or not path.is_file():
        return 0, []
    text = path.read_text(encoding="utf-8")
    through = max((int(m) for m in _THROUGH_RE.findall(text)), default=0)
    lessons = [(m.group(1), m.group(2)) for m in map(_LESSON_RE.match, text.splitlines()) if m]
    return through, lessons


def read_rulings(base: Path | None) -> tuple[str | None, list[str] | None]:
    """(最新 nugget 行, 最新 equiv{…} 的 H# 列表)。"""
    path = base / "RULINGS.md" if base else None
    if path is None or not path.is_file():
        return None, None
    nugget: str | None = None
    equiv: list[str] | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        if m := _NUGGET_RE.match(line):
            nugget = m.group(1)
        for m in _EQUIV_RE.finditer(line):
            equiv = [h for h in re.split(r"[,\s]+", m.group(1)) if h]
    return nugget, equiv


def scoped_statement(claim: dict[str, Any]) -> str | None:
    return claim.get("scopedStatement") or claim.get("scoped_statement")


def alive_claims(reg: dict[str, Any], mode: str | None) -> list[dict[str, Any]]:
    """仍在竞争的 claim。mode run = MCP isAlive：LIVE ∪ CONTESTED（含 lead）∪ SUPPORTED ∪ SCOPED（narrowed）；
    legacy 只认 LIVE（旧锚语义不变）。

    register 的 `claims` 是当前态，`graveyard` 是迁移那一刻的快照（复活不清），同 id 以 `claims` 为准——
    否则复活后又收窄的 claim 会同时是坟场禁令和活对手。
    """
    claims = reg.get("claims", [])
    if not mode:
        return [c for c in claims if c.get("state") == "LIVE"]
    current = {c["id"]: c for c in claims}
    for g in reg.get("graveyard", []):
        current.setdefault(g["id"], g)
    return [c for c in current.values() if c.get("state") in _ALIVE_IN_MODE]


def lead_lines(lead: list[dict[str, Any]]) -> list[str]:
    """LEAD 段：被封顶的终态请求（CONTESTED + lead{requested, caps}），仍是活对手。"""
    if not lead:
        return []
    lines = [f"LEAD ({len(lead)}) —— 终态请求被封顶，仍在竞争；去掉封顶要新证据（下一个 prereg 补上 caps 指的字段 / 审计）："]
    for c in lead:
        info = c["lead"]
        caps = ",".join(info.get("caps", []))
        lines.append(f"  {c['id']} requested={info.get('requested')} caps={caps}（{info.get('byProbe')}）: {c.get('statement', '')}")
    return lines


def constraint_lines(
    narrowed: list[dict[str, Any]],
    equiv: list[str] | None,
    lessons: list[tuple[str, str]],
) -> list[str]:
    """约束块的 P2 段：LIVE (narrowed)、等价类 RULING、本 run lessons（坟场禁令仍由 anchor 渲染）。"""
    lines: list[str] = []
    if narrowed:
        lines.append(f"LIVE (narrowed) ({len(narrowed)}) —— SCOPED 收窄后仍在竞争，可入 bands：")
        lines += [f"  {c['id']}: {scoped_statement(c) or '（无 scoped_statement）'}" for c in narrowed]
    if equiv:
        lines.append("EQUIV (RULING): {" + ", ".join(equiv) + "} —— 现有协议与预算下分不开；报告写等价类")
    if lessons:
        lines.append("LESSONS（本 run；global = 本 run 全局；在其上构建，不要重新推导）：")
        recent = lessons[-_MAX_LESSONS:]
        for level in _LEVELS:
            lines += [f"  [{level}] {text}" for lvl, text in recent if lvl == level]
    return lines


def _fmt(action: str, inputs: str, out: str, why: str) -> str:
    return f"NEXT: {action} · in: {inputs} · out: {out} · why: {why}"


def synthesis_line(events: list[dict[str, Any]], through: int, run_name: str) -> str | None:
    """lessons 相对 journal 过期 → `NEXT: synthesize lessons`（终态 / lead 迁移 ≥1 或落地 ≥3）。

    lead 迁移（CONTESTED + lead[]，被封顶的终态请求）与终态同样计——trace gate 也把它算作已定格。
    """
    after = events[through:]
    terminal = sum(
        1 for e in after
        if e.get("op") == "claim.transition" and (e.get("to") in _TERMINAL or isinstance(e.get("lead"), list))
    )
    landed = sum(1 for e in after if e.get("op") == "probe.land" and e.get("exit_code") == 0)
    if terminal == 0 and landed < _LANDED_PER_SYNTHESIS:
        return None
    seq = len(events)
    return _fmt(
        "synthesize lessons（W5；brief = research-loop/references/w5-lessons.md）",
        f"journal seq {through + 1}–{seq}, .rlm-jobs/{run_name}/failures.jsonl",
        f"research-work/{run_name}/lessons.md（新段首行写 through-seq: {seq}）",
        f"{terminal} 次终态/lead 迁移 · {landed} 次落地尚未综合",
    )


def next_line(
    mode: str | None,
    reg: dict[str, Any],
    events: list[dict[str, Any]],
    counters: dict[str, Any],
    run_name: str,
    equiv: list[str] | None,
) -> str:
    """一步建议。顺序：结案 → 已登记未跑 → 落地未消化 → SUPPORTED 未挨打 → 按 mode 的阶段。"""
    work, state = f"research-work/{run_name}", f".proma-research/{run_name}"
    report = _fmt("K7 写报告 → report_declare", f"{state}/register.json, RULINGS.md",
                  f"{work}/REPORT.md", "谓词满足或坟场已足以回答")
    if counters["concluded"]:
        return "NEXT: — · 已结案（gate 通过）"
    probes = reg.get("probes", [])
    pending = [p["pid"] for p in probes if p.get("status") == "PREREG"]
    if pending:
        return _fmt(f"probe_run {pending[0]}", f"{state}/prereg/{pending[0]}.json（已冻结）",
                    f"{state}/probes/{pending[0]}/", "已预登记未执行；不改命令、不先看")
    if counters["landed_since_transition"] >= 1:
        landed = [p["pid"] for p in probes if p.get("status") == "LANDED"] or ["P?"]
        return _fmt("metric_recompute → claim_transition（SUPPORTED 先过 K3 审计、带 audit；落带外 → triage）",
                    f"{state}/probes/{landed[-1]}/", "journal",
                    f"{counters['landed_since_transition']} 个落地尚未改变信念")
    claims = reg.get("claims", []) + reg.get("graveyard", [])
    attacked = {a.get("target") for a in reg.get("attacks", [])}
    unattacked = [c["id"] for c in claims if c.get("state") == "SUPPORTED" and c["id"] not in attacked]
    if unattacked:
        return _fmt(f"research-grill → attack_record（target: {unattacked[0]}）",
                    f"research_kit.claim_view(run, \"{unattacked[0]}\")", f".rlm-jobs/{run_name}/grill/{unattacked[0]}/",
                    "SUPPORTED 未挨过打（trace gate 会红）")
    live = [c["id"] for c in alive_claims(reg, mode)]
    rivals = [c["id"] for c in claims if c["id"] != H0]
    ops = {e.get("op") for e in events}
    if mode == "identify":
        if "world.info" not in ops:
            return _fmt("I0 world_simulate(mode=info) → 钉死 / 自由账本 + σ 出处（research-loop/references/world-engine.md）",
                        f"{state}/K0-intake.md", f"{work}/ledger.md", "还没有题面与 sim_env")
        if not rivals:
            return _fmt("I1 召回机制族（W1）+ I3 对手完整性 → claim_propose", f"{work}/ledger.md",
                        f"{work}/recall/families.md", "LIVE 里只有内置 H0")
        if len(live) <= 1 or (equiv and set(live) <= set(equiv)):
            if "world.forecast" in ops:
                return report
            return _fmt("I9 world_forecast（全部 held-out 一次提交，每值带 (sim:H#) 或 (extrap)）",
                        f"{work}/sim/", "journal", "活对手（含 lead / narrowed）已收缩到 1 个或一个写明的等价类")
        return _fmt("I2+I4 nbsim 矩阵 → Δ/σ 表 → prereg_write（r* 最小的格；research-loop/references/world-engine.md）",
                    f"{work}/nbsim, {work}/recall/families.md", f"{work}/sim/matrix.csv, {work}/sim/<id>.json",
                    f"{len(live)} 条活对手（含 lead / narrowed）待判别")
    if mode == "open":
        if not claims:
            return _fmt("O1–O4 召回 → 残差 → 生成（P5 前：research-abduce + research-scoop）→ claim_propose",
                        f"{state}/K0-intake.md", f"{work}/ideas.md", "还没有候选")
        if not live:
            return report
        if not probes:
            return _fmt("O8 探针构建 → K2 prereg_write（针对 riskiest_assumption）", f"{work}/ideas.md",
                        f"{work}/<cand>/probe-spec.md", "有候选，无判别探针")
        return _fmt("K2 下一个判别探针 → prereg_write", f"{work}/<cand>/probe-spec.md",
                    f"{work}/<cand>/", f"{len(live)} 条活对手（含 lead / narrowed）未判定")
    if mode == "score":
        if not rivals:
            return _fmt("S1 结果召回 + S3 变体 → claim_propose{parent: H0}", f"{state}/K0-intake.md（契约）",
                        f"{work}/variants.md", "只有 incumbent H0")
        if len(live) <= 1:
            return report
        return _fmt("S4 dev（自报，标 (dev, self-reported)）→ S5 admit prereg_write", f"{work}/variants.md",
                    f"{work}/dev.md", f"{len(live)} 条活对手（含 H0 与 lead）待准入")
    # legacy：research-loop 阶段表
    if not live:
        return _fmt("research-abduce → claim_propose", "坟场禁令（本锚）", "journal", "没有 LIVE 假设")
    if any(c not in attacked for c in live):
        return _fmt("research-grill → attack_record", "research_kit.claim_view", "journal", "有 LIVE 从未被攻击")
    return _fmt("research-probe → prereg_write", "LIVE 频段", "journal", "LIVE 之间还没有覆盖它的落地探针")
