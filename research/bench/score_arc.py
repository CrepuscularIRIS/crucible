#!/usr/bin/env python3
"""Programmatic half of ARC-Bench scoring (plan 05 §2.2, slice S5). Host-side,
after report_declare; no LLM.

    python3 research/bench/score_arc.py ML04 <submission_dir> [--arc-root DIR] [--out score.json]

Scored here:
  must_pass  submission contract every ARC task shares (from upstream
             judge.py run_local_judge + EXPERIMENT_DESIGN.md): code/*.py,
             results/metrics.json, README '## Agent-produced writeup',
             claims.json with a recognised verdict per manifest hypothesis;
             plus the task's own must_pass requirements we can check by
             program (today: req_results_json schema).
  signals    upstream's verdict coverage score and metric-name coverage.
Not scored: rubric leaves (LLM judge; upstream judge.py does not import, plan
05 R11), reported as a count only (leaf ids are descriptive, so they stay in),
and requirements that need reading prose or figures (task requirement ids are
public: they are in the task card); must_pass ones are listed as "unchecked".

Exit code: 0 if no programmatic must_pass item fails (unchecked ones may still
fail under a judge), 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import yaml

from stage_arc import DEFAULT_ARC_ROOT, find_manifest

# Upstream judge.py VERDICT_ALIASES (MIT).
VERDICT_ALIASES = {
    "supported": "supported", "confirmed": "supported", "backed": "supported",
    "refuted": "refuted", "rejected": "refuted", "contradicted": "refuted", "disproven": "refuted",
    "not_supported": "refuted", "unsupported": "refuted", "not supported": "refuted",
    "partially_supported": "partially_supported", "partially_refuted": "partially_supported",
    "partial": "partially_supported", "mixed": "partially_supported",
    "inconclusive": "inconclusive", "unclear": "inconclusive",
    "insufficient_evidence": "inconclusive", "indeterminate": "inconclusive",
}
DEFINITIVE = {"supported", "refuted", "partially_supported"}
MIN_WRITEUP_CHARS = 200  # upstream judge_results_only._has_real_writeup


def _json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _num(x: object) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _item(item_id: str, ok: bool, why: str) -> dict:
    return {"id": item_id, "pass": bool(ok), "why": why}


def _claims(sub: Path) -> dict[str, str]:
    blob = _json(sub / "claims.json")
    claims = blob.get("claims") if isinstance(blob, dict) else None
    out: dict[str, str] = {}
    for c in claims if isinstance(claims, list) else []:
        if isinstance(c, dict) and c.get("id") is not None:
            out[str(c["id"]).upper()] = VERDICT_ALIASES.get(str(c.get("verdict", "")).strip().lower(), "unknown")
    return out


def contract(sub: Path, hyp_ids: list[str]) -> list[dict]:
    code = sub / "code"
    has_code = code.is_dir() and any(p.is_file() and p.stat().st_size > 0 for p in code.rglob("*.py"))
    metrics = _json(sub / "results" / "metrics.json")
    readme = sub / "README.md"
    text = readme.read_text(encoding="utf-8", errors="replace") if readme.is_file() else ""
    has_writeup = "agent-produced writeup" in text.lower() and len(text) >= MIN_WRITEUP_CHARS and any(c.isdigit() for c in text)
    verdicts = _claims(sub)
    missing = [h for h in hyp_ids if verdicts.get(h.upper(), "unknown") == "unknown"]
    return [
        _item("code", has_code, "submission/code/ holds a non-empty .py" if has_code else "no non-empty .py under submission/code/"),
        _item("metrics_json", bool(metrics), "results/metrics.json parses and is non-empty" if metrics else "results/metrics.json missing, unparseable or empty"),
        _item("writeup", has_writeup, "README.md has '## Agent-produced writeup' with >=200 chars and numbers" if has_writeup else "README.md lacks the writeup section, length or numbers"),
        _item("claims_per_hypothesis", bool(hyp_ids) and not missing,
              f"recognised verdict for {hyp_ids}" if hyp_ids and not missing else f"no recognised verdict for {missing or 'any hypothesis (manifest lists none)'}"),
    ]


def check_results_json(sub: Path, n_hyp: int, description: str) -> tuple[bool, str]:
    """Enforce only the keys this task's req_results_json description names
    (the 20 tasks that have it do not share one schema)."""
    r = _json(sub / "results.json")
    if not isinstance(r, dict):
        return False, "results.json missing or not a JSON object"
    named = lambda key: re.search(rf"\b{key}\b", description) is not None  # noqa: E731
    problems = []
    if named("primary_metric") and not _num(r.get("primary_metric")):
        problems.append("primary_metric not a finite number")
    if named("metric_key") and not isinstance(r.get("metric_key"), str):
        problems.append("metric_key not a string")
    m = r.get("metrics")
    if named("metrics") and not (isinstance(m, dict) and m and any(_num(v) for v in m.values())):
        problems.append("metrics not an object with numeric values")
    if named("supported"):
        h = r.get("hypotheses")
        for i in range(1, n_hyp + 1):
            entry = h.get(f"h{i}") if isinstance(h, dict) else None
            if not (isinstance(entry, dict) and isinstance(entry.get("supported"), bool)):
                problems.append(f"hypotheses.h{i}.supported not a boolean")
    if named("summary") and not (isinstance(r.get("summary"), str) and r["summary"].strip()):
        problems.append("summary empty")
    return not problems, "; ".join(problems) or "parses; every key the task names is present"


def _leaf_ids(node: object) -> list[str]:
    if not isinstance(node, dict):
        return []
    subs = node.get("sub_tasks") or []
    if not subs:
        return [str(node.get("id"))]
    return [i for s in subs for i in _leaf_ids(s)]


def score(task_id: str, sub: Path, arc_root: Path = DEFAULT_ARC_ROOT) -> dict:
    manifest = yaml.safe_load(find_manifest(task_id, arc_root).read_text(encoding="utf-8"))
    hyp_ids = [str(h.get("id")) for h in manifest.get("hypotheses") or [] if isinstance(h, dict)]
    items = contract(sub, hyp_ids)

    requirements = []
    for req in manifest.get("requirements") or []:
        row = {"id": req.get("id"), "must_pass": bool(req.get("must_pass")), "status": "not_scored", "why": "needs a judge"}
        if req.get("id") == "req_results_json":
            ok, why = check_results_json(sub, len(hyp_ids), str(req.get("description", "")))
            row.update(status="pass" if ok else "fail", why=why)
            if row["must_pass"]:
                items.append(_item("req_results_json", ok, why))
        requirements.append(row)

    verdicts = _claims(sub)
    graded = [verdicts.get(h.upper(), "unknown") for h in hyp_ids]
    verdict_score = sum(1.0 if v in DEFINITIVE else 0.3 if v == "inconclusive" else 0.0 for v in graded) / len(graded) if graded else 0.0
    metrics_blob = json.dumps(_json(sub / "results" / "metrics.json") or {}).lower()
    names = [m.get("name", "") for m in (manifest.get("experiment_design") or {}).get("metrics") or [] if isinstance(m, dict)]
    claims_cover = sum(1 for n in names if n and n.lower() in metrics_blob) / len(names) if names else 0.0

    rubric_file = arc_root.parents[1] / str(manifest.get("rubric_path", ""))
    rubric = _json(rubric_file) if rubric_file.is_file() else None
    return {
        "task": task_id,
        "submission": str(sub),
        "must_pass": {
            "passed": all(i["pass"] for i in items),  # programmatic items only; see "unchecked"
            "items": items,
            "unchecked": [r["id"] for r in requirements if r["must_pass"] and r["status"] == "not_scored"],
        },
        "requirements": requirements,
        "signals": {"verdict_score": round(verdict_score, 4), "claims_cover": round(claims_cover, 4)},
        "not_scored": {
            "rubric_leaves": len(_leaf_ids(rubric)),  # a count: leaf ids are descriptive slugs
            "requirements": [r["id"] for r in requirements if r["status"] == "not_scored"],
            "reason": "LLM-judged; upstream judge.py fails to import (plan 05 R11)" if rubric else "rubric file not found",
        },
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("task_id")
    ap.add_argument("submission", type=Path)
    ap.add_argument("--arc-root", type=Path, default=DEFAULT_ARC_ROOT)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args(argv)
    r = score(args.task_id, args.submission, args.arc_root)
    text = json.dumps(r, indent=2)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0 if r["must_pass"]["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
