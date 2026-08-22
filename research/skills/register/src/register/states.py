"""claim / probe 状态机。

CLAIM: PROPOSED ─abduce ok→ LIVE ─文本→ DEMOTED|SCOPED（可逆）
       LIVE ─landed probe + rule→ REFUTED | ARTIFACT | SUPPORTED（终态，入 graveyard）
       LIVE ─land, 证据不足→ CONTESTED（阻断 headline，非终态）
PROBE: DRAFT ─prereg ok→ PREREG ─probe.run→ RUNNING ─land→ LANDED|TRIAGE
"""

from __future__ import annotations

from enum import Enum


class ClaimState(str, Enum):
    PROPOSED = "PROPOSED"
    LIVE = "LIVE"
    DEMOTED = "DEMOTED"
    SCOPED = "SCOPED"
    CONTESTED = "CONTESTED"
    REFUTED = "REFUTED"
    ARTIFACT = "ARTIFACT"
    SUPPORTED = "SUPPORTED"


TERMINAL_CLAIM_STATES = frozenset(
    {ClaimState.REFUTED, ClaimState.ARTIFACT, ClaimState.SUPPORTED}
)
# 文本许可的可逆集合：这三个状态都算"还活着"，≥2 live 检查按此口径
ALIVE_CLAIM_STATES = frozenset(
    {ClaimState.LIVE, ClaimState.DEMOTED, ClaimState.SCOPED, ClaimState.CONTESTED}
)

# 文本移动（demote/scope/promote/resolve_contested）允许的非终态迁移
TEXT_MOVES = {
    ClaimState.LIVE: frozenset({ClaimState.DEMOTED, ClaimState.SCOPED}),
    ClaimState.DEMOTED: frozenset({ClaimState.LIVE, ClaimState.SCOPED}),
    ClaimState.SCOPED: frozenset({ClaimState.LIVE, ClaimState.DEMOTED}),
    ClaimState.CONTESTED: frozenset({ClaimState.LIVE}),
}
# land() 可设置的状态（含终态与 CONTESTED）
LAND_MOVABLE = frozenset(
    {
        ClaimState.REFUTED,
        ClaimState.ARTIFACT,
        ClaimState.SUPPORTED,
        ClaimState.CONTESTED,
        ClaimState.SCOPED,
    }
)


class ProbeState(str, Enum):
    DRAFT = "DRAFT"
    PREREG = "PREREG"
    RUNNING = "RUNNING"
    LANDED = "LANDED"
    TRIAGE = "TRIAGE"


PROBE_TRANSITIONS = {
    ProbeState.DRAFT: frozenset({ProbeState.PREREG}),
    ProbeState.PREREG: frozenset({ProbeState.RUNNING}),
    # RUNNING 允许重跑（崩溃恢复），落地由 land() 完成
    ProbeState.RUNNING: frozenset({ProbeState.RUNNING, ProbeState.LANDED, ProbeState.TRIAGE}),
    ProbeState.LANDED: frozenset(),
    ProbeState.TRIAGE: frozenset(),
}
