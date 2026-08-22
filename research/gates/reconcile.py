#!/usr/bin/env python3
"""reconcile gate —— 报告里没有无出处的断言，没有重算不过的数字。

拒绝条件（计划 §2.6，对应 ARFT D.4 与 E.2）：
  1. report.md 缺失；
  2. 报告引用的 H# 不在 register；
  3. 报告引用的 H# 没有任何 artifact（落地 probe 或挂接证据）；
  4. 报告中的小数必须同行携带 (P#) 出处；
  5. 任何被引用的数字与从 results/<pid>/raw 重算的指标不符（幻觉数字）。

用法：python reconcile.py <RUN_DIR>
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import conclude, load_prereg, load_register, recompute_metric

HID = re.compile(r"\bH\d+\b")
NUMBER = re.compile(r"\d+\.\d+")
CITED = re.compile(r"(\d+(?:\.\d+)?)\s*[（(]\s*(P\d+)\s*[)）]")


def main(run_dir: str) -> int:
    reg = load_register(run_dir)
    refusals: list[str] = []
    details: list[str] = []
    report_path = os.path.join(run_dir, "report.md")
    if not os.path.exists(report_path):
        print("GATE reconcile: FAIL")
        print("  ✗ report.md 不存在")
        return 1
    text = open(report_path, encoding="utf-8").read()
    claims = reg.get("claims", {})
    probes = reg.get("probes", {})

    # 1) 引用的 claim 必须存在且有 artifact
    for hid in sorted(set(HID.findall(text))):
        c = claims.get(hid)
        if c is None:
            refusals.append(f"报告引用了不存在的 claim {hid}")
            continue
        has_artifact = any(
            p.get("claim") == hid and p.get("state") in ("LANDED", "TRIAGE")
            for p in probes.values()
        ) or any(
            hid in (p.get("result", {}) or {}).get("applied", {}).get(action, [])
            for p in probes.values() if p.get("state") == "LANDED"
            for action in ("kill", "scope", "support", "artifact", "contest")
        ) or any(e.get("claim") == hid for e in reg.get("evidence", []))
        if not has_artifact:
            refusals.append(f"{hid} 被报告引用但没有任何 artifact（无落地 probe / 无挂接证据）")

    # 2) 小数必须带 (P#) 出处；成对记录 (pid, value)
    cited_pairs: list[tuple[str, float]] = []
    for line_no, line in enumerate(text.splitlines(), 1):
        spans = [
            (m.start(1), m.end(1), m.group(2), float(m.group(1)))
            for m in CITED.finditer(line)
        ]
        for match in NUMBER.finditer(line):
            if not any(s <= match.start() and match.end() <= e for s, e, _, _ in spans):
                refusals.append(f"第 {line_no} 行数字 {match.group(0)} 缺少 (P#) 出处")
        cited_pairs.extend((pid, v) for _, _, pid, v in spans)

    cited: dict[str, list[float]] = {}
    for pid, v in cited_pairs:
        cited.setdefault(pid, []).append(v)

    # 3) 被引用数字与重算值对账
    for pid, values in cited.items():
        p = probes.get(pid)
        if p is None:
            refusals.append(f"报告引用了不存在的 probe {pid}")
            continue
        if p.get("state") != "LANDED":
            refusals.append(f"{pid} 被报告引用但状态为 {p.get('state')}（只有 LANDED 可入报告）")
            continue
        spec = load_prereg(run_dir, p)
        raw_dir = os.path.join(run_dir, "results", pid, "raw")
        try:
            metric = recompute_metric(spec["recompute"], raw_dir)
        except Exception as exc:  # noqa: BLE001 - gate 必须把一切重算失败记为拒绝
            refusals.append(f"{pid} 重算失败: {exc}")
            continue
        for v in values:
            if abs(v - metric) > 1e-6 * max(1.0, abs(metric)):
                refusals.append(
                    f"幻觉数字：报告称 {v} (P#={pid})，从原始文件重算为 {metric:.6f}"
                )
        details.append(f"{pid}: 重算 {metric:.6f}，报告引用 {[v for v in values]}")

    return conclude("reconcile", refusals, details)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python reconcile.py <RUN_DIR>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
