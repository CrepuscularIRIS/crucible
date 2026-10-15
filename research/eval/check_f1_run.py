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
  - B9's numeric scan is a heuristic, and every hit names its source. A session tool return (one cell) is hit
    when it holds ≥3 numbers of one channel, or one of its lines (ended by a real or an escaped newline) holds
    the whole fingerprint of a channel with fewer than 3 numbers; a ledger / work-file line when it holds the
    channel's whole fingerprint (≥3 of its numbers when it has more). Digits inside identifiers (P5, H10,
    K1-9, hashes, dates) and list enumerators are not numbers; escaped \\n \\t \\r count as whitespace. A hit
    is "explained" (reported, not failed) when one declared candidate holds every matched number: one sim
    record's `mechanism` (for a cell: written before it), or for a cell one earlier assistant message (its
    text or tool-call argument strings: the agent typed the numbers before a tool returned them).
    The investigate track's diagnosis of the final run (03 §10.2) is what these rules encode.
  - B4 / B5 / B8 read d, σ, r* from the prereg's `discrimination` and `question` (free text: ≈ = ： ＝,
    Chinese punctuation, σ_total, per-pair "H0–H10 … r*=1"). A claim's r* is the largest r* declared for a
    pair holding it; a claim in no declared pair has none, unless the prereg declares no pair (then the
    largest r* it declares stands in, as it does for B8, which names no claim). Its sim id may also be a
    `sims[]` citation. B8 treats a quoted phrase as mentioned, not asserted, only right after a negated
    reporting verb (从不写 / 不等于 / 并非 …).
  - B7 reads per-label tags from REPORT, from research-work/<run>/forecast.md when REPORT cites it, and from a
    `provenance` map on the forecast event. A file-level list of sim records is not a per-label tag.
  - B3 / B7 take nbsim/task.json from the work dir; without one, and with NEURONBENCH_ROOT set, the host
    rebuilds the task from the benchmark (nbsim_strip's own recipe).
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
SEP = r"\s*[=≈:：＝~]\s*"
# "r*=3", "r*：3", "r＊＝3", "r*=⌈(2/d)²⌉=9" (a formula opening with a bracket, then its value)
RSTAR_RE = re.compile(r"r\s*[*＊⋆]" + SEP + r"(?:[⌈(\[（][^=≈＝，,；;、。\n]{0,30}[=≈＝]\s*)?(\d+)(?![\d.])")
PAIR_RE = re.compile(r"(?<![A-Za-z0-9_])(H\d+)\s*(?:[–—\-~/|]|vs\.?|对|与)\s*(H\d+)(?!\d)")
D_RE = re.compile(r"(?<![A-Za-z_])d(?:\s*[(（][^)）]{0,20}[)）]|_\w+)?" + SEP)
SIGMA_RE = re.compile(r"(?:σ|sigma|(?<![A-Za-z])sd)(?:_?[A-Za-z]+)?\s*(?:[(（][^)）]{0,12}[)）])?" + SEP, re.I)
SIM_REF_RE = re.compile(r"\bsim:([\w.-]+)")
SIM_CITE_RE = re.compile(r"\bsim:[\w.-]+|\bsim/[\w.-]+\.json")
PID_RE = re.compile(r"\bP\d+\b")
ABSENCE_RE = re.compile(r"不存在|does not exist|do not exist|is absent|are absent", re.I)
# a quoted phrase right after a negated reporting verb ("从不写"不存在"", "不等于"…不存在"") is mentioned, not
# asserted; any other nearby negation ("结论不变："…"", "不过，"…"") leaves it asserted
QUOTED_RE = re.compile(r'"[^"\n]*"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』|`[^`\n]*`')
MENTION_RE = re.compile(r"(?:(?:从|绝|并)?不(?:写|说|称|等于|是|意味着)|并非|而非|(?:never|not) (?:say|write|claim|mean)s?)"
                        r"\s*[:：]?\s*$", re.I)
# quantities only: digits inside identifiers (P5, H10, K1-9, sha hex, dates) and list enumerators ("## 3.") are not
NUM_RE = re.compile(r"(?<![A-Za-z0-9_.])(?<![0-9]-)-?\d+(?:\.\d+)?")
ENUM_RE = re.compile(r"(?m)^([\s#>*+-]*)\d+[.)、](?=\s|$)")
ESCAPED_WS_RE = re.compile(r"\\[ntr]")  # repr'd / JSON-escaped output: "x\\n1.5" holds 1.5
LINE_RE = re.compile(r"\n|\\n")  # a line ends at a real newline or at an escaped one
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


def _mtime(path: Path) -> datetime:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)


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
            out[f.stem] = (rec, _mtime(f))
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


