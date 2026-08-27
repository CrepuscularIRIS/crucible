#!/usr/bin/env python3
"""Proma session.jsonl → agent-as-a-judge traj/*.json 垫片(E2 评测基建)。

把 Pi SDK 会话转录转成判官认识的 Claude Code 日志形状:
  assistant: message.content[{type:tool_use,id,name,input}] / {type:text}
  user(tool_result): message.content[{type:tool_result,tool_use_id,content}]

用法:
  python3 proma2traj.py --session <session.jsonl> --task-id <id> \
      [--report <REPORT.md>] [--out-dir <traj_dir>] [--reward <float>]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def convert(session_path: str) -> list[dict]:
    out: list[dict] = []
    for line in open(session_path, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        if d.get("type") != "message":
            continue  # session/model_change/child_usage 等元事件不进判官语料
        m = d.get("message", {})
        role = m.get("role")
        content = m.get("content")
        ts = d.get("timestamp")

        if role == "user":
            text = content if isinstance(content, str) else " ".join(
                b.get("text", "") for b in content if isinstance(b, dict))
            if text.strip():
                out.append({"type": "user", "timestamp": ts,
                            "message": {"role": "user", "content": text}})

        elif role == "assistant":
            blocks = []
            for b in content or []:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and b.get("text"):
                    blocks.append({"type": "text", "text": b["text"]})
                elif b.get("type") == "toolCall":
                    blocks.append({
                        "type": "tool_use",
                        "id": b.get("id", ""),
                        "name": b.get("name", "unknown"),
                        "input": b.get("arguments", b.get("args", {})) or {},
                    })
            if blocks:
                out.append({"type": "assistant", "timestamp": ts,
                            "message": {"role": "assistant", "content": blocks}})

        elif role == "toolResult":
            c = m.get("content")
            text = c if isinstance(c, str) else " ".join(
                b.get("text", "") for b in (c or []) if isinstance(b, dict))
            out.append({"type": "user", "timestamp": ts, "message": {"role": "user", "content": [
                {"type": "tool_result",
                 "tool_use_id": m.get("toolCallId", ""),
                 "content": text[:20000]}]}})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--task-id", required=True)
    ap.add_argument("--report", default="")
    ap.add_argument("--reward", type=float, default=None)
    ap.add_argument("--out-dir", default="traj")
    args = ap.parse_args()

    events = convert(args.session)
    traj = {
        "task_id": args.task_id,
        "claude_log": "\n".join(json.dumps(e, ensure_ascii=False) for e in events),
        "report_md": (Path(args.report).read_text(encoding="utf-8")
                      if args.report and Path(args.report).exists() else ""),
        "decision": {},
        "reward": args.reward,
        "reason": "",
        "dims": {},
    }
    out = Path(args.out_dir) / f"{args.task_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(traj, ensure_ascii=False), encoding="utf-8")
    print(f"{out} events={len(events)}")


if __name__ == "__main__":
    main()
