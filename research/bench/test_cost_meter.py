"""S0: token and wall-clock totals from Pi/Prime session JSONL (parent + children)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import cost_meter


def _usage(inp: int, cached: int, out: int, write: int = 0) -> dict:
    return {"input": inp, "output": out, "cacheRead": cached, "cacheWrite": write,
            "totalTokens": inp + cached + out + write, "cost": {"total": 0}}


def _msg(entry_id: str, ts: str, model: str, usage: dict) -> dict:
    return {"type": "message", "id": entry_id, "timestamp": ts,
            "message": {"role": "assistant", "provider": "bailian", "model": model, "usage": usage, "content": []}}


def _write(path: Path, entries: list[dict]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(e) for e in entries) + "\n", encoding="utf-8")
    return path


def _fixture(tmp_path: Path, *, aggregate_on_disk: bool) -> tuple[Path, Path]:
    child_usage = _usage(100, 10, 20)
    own2 = _usage(50, 400, 30)
    agg2 = _usage(150, 410, 50)
    parent = _write(tmp_path / "parent.jsonl", [
        {"type": "session", "id": "s1", "timestamp": "2026-10-15T10:00:00.000Z", "rlmDepth": 0},
        {"type": "message", "id": "u1", "timestamp": "2026-10-15T10:00:01.000Z", "message": {"role": "user", "content": "go"}},
        _msg("a1", "2026-10-15T10:00:05.000Z", "qwen-max", _usage(1000, 0, 200, 300)),
        _msg("a2", "2026-10-15T10:30:00.000Z", "qwen-max", agg2 if aggregate_on_disk else own2),
        {"type": "child_usage_attributed", "id": "c1", "timestamp": "2026-10-15T10:30:01.000Z",
         "targetId": "a2", "childUsage": child_usage, "aggregateUsage": agg2},
        "not json",
    ])
    child = _write(tmp_path / "sub-1" / "child.jsonl", [
        {"type": "session", "id": "s2", "timestamp": "2026-10-15T10:10:00.000Z", "rlmDepth": 1, "parentSession": "x"},
        _msg("b1", "2026-10-15T10:20:00.000Z", "qwen-flash", child_usage),
    ])
    return parent, child


@pytest.mark.parametrize("aggregate_on_disk", [True, False])
def test_totals_per_model_and_wall_clock(tmp_path: Path, aggregate_on_disk: bool) -> None:
    parent, child = _fixture(tmp_path, aggregate_on_disk=aggregate_on_disk)
    r = cost_meter.meter([parent, child])
    assert r["models"]["bailian/qwen-max"] == {"calls": 2, "input": 1050, "cached": 400, "cache_write": 300, "output": 230}
    assert r["models"]["bailian/qwen-flash"] == {"calls": 1, "input": 100, "cached": 10, "cache_write": 0, "output": 20}
    assert r["total"] == {"calls": 3, "input": 1150, "cached": 410, "cache_write": 300, "output": 250}
    assert r["sessions"] == {"parent": 1, "child": 1}
    assert r["wall_clock_sec"] == 30 * 60 + 1
    assert r["first_ts"] == "2026-10-15T10:00:00.000Z"
    assert r["attributed_child"]["input"] == 100


def test_directory_input_recurses_and_dedupes(tmp_path: Path) -> None:
    parent, _ = _fixture(tmp_path, aggregate_on_disk=True)
    r = cost_meter.meter(cost_meter.collect_files([tmp_path, parent]))
    assert r["total"]["calls"] == 3
    assert r["sessions"] == {"parent": 1, "child": 1}


def test_non_session_jsonl_is_ignored(tmp_path: Path) -> None:
    parent, _ = _fixture(tmp_path, aggregate_on_disk=True)
    _write(tmp_path / "sub-1" / "harness-log.jsonl", [{"timestamp": "2026-10-16T00:00:00.000Z", "event": "x"}])
    r = cost_meter.meter(cost_meter.collect_files([tmp_path]))
    assert r["files"] == 2
    assert r["wall_clock_sec"] == 30 * 60 + 1


def test_missing_children_are_visible(tmp_path: Path) -> None:
    parent, _ = _fixture(tmp_path, aggregate_on_disk=True)
    r = cost_meter.meter([parent])
    assert r["total"]["input"] == 1050
    assert r["attributed_child"]["input"] > 0
    assert r["sessions"]["child"] == 0


@pytest.mark.parametrize("on_disk_input", [50, 350])
def test_multiple_attributions_to_one_parent_message(tmp_path: Path, on_disk_input: int) -> None:
    # Prime writes one attribution per child turn; aggregateUsage is cumulative (own + c1 + ... + cN).
    parent = _write(tmp_path / "parent.jsonl", [
        {"type": "session", "id": "s1", "timestamp": "2026-10-15T10:00:00.000Z", "rlmDepth": 0},
        _msg("a1", "2026-10-15T10:00:01.000Z", "qwen-max", _usage(on_disk_input, 0, 0)),
        {"type": "child_usage_attributed", "id": "c1", "timestamp": "2026-10-15T10:00:02.000Z",
         "targetId": "a1", "childUsage": _usage(100, 0, 0), "aggregateUsage": _usage(150, 0, 0)},
        {"type": "child_usage_attributed", "id": "c2", "timestamp": "2026-10-15T10:00:03.000Z",
         "targetId": "a1", "childUsage": _usage(200, 0, 0), "aggregateUsage": _usage(350, 0, 0)},
    ])
    child = _write(tmp_path / "sub-1" / "child.jsonl", [
        {"type": "session", "id": "s2", "timestamp": "2026-10-15T10:00:01.500Z", "rlmDepth": 1},
        _msg("b1", "2026-10-15T10:00:01.600Z", "qwen-flash", _usage(100, 0, 0)),
        _msg("b2", "2026-10-15T10:00:02.600Z", "qwen-flash", _usage(200, 0, 0)),
    ])
    r = cost_meter.meter([parent, child])
    assert r["models"]["bailian/qwen-max"]["input"] == 50
    assert r["total"]["input"] == 350


def test_fork_with_parent_session_but_depth_zero_is_a_parent(tmp_path: Path) -> None:
    fork = _write(tmp_path / "fork.jsonl", [
        {"type": "session", "id": "s3", "timestamp": "2026-10-15T10:00:00.000Z", "rlmDepth": 0, "parentSession": "x"},
    ])
    assert cost_meter.meter([fork])["sessions"] == {"parent": 1, "child": 0}
