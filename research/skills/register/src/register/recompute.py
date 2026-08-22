"""recompute 规约执行器：land() 与宿主 gate 共用的"从原始文件重算指标"逻辑。

三种规约（记录在 prereg/P*.json，随 prereg 一同被时间戳与哈希锁定）：
  {"kind": "json",   "path": "metrics.json", "key": "acc"}
  {"kind": "regex",  "file": "eval.log", "pattern": "acc=([0-9.eE+-]+)", "group": 1}
  {"kind": "python", "source": "<完整 python 源码>"}   # 以 raw 目录为 cwd 子进程执行，stdout 须为一个 float

规约由 prereg 阶段写定；land() 与 gate 永远不读任何人"报告"的数字。
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


class RecomputeError(Exception):
    pass


def validate_spec(spec: dict[str, Any]) -> None:
    if not isinstance(spec, dict):
        raise RecomputeError("recompute 规约必须是 dict")
    kind = spec.get("kind")
    if kind == "json":
        if not spec.get("path") or not spec.get("key"):
            raise RecomputeError("json 规约需要 path 与 key")
    elif kind == "regex":
        if not spec.get("file") or not spec.get("pattern"):
            raise RecomputeError("regex 规约需要 file 与 pattern")
        try:
            re.compile(spec["pattern"])
        except re.error as exc:
            raise RecomputeError(f"regex 规约无法编译: {exc}") from exc
    elif kind == "python":
        if not spec.get("source"):
            raise RecomputeError("python 规约需要 source")
    else:
        raise RecomputeError(f"未知 recompute kind: {kind!r}")


def run_spec(spec: dict[str, Any], raw_dir: str) -> float:
    """在 raw_dir 下按规约重算指标，返回 float。任何失败抛 RecomputeError。"""
    validate_spec(spec)
    raw = Path(raw_dir)
    kind = spec["kind"]
    if kind == "json":
        target = raw / spec["path"]
        if not target.is_file():
            raise RecomputeError(f"原始文件缺失: {spec['path']}")
        data = json.loads(target.read_text(encoding="utf-8"))
        node: Any = data
        for part in str(spec["key"]).split("."):
            if not isinstance(node, dict) or part not in node:
                raise RecomputeError(f"key 路径不存在: {spec['key']}")
            node = node[part]
        return _to_float(node, f"metrics {spec['key']}")
    if kind == "regex":
        target = raw / spec["file"]
        if not target.is_file():
            raise RecomputeError(f"原始文件缺失: {spec['file']}")
        text = target.read_text(encoding="utf-8", errors="replace")
        match = re.search(spec["pattern"], text)
        if not match:
            raise RecomputeError(f"regex 未命中: {spec['pattern']}")
        group = spec.get("group", 1)
        captured = match.group(group) if match.groups() else match.group(0)
        return _to_float(captured, "regex 捕获")
    # kind == "python"：prereg 锁定的源码，子进程执行，stdout 取 float
    result = subprocess.run(
        [sys.executable, "-c", spec["source"]],
        cwd=raw_dir,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RecomputeError(f"python 规约执行失败: {result.stderr.strip()[:300]}")
    return _to_float(result.stdout.strip().splitlines()[-1], "python stdout")


def _to_float(value: Any, what: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise RecomputeError(f"{what} 不是数值: {value!r}") from exc
