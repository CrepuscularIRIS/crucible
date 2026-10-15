#!/usr/bin/env python3
"""Token and wall-clock totals from Pi/Prime session JSONL (plan 05 §6, slice S0).

    python3 research/bench/cost_meter.py <session.jsonl | dir>... [--json]

Directories are searched recursively for *.jsonl (RLM children live in sub-*/).
Per model (provider/model) it sums the usage of every assistant message:
input (uncached), cached (cacheRead), cache_write, output. No dollar figures:
`usage.cost` is 0 on custom channels (plan 05 §6.1).

Child attribution: after an rlm() child finishes, Prime writes a
`child_usage_attributed` entry and folds the child's usage into the parent
assistant message. Prime writes one such entry per child turn and its
aggregateUsage is cumulative (own + c1 + ... + cN); on disk the message may
carry own or any aggregate. For those targets we count the latest aggregate
minus the sum of every childUsage (as Prime's computeOwnAndTotalUsage does),
so child tokens are
counted once, from the child's own session file. `attributed_child` sums the
attributions as a cross-check: if it is non-zero while `sessions.child` is 0,
the child session files were not passed in.

Only files whose first entry is a Pi `session` header are read.
Wall clock = last entry timestamp - first entry timestamp across all files.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

FIELDS = (("input", "input"), ("cached", "cacheRead"), ("cache_write", "cacheWrite"), ("output", "output"))


def _zero() -> dict[str, int]:
    return {"calls": 0, **{k: 0 for k, _ in FIELDS}}


def _tokens(usage: dict) -> dict[str, int]:
    return {k: int(usage.get(src) or 0) for k, src in FIELDS}


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _entries(path: Path) -> list[dict]:
    out = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(entry, dict):
            out.append(entry)
    return out


def collect_files(paths: list[Path]) -> list[Path]:
    found: dict[Path, None] = {}
    for p in paths:
        for f in sorted(p.rglob("*.jsonl")) if p.is_dir() else [p]:
            found[f.resolve()] = None
    return list(found)


def meter(files: list[Path]) -> dict:
    models: dict[str, dict[str, int]] = {}
    attributed = _zero()
    sessions = {"parent": 0, "child": 0}
    stamps: list[tuple[datetime, str]] = []

    used = 0
    for path in dict.fromkeys(Path(f).resolve() for f in files):
        entries = _entries(path)
        if not entries or entries[0].get("type") != "session":
            continue  # not a Pi session file (e.g. a harness log under session-artifacts/)
        used += 1
        # targetId -> (latest cumulative aggregate, sum of every childUsage); own = agg - sum
        attrib: dict[str, tuple[dict[str, int], dict[str, int]]] = {}
        for e in entries:
            if e.get("timestamp"):
                stamps.append((_ts(e["timestamp"]), e["timestamp"]))
            if e.get("type") == "session":
                depth = e.get("rlmDepth")  # Prime: rlmDepth wins; parentSession only when it is absent
                is_child = depth > 0 if isinstance(depth, int) else bool(e.get("parentSession"))
                sessions["child" if is_child else "parent"] += 1
            elif e.get("type") == "child_usage_attributed":
                child = _tokens(e.get("childUsage") or {})
                _, csum = attrib.get(e.get("targetId"), (None, dict.fromkeys(child, 0)))
                attrib[e.get("targetId")] = (_tokens(e.get("aggregateUsage") or {}), {k: csum[k] + child[k] for k in child})
                for k, v in child.items():
                    attributed[k] += v
                attributed["calls"] += 1
        own_override = {tid: {k: agg[k] - csum[k] for k in agg} for tid, (agg, csum) in attrib.items()}
        for e in entries:
            msg = e.get("message")
            if e.get("type") != "message" or not isinstance(msg, dict) or msg.get("role") != "assistant":
                continue
            usage = own_override.get(e.get("id")) or _tokens(msg.get("usage") or {})
            key = f"{msg.get('provider', '?')}/{msg.get('model', '?')}"
            row = models.setdefault(key, _zero())
            row["calls"] += 1
            for k, v in usage.items():
                row[k] += v

    total = _zero()
    for row in models.values():
        for k, v in row.items():
            total[k] += v
    stamps.sort()
    return {
        "files": used,
        "sessions": sessions,
        "models": dict(sorted(models.items())),
        "total": total,
        "attributed_child": attributed,
        "first_ts": stamps[0][1] if stamps else None,
        "last_ts": stamps[-1][1] if stamps else None,
        "wall_clock_sec": round((stamps[-1][0] - stamps[0][0]).total_seconds(), 3) if stamps else 0,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("paths", nargs="+", type=Path)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    r = meter(collect_files(args.paths))
    if args.json:
        print(json.dumps(r, indent=2))
        return 0
    print(f"files {r['files']}  sessions parent={r['sessions']['parent']} child={r['sessions']['child']}")
    print(f"wall clock {r['wall_clock_sec'] / 60:.1f} min  ({r['first_ts']} -> {r['last_ts']})")
    print(f"{'model':40} {'calls':>6} {'input':>12} {'cached':>12} {'cache_wr':>10} {'output':>10}")
    for name, row in [*r["models"].items(), ("TOTAL", r["total"])]:
        print(f"{name:40} {row['calls']:>6} {row['input']:>12} {row['cached']:>12} {row['cache_write']:>10} {row['output']:>10}")
    if r["attributed_child"]["calls"] and not r["sessions"]["child"]:
        print("WARNING: parent attributes child usage but no child session file was given", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
