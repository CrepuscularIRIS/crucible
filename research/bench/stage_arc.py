#!/usr/bin/env python3
"""Stage one ARC-Bench task into a clean agent workspace (plan 05 §3.1, slice S2).

    python3 research/bench/stage_arc.py ML04 <workspace> [--arc-root DIR]

Writes exactly two files:
  task-card.yaml   whitelisted manifest fields + the submission layout
  MANIFEST.sha256  sha256 of every staged file

Whitelist, not blacklist: rubric_path, arxiv_id, venue, paper_asset and any
field the upstream adds later are dropped (with a warning on stderr) at the
top level, in experiment_design, and in hypothesis and requirement items.
Values under a whitelisted experiment_design key (metrics[], datasets[], ...)
are copied whole; their nested keys are not filtered.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from _tree import require_empty, write_sha_manifest

DEFAULT_ARC_ROOT = Path.home() / "oss" / "AutoResearchClaw" / "experiments" / "arc_bench"

TOP_KEYS = ("id", "title", "synthesis", "hypotheses", "experiment_design", "requirements")
# ML keys + the extra keys the statistics manifests use today (S01-S03, 2026-10-15).
DESIGN_KEYS = (
    "research_question", "conditions", "baselines", "metrics", "datasets", "compute_requirements",
    "simulation_settings", "dependencies", "estimand", "estimands", "expected_artifacts",
    "data_generating_conditions", "data_generating_process", "semiparametric_structure",
    "nuisance_models", "task_type", "implementation_note", "statistical_tasks",
)
HYPOTHESIS_KEYS = ("id", "statement", "measurable")
REQUIREMENT_KEYS = ("id", "type", "description", "must_pass")

# The layout score_arc.py reads (upstream judge.py run_local_judge + EXPERIMENT_DESIGN.md).
DELIVERABLES = {
    "submission/code/": "the analysis code (.py) that produced every number",
    "submission/results/metrics.json": "machine-readable metrics for every condition, dataset and seed",
    "submission/README.md": "a section headed '## Agent-produced writeup' (method, results, verdict per hypothesis, limitations)",
    "submission/claims.json": '{"claims": [{"id": "H1", "verdict": "supported|refuted|partially_supported|inconclusive", ...}, ...]}',
}
DELIVERABLES_WITH_RESULTS_JSON = {
    **DELIVERABLES,
    "submission/results.json": "required by this task's requirements (see req_results_json)",
}


def find_manifest(task_id: str, arc_root: Path) -> Path:
    hits = sorted((arc_root / "config").glob(f"*/manifests/{task_id}.yaml"))
    if len(hits) != 1:
        raise FileNotFoundError(f"expected one manifest for {task_id} under {arc_root}/config, found {len(hits)}")
    return hits[0]


def _pick(d: dict, keys: tuple[str, ...], where: str) -> dict:
    dropped = sorted(set(d) - set(keys))
    if dropped:
        print(f"stage_arc: dropped {where} fields {dropped}", file=sys.stderr)
    return {k: d[k] for k in keys if k in d}


def build_card(manifest: dict) -> dict:
    card = _pick(manifest, TOP_KEYS, "top-level")
    if isinstance(card.get("experiment_design"), dict):
        card["experiment_design"] = _pick(card["experiment_design"], DESIGN_KEYS, "experiment_design")
    if isinstance(card.get("hypotheses"), list):
        card["hypotheses"] = [_pick(h, HYPOTHESIS_KEYS, "hypothesis") for h in card["hypotheses"]]
    if isinstance(card.get("requirements"), list):
        card["requirements"] = [_pick(r, REQUIREMENT_KEYS, "requirement") for r in card["requirements"]]
    needs_results = any(r.get("id") == "req_results_json" for r in card.get("requirements") or [])
    card["deliverables"] = DELIVERABLES_WITH_RESULTS_JSON if needs_results else DELIVERABLES
    return card


def stage(task_id: str, out_dir: Path, arc_root: Path = DEFAULT_ARC_ROOT) -> Path:
    manifest = yaml.safe_load(find_manifest(task_id, arc_root).read_text(encoding="utf-8"))
    if manifest.get("id") != task_id:
        raise ValueError(f"manifest id {manifest.get('id')!r} != {task_id!r}")
    require_empty(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    card = build_card(manifest)
    (out_dir / "task-card.yaml").write_text(
        yaml.safe_dump(card, allow_unicode=True, sort_keys=False, width=100), encoding="utf-8")
    write_sha_manifest(out_dir)
    return out_dir


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("task_id")
    ap.add_argument("workspace", type=Path)
    ap.add_argument("--arc-root", type=Path, default=DEFAULT_ARC_ROOT)
    args = ap.parse_args(argv)
    out = stage(args.task_id, args.workspace, args.arc_root)
    print(f"staged {args.task_id} -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