def parse_rstar(text: str) -> tuple[dict[tuple[str, str], int], list[int]]:
    """({(Ha, Hb): r*}, [r* bound to no pair]). An r* belongs to the nearest pair before it in its sentence,
    unless another r* sits between them; a pair seen twice keeps its largest r*."""
    pairs: dict[tuple[str, str], int] = {}
    loose: list[int] = []
    for sentence in re.split(r"[；;。\n]", text):
        marks = sorted([(m.start(), "pair", (m.group(1), m.group(2))) for m in PAIR_RE.finditer(sentence)]
                       + [(m.start(), "r", int(m.group(1))) for m in RSTAR_RE.finditer(sentence)])
        last = None
        for _, kind, val in marks:
            if kind == "pair":
                last = val
            elif last is not None:
                pairs[last] = max(pairs.get(last, 0), val)
                last = None
            else:
                loose.append(val)
    return pairs, loose


def _nums(text: str) -> set[float]:
    return {float(x) for x in NUM_RE.findall(ENUM_RE.sub(r"\1", ESCAPED_WS_RE.sub(" ", text)))}


def _flat(obj) -> str:
    """Tool-call arguments as plain text (their string values joined, not JSON-escaped)."""
    if isinstance(obj, dict):
        return "\n".join(map(_flat, obj.values()))
    if isinstance(obj, (list, tuple)):
        return "\n".join(map(_flat, obj))
    return "" if obj is None or isinstance(obj, bool) else str(obj)


def _numbers_in(obj) -> set[float]:
    if isinstance(obj, dict):
        return set().union(*map(_numbers_in, obj.values())) if obj else set()
    if isinstance(obj, (list, tuple)):
        return set().union(*map(_numbers_in, obj)) if obj else set()
    return {float(obj)} if isinstance(obj, (int, float)) and not isinstance(obj, bool) else set()


def _candidates(records: dict[str, tuple[dict, datetime]]) -> list[tuple[datetime, frozenset]]:
    """Per sim record: (mtime, the numbers of its declared `mechanism`)."""
    return [(mtime, frozenset(_numbers_in(rec.get("mechanism")))) for rec, mtime in records.values()]


