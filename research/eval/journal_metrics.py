#!/usr/bin/env python3
"""Deterministic metrics from an E1 campaign bundle's journal.

Recomputes, with zero LLM calls, the claims the report makes about a run:
  - forecast traceability (declared forecast vs journal-observed means)
  - held-out protocols (forecast protocols never simulated = honest generalization)
  - duplicate simulate rate, claim funnel, attack kinds
  - prereg / report sha256 integrity, gate verdict
  - external nudges (user messages that are not runtime context)

Usage: python3 journal_metrics.py BUNDLE_DIR [BUNDLE_DIR ...]
       (BUNDLE_DIR = campaign dir; run/journal.jsonl found at BUNDLE/run
        or one level down at BUNDLE/ARM/run)
"""
from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

CONTEXT_PREFIX = "**当前时间"


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def stable_digest(path: Path) -> str | None:
    """Port of packages/research-mcp/src/state.ts stableStringify + sha256
    (the runtime's own prereg freeze hash; gates/prereg.ts re-checks it too)."""
    if not path.is_file():
        return None
    obj = json.loads(path.read_text(encoding="utf-8"))
    canonical = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def is_context_msg(text: str) -> bool:
    return text.startswith(CONTEXT_PREFIX)


def first_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                return part.get("text", "")
    return ""


def nudge_count(session_path: Path) -> tuple[int, int]:
    """(external nudges, total non-context user messages) from the UI-level
    session log (proma-session.jsonl: type=='user' text messages; tool_result
    entries excluded). The runtime view (session.jsonl) shows wakes only as
    context refreshes — it must not be used for this count."""
    nudges = total = 0
    if not session_path.is_file():
        return -1, -1
    for line in open(session_path, encoding="utf-8", errors="replace"):
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get("type") != "user":
            continue
        msg = e.get("message") or {}
        content = msg.get("content")
        if not isinstance(content, list) or not content:
            continue
        if content[0].get("type") != "text":  # tool_result turns excluded
            continue
        if not content[0].get("text", "").strip():  # UI streaming artifacts
            continue
        if is_context_msg(content[0].get("text", "")):
            continue
        total += 1
        nudges += 1 if total > 1 else 0  # first non-context msg = the task itself
    return nudges, total


def find_run_dirs(bundle: Path) -> list[Path]:
    """Expand a campaign dir to every arm dir holding run/journal.jsonl
    (corpus layout: CAMPAIGN/ARM/run — plus-litellm-r2, 38max-direct-r1, …)."""
    if (bundle / "run" / "journal.jsonl").is_file():
        return [bundle]
    if not bundle.is_dir():
        return []
    return [c for c in sorted(bundle.iterdir()) if (c / "run" / "journal.jsonl").is_file()]


