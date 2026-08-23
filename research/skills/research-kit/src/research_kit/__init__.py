"""research_kit —— 研究层的 kernel 侧只读工具箱。

四个纯函数，全部读 server 维护的派生缓存 register.json（journal 是唯一权威，
分歧时以 MCP `research_state` 为准）。本模块**绝不写** `.proma-research/`——
写路径只有 research-mcp（第二个写者会触发 P3.3 防篡改，且失去 UI 可见性）。

kernel 跨压缩存活：`anchor()` 的结果同时存进模块变量 `LAST`，压缩后
`print(research_kit.LAST)` 一行找回信念状态，不必重新拉取。
"""

from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path
from typing import Any

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


def anchor(run: str) -> str:
    """紧凑信念锚（≈1k token）：LIVE 一行一条 · graveyard 禁令体 · 探针 · 攻击计数。

    graveyard 按 Arbor constraints-block 的教训渲染成**禁令**而非数据：
    重提共享同一隐藏假设的想法必须在 conflicts 里明确反驳该教训。
    """
    reg = _register(run)
    lines: list[str] = [f"== 信念锚 · {reg.get('run', run)} =="]

    live = [c for c in reg.get("claims", []) if c.get("state") == "LIVE"]
    lines.append(f"LIVE ({len(live)}):")
    for c in live:
        predicts = " | ".join(c.get("predicts", []))
        lines.append(f"  {c['id']}: {c.get('statement', '')} → {predicts}")

    graveyard = reg.get("graveyard", [])
    if graveyard:
        lines.append(f"GRAVEYARD ({len(graveyard)}) —— 以下方向已死，禁止换装重提；"
                     "复活/相邻想法必须点名反驳其死因：")
        for g in graveyard:
            by = f"（{g.get('byProbe')}）" if g.get("byProbe") else ""
            lines.append(f"  {g['id']} {g.get('state', '')}{by}: {g.get('statement', '')}")

    probes = reg.get("probes", [])
    if probes:
        lines.append("PROBES:")
        for p in probes:
            metric = f" metric={p['metric']}" if p.get("metric") is not None else ""
            lines.append(f"  {p['pid']} {p.get('status', '')}{metric}")

    attacks = reg.get("attacks", [])
    lines.append(f"ATTACKS: {len(attacks)} 条 typed 攻击在案")

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
