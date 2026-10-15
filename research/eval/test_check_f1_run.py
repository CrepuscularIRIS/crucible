"""check_f1_run B3/B4/B5/B7/B8/B9 against the record formats real runs write (03 §10.2).

Synthetic fixtures only: no truth literal (channel numbers below are made up, and test_nbsim's
`test_sources_hold_no_truth_literal` scans this file too). The regression test at the bottom runs the
checker on every archived 2026-10-14-* campaign.

    cd research/eval && python3 -m pytest -q test_check_f1_run.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import check_f1_run as cf  # noqa: E402

T0, T1, T2 = "2026-01-01T00:00:00.000Z", "2026-01-01T01:00:00.000Z", "2026-01-01T02:00:00.000Z"
HELD = [["held A", [[50.0, 3.0]]], ["held B", [[80.0, -4.0], [40.0, 6.0]]]]
POOL = [["pool A", [[100.0, 5.0]]]]
# a made-up 3-number channel fingerprint (not any real channel)
FAKE_FP = {"text": [], "problem_strings": {}, "f_num": {"XCH": {101.37, 202.71, -303.13}, "YCH": {7.77, 8.88}}}


NB_ROOT = os.environ.get("NEURONBENCH_ROOT", "").strip()  # read before the fixture below clears it


@pytest.fixture(autouse=True)
def _no_benchmark(monkeypatch):
    monkeypatch.delenv("NEURONBENCH_ROOT", raising=False)


def _run(tmp_path, *, prereg: dict, transitions=(), report="", forecast=None, forecast_md=None,
         records=None, task=True, nested=False, observe_reps=4):
    """Archive-shaped run: RUN_DIR + research-work (flat, or research-work/<run> when nested)."""
    run_dir = tmp_path / "archive"
    (run_dir / "prereg").mkdir(parents=True)
    work_root = tmp_path / "research-work"
    work = work_root / "r1" if nested else work_root
    (work / "sim").mkdir(parents=True)
    for sid, rec in (records or {"a1": {"segments": POOL[0][1], "block": ["TTX"]}}).items():
        full = {"mechanism": {"extra": []}, "reps": 64, "seed": 0, "counts_mean": 1.0, "counts_sd": 0.5, **rec}
        (work / "sim" / f"{sid}.json").write_text(json.dumps(full), encoding="utf-8")
    if task:
        (work / "nbsim").mkdir()
        (work / "nbsim" / "task.json").write_text(json.dumps({"protocols": POOL, "held_out": HELD}), encoding="utf-8")
    if forecast_md is not None:
        (work / "forecast.md").write_text(forecast_md, encoding="utf-8")
    (run_dir / "prereg" / "P1.json").write_text(json.dumps({"pid": "P1", **prereg}, ensure_ascii=False), encoding="utf-8")
    events = [{"op": "run.init", "run": "r1", "ts": T0},
              {"op": "prereg.write", "pid": "P1", "ts": T2},
              {"op": "world.observe", "pid": "P1", "reps": observe_reps, "blockers": "", "cost": observe_reps, "ts": T2},
              *({"op": "claim.transition", "id": cid, "to": to, "by_probe": "P1", "ts": T2} for cid, to in transitions)]
    if forecast is not None:
        events.append({"op": "world.forecast", "ts": T2, **forecast})
    (run_dir / "journal.jsonl").write_text("".join(json.dumps(e, ensure_ascii=False) + "\n" for e in events), encoding="utf-8")
    (run_dir / "REPORT.md").write_text(report, encoding="utf-8")
    return run_dir, work_root


def _status(run_dir, work, cid):
    return next(r for r in cf.check(run_dir, work=work) if r["id"] == cid)


DISC = ("P5 单格 r=4：σ_total(单次)≈2.1–2.9（sim sd ⊕ SIG_OBS），4 次均值 SE≈1.1；主判别对 H2–H4 |Δ|=6.1、d≈2.2、r*=1，"
        "H0–H7 |Δ|=5.0、d≈2.0、r*=1，H0–H10 |Δ|=4.4、d≈1.9、r*=2，H0–H2 |Δ|=3.3、d≈0.9、r*=6；reps=4")
SIMS = [{"path": "research-work/r1/sim/a1.json", "sha256": "0" * 64}]


# ── r* parsing ──────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text, pairs, loose", [
    ("r*=3", {}, [3]),
    ("r* ≈ 3", {}, [3]),
    ("r*：3", {}, [3]),
    ("r＊＝3", {}, [3]),
    ("r*=⌈(2/0.7)²⌉=9", {}, [9]),
    ("H1 vs H5：d=0.4，r*=25", {("H1", "H5"): 25}, []),
    ("H0–H10 |Δ|=4.4、d≈1.9、r*=2，H0-H2 d≈0.9、r*=6", {("H0", "H10"): 2, ("H0", "H2"): 6}, []),
    ("全部 kill 对的 r*；", {}, []),
])
def test_rstar_parsing(text, pairs, loose):
    got_pairs, got_loose = cf.parse_rstar(text)
    assert got_pairs == pairs and got_loose == loose


# ── B4 ──────────────────────────────────────────────────────────────────────────────────────────────

def test_b4_reads_the_discrimination_field_and_sims_citations(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "主判别切分", "discrimination": DISC, "sims": SIMS})
    assert _status(run_dir, work, "B4")["status"] == "PASS"


def test_b4_still_reads_a_question_only_prereg(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "d=1.1 σ=0.5 r*=4 sim:a1"})
    assert _status(run_dir, work, "B4")["status"] == "PASS"


def test_b4_fails_without_rstar_or_sim_id(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": "σ_total≈2.0，d≈1.5"})
    res = _status(run_dir, work, "B4")
    assert res["status"] == "FAIL" and "r*" in res["why"] and "sim:id" in res["why"]


def test_b4_is_not_fooled_by_sd_or_an_unbound_rstar(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": "sim sd 2.0，全部 kill 对的 r*，d=1", "sims": SIMS})
    res = _status(run_dir, work, "B4")
    assert res["status"] == "FAIL" and "σ" in res["why"] and "r*" in res["why"]


# ── B5 ──────────────────────────────────────────────────────────────────────────────────────────────

def test_b5_uses_the_transitioned_claims_pair(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": DISC, "sims": SIMS},
                         transitions=[("H10", "REFUTED"), ("H4", "CONTESTED")])
    assert _status(run_dir, work, "B5")["status"] == "PASS"


def test_b5_fails_when_the_claims_pair_needs_more_reps(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": DISC, "sims": SIMS},
                         transitions=[("H2", "REFUTED")])
    res = _status(run_dir, work, "B5")
    assert res["status"] == "FAIL" and "reps 4 < r* 6" in res["why"]


def test_b5_a_claim_in_no_declared_pair_has_no_rstar(tmp_path):
    # the prereg computed power per pair, none of them holds H9: nobody computed H9's r*
    ok_disc = "σ≈2，H0–H7 d≈2.0、r*=1，H0–H10 d≈1.9、r*=2"
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": ok_disc}, transitions=[("H9", "REFUTED")])
    res = _status(run_dir, work, "B5")
    assert res["status"] == "FAIL" and "r* undeclared for H9" in res["why"], res


def test_b5_falls_back_to_the_max_rstar_only_when_no_pair_is_declared(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": "σ≈2，d≈1.5，r*=2；另一切分 r*=3"},
                         transitions=[("H9", "REFUTED")])
    assert _status(run_dir, work, "B5")["status"] == "PASS"
    run_dir, work = _run(tmp_path / "b", prereg={"question": "q", "discrimination": "σ≈2，d≈0.5，r*=6"},
                         transitions=[("H9", "REFUTED")])
    assert "r* 6" in _status(run_dir, work, "B5")["why"]


def test_b5_fails_when_rstar_is_undeclared(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": "d≈2, σ≈1"}, transitions=[("H1", "SUPPORTED")])
    res = _status(run_dir, work, "B5")
    assert res["status"] == "FAIL" and "r* undeclared" in res["why"]


# ── B3 ──────────────────────────────────────────────────────────────────────────────────────────────

def test_b3_reads_task_json_under_research_work_run(tmp_path):
    records = {"a1": {"segments": POOL[0][1], "block": ["TTX"]}, "a2": {"segments": [[33.0, 7.5]], "block": []}}
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, records=records, nested=True)
    res = _status(run_dir, work, "B3")
    assert res["status"] == "PASS", res


def test_b3_fails_when_every_segment_is_pool_or_held_out(tmp_path):
    records = {"a1": {"segments": POOL[0][1], "block": ["TTX"]}, "a2": {"segments": HELD[1][1], "block": []},
               "a3": {"label": "held-out X", "block": []}}
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, records=records)
    assert _status(run_dir, work, "B3")["status"] == "FAIL"


# ── B7 ──────────────────────────────────────────────────────────────────────────────────────────────

FC = {"counts": {"held A": 1.5, "held B": 2.5}}


def test_b7_accepts_tags_in_forecast_md_the_report_cites(tmp_path):
    md = "| label | value |\n| held A | 1.5 (sim:a1) |\n| held B | 2.5 (sim/a2.json) |\n"
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, forecast=FC, forecast_md=md,
                         report="预报逐标签值见 research-work/r1/forecast.md\n")
    assert _status(run_dir, work, "B7")["status"] == "PASS"


def test_b7_ignores_forecast_md_the_report_does_not_cite(tmp_path):
    md = "| held A | 1.5 (sim:a1) |\n| held B | 2.5 (sim:a2) |\n"
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, forecast=FC, forecast_md=md, report="no table\n")
    assert _status(run_dir, work, "B7")["status"] == "FAIL"


def test_b7_fails_on_file_level_citations_only(tmp_path):
    md = "记录：sim/*-ho.json、sim/{a,b}-{p1,p2}.json\n| held A | 1.5 |\n| held B | 2.5 |\n"
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, forecast=FC, forecast_md=md, report="见 forecast.md\n")
    res = _status(run_dir, work, "B7")
    assert res["status"] == "FAIL" and "held A" in res["why"]


def test_b7_accepts_per_label_provenance_on_the_forecast_event(tmp_path):
    fc = {**FC, "provenance": {"held A": "sim:a1", "held B": "sim:a2"}}
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, forecast=fc, report="预报见 world_forecast 事件\n")
    assert _status(run_dir, work, "B7")["status"] == "PASS"


def test_b7_still_reads_report_tags(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, forecast=FC,
                         report="| held A | 1.5 (sim:H1) |\n| held B | 2.5 (sim:H1) |\n")
    assert _status(run_dir, work, "B7")["status"] == "PASS"


# ── B8 ──────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("line", [
    '- **检出限**：H4 按"在 r=4、该精度下与其预测不相容；更小效应未排除"读写，从不写"不存在"。',
    '→ H4 范围限定为"已测轴上不可见"，不等于"附加电流不存在"。',
    "该协议下 ≤ x 的效应未被排除（检出限写法）。",
    # 2026-10-15 delivery run REPORT:12 — modal + reporting verb is still a negated mention
    '所有排除均为参数点级，**不能宣称"不存在此类通道"**，只能宣称"在本战役的读数精度内无证据支持"。',
])
def test_b8_does_not_flag_detection_limit_wording(tmp_path, line):
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, report=line + "\n")
    assert _status(run_dir, work, "B8")["status"] == "PASS"


@pytest.mark.parametrize("line", [
    "结论：附加的反弹电流不存在。",
    '结论："附加电流不存在"。',
    "the extra current does not exist (P1).",
    # a negation near the quote that is not a negated reporting verb: still an assertion
    '结论不变："附加电流不存在"。',
    '不过，"附加电流不存在"。',
    '毫不意外，"该通道不存在"。',
    # double negation means "must claim": still an assertion
    '不得不宣称"附加电流不存在"。',
    '不能不声称"附加电流不存在"。',
])
def test_b8_flags_an_unpowered_absence_claim(tmp_path, line):
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": "d≈0.3，r*=45"}, report=line + "\n")
    assert _status(run_dir, work, "B8")["status"] == "FAIL"


def test_b8_accepts_an_absence_line_backed_by_a_powered_probe(tmp_path):
    run_dir, work = _run(tmp_path, prereg={"question": "q", "discrimination": DISC.replace("r*=6", "r*=3")},
                         report="P1 落参考带：目标分支不存在（P1）。\n")
    assert _status(run_dir, work, "B8")["status"] == "PASS"


# ── B9 numeric fingerprint ──────────────────────────────────────────────────────────────────────────

def test_numbers_after_escaped_whitespace_are_read():
    assert cf._nums("x\\n0.25 y\\t-80 z\\r7") == {0.25, -80.0, 7.0}


def test_digits_inside_identifiers_are_not_numbers():
    assert cf._nums("P5 H10 sha=bd1b9c x_2 v1.2 → g=0.5, E=-80, 12ms") == {0.5, -80.0, 12.0}
    assert cf._nums("K1-9 / 2026-10-14 / exp(-(V-61)/4)") == {2026.0, 61.0, 4.0}  # month/day dropped
    assert cf._nums("## 9. item\n  3) item\n- 4、 item\nx = 9.5") == {9.5}


def test_cell_hit_needs_three_numbers_of_one_channel():
    cell = "g=101.37 E=-303.13\n" + "...\n" * 5 + "tau=202.71\n"
    assert cf._text_hits(cell, FAKE_FP, "s#ipython", [], per_cell=True) == (["s#ipython numbers of XCH"], [])
    two = "g=101.37 E=-303.13 and"
    assert cf._text_hits(two, FAKE_FP, "s#ipython", [], per_cell=True) == ([], [])


def test_a_small_channels_whole_fingerprint_on_one_line_of_a_cell_is_a_hit():
    # YCH has 2 numbers: the ≥3 cell rule can never see it, so a cell line holding both is a hit
    line = "g=101.37 and YCH-like 7.77 8.88"
    assert cf._text_hits(line, FAKE_FP, "s#ipython", [], per_cell=True) == (["s#ipython:1 numbers of YCH"], [])
    # a repr'd tool return: lines are split on the literal two characters backslash-n as well
    escaped = "{'out': 'a=1\\nv=7.77, w=8.88\\nend'}"
    assert cf._text_hits(escaped, FAKE_FP, "s#ipython", [], per_cell=True) == (["s#ipython:2 numbers of YCH"], [])
    # the two numbers on different lines (real or escaped) of one cell are not a hit
    for apart in ("v=7.77\nw=8.88", "v=7.77\\nw=8.88"):
        assert cf._text_hits(apart, FAKE_FP, "s#ipython", [], per_cell=True) == ([], [])
    # a ledger / work-file line still needs only a small channel's whole fingerprint
    assert cf._text_hits(line, FAKE_FP, "f.md", []) == (["f.md:1 numbers of YCH"], [])


def test_a_two_number_channel_leak_in_a_tool_return_fails_the_session_scan():
    out = [{"type": "text", "text": "'chan: g=7.77\\tE=8.88'"}]
    hits, explained = cf._session_hits([_msg("toolResult", out)], FAKE_FP, "s", [])
    assert hits == ["s#ipython@1:1 numbers of YCH"] and explained == []


def test_identifier_digits_do_not_complete_a_fingerprint():
    cell = "g=101.37 E=-303.13 see P202 and H202"
    assert cf._text_hits(cell, FAKE_FP, "s#ipython", [], per_cell=True) == ([], [])


def test_a_candidate_declared_in_one_sim_record_explains_the_cell():
    cell = '{"name": "Kx", "g": 101.37, "E": -303.13, "tau": 202.71}'
    one = [frozenset({101.37, -303.13, 202.71, 1.0})]
    assert cf._text_hits(cell, FAKE_FP, "s#ipython", one, per_cell=True) == ([], ["s#ipython numbers of XCH"])
    split = [frozenset({101.37, -303.13}), frozenset({202.71})]
    assert cf._text_hits(cell, FAKE_FP, "s#ipython", split, per_cell=True) == (["s#ipython numbers of XCH"], [])


def _msg(role, content, ts=T1):
    return {"timestamp": ts, "message": {"role": role, "toolName": "ipython", "content": content}}


def test_numbers_the_agent_typed_first_explain_the_cell():
    code = {"type": "toolCall", "name": "ipython", "arguments": {"code": "cand = dict(g=101.37, E=-303.13, tau=202.71)"}}
    out = [{"type": "text", "text": "{'g': 101.37, 'E': -303.13, 'tau': 202.71}"}]
    hits, explained = cf._session_hits([_msg("assistant", [code]), _msg("toolResult", out)], FAKE_FP, "s", [])
    assert hits == [] and explained == ["s#ipython@1 numbers of XCH"]
    # the same return with nothing typed first is a hit; typing them only afterwards does not explain it
    hits, _ = cf._session_hits([_msg("toolResult", out), _msg("assistant", [code])], FAKE_FP, "s", [])
    assert hits == ["s#ipython@1 numbers of XCH"]
    # numbers typed after a newline in tool-call code still count as typed first
    multi = {"type": "toolCall", "name": "ipython", "arguments": {"code": "cand = [\n101.37,\n-303.13,\n202.71]"}}
    hits, explained = cf._session_hits([_msg("assistant", [multi]), _msg("toolResult", out)], FAKE_FP, "s", [])
    assert hits == [] and explained == ["s#ipython@1 numbers of XCH"]
    # spread over two messages: no single earlier message declared that candidate
    a = {"type": "text", "text": "try g=101.37 and E=-303.13"}
    b = {"type": "text", "text": "and tau=202.71"}
    hits, _ = cf._session_hits([_msg("assistant", [a]), _msg("assistant", [b]), _msg("toolResult", out)], FAKE_FP, "s", [])
    assert hits == ["s#ipython@1 numbers of XCH"]


def test_only_sim_records_written_before_the_cell_explain_it(tmp_path):
    work = tmp_path / "sim"
    work.mkdir()
    rec = work / "k1.json"
    rec.write_text(json.dumps({"mechanism": {"extra": [{"g": 101.37, "E": -303.13, "tau": 202.71}]}, "counts_mean": 1}))
    os.utime(rec, (1_700_000_000, 1_700_000_000))  # 2023-11-14
    cands = cf._candidates({"k1": (json.loads(rec.read_text()), cf._mtime(rec))})
    assert len(cf._before(cands, "2023-11-15T00:00:00Z")) == 1
    assert cf._before(cands, "2023-11-13T00:00:00Z") == []
    assert len(cf._before(cands, None)) == 1


@pytest.mark.skipif(not NB_ROOT, reason="needs the real fingerprints")
@pytest.mark.parametrize("small", [False, True], ids=["3+numbers", "2-numbers"])
@pytest.mark.parametrize("cell_ts, declared, expect", [
    ("2099-01-01T00:00:00Z", False, "FAIL"),   # a channel's numbers in a tool return, no candidate declares them
    ("2099-01-01T00:00:00Z", True, "PASS"),    # a sim record written before the cell declares that candidate
    ("2000-01-01T00:00:00Z", True, "FAIL"),    # the record came after the cell: it cannot explain it
])
def test_b9_session_cell_against_real_fingerprints(tmp_path, monkeypatch, cell_ts, declared, expect, small):
    import nbsim_strip
    fp = nbsim_strip.truth_fingerprints(Path(NB_ROOT))
    size_ok = (lambda n: n < 3) if small else (lambda n: n >= 3)
    name, fn = next((v, sorted(fn)) for v, fn in fp["f_num"].items() if size_ok(len(fn)))  # computed, never spelled
    records = {"a1": {"segments": POOL[0][1], "block": ["TTX"]}}
    if declared:
        records["k1"] = {"mechanism": {"extra": [{f"p{i}": x for i, x in enumerate(fn)}]}}
    run_dir, work = _run(tmp_path, prereg={"question": "q"}, records=records, task=False)  # no partial nbsim/
    session = tmp_path / "session.jsonl"
    text = "candidate: " + ", ".join(f"p{i}={x}" for i, x in enumerate(fn))
    session.write_text(json.dumps({"type": "session", "rlmDepth": 0}) + "\n" + json.dumps({
        "timestamp": cell_ts, "message": {"role": "toolResult", "toolName": "ipython",
                                          "content": [{"type": "text", "text": text}]}}) + "\n", encoding="utf-8")
    monkeypatch.setenv("NEURONBENCH_ROOT", NB_ROOT)
    run = cf.Run(run_dir, work, None, [session], None, None)
    status, why = cf._leak_scan(run)
    assert status == expect, why
    hits, _, explained = why.partition("explained by a declared sim candidate")
    assert (f"numbers of {name}" in hits) == (expect == "FAIL")
    assert (f"numbers of {name}" in explained) == declared


# ── regression: every archived 2026-10-14-* campaign ────────────────────────────────────────────────

CAMPAIGNS = sorted((HERE.parent / "campaigns").glob("2026-10-14-*"))


def _archive_check(d: Path) -> dict[str, dict]:
    kw = {"work": d / "research-work" if (d / "research-work").is_dir() else None,
          "jobs": d / "child-jobs" if (d / "child-jobs").is_dir() else None,
          "k0": d / "k0-host.json" if (d / "k0-host.json").is_file() else None}
    return {r["id"]: r for r in cf.check(d, **kw)}


@pytest.mark.parametrize("d", CAMPAIGNS, ids=lambda p: p.name)
def test_old_archives_stay_red_where_they_were_red(d):
    if not (d / "research-work" / "sim").is_dir():  # pre-nbsim runs: D5/D6/D10/D11 must stay visible
        res = _archive_check(d)
        assert {"B1", "B2", "B3", "B4"} <= {k for k, r in res.items() if r["status"] == "FAIL"}, res


def test_final_archive_reads_its_real_record_formats():
    d = next((c for c in CAMPAIGNS if "final-oneline" in c.name), None)
    if d is None:
        pytest.skip("final archive absent")
    res = _archive_check(d)
    assert res["B4"]["status"] == "PASS", res["B4"]
    assert res["B5"]["status"] == "PASS", res["B5"]
    assert res["B8"]["status"] == "PASS", res["B8"]
    assert res["B2"]["status"] == "PASS" and "cited" in res["B2"]["why"], res["B2"]
    assert res["B7"]["status"] == "FAIL", res["B7"]  # forecast.md cites sim records only at file level
    assert res["B6"]["status"] == "FAIL"  # no blocker observation: a real gap, not a format issue


def test_research_state_echo_is_explained_by_numbers_typed_across_messages():
    # research_state returns the journal: claims the agent proposed one message at a time.
    # 2026-10-15 delivery run: three claim numbers from three proposals read as a fingerprint hit.
    a = {"type": "text", "text": "try g=101.37 and E=-303.13"}
    b = {"type": "text", "text": "and tau=202.71"}
    out = [{"type": "text", "text": "H1 g=101.37 E=-303.13 | H2 tau=202.71"}]
    echo = {"timestamp": T1, "message": {"role": "toolResult", "toolName": "mcp__research__research_state", "content": out}}
    hits, explained = cf._session_hits([_msg("assistant", [a]), _msg("assistant", [b]), echo], FAKE_FP, "s", [])
    assert hits == [] and explained == ["s#mcp__research__research_state@1 numbers of XCH"]
    # nothing typed first: still a hit
    hits, _ = cf._session_hits([echo], FAKE_FP, "s", [])
    assert hits == ["s#mcp__research__research_state@1 numbers of XCH"]

    # probe metrics in the echo are host-measured: typing them back across messages does not explain them
    probes = [{"type": "text", "text": json.dumps({"probes": [{"pid": "P1", "metric": 101.37}, {"pid": "P2", "metric": -303.13},
                                                          {"pid": "P3", "metric": 202.71}]})}]
    measured = {"timestamp": T1, "message": {"role": "toolResult", "toolName": "mcp__research__research_state", "content": probes}}
    hits, _ = cf._session_hits([_msg("assistant", [a]), _msg("assistant", [b]), measured], FAKE_FP, "s", [])
    assert hits == ["s#mcp__research__research_state@1 numbers of XCH"]