def bundle_metrics(bundle: Path) -> dict:
    """bundle here is the ARM dir (has run/ inside); label = campaign/arm."""
    run = bundle / "run"
    campaign = bundle.parent.name.replace("-s0", "")
    arm = bundle.name
    ops: list[dict] = []
    jp = run / "journal.jsonl"
    for line in open(jp, encoding="utf-8", errors="replace"):
        try:
            ops.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    sims: dict[str, list[float]] = defaultdict(list)
    sim_modes: Counter[str] = Counter()
    claims: dict[str, str | None] = {}  # id -> last transition state
    attacks: Counter[str] = Counter()
    prereg_shas: dict[str, str] = {}
    report_sha: str | None = None
    forecast: dict | None = None
    gate: dict | None = None
    ts_first = ts_last = None
    from datetime import datetime

    for e in ops:
        ts = e.get("ts")
        if ts:
            ts_first = ts_first or ts
            ts_last = ts
        op = e.get("op", "")
        if op == "world.simulate":
            sims[e.get("protocol", "?")].append(e.get("mean_spike_count"))
            sim_modes[e.get("mode", "?")] += 1
        elif op == "claim.propose":
            claims.setdefault(e["id"], None)
        elif op == "claim.transition":
            claims[e["id"]] = e.get("to", "?")
        elif op == "attack.record":
            attacks[e.get("kind", "?")] += 1
        elif op == "prereg.write":
            prereg_shas[e.get("pid", "?")] = e.get("spec_sha256", "")
        elif op == "report.declare":
            report_sha = e.get("sha256")
        elif op == "world.forecast":
            forecast = e
        elif op == "gate.verdict":
            gate = e

    # forecast vs journal evidence: report the deviation itself, not a tuned pass/fail
    fc_max_dev = None
    heldout_n = 0
    if forecast and "counts" in forecast:
        devs = []
        for proto, fc_val in forecast["counts"].items():
            obs = [v for v in sims.get(proto, []) if isinstance(v, (int, float))]
            if not obs:
                heldout_n += 1
                continue
            devs.append(abs(fc_val - sum(obs) / len(obs)))
        fc_max_dev = round(max(devs), 2) if devs else None

    # REPORT.md must quote the same MSE the journal declared (no post-hoc rewrite);
    # match any rounding of the declared value (reports write 1-4 decimals)
    mse_in_report = None
    if forecast and "spike_forecast_mse" in forecast:
        txt = (run / "REPORT.md").read_text(encoding="utf-8", errors="replace") if (run / "REPORT.md").is_file() else ""
        mse = forecast["spike_forecast_mse"]
        mse_in_report = any(f"{mse:.{p}f}" in txt for p in range(0, 7))  # reports write "≈37"/"35.5"/full

    total_sims = sum(sim_modes.values())
    unique_protos = len(sims)
    dup_rate = 1 - unique_protos / total_sims if total_sims else 0.0

    prereg_ok = prereg_bad = 0
    for pid, want in prereg_shas.items():
        got = stable_digest(run / "prereg" / f"{pid}.json")
        if got is not None:
            prereg_ok += int(got == want)
            prereg_bad += int(got != want)

    report_ok = None
    if report_sha:
        got = sha256_file(run / "REPORT.md")
        report_ok = got == report_sha if got else None

    states = Counter(v or "OPEN" for v in claims.values())
    proma_sess = run.parent / "proma-session.jsonl"
    if not proma_sess.is_file():  # demo-style bundles keep sessions at campaign root
        proma_sess = run.parent.parent / "proma-session.jsonl"
    nudges, user_msgs = nudge_count(proma_sess)

    return {
        "bundle": f"{campaign}/{arm}",
        "sim_calls": total_sims,
        "unique_protocols": unique_protos,
        "repl_rate": round(dup_rate, 3),
        "claims_proposed": len(claims),
        "claims_final": dict(sorted(states.items())),
        "attacks": dict(sorted(attacks.items())),
        "forecast_mse_declared": round(forecast["spike_forecast_mse"], 3) if forecast else None,
        "mse_in_report": mse_in_report,
        "fc_max_dev": fc_max_dev,
        "heldout_protocols": heldout_n,
        "prereg_sha_ok": f"{prereg_ok}/{prereg_ok + prereg_bad}",
        "report_sha_ok": report_ok,
        "gate_passed": (gate or {}).get("passed"),
        "nudges_external": nudges,
        "duration_min": round(
            (datetime.fromisoformat(ts_last.replace("Z", "+00:00"))
             - datetime.fromisoformat(ts_first.replace("Z", "+00:00"))).total_seconds() / 60,
            1,
        ) if ts_first and ts_last else None,
    }


COLS = [
    ("bundle", "bundle"), ("sim_calls", "sims"), ("unique_protocols", "uniq"),
    ("repl_rate", "repl"), ("claims_proposed", "claims"), ("claims_final", "final"),
    ("attacks", "attacks"), ("forecast_mse_declared", "MSE"),
    ("mse_in_report", "mse∈rep"), ("fc_max_dev", "fc_dev"), ("heldout_protocols", "heldout"),
    ("prereg_sha_ok", "prereg"), ("report_sha_ok", "rep_sha"),
    ("gate_passed", "gate"), ("nudges_external", "nudge"), ("duration_min", "min"),
]


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    rows = [bundle_metrics(arm) for a in argv[1:] for arm in find_run_dirs(Path(a))]
    widths = {c: max(len(c), *(len(str(r.get(c, ""))) for r in rows)) for c, _ in COLS}
    print(" | ".join(c.ljust(widths[c]) for c, _ in COLS))
    print("-|-".join("-" * widths[c] for c, _ in COLS))
    for r in rows:
        if "error" in r:
            print(f"{r['bundle']}: {r['error']}")
            continue
        print(" | ".join(str(r.get(c, "")).ljust(widths[c]) for c, _ in COLS))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
