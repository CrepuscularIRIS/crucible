"""S5 (programmatic half): ARC submission contract + results.json schema.
LLM-judged rubric leaves are reported as not scored."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

import score_arc
import stage_arc

ARC_ROOT = stage_arc.DEFAULT_ARC_ROOT
needs_arc = pytest.mark.skipif(not ARC_ROOT.is_dir(), reason="ARC checkout missing")


def _good_submission(sub: Path, hyp_ids: list[str]) -> Path:
    (sub / "code").mkdir(parents=True)
    (sub / "code" / "run.py").write_text("print('ok')\n", encoding="utf-8")
    (sub / "results").mkdir()
    (sub / "results" / "metrics.json").write_text(json.dumps({"test_accuracy": {"mean": 0.9, "std": 0.01}, "n_seeds": 5}), encoding="utf-8")
    body = "Method, results and verdicts. Accuracy 0.90 over 5 splits. " * 6
    (sub / "README.md").write_text(f"# Run\n\n## Agent-produced writeup\n\n{body}\n", encoding="utf-8")
    claims = [{"id": h, "verdict": "refuted" if i else "supported"} for i, h in enumerate(hyp_ids)]
    (sub / "claims.json").write_text(json.dumps({"claims": claims}), encoding="utf-8")
    return sub


@needs_arc
def test_empty_submission_fails_must_pass(tmp_path: Path) -> None:
    sub = tmp_path / "submission"
    sub.mkdir()
    r = score_arc.score("ML04", sub, ARC_ROOT)
    assert r["must_pass"]["passed"] is False
    assert r["must_pass"]["items"] and not any(i["pass"] for i in r["must_pass"]["items"])
    assert score_arc.main(["ML04", str(sub), "--arc-root", str(ARC_ROOT)]) == 1


@needs_arc
def test_complete_submission_passes_and_rubric_is_not_scored(tmp_path: Path) -> None:
    manifest = yaml.safe_load(stage_arc.find_manifest("ML04", ARC_ROOT).read_text(encoding="utf-8"))
    sub = _good_submission(tmp_path / "submission", [h["id"] for h in manifest["hypotheses"]])
    r = score_arc.score("ML04", sub, ARC_ROOT)
    assert r["must_pass"]["passed"] is True, r["must_pass"]
    assert r["signals"]["verdict_score"] == 1.0
    assert isinstance(r["not_scored"]["rubric_leaves"], int) and r["not_scored"]["rubric_leaves"] > 0
    # Nothing from the rubric leaves the scorer: neither requirement text nor (descriptive) leaf ids.
    rubric = json.loads((ARC_ROOT.parents[1] / manifest["rubric_path"]).read_text(encoding="utf-8"))
    out = json.dumps(r)
    stack, seen = [rubric], 0
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("requirements", "id", "judging_note") and isinstance(v, str) and v != "ML04":
                    assert json.dumps(v) not in out
                    seen += 1
                stack.append(v)
        elif isinstance(node, list):
            stack.extend(node)
    assert seen


def test_missing_hypothesis_verdict_fails(tmp_path: Path) -> None:
    root = _fake_arc_with_results_req(tmp_path / "arc")
    sub = _good_submission(tmp_path / "submission", ["H1"])  # H2 missing
    r = score_arc.score("S99", sub, root)
    item = next(i for i in r["must_pass"]["items"] if i["id"] == "claims_per_hypothesis")
    assert item["pass"] is False


def _fake_arc_with_results_req(root: Path) -> Path:
    mdir = root / "config" / "statistics" / "manifests"
    mdir.mkdir(parents=True)
    manifest = {
        "id": "S99", "title": "t", "rubric_path": "experiments/arc_bench/config/statistics/rubrics/S99.json",
        "hypotheses": [{"id": "H1", "statement": "a"}, {"id": "H2", "statement": "b"}],
        "requirements": [
            {"id": "req_results_json", "type": "artifact", "must_pass": True,
             "description": "results.json with keys primary_metric (number), metric_key (string), metrics (object), "
                            "hypotheses (h1/h2 each with a `supported` boolean), summary (string)."},
            {"id": "req_discussion", "type": "discussion", "must_pass": True, "description": "prose"},
            {"id": "req_figure", "type": "artifact", "must_pass": False, "description": "figure"},
        ],
    }
    (mdir / "S99.yaml").write_text(yaml.safe_dump(manifest), encoding="utf-8")
    return root


def test_results_json_schema_requirement(tmp_path: Path) -> None:
    root = _fake_arc_with_results_req(tmp_path / "arc")
    sub = _good_submission(tmp_path / "submission", ["H1", "H2"])

    r = score_arc.score("S99", sub, root)
    req = {x["id"]: x for x in r["requirements"]}
    assert req["req_results_json"]["status"] == "fail"
    assert req["req_figure"]["status"] == "not_scored"
    assert r["must_pass"]["passed"] is False

    good = {"primary_metric": 0.94, "metric_key": "coverage", "metrics": {"coverage": 0.94},
            "hypotheses": {"h1": {"supported": True}, "h2": {"supported": False}}, "summary": "done"}
    (sub / "results.json").write_text(json.dumps(good), encoding="utf-8")
    r = score_arc.score("S99", sub, root)
    assert {x["id"]: x for x in r["requirements"]}["req_results_json"]["status"] == "pass"
    assert r["must_pass"]["passed"] is True

    bad = dict(good, hypotheses={"h1": {"supported": "yes"}, "h2": {"supported": False}})
    (sub / "results.json").write_text(json.dumps(bad), encoding="utf-8")
    assert {x["id"]: x for x in score_arc.score("S99", sub, root)["requirements"]}["req_results_json"]["status"] == "fail"


def test_empty_submission_fails_must_pass_without_checkout(tmp_path: Path) -> None:
    root = _fake_arc_with_results_req(tmp_path / "arc")
    sub = tmp_path / "submission"
    sub.mkdir()
    r = score_arc.score("S99", sub, root)
    assert r["must_pass"]["passed"] is False
    assert not any(i["pass"] for i in r["must_pass"]["items"])
    assert score_arc.main(["S99", str(sub), "--arc-root", str(root)]) == 1


def test_unchecked_must_pass_requirements_are_listed(tmp_path: Path) -> None:
    root = _fake_arc_with_results_req(tmp_path / "arc")
    r = score_arc.score("S99", tmp_path, root)
    assert r["must_pass"]["unchecked"] == ["req_discussion"]


def test_results_json_checks_only_keys_the_task_names(tmp_path: Path) -> None:
    root = tmp_path / "arc"
    mdir = root / "config" / "physics" / "manifests"
    mdir.mkdir(parents=True)
    manifest = {"id": "P99", "title": "t", "rubric_path": "x", "hypotheses": [{"id": "H1"}],
                "requirements": [{"id": "req_results_json", "type": "artifact", "must_pass": True,
                                  "description": "A results.json with a non-empty summary string."}]}
    (mdir / "P99.yaml").write_text(yaml.safe_dump(manifest), encoding="utf-8")
    sub = tmp_path / "submission"
    sub.mkdir()
    (sub / "results.json").write_text(json.dumps({"summary": "done"}), encoding="utf-8")
    req = score_arc.score("P99", sub, root)["requirements"][0]
    assert req["status"] == "pass", req
