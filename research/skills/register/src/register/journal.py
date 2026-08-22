"""append-only journal（journal.jsonl）。

单文件、只追加。gate 靠重放它对账；拒绝（ok=False）也记录——尝试本身就是事实。
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from typing import Any, Iterator


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


class Journal:
    def __init__(self, run_dir: str) -> None:
        self.path = os.path.join(run_dir, "journal.jsonl")

    def append(self, op: str, ok: bool, **fields: Any) -> dict[str, Any]:
        entry: dict[str, Any] = {
            "ts": utc_now_iso(),
            "unix_ts": time.time(),
            "op": op,
            "ok": ok,
        }
        entry.update(fields)
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        return entry

    def replay(self) -> Iterator[dict[str, Any]]:
        if not os.path.exists(self.path):
            return
        with open(self.path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    yield json.loads(line)

    def last(self, op: str) -> dict[str, Any] | None:
        found = None
        for entry in self.replay():
            if entry.get("op") == op:
                found = entry
        return found


def atomic_write_json(path: str, data: Any) -> None:
    """临时文件 + fsync + rename 的原子写，避免半截 JSON。"""
    directory = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
