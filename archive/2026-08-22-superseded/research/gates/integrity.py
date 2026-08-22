#!/usr/bin/env python3
"""integrity gate —— register.json 里的每一个信念，journal 里都得有人认领。

前三道 gate 都把 register.json 当作事实读。可 register.json 就是模型写的一个文件：
把 claims.H2.state 改成 SUPPORTED，再往某个已落地 probe 的 result.applied.support
里塞一个 "H2"，三道 gate 全绿——没有任何一道会去问"谁把它变成这样的"。

本 gate 只做一件事：拿只追加的 journal 复算一遍状态，和 register 对账。
拒绝条件：
  1. journal 缺失或为空（没有 journal 就没有可核对的过程，直接判负）；
  2. 任何终态 claim 的 killed_by 指向的 probe 不是 LANDED，或 journal 里
     没有对应的 land ok=true 且 applied 里点名了它；
  3. 任何终态 claim 没有 killed_by（终态只能由 land 产生）；
  4. 任何 LANDED probe 在 journal 里没有 land ok=true 记录，或记录的 metric 与
     register 存的不一致；
  5. 任何 claim 在 journal 里没有 abduce ok=true 记录（凭空出现的假设）；
  6. 空跑：没有任何 LANDED probe，或没有任何 claim 走到终态——
     一场什么都没发生的战役不该拿到绿灯。

用法：python integrity.py <RUN_DIR>
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import conclude, journal_lines, load_register

TERMINAL = {"REFUTED", "SUPPORTED", "ARTIFACT"}


def main(run_dir: str) -> int:
    reg = load_register(run_dir)
    journal = journal_lines(run_dir)
    refusals: list[str] = []
    details: list[str] = []

    if not journal:
        print("GATE integrity: FAIL")
        print("  ✗ journal.jsonl 缺失或为空——没有过程记录，register.json 无从核对")
        return 1

    abduced = {e.get("claim") for e in journal if e.get("op") == "abduce" and e.get("ok")}
    # land ok 的条目：pid → (metric, applied 里出现的所有 claim)
    landed: dict[str, dict] = {}
    land_counts: dict[str, int] = {}
    for e in journal:
        if e.get("op") == "land" and e.get("ok"):
            applied = e.get("applied") or {}
            settled = {c for targets in applied.values() for c in (targets or [])}
            landed[e.get("pid")] = {"metric": e.get("metric"), "settled": settled}
            land_counts[e.get("pid")] = land_counts.get(e.get("pid"), 0) + 1
    # 状态机保证一个 probe 只能成功落地一次；出现第二条就说明 journal 被追写过
    for pid, n in sorted(land_counts.items()):
        if n > 1:
            refusals.append(f"{pid} 在 journal 中有 {n} 条 land ok 记录——落地只能发生一次，日志被追写过")

    claims = reg.get("claims", {})
    probes = reg.get("probes", {})

    for cid, c in sorted(claims.items()):
        if cid not in abduced:
            refusals.append(f"{cid} 在 register 里存在，但 journal 中没有 abduce 记录（凭空出现）")
        state = c.get("state")
        if state not in TERMINAL:
            continue
        killer = c.get("killed_by")
        if not killer:
            refusals.append(f"{cid} 是终态 {state} 却没有 killed_by——终态只能由 land 产生")
            continue
        p = probes.get(killer)
        if p is None:
            refusals.append(f"{cid} 的 killed_by={killer} 不是 register 里的 probe")
        elif p.get("state") != "LANDED":
            refusals.append(f"{cid} 终态由 {killer} 判定，但 {killer} 状态是 {p.get('state')}（只有 LANDED 能判定）")
        if killer not in landed:
            refusals.append(f"{cid} 终态由 {killer} 判定，但 journal 中没有 {killer} 的 land ok 记录")
        elif cid not in landed[killer]["settled"]:
            refusals.append(f"{cid} 终态由 {killer} 判定，但 journal 中 {killer} 的 applied 未点名它")

    for pid, p in sorted(probes.items()):
        if p.get("state") != "LANDED":
            continue
        if pid not in landed:
            refusals.append(f"{pid} 在 register 里是 LANDED，但 journal 中没有 land ok 记录")
            continue
        reg_metric = (p.get("result") or {}).get("metric")
        j_metric = landed[pid]["metric"]
        if reg_metric is not None and j_metric is not None:
            if abs(float(reg_metric) - float(j_metric)) > 1e-9:
                refusals.append(f"{pid} 的 register 指标 {reg_metric} 与 journal 记录 {j_metric} 不一致")

    # 空跑判据：gate 不能靠"什么都没发生"拿绿灯
    if not any(p.get("state") == "LANDED" for p in probes.values()):
        refusals.append("没有任何 LANDED probe——空跑不予通过")
    if not any(c.get("state") in TERMINAL for c in claims.values()):
        refusals.append("没有任何 claim 走到终态——没有信念被改变，空跑不予通过")

    details.append(f"claims={len(claims)} probes={len(probes)} journal={len(journal)} 条 land_ok={len(landed)}")
    return conclude("integrity", refusals, details)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python integrity.py <RUN_DIR>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
