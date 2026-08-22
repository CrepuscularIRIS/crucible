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

# 预登记频段：**严格**两个数值的 [lo, hi]，别的括号内容一概不豁免。
# （早先的宽松版 \[[^\]]*\d+\.\d+[^\]]*\] 把 "[0.91]" 这类任意方括号也豁免了，
#  等于给"我不想解释的数字"开了一扇后门。）
BAND_EXPR = re.compile(r"\[\s*-?\d+(?:\.\d+)?\s*[,，]\s*-?\d+(?:\.\d+)?\s*\]")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import conclude, load_prereg, load_register, recompute_metric
from review import VERDICT_LINE  # 与 review gate 用同一个 verdict 行口径

# 中文里 "假设H1被否证" 没有词边界，\b 会漏掉——与 review.py 保持同一个模式
HID = re.compile(r"H\d+")
NUMBER = re.compile(r"\d+\.\d+")
CITED = re.compile(r"(\d+(?:\.\d+)?)\s*[（(]\s*(P\d+)\s*[)）]")


def strip_verdict_lines(text: str) -> str:
    """去掉形如 `- H1: SUPPORTED` 的 verdict 行再做 claim 引用检查。

    verdict 行的语义是"逐条枚举 register 状态"，含未检验的 LIVE claim 本就合法；
    它不是证据性断言。不豁免它，review（要求每个 claim 都有 verdict 行）与本 gate
    （拒绝任何无 artifact 的 H# 出现）就互相矛盾，报告无解。

    只豁免 verdict 行本身，不豁免整个「## 评审」段——段落切分会一路吃到文末，
    把跟在后面的散文一起放行。
    """
    return "\n".join(
        line for line in text.splitlines() if not VERDICT_LINE.fullmatch(line.rstrip())
    )


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

    # 1) 引用的 claim 必须存在且有 artifact（verdict 行除外，见 strip_verdict_lines）
    for hid in sorted(set(HID.findall(strip_verdict_lines(text)))):
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

    # 2) 小数必须带 (P#) 出处；成对记录 (pid, value, 原始字符串)
    cited_pairs: list[tuple[str, float]] = []
    raw_strings: dict[str, list[str]] = {}
    for line_no, line in enumerate(text.splitlines(), 1):
        spans = [
            (m.start(1), m.end(1), m.group(2), float(m.group(1)), m.group(1))
            for m in CITED.finditer(line)
        ]
        band_spans = [(m.start(), m.end()) for m in BAND_EXPR.finditer(line)]
        for match in NUMBER.finditer(line):
            in_cite = any(s <= match.start() and match.end() <= e for s, e, _, _, _ in spans)
            in_band = any(s <= match.start() and match.end() <= e for s, e in band_spans)
            if not in_cite and not in_band:
                refusals.append(f"第 {line_no} 行数字 {match.group(0)} 缺少 (P#) 出处")
        for s, e, pid, v, raw in spans:
            # 频段内的 (P#) 标注不是"结果数字的出处"——频段是预登记内容。
            # 不这样切，第 4 条（数字要带出处）与第 5 条（带出处的数字要对得上重算值）
            # 会把同一个频段数字同时判为"该标"和"标了就是幻觉"。
            if any(bs <= s and e <= be for bs, be in band_spans):
                continue
            cited_pairs.append((pid, v))
            raw_strings.setdefault(pid, []).append(raw)

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
        for v, raw in zip(values, raw_strings.get(pid, [])):
            # 容差按引用值的显示精度：引用值须是重算值的正确舍入（半宽 = 末位 0.5）。
            # 但半宽有上限：否则"约 1 (P1)" 会以 ±0.5 的容差通过一个真值 0.6465 的对账，
            # 降精度就成了合法的脱逃路线。上限取指标量级的 1%（近零时给一个绝对下限）。
            decimals = len(raw.split(".")[1]) if "." in raw else 0
            half_width = 0.5 * (10 ** -decimals)
            tolerance = min(half_width, max(0.01 * abs(metric), 1e-6)) + 1e-9
            if abs(v - metric) > tolerance:
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
