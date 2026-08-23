#!/usr/bin/env python3
"""liveness —— 从 Proma 会话 JSONL 里量「机制到底有没有被用」。

评测的第一问不是分数，是**编排有没有触发**。BASELINE-HOLES.md 的 H1 是本仓库
最贵的一课：一场 26 轮、exit 0、产出 11 张图的 RCB run，55 条事件里
`evidence:0 killed:0 survived:0`——我们对外声称的全部贡献一次都没被触发，
而分数看上去很正常。分数不会告诉你这件事，只有活性会。

只读，纯统计，不调模型、不写任何状态。

    python3 research/eval/liveness.py <session.jsonl> [--json]

字段来源（实测自 2026-08-23-routing-acceptance）：
  message.toolName            工具名（`mcp__research__*` 即信念写入）
  message.details.kernelRestarted   kernel 是否重启（上下文持久性）
  type == 'child_usage_attributed'  rlm() 子代理落账（含 token 归因）
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter

SKILL_RE = re.compile(r"(research-[a-z-]+)/SKILL\.md")
KIT_RE = re.compile(r"research_kit\.(\w+)\s*\(")
# 移动卡：research-moves 的 references/*.md
MOVE_RE = re.compile(r"references/(triage|reframe|oracle|derive)\.md")
BENCHMARK_IMPORT_RE = re.compile(r"(?:^|[;\n]\s*)(?:from|import)\s+neuronbench\b", re.I)
METER_EXEC_RE = re.compile(r"world-meter\.py", re.I)


def truth_leak_categories(code: str) -> list[str]:
    """只识别 kernel/bash 的直接真值访问；合法 world MCP 返回不进入这里。"""
    matches = []
    if BENCHMARK_IMPORT_RE.search(code):
        matches.append("benchmark_import")
    if METER_EXEC_RE.search(code):
        matches.append("meter_execution")
    benchmark_root = os.path.realpath(os.environ.get(
        "NEURONBENCH_ROOT", "/home/lingxufeng/oss/neuronbench"))
    normalized = code.replace("\\\\", "/")
    if benchmark_root.replace("\\\\", "/") in normalized:
        matches.append("benchmark_path_read")
    return matches


def load(path: str) -> list[dict]:
    events = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def analyze(events: list[dict], eval_pattern: str | None = None) -> dict:
    """eval_pattern：匹配**执行**评测命令的正则（如 `python3?\\s+\\S*eval\\.py`）。
    给了才做 F1 侦测——泛泛地"预登记前有执行"会把列目录、读源码都算进去，
    那种告警没人会看第二次（实测：routing-acceptance 读源码推频段是合规的）。"""
    exec_re = re.compile(eval_pattern) if eval_pattern else None
    tools: Counter = Counter()
    kit: Counter = Counter()
    skills: dict[str, str] = {}       # skill -> 首次打开时间
    moves: dict[str, str] = {}
    children: list[str] = []
    kernel_restarts = 0
    first_mcp: str | None = None
    first_prereg: str | None = None
    first_exec: str | None = None      # 首次执行评测命令（F1 侦测用）
    truth_leaks: list[str] = []

    for ev in events:
        ts = ev.get("timestamp", "")
        if ev.get("type") == "child_usage_attributed":
            children.append(ts)
            continue
        msg = ev.get("message")
        if not isinstance(msg, dict):
            continue

        tool = msg.get("toolName")
        if tool:
            tools[tool] += 1
            if tool.startswith("mcp__research__") and first_mcp is None:
                first_mcp = ts
            if tool == "mcp__research__prereg_write" and first_prereg is None:
                first_prereg = ts

        # F1 只看**被执行的代码**（assistant 的 toolCall.arguments），且只认
        # 执行形状。读源码是允许的（derive 卡靠读源码推导频段——实测
        # routing-acceptance 就是这么把频段推出来的）；跑它才是违规。
        if msg.get("role") == "assistant":
            for block in msg.get("content") or []:
                if not isinstance(block, dict) or block.get("type") != "toolCall":
                    continue
                if block.get("name") not in ("ipython", "bash"):
                    continue
                arguments = block.get("arguments") or {}
                if isinstance(arguments, dict):
                    code = "\n".join(
                        value for value in arguments.values() if isinstance(value, str))
                else:
                    code = json.dumps(arguments, ensure_ascii=False)
                for category in truth_leak_categories(code):
                    if category not in truth_leaks:
                        truth_leaks.append(category)
                if exec_re and first_exec is None and exec_re.search(code):
                    first_exec = ts

        details = msg.get("details")
        if isinstance(details, dict) and details.get("kernelRestarted"):
            kernel_restarts += 1

        blob = json.dumps(msg, ensure_ascii=False)
        for name in SKILL_RE.findall(blob):
            skills.setdefault(name, ts)
        for name in MOVE_RE.findall(blob):
            moves.setdefault(name, ts)
        for fn in KIT_RE.findall(blob):
            kit[fn] += 1

    mcp = {k.replace("mcp__research__", ""): v for k, v in tools.items()
           if k.startswith("mcp__research__")}
    loop_ts = skills.get("research-loop")
    return {
        "skills_opened": dict(sorted(skills.items(), key=lambda kv: kv[1])),
        "move_cards_opened": dict(sorted(moves.items(), key=lambda kv: kv[1])),
        "kit_calls": dict(kit),
        "mcp_calls": mcp,
        "tool_calls": dict(tools),
        "rlm_children": len(children),
        "kernel_restarts": kernel_restarts,
        "first_research_mcp": first_mcp,
        "first_prereg": first_prereg,
        "first_eval_execution": first_exec,
        # 路由验收：loop 卡必须先于第一次 research MCP 调用被打开
        "routing_ok": bool(loop_ts and first_mcp and loop_ts < first_mcp),
        # 调度层活性：只调 research_state 而不 anchor，⚠ 计数器层是死的（P5.1 F3）
        "anchor_used": kit.get("anchor", 0) > 0,
        "truth_leak": {
            "detected": bool(truth_leaks),
            "matches": truth_leaks,
        },
        # F1：评测命令的执行早于第一次预登记 = 频段是回忆不是预测（P14 违背）。
        # None = 没给 eval_pattern，没测（不是"通过"）。
        "prereg_preview": None if eval_pattern is None else bool(
            first_exec and (first_prereg is None or first_exec < first_prereg)),
    }


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    eval_pattern = next((a.split("=", 1)[1] for a in sys.argv[1:]
                         if a.startswith("--eval-pattern=")), None)
    report = analyze(load(args[0]), eval_pattern)
    if "--json" in sys.argv:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    print("== 活性报告 ==")
    print(f"路由（loop 先于首个 research MCP）: {'PASS' if report['routing_ok'] else 'FAIL'}")
    print(f"anchor 立锚（⚠ 调度层活性）      : {'PASS' if report['anchor_used'] else 'FAIL'}")
    print(f"kernel 重启次数（上下文持久性）  : {report['kernel_restarts']}")
    print(f"rlm() 子代理落账                 : {report['rlm_children']}")
    leak = report["truth_leak"]
    print(f"kernel/bash 真值访问             : {'FAIL ' + ','.join(leak['matches']) if leak['detected'] else 'PASS'}")
    preview = report["prereg_preview"]
    print(f"预登记前执行评测命令（F1）        : "
          f"{'未测（需 --eval-pattern=）' if preview is None else ('⚠ 违规' if preview else '否')}")
    print("\n技能打开顺序:")
    for name, ts in report["skills_opened"].items():
        print(f"  {ts}  {name}")
    if report["move_cards_opened"]:
        print("移动卡:")
        for name, ts in report["move_cards_opened"].items():
            print(f"  {ts}  {name}")
    print(f"\nresearch_kit 调用: {report['kit_calls'] or '（无）'}")
    print(f"MCP 信念写入    : {report['mcp_calls'] or '（无 —— 编排未触发，见 H1）'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
