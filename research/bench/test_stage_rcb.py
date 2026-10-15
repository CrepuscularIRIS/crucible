"""S3: RCB staging. Only data/ and related_work/ plus a public task card reach
the workspace; nothing under target_study/ does; the workspace lives outside
the RCB repo."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest
import yaml

import stage_rcb

RCB_ROOT = stage_rcb.DEFAULT_RCB_ROOT
PILOT = ["Information_005", "Information_006", "Information_007"]
needs_rcb = pytest.mark.skipif(not RCB_ROOT.is_dir(), reason="RCB checkout missing")


def _shas(root: Path) -> set[str]:
    return {hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob("*") if p.is_file()}


@needs_rcb
@pytest.mark.parametrize("task_id", PILOT)
def test_workspace_holds_no_target_study_file(task_id: str, tmp_path: Path) -> None:
    truth = RCB_ROOT / "tasks" / task_id / "target_study"
    truth_shas = _shas(truth)
    assert truth_shas, "target_study is empty; the leak check would be vacuous"

    ws = tmp_path / "ws"
    stage_rcb.stage(task_id, ws, RCB_ROOT)

    assert not ws.resolve().is_relative_to(RCB_ROOT.resolve())
    assert not (truth_shas & _shas(ws))
    assert not any("target_study" in p.parts for p in ws.rglob("*"))
    assert {"data", "related_work", "task-card.yaml", "MANIFEST.sha256"} <= {p.name for p in ws.iterdir()}
    card = yaml.safe_load((ws / "task-card.yaml").read_text(encoding="utf-8"))
    assert set(card) == {"id", "task", "data", "deliverables"}


def _fake_rcb(root: Path, *, leak: bool = False) -> Path:
    task = root / "tasks" / "Fake_000"
    (task / "data").mkdir(parents=True)
    (task / "related_work").mkdir()
    (task / "target_study" / "images").mkdir(parents=True)
    (task / "data" / "x.csv").write_text("a,b\n1,2\n", encoding="utf-8")
    (task / "related_work" / "paper_000.pdf").write_bytes(b"%PDF related")
    (task / "target_study" / "paper.pdf").write_bytes(b"%PDF target")
    (task / "target_study" / "checklist.json").write_text("[]", encoding="utf-8")
    if leak:
        (task / "related_work" / "paper_001.pdf").write_bytes(b"%PDF target")
    info = {"task": "public goal", "data": [{"name": "x", "path": "./data/x.csv", "type": "csv", "description": "d"}], "hidden": "SENTINEL"}
    (task / "task_info.json").write_text(json.dumps(info), encoding="utf-8")
    return root


def test_refuses_workspace_inside_rcb_repo(tmp_path: Path) -> None:
    root = _fake_rcb(tmp_path / "rcb")
    with pytest.raises(ValueError):
        stage_rcb.stage("Fake_000", root / "workspaces" / "run", root)


def test_fails_closed_when_public_input_duplicates_target(tmp_path: Path) -> None:
    root = _fake_rcb(tmp_path / "rcb", leak=True)
    ws = tmp_path / "ws"
    with pytest.raises(ValueError):
        stage_rcb.stage("Fake_000", ws, root)
    assert not ws.exists()


def test_card_keeps_only_public_fields(tmp_path: Path) -> None:
    root = _fake_rcb(tmp_path / "rcb")
    ws = tmp_path / "ws"
    stage_rcb.stage("Fake_000", ws, root)
    text = (ws / "task-card.yaml").read_text(encoding="utf-8")
    assert "SENTINEL" not in text
    assert (ws / "data" / "x.csv").is_file()
    assert (ws / "report" / "images").is_dir()


def test_refuses_task_without_target_study(tmp_path: Path) -> None:
    root = _fake_rcb(tmp_path / "rcb")
    shutil.rmtree(root / "tasks" / "Fake_000" / "target_study")
    ws = tmp_path / "ws"
    with pytest.raises(ValueError):
        stage_rcb.stage("Fake_000", ws, root)
    assert not ws.exists()
