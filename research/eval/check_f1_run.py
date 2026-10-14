#!/usr/bin/env python3
"""check_f1_run — F1 rerun behaviour checker (03 §10.2, B0–B9). Read-only, deterministic, zero model calls.

    python3 research/eval/check_f1_run.py RUN_DIR [--work DIR] [--jobs DIR] [--session F]... [--k0 F]
                                          [--budget N] [--json]

RUN_DIR holds journal.jsonl, prereg/, REPORT.md, world-ledger.jsonl: the live <cwd>/.proma-research/<run>, or an
archived campaign dir. For the live layout --work / --jobs default to <cwd>/research-work/<run> and
<cwd>/.rlm-jobs/<run>. Each check is PASS / FAIL / UNKNOWN; UNKNOWN means a data source is absent and never
counts as PASS. Exit status 1 when any check FAILs. Session JSONL(s) and k0-host.json are only read when
passed explicitly (host copies: session-artifacts/<id>/…); files with those names inside RUN_DIR are ignored.

Limits (stated, not hidden):
  - B9's leak scan skips world names: 03 §13 Q1 settled "no alias", so the name is a known ceiling, and the
    run-level alias scan (A7) is not implemented.
  - B9's numeric scan of free text (tool returns, ledger, work files) flags a line holding a channel's whole
    fingerprint (at least 3 of its numbers when it has more); it is a heuristic, and every hit names its source.
  - B0 reads arm.mode / arm.contaminated from k0-host.json (interface 11, written by track C's SE7b).
  - Sim records are agent-written and taken at face value (reps, block, segments); recomputing them from
    their seed is the host's job (F1-T6, deferred past the defense).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import liveness
import nbsim_strip

SIM_REPS_MIN = 64  # 03 §9.2 card rule 1 / B2
VERDICTS = {"REFUTED", "SUPPORTED"}
RSTAR_RE = re.compile(r"r\*\s*[=≈:]\s*(\d+)")
D_RE = re.compile(r"(?<![A-Za-z_])d\s*[=≈]")
SIGMA_RE = re.compile(r"(?:σ|sigma)\s*[=≈]", re.I)
SIM_REF_RE = re.compile(r"\bsim:([\w.-]+)")
PID_RE = re.compile(r"\bP\d+\b")
ABSENCE_RE = re.compile(r"不存在|does not exist|do not exist|is absent|are absent", re.I)
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")
TEXT_SUFFIXES = {".json", ".jsonl", ".md", ".txt", ".csv", ".py", ".log", ".yaml", ".yml"}  # binary plots skipped


def _jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    out = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _sim_records(d: Path | None, recursive: bool = False) -> dict[str, tuple[dict, datetime]]:
    """{stem: (record, mtime)} for JSON files holding `counts_mean` (03 §6 record shape)."""
    if not d or not d.is_dir():
        return {}
    out = {}
    for f in sorted(d.rglob("*.json") if recursive else d.glob("*.json")):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(rec, dict) and "counts_mean" in rec:
            out[f.stem] = (rec, datetime.fromtimestamp(f.stat().st_mtime, timezone.utc))
    return out


def _int(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _task(path: Path) -> dict | None:
    """nbsim/task.json, or None when it is not readable as one (the agent can chmod and edit its copy)."""
    try:
        task = json.loads(path.read_text(encoding="utf-8"))
        [(str(lab), seg) for lab, seg in [*task["protocols"], *task["held_out"]]]
        return task
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _result(cid: str, status: str, why: str) -> dict:
    return {"id": cid, "status": status, "why": why}


def _combine(cid: str, parts: list[tuple[str, str]]) -> dict:
    status = "FAIL" if any(s == "FAIL" for s, _ in parts) else "UNKNOWN" if any(s == "UNKNOWN" for s, _ in parts) else "PASS"
    return _result(cid, status, "; ".join(w for _, w in parts))


class Run:
    def __init__(self, run_dir: Path, work, jobs, sessions, k0, budget):
        self.dir = Path(run_dir)
        self.journal = _jsonl(self.dir / "journal.jsonl")
        name = next((e.get("run") for e in self.journal if e.get("op") == "run.init"), self.dir.name)
        if self.dir.parent.name == ".proma-research":
            cwd = self.dir.parent.parent
            work = work or cwd / "research-work" / name
            jobs = jobs or cwd / ".rlm-jobs" / name
        self.work = Path(work) if work else None
        self.jobs = Path(jobs) if jobs else None
        self.preregs = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((self.dir / "prereg").glob("*.json"))}
        report = self.dir / "REPORT.md"
        self.report = report.read_text(encoding="utf-8", errors="replace").replace("−", "-") if report.is_file() else ""
        # never auto-discovered inside RUN_DIR: the host does not write them there, so a file found there
        # could be planted by the agent; the operator passes the host's copies explicitly
        self.sessions = [Path(s) for s in sessions or []]
        self.k0 = Path(k0) if k0 else None
        self.budget = budget or int(os.environ.get("PROMA_EVAL_BUDGET", "").strip() or 8)
        self.records = _sim_records(self.work / "sim") if self.work else {}
        self.misplaced = len(_sim_records(self.jobs, recursive=True)) if self.jobs else 0
        task = self.work / "nbsim" / "task.json" if self.work else None
        self.task = _task(task) if task and task.is_file() else None
        self.live = [liveness.analyze(liveness.load(str(s))) for s in self.sessions]
        self.world = next((e.get("world") for e in self.journal if e.get("op", "").startswith("world.") and e.get("world")), None)

    def ops(self, op: str) -> list[dict]:
        return [e for e in self.journal if e.get("op") == op]

    def r_star(self, pid: str) -> int | None:
        m = RSTAR_RE.search(str(self.preregs.get(pid, {}).get("question", "")))
        return int(m.group(1)) if m else None

    def reps(self, pid: str) -> int | None:
        observed = [e.get("reps") for e in self.ops("world.observe") if e.get("pid") == pid]
        if observed:
            return int(observed[-1])
        reps = (self.preregs.get(pid, {}).get("observe") or {}).get("reps")
        return int(reps) if reps is not None else None

    def powered(self, pid: str) -> bool:
        r, n = self.r_star(pid), self.reps(pid)
        return r is not None and n is not None and n >= r

    def misplaced_note(self) -> str:
        return f"; {self.misplaced} sim record(s) misplaced under .rlm-jobs (not counted)" if self.misplaced else ""


def b0(run: Run) -> dict:
    if run.k0 is None:
        return _result("B0", "UNKNOWN", "no k0-host.json (runs before SE7b have no arm record)")
    raw = json.loads(run.k0.read_text(encoding="utf-8")).get("arm")
    # SE7b writes {"arm": {"mode", "source", "contaminated", "reasons"}}; a bare string is also accepted
    arm = str((raw.get("mode") if isinstance(raw, dict) else raw) or "")
    if not arm:
        return _result("B0", "UNKNOWN", "k0-host.json has no arm mode")
    contaminated = bool(isinstance(raw, dict) and raw.get("contaminated")) or "contaminated" in arm
    ok = arm.split()[0] == "frozen" and not contaminated
    return _result("B0", "PASS" if ok else "FAIL", f"arm={arm!r} contaminated={contaminated}")


def b1(run: Run) -> dict:
    preregs = [_ts(e["ts"]) for e in run.ops("prereg.write") if e.get("ts")]
    first = min(preregs) if preregs else None
    early = [s for s, (_, mtime) in run.records.items() if first is None or mtime < first]
    if not early:
        what = "no sim records under research-work/<run>/sim" if not run.records else "no sim record before the first prereg"
        return _result("B1", "FAIL", what + run.misplaced_note())
    if not run.live:
        return _result("B1", "UNKNOWN", f"{len(early)} sim record(s) before first prereg; no session JSONL to confirm `import nbsim`")
    imports = sum(r["nbsim"]["parent"]["import"] + r["nbsim"]["child"]["import"] for r in run.live)
    return _result("B1", "PASS" if imports else "FAIL", f"import nbsim ×{imports}; {len(early)} sim record(s) before first prereg")


def _referenced(run: Run) -> set[str]:
    return {sid for p in run.preregs.values() for sid in SIM_REF_RE.findall(str(p.get("question", "")))}


def _record_for(run: Run, sid: str):
    return next((rec for stem, (rec, _) in run.records.items() if stem == sid or stem.endswith(f"-{sid}")), None)


def b2(run: Run) -> dict:
    if not run.records:
        legacy = len(run.ops("world.simulate"))
        return _result("B2", "FAIL", f"no sim records (legacy MCP world.simulate ×{legacy}, reps capped at 20)" + run.misplaced_note())
    refs = _referenced(run)
    used = {sid: _record_for(run, sid) for sid in refs} if refs else {s: rec for s, (rec, _) in run.records.items()}
    missing = sorted(s for s, rec in used.items() if rec is None)
    low = sorted(s for s, rec in used.items() if rec is not None and _int(rec.get("reps")) < SIM_REPS_MIN)
    if missing or low:
        return _result("B2", "FAIL", f"cited but absent: {missing}; reps < {SIM_REPS_MIN}: {low}")
    return _result("B2", "PASS", f"{len(used)} record(s) {'cited by preregs' if refs else '(none cited; all checked)'} have reps ≥ {SIM_REPS_MIN}")


def b3(run: Run) -> dict:
    if not run.records:
        return _result("B3", "FAIL", "no sim records" + run.misplaced_note())
    recs = [rec for rec, _ in run.records.values()]
    blocker = any(rec.get("block") for rec in recs)
    if run.task is None:
        return _result("B3", "FAIL" if not blocker else "UNKNOWN",
                       f"blocker column: {blocker}; no nbsim/task.json to tell self-written segments from pool / held-out")
    known = {nbsim_strip.seg_key(seg) for _, seg in [*run.task["protocols"], *run.task["held_out"]]}
    keys = [nbsim_strip.seg_key(rec.get("segments")) for rec in recs]
    own = any(k is not None and k not in known for k in keys)
    return _result("B3", "PASS" if blocker and own else "FAIL", f"blocker column: {blocker}; self-written segment: {own}")


def b4(run: Run) -> dict:
    if not run.preregs:
        return _result("B4", "FAIL", "no prereg")
    gaps = {}
    for pid, p in run.preregs.items():
        q = str(p.get("question", ""))
        miss = [k for k, rx in (("d", D_RE), ("σ", SIGMA_RE), ("r*", RSTAR_RE), ("sim:id", SIM_REF_RE)) if not rx.search(q)]
        if miss:
            gaps[pid] = miss
    return _result("B4", "FAIL" if gaps else "PASS", f"missing: {gaps}" if gaps else f"{len(run.preregs)} prereg(s) carry d, σ, r*, sim id")


def b5(run: Run) -> dict:
    bad = []
    for e in run.ops("claim.transition"):
        if e.get("to") not in VERDICTS:
            continue
        pid = e.get("by_probe")
        if not pid:
            bad.append(f"{e.get('id')}→{e['to']} without a probe")
        elif run.r_star(pid) is None:
            bad.append(f"{e.get('id')}→{e['to']} by {pid}: r* undeclared")
        elif not run.powered(pid):
            bad.append(f"{e.get('id')}→{e['to']} by {pid}: reps {run.reps(pid)} < r* {run.r_star(pid)}")
    return _result("B5", "FAIL" if bad else "PASS", "; ".join(bad) or "every REFUTED / SUPPORTED rests on a probe with reps ≥ r*")


def b6(run: Run) -> dict:
    blocked = [e for e in run.ops("world.observe") if str(e.get("blockers") or "").strip()]
    return _result("B6", "PASS" if blocked else "FAIL", f"observations with blockers: {len(blocked)}")


def b7(run: Run) -> dict:
    forecasts = run.ops("world.forecast")
    if len(forecasts) != 1:
        return _result("B7", "FAIL", f"{len(forecasts)} forecast(s); exactly one expected")
    labels = set((forecasts[0].get("counts") or {}).keys())
    lines = run.report.splitlines()
    untagged = sorted(lab for lab in labels if not any(lab in ln and "(sim:" in ln for ln in lines))
    expected = {lab for lab, _ in run.task["held_out"]} if run.task else None
    missing = sorted(expected - labels) if expected is not None else []
    if untagged or missing:
        return _result("B7", "FAIL", f"not forecast: {missing}; REPORT value without (sim:…): {untagged}")
    if expected is None:
        return _result("B7", "UNKNOWN", f"{len(labels)} value(s) tagged (sim:…); held-out set unknown (no nbsim/task.json)")
    return _result("B7", "PASS", f"all {len(expected)} held-out forecast once, each tagged (sim:…)")


def b8(run: Run) -> dict:
    if not run.report:
        return _result("B8", "UNKNOWN", "no REPORT.md")
    bad = [ln.strip()[:80] for ln in run.report.splitlines()
           if ABSENCE_RE.search(ln) and not ((pids := PID_RE.findall(ln)) and all(run.powered(p) for p in pids))]
    return _result("B8", "FAIL" if bad else "PASS",
                   f"absence claim(s) without a probe with reps ≥ r*: {bad}" if bad else "no unpowered absence claim")


def _text_hits(text: str, fp: dict, source: str) -> list[str]:
    hits = []
    for i, line in enumerate(text.replace("−", "-").splitlines(), 1):
        hits += [f"{source}:{i} {h['what']}" for h in nbsim_strip.text_hits(line, fp, None, skip_world_names=True)]
        nums = {float(x) for x in NUM_RE.findall(line)}
        hits += [f"{source}:{i} numbers of {v}" for v, fn in fp["f_num"].items() if len(nums & fn) >= min(3, len(fn))]
    return hits


def _leak_scan(run: Run) -> tuple[str, str]:
    nb_root = os.environ.get("NEURONBENCH_ROOT", "").strip()
    if not nb_root:
        return "UNKNOWN", "leak scan skipped (NEURONBENCH_ROOT unset)"
    fp = nbsim_strip.truth_fingerprints(Path(nb_root))
    hits: list[str] = []
    for s in run.sessions:
        for ev in liveness.load(str(s)):
            msg = ev.get("message")
            if isinstance(msg, dict) and msg.get("role") == "toolResult":
                text = "\n".join(c.get("text", "") for c in msg.get("content") or [] if isinstance(c, dict))
                hits += _text_hits(text, fp, f"{s.name}#{msg.get('toolName')}")
    ledger = run.dir / "world-ledger.jsonl"
    if ledger.is_file():
        hits += _text_hits(ledger.read_text(encoding="utf-8", errors="replace"), fp, ledger.name)
    for root in (run.work, run.jobs):
        if not root or not root.is_dir():
            continue
        for f in sorted(root.rglob("*")):
            if f.is_file() and f.suffix in TEXT_SUFFIXES and not (run.work and (run.work / "nbsim") in f.parents):
                hits += _text_hits(f.read_text(encoding="utf-8", errors="ignore"), fp, str(f.relative_to(root.parent)))
    if run.work and (run.work / "nbsim").is_dir():
        hits += [f"nbsim/{h.get('file', '')} {h['check']}:{h['what']}" for h in nbsim_strip.scan_package(run.work / "nbsim", fp, run.world)]
    scope = f"{len(run.sessions)} session(s), ledger, research-work, .rlm-jobs; world names excluded (§13 Q1)"
    return ("FAIL", f"truth fingerprints: {hits[:5]}{' …' if len(hits) > 5 else ''}") if hits else ("PASS", f"no truth fingerprint in {scope}")


def b9(run: Run) -> dict:
    spent = sum(int(e.get("cost", 0) or 0) for e in run.ops("world.observe"))
    if spent > run.budget:
        parts = [("FAIL", f"budget overspent {spent}/{run.budget}")]
    elif spent < run.budget:
        parts = [("FAIL", f"budget left unspent {spent}/{run.budget} (01 K2-1)")]
    else:
        parts = [("PASS", f"budget {spent}/{run.budget}")]
    if run.live:
        leaks = sorted({m for r in run.live for m in r["truth_leak"]["matches"]})
        parts.append(("FAIL" if leaks else "PASS", f"liveness truth access: {leaks or 'none'}"))
    else:
        parts.append(("UNKNOWN", "no session JSONL for liveness"))
    parts.append(_leak_scan(run))
    return _combine("B9", parts)


CHECKS = (b0, b1, b2, b3, b4, b5, b6, b7, b8, b9)


def check(run_dir: Path, *, work=None, jobs=None, sessions=None, k0=None, budget=None) -> list[dict]:
    run = Run(Path(run_dir), work, jobs, sessions, k0, budget)
    return [fn(run) for fn in CHECKS]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("run_dir")
    ap.add_argument("--work")
    ap.add_argument("--jobs")
    ap.add_argument("--session", action="append")
    ap.add_argument("--k0")
    ap.add_argument("--budget", type=int)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    results = check(Path(args.run_dir), work=args.work, jobs=args.jobs, sessions=args.session, k0=args.k0, budget=args.budget)
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for r in results:
            print(f"{r['id']}  {r['status']:<7}  {r['why']}")
    return 1 if any(r["status"] == "FAIL" for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
