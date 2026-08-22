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


MAX_REGEX_INPUT = 1 << 20  # 1 MiB：给模型写的 pattern 一个有界输入，避免灾难性回溯


def confined(base: str, rel: str) -> str:
    """把模型给的相对路径钉死在 base 内（挡 ..、绝对路径、符号链接逃逸）。"""
    base_real = os.path.realpath(base)
    target = os.path.realpath(os.path.join(base_real, str(rel)))
    if target != base_real and not target.startswith(base_real + os.sep):
        raise ValueError("路径逃出 run 目录")
    if os.path.exists(target) and not os.path.isfile(target):
        raise ValueError("目标不是普通文件")
    return target


def recompute_metric(spec: dict[str, Any], raw_dir: str) -> float:
    """与 skills/register/src/register/recompute.py 等价（stdlib-only 版）。

    宿主侧是裁决层，**永不执行模型写的代码**：kind='python' 一律拒绝（容器内的同名
    gate 仍可执行，那里本来就是沙箱）。路径一律 confined，报错文本不回显文件内容或
    模型给的 pattern——那条回显曾经把宿主文件读进 artifacts 日志。
    """
    kind = spec.get("kind")
    if kind == "python":
        raise ValueError("宿主 gate 拒绝 recompute kind='python'（裁决层不执行模型代码）")
    if kind == "json":
        with open(confined(raw_dir, spec["path"]), encoding="utf-8") as fh:
            node: Any = json.load(fh)
        for part in str(spec["key"]).split("."):
            node = node[part]
        return float(node)
    if kind == "regex":
        with open(confined(raw_dir, spec["file"]), encoding="utf-8", errors="replace") as fh:
            text = fh.read(MAX_REGEX_INPUT)
        match = re.search(spec["pattern"], text)
        if not match:
            raise ValueError("regex 未命中")
        captured = match.group(spec.get("group", 1)) if match.groups() else match.group(0)
        return float(captured)
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