def _before(cands: list[tuple[datetime, frozenset]], ts) -> list[frozenset]:
    """Candidate number sets written no later than `ts` (ISO string or epoch ms); all of them when ts is unknown."""
    try:
        when = _ts(ts) if isinstance(ts, str) else datetime.fromtimestamp(ts / 1000, timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return [c for _, c in cands]
    return [c for mtime, c in cands if mtime <= when]


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
        if self.work and (self.work / name).is_dir():  # --work given as the research-work root
            self.work = self.work / name
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
        self.live = [liveness.analyze(liveness.load(str(s))) for s in self.sessions]
        self.world = next((e.get("world") for e in self.journal if e.get("op", "").startswith("world.") and e.get("world")), None)
        task = self.work / "nbsim" / "task.json" if self.work else None
        self.task, self.task_src = (_task(task), "nbsim/task.json") if task and task.is_file() else (None, "")
        nb_root = os.environ.get("NEURONBENCH_ROOT", "").strip()
        if self.task is None and nb_root and self.world:
            try:  # the archive lacks nbsim/: rebuild the task the host handed out (nbsim_strip.build's recipe)
                self.task = json.loads(json.dumps(nbsim_strip._task(nbsim_strip._load_nb(Path(nb_root)), self.world)))
                self.task_src = "benchmark task"
            except Exception:  # unknown world / unimportable benchmark: the checks report UNKNOWN as before
                self.task = None

    def ops(self, op: str) -> list[dict]:
        return [e for e in self.journal if e.get("op") == op]

    def text(self, pid: str) -> str:
        p = self.preregs.get(pid, {})
        return f"{p.get('question') or ''}\n{p.get('discrimination') or ''}".replace("−", "-")

    def r_star(self, pid: str, claim: str | None = None) -> int | None:
        """The claim's pair r* (largest, when several pairs hold it). The largest r* the prereg declares stands in
        only when no claim is named, or when the prereg declares no pair at all: a claim outside every declared
        pair has no r* (nobody computed its power)."""
        pairs, loose = parse_rstar(self.text(pid))
        if claim is None or not pairs:
            every = [*pairs.values(), *loose]
            return max(every) if every else None
        own = [r for pair, r in pairs.items() if claim in pair]
        return max(own) if own else None

    def reps(self, pid: str) -> int | None:
        observed = [e.get("reps") for e in self.ops("world.observe") if e.get("pid") == pid]
        if observed:
            return int(observed[-1])
        reps = (self.preregs.get(pid, {}).get("observe") or {}).get("reps")
        return int(reps) if reps is not None else None

    def powered(self, pid: str, claim: str | None = None) -> bool:
        r, n = self.r_star(pid, claim), self.reps(pid)
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


def _sim_ids(run: Run, pid: str) -> set[str]:
    p = run.preregs.get(pid, {})
    text = run.text(pid) + "\n" + " ".join(map(str, (p.get("provenance") or {}).values()))
    cited = {Path(str(c.get("path", ""))).stem for c in p.get("sims") or [] if isinstance(c, dict)}
    return set(SIM_REF_RE.findall(text)) | (cited - {""})


def _referenced(run: Run) -> set[str]:
    return {sid for pid in run.preregs for sid in _sim_ids(run, pid)}


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
    own = sum(k is not None and k not in known for k in keys)
    return _result("B3", "PASS" if blocker and own else "FAIL",
                   f"blocker column: {blocker}; self-written segment(s): {own} ({run.task_src})")


def b4(run: Run) -> dict:
    if not run.preregs:
        return _result("B4", "FAIL", "no prereg")
    gaps = {}
    for pid in run.preregs:
        q = run.text(pid)
        miss = [k for k, rx in (("d", D_RE), ("σ", SIGMA_RE), ("r*", RSTAR_RE)) if not rx.search(q)]
        miss += [] if _sim_ids(run, pid) else ["sim:id"]
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
        elif run.r_star(pid, e.get("id")) is None:
            bad.append(f"{e.get('id')}→{e['to']} by {pid}: r* undeclared for {e.get('id')}")
        elif not run.powered(pid, e.get("id")):
            bad.append(f"{e.get('id')}→{e['to']} by {pid}: reps {run.reps(pid)} < r* {run.r_star(pid, e.get('id'))}")
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
    fmd = run.work / "forecast.md" if run.work else None
    if "forecast.md" in run.report and fmd and fmd.is_file():
        lines += fmd.read_text(encoding="utf-8", errors="replace").splitlines()
    prov = forecasts[0].get("provenance") or {}
    untagged = sorted(lab for lab in labels if not (SIM_CITE_RE.search(str(prov.get(lab, "")))
                                                    or any(lab in ln and SIM_CITE_RE.search(ln) for ln in lines)))
    expected = {lab for lab, _ in run.task["held_out"]} if run.task else None
    missing = sorted(expected - labels) if expected is not None else []
    if untagged or missing:
        return _result("B7", "FAIL", f"not forecast: {missing}; value without a per-label sim tag (REPORT / cited forecast.md / event): {untagged}")
    if expected is None:
        return _result("B7", "UNKNOWN", f"{len(labels)} value(s) tagged sim:…; held-out set unknown (no nbsim/task.json)")
    return _result("B7", "PASS", f"all {len(expected)} held-out forecast once, each tagged sim:… ({run.task_src})")


def b8(run: Run) -> dict:
    if not run.report:
        return _result("B8", "UNKNOWN", "no REPORT.md")
    def asserted(ln: str) -> str:
        return QUOTED_RE.sub(lambda m: " " if MENTION_RE.search(ln[:m.start()]) else m.group(), ln)

    bad = [ln.strip()[:80] for ln in run.report.splitlines()
           if ABSENCE_RE.search(asserted(ln)) and not ((pids := PID_RE.findall(ln)) and all(run.powered(p) for p in pids))]
    return _result("B8", "FAIL" if bad else "PASS",
                   f"absence claim(s) without a probe with reps ≥ r*: {bad}" if bad else "no unpowered absence claim")


def _number_hits(nums: set[float], fp: dict, cands: list[frozenset], need) -> list[tuple[str, bool]]:
    """(channel, explained) for channels with `need(fn)` of their numbers in `nums`; explained = one declared
    candidate (a sim record's mechanism) holds every matched number."""
    return [(v, any(m <= c for c in cands)) for v, fn in fp["f_num"].items() if len(m := nums & fn) >= need(fn)]


def _small_whole(fn: set) -> float:
    """A channel of fewer than 3 numbers needs all of them; larger channels are left to the cell rule."""
    return len(fn) if len(fn) < 3 else float("inf")


def _text_hits(text: str, fp: dict, source: str, cands: list[frozenset],
               per_cell: bool = False) -> tuple[list[str], list[str]]:
    """(hits, explained). String hits per line; number hits per line (the channel's whole fingerprint, ≥3 of
    its numbers when it has more) and, per cell, also ≥3 of one channel anywhere in the cell. In a cell a line
    also ends at an escaped newline, and the per-line rule only covers channels the cell rule cannot see
    (fewer than 3 numbers)."""
    hits: list[str] = []
    found: list[tuple[str, str, bool]] = []
    text = text.replace("−", "-")
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        hits += [f"{source}:{i} {h['what']}" for h in nbsim_strip.text_hits(line, fp, None, skip_world_names=True)]
        if not per_cell:
            found += [(f"{source}:{i}", v, ok) for v, ok in _number_hits(_nums(line), fp, cands, lambda fn: min(3, len(fn)))]
    if per_cell:
        found += [(source, v, ok) for v, ok in _number_hits(_nums(text), fp, cands, lambda fn: 3)]
        for i, line in enumerate(LINE_RE.split(text), 1):
            found += [(f"{source}:{i}", v, ok) for v, ok in _number_hits(_nums(line), fp, cands, _small_whole)]
    hits += [f"{where} numbers of {v}" for where, v, ok in found if not ok]
    return hits, [f"{where} numbers of {v}" for where, v, ok in found if ok]


def _session_hits(events: list[dict], fp: dict, name: str, cands) -> tuple[list[str], list[str]]:
    """Scan each tool return (one cell). Besides sim records written before it, a cell is explained by one
    earlier assistant message (its text or tool-call arguments) holding every matched number: a leak has to
    come out of a tool return, and numbers the agent typed first came from the agent."""
    hits: list[str] = []
    explained: list[str] = []
    authored: list[frozenset] = []
    cell = 0
    for ev in events:
        msg = ev.get("message")
        if not isinstance(msg, dict):
            continue
        content = [c for c in msg.get("content") or [] if isinstance(c, dict)]
        if msg.get("role") == "assistant":
            authored.append(frozenset(_nums("\n".join(
                c.get("text", "") if c.get("type") == "text" else _flat(c.get("arguments"))
                for c in content if c.get("type") in ("text", "toolCall")))))
        elif msg.get("role") == "toolResult":
            cell += 1
            text = "\n".join(c.get("text", "") for c in content)
            ts = ev.get("timestamp") or msg.get("timestamp")
            h, e = _text_hits(text, fp, f"{name}#{msg.get('toolName')}@{cell}", _before(cands, ts) + authored, per_cell=True)
            hits += h
            explained += e
    return hits, explained


def _leak_scan(run: Run) -> tuple[str, str]:
    nb_root = os.environ.get("NEURONBENCH_ROOT", "").strip()
    if not nb_root:
        return "UNKNOWN", "leak scan skipped (NEURONBENCH_ROOT unset)"
    fp = nbsim_strip.truth_fingerprints(Path(nb_root))
    cands = _candidates(run.records)
    every = [c for _, c in cands]
    hits: list[str] = []
    explained: list[str] = []

    def add(found: tuple[list[str], list[str]]) -> None:
        hits.extend(found[0])
        explained.extend(found[1])

    for s in run.sessions:
        add(_session_hits(liveness.load(str(s)), fp, s.name, cands))
    ledger = run.dir / "world-ledger.jsonl"
    if ledger.is_file():
        add(_text_hits(ledger.read_text(encoding="utf-8", errors="replace"), fp, ledger.name, every))
    for root in (run.work, run.jobs):
        if not root or not root.is_dir():
            continue
        for f in sorted(root.rglob("*")):
            if f.is_file() and f.suffix in TEXT_SUFFIXES and not (run.work and (run.work / "nbsim") in f.parents):
                add(_text_hits(f.read_text(encoding="utf-8", errors="ignore"), fp, str(f.relative_to(root.parent)), every))
    if run.work and (run.work / "nbsim").is_dir():
        hits += [f"nbsim/{h.get('file', '')} {h['check']}:{h['what']}" for h in nbsim_strip.scan_package(run.work / "nbsim", fp, run.world)]
    scope = f"{len(run.sessions)} session(s), ledger, research-work, .rlm-jobs; world names excluded (§13 Q1)"
    note = f"; {len(explained)} number match(es) explained by a declared sim candidate: {explained[:3]}" if explained else ""
    if hits:
        return "FAIL", f"truth fingerprints: {hits[:5]}{' …' if len(hits) > 5 else ''}{note}"
    return "PASS", f"no truth fingerprint in {scope}{note}"


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
