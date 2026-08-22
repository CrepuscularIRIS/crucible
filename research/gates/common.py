"""宿主端 gate 共享逻辑。

刻意只用标准库、刻意不 import skills 包：宿主（人/CI/容器外的 run.sh）必须能在
零依赖下重放与重算。recompute 逻辑与 skills/register 的实现等价（双份维护，
改一处必须同步另一处并各跑一次测试）。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from typing import Any


def load_register(run_dir: str) -> dict[str, Any]:
    path = os.path.join(run_dir, "register.json")
    if not os.path.exists(path):
        raise SystemExit(f"REFUSE: register.json 不存在: {path}")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_prereg(run_dir: str, probe: dict[str, Any]) -> dict[str, Any] | None:
    rel = probe.get("prereg_path")
    if not rel:
        return None
    path = os.path.join(run_dir, rel)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def sha256_file(path: str) -> str:
    import hashlib

    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def recompute_metric(spec: dict[str, Any], raw_dir: str) -> float:
    """与 skills/register/src/register/recompute.py 等价（stdlib-only 版）。"""
    kind = spec.get("kind")
    if kind == "json":
        with open(os.path.join(raw_dir, spec["path"]), encoding="utf-8") as fh:
            node: Any = json.load(fh)
        for part in str(spec["key"]).split("."):
            node = node[part]
        return float(node)
    if kind == "regex":
        with open(os.path.join(raw_dir, spec["file"]), encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        match = re.search(spec["pattern"], text)
        if not match:
            raise ValueError(f"regex 未命中: {spec['pattern']}")
        captured = match.group(spec.get("group", 1)) if match.groups() else match.group(0)
        return float(captured)
    if kind == "python":
        result = subprocess.run(
            [sys.executable, "-c", spec["source"]],
            cwd=raw_dir, capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            raise ValueError(f"python 规约失败: {result.stderr.strip()[:200]}")
        return float(result.stdout.strip().splitlines()[-1])
    raise ValueError(f"未知 recompute kind: {kind!r}")


def journal_lines(run_dir: str) -> list[dict[str, Any]]:
    path = os.path.join(run_dir, "journal.jsonl")
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def conclude(gate: str, refusals: list[str], details: list[str] | None = None) -> int:
    """统一出口：打印裁决，PASS 退出 0，FAIL 退出 1。"""
    for line in details or []:
        print(f"  · {line}")
    if refusals:
        print(f"GATE {gate}: FAIL")
        for r in refusals:
            print(f"  ✗ {r}")
        return 1
    print(f"GATE {gate}: PASS")
    return 0
