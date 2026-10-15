"""S2: ARC staging. The staged workspace must carry no rubric content, and any
manifest field outside the whitelist must be dropped.

No rubric text is written in this file: leak strings are derived at test time
from the real rubric file.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest
import yaml

import stage_arc

ARC_ROOT = stage_arc.DEFAULT_ARC_ROOT
PILOT = ["ML04", "ML13", "ML16"]
needs_arc = pytest.mark.skipif(not ARC_ROOT.is_dir(), reason="ARC checkout missing")


def _strings(obj: object) -> list[str]:
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        return [s for v in obj.values() for s in _strings(v)]
    if isinstance(obj, list):
        return [s for v in obj for s in _strings(v)]
    return []


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


def _ngrams(text: str, n: int = 8) -> set[str]:
    words = _norm(text).split()
    return {" ".join(words[i : i + n]) for i in range(len(words) - n + 1)}


def _tree_text(root: Path) -> str:
    return "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in sorted(root.rglob("*")) if p.is_file())


@needs_arc
@pytest.mark.parametrize("task_id", PILOT)
def test_staged_tree_contains_no_rubric_content(task_id: str, tmp_path: Path) -> None:
    manifest = yaml.safe_load(stage_arc.find_manifest(task_id, ARC_ROOT).read_text(encoding="utf-8"))
    rubric_file = ARC_ROOT.parents[1] / manifest["rubric_path"]
    rubric_strings = [s for s in _strings(json.loads(rubric_file.read_text(encoding="utf-8"))) if len(s) >= 20]
    assert rubric_strings, "rubric yielded no strings; the leak check would be vacuous"

    ws = tmp_path / "ws"
    stage_arc.stage(task_id, ws, ARC_ROOT)

    assert sorted(p.name for p in ws.iterdir()) == ["MANIFEST.sha256", "task-card.yaml"]
    text = _tree_text(ws)
    norm = _norm(text)
    assert "rubric" not in norm
    assert rubric_file.name not in text
    for s in rubric_strings:
        assert _norm(s) not in norm
    leaked = set().union(*(_ngrams(s) for s in rubric_strings)) & _ngrams(text)
    assert not leaked, f"{len(leaked)} rubric 8-grams found in staged tree"


def _fake_arc(root: Path, manifest: dict) -> Path:
    mdir = root / "config" / "ml" / "manifests"
    mdir.mkdir(parents=True)
    (mdir / f"{manifest['id']}.yaml").write_text(yaml.safe_dump(manifest), encoding="utf-8")
    return root


def test_unknown_and_identifying_fields_are_dropped(tmp_path: Path) -> None:
    manifest = {
        "id": "ML99",
        "title": "A public title",
        "arxiv_id": "2401.99999",
        "venue": "SECRET_VENUE",
        "paper_asset": "SECRET_ASSET.pdf",
        "synthesis": "Public synthesis.",
        "hypotheses": [{"id": "H1", "statement": "s", "measurable": "m", "expected_value": "SENTINEL_HYP"}],
        "experiment_design": {"research_question": "q", "reference_result": "SENTINEL_NESTED"},
        "rubric_path": "experiments/arc_bench/config/ml/rubrics/ML99.json",
        "brand_new_field": "SENTINEL_TOP",
    }
    root = _fake_arc(tmp_path / "arc", manifest)
    ws = tmp_path / "ws"
    stage_arc.stage("ML99", ws, root)

    text = _tree_text(ws)
    for secret in ("2401.99999", "SECRET_VENUE", "SECRET_ASSET", "SENTINEL_HYP", "SENTINEL_NESTED", "SENTINEL_TOP", "rubric"):
        assert secret not in text
    card = yaml.safe_load((ws / "task-card.yaml").read_text(encoding="utf-8"))
    assert set(card) == {"id", "title", "synthesis", "hypotheses", "experiment_design", "deliverables"}
    assert card["hypotheses"] == [{"id": "H1", "statement": "s", "measurable": "m"}]
    assert card["experiment_design"] == {"research_question": "q"}


def test_manifest_sha256_matches_files(tmp_path: Path) -> None:
    root = _fake_arc(tmp_path / "arc", {"id": "ML98", "title": "t", "hypotheses": [], "rubric_path": "x"})
    ws = tmp_path / "ws"
    stage_arc.stage("ML98", ws, root)
    lines = (ws / "MANIFEST.sha256").read_text(encoding="utf-8").splitlines()
    assert lines
    for line in lines:
        digest, rel = re.split(r"\s+", line, maxsplit=1)
        assert hashlib.sha256((ws / rel).read_bytes()).hexdigest() == digest


def test_refuses_non_empty_workspace(tmp_path: Path) -> None:
    root = _fake_arc(tmp_path / "arc", {"id": "ML97", "title": "t", "rubric_path": "x"})
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "stale.txt").write_text("old run", encoding="utf-8")
    with pytest.raises(ValueError):
        stage_arc.stage("ML97", ws, root)
