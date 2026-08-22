#!/usr/bin/env python3
"""review gate —— 评审结构化，headline 里没有未决断言。

拒绝条件（计划 §2.6，对应 ARFT F.4 与 D.7）：
  1. report.md 缺「## 评审」段；
  2. 评审不是 claim→verdict 结构（每个 register 中的 claim 都要有 verdict 行）；
  3. verdict 用词不在状态词表内，或与 register 状态不一致；
  4. 「## 核心结论」段引用了非终态 claim，或 CONTESTED/REFUTED claim（未决/已死断言不得当结论）。

用法：python review.py <RUN_DIR>
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import conclude, load_register

TERMINAL_OK_IN_HEADLINE = {"SUPPORTED", "ARTIFACT"}
VERDICT_LINE = re.compile(r"^\s*[-*]?\s*(H\d+)\s*[::]\s*([A-Z]+)\s*$", re.MULTILINE)


def section(text: str, title: str) -> str | None:
    """返回段内容；段不存在返回 None（空段返回 ''，与缺段区分）。"""
    m = re.search(rf"^##\s*{re.escape(title)}\s*$(.*?)(?=^##\s|\Z)", text, re.MULTILINE | re.DOTALL)
    return m.group(1) if m else None


def main(run_dir: str) -> int:
    reg = load_register(run_dir)
    refusals: list[str] = []
    details: list[str] = []
    report_path = os.path.join(run_dir, "report.md")
    if not os.path.exists(report_path):
        print("GATE review: FAIL")
        print("  ✗ report.md 不存在")
        return 1
    text = open(report_path, encoding="utf-8").read()
    claims = reg.get("claims", {})

    review = section(text, "评审")
    if review is None:
        refusals.append("缺「## 评审」段：评审必须结构化为 claim→verdict")
    verdicts = dict(VERDICT_LINE.findall(review or ""))
    for hid, c in sorted(claims.items()):
        v = verdicts.get(hid)
        if v is None:
            refusals.append(f"{hid} 没有评审 verdict 行")
        elif v != c.get("state"):
            refusals.append(f"{hid} 评审 verdict={v} 与 register 状态={c.get('state')} 不一致")

    headline = section(text, "核心结论")
    if headline is None:
        refusals.append("缺「## 核心结论」段")
    else:
        headline = headline or ""
        headline_ids = sorted(set(re.findall(r"H\d+", headline)))
        for hid in headline_ids:
            c = claims.get(hid)
            if c is None:
                refusals.append(f"headline 引用了不存在的 claim {hid}")
            elif c.get("state") not in TERMINAL_OK_IN_HEADLINE:
                refusals.append(
                    f"{hid} 状态 {c.get('state')} 出现在核心结论——只有 SUPPORTED/ARTIFACT 可入 headline"
                )
        details.append(f"headline 引用: {headline_ids}")

    return conclude("review", refusals, details)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python review.py <RUN_DIR>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
