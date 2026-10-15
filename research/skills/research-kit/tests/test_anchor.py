"""P2 锚（01-统一架构 §6.3 约束块、§6.5 锚 NEXT 行、§12 Q1 等价类出口）。

run 布局与真实工作目录一致：<cwd>/.proma-research/<run>/{register.json,journal.jsonl}（MCP 写），
<cwd>/research-work/<run>/lessons.md 与 <cwd>/RULINGS.md（父会话写）。kit 只读这几处。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

import research_kit

RUN = "r1"


@pytest.fixture(autouse=True)
def _cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("PROMA_EVAL_BUDGET", raising=False)  # 锚读 kernel 的预算 env；缺省 8 与 server 一致


def _claim(cid: str, state: str = "LIVE", **extra: Any) -> dict[str, Any]:
    return {"id": cid, "state": state, "statement": f"s-{cid}", "predicts": [], **extra}


def _run(
    events: list[dict[str, Any]],
    claims: list[dict[str, Any]] | None = None,
    graveyard: list[dict[str, Any]] | None = None,
    probes: list[dict[str, Any]] | None = None,
    attacks: list[dict[str, Any]] | None = None,
    verdicts: list[dict[str, Any]] | None = None,
    **reg_extra: Any,
) -> Path:
    root = Path(".proma-research") / RUN
    root.mkdir(parents=True, exist_ok=True)
    (root / "journal.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events), encoding="utf-8")
    reg = {
        "run": RUN,
        "claims": claims or [],
        "graveyard": graveyard or [],
        "probes": probes or [],
        "attacks": attacks or [],
        "gateVerdicts": verdicts or [],
        **reg_extra,
    }
    (root / "register.json").write_text(json.dumps(reg), encoding="utf-8")
    return root


def _init(mode: str | None, **extra: Any) -> dict[str, Any]:
    event: dict[str, Any] = {"ts": "t0", "op": "run.init", "run": RUN, **extra}
    if mode:
        event["mode"] = mode
    return event


def _next_lines(text: str) -> list[str]:
    return [line for line in text.splitlines() if line.startswith("NEXT:")]


def _lessons(text: str) -> None:
    path = Path("research-work") / RUN / "lessons.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _rulings(text: str) -> None:
    Path("RULINGS.md").write_text(text, encoding="utf-8")


# ---------- MODE / 谓词 ----------


def test_mode_line_shows_mode_predicate_and_depth_from_run_init() -> None:
    _run([_init("identify", success_predicate="LIVE 收缩到 1 或等价类，且 forecast 已提交", depth="light")])
    out = research_kit.anchor(RUN)
    assert "MODE: identify" in out
    assert "LIVE 收缩到 1 或等价类，且 forecast 已提交" in out
    assert "depth=light" in out
    assert research_kit.LAST == out


def test_mode_also_read_from_register_camel_case() -> None:
    _run([_init(None)], mode="score", successPredicate="admit(best) − admit(H0) ≥ δ")
    out = research_kit.anchor(RUN)
    assert "MODE: score" in out
    assert "admit(best) − admit(H0) ≥ δ" in out


def test_run_without_mode_is_legacy_and_routes_by_phase_table() -> None:
    _run([_init(None)])
    out = research_kit.anchor(RUN)
    assert "MODE: legacy" in out
    (line,) = _next_lines(out)
    assert "research-abduce" in line


# ---------- NEXT：三种 mode 起步各不同，且列出输入 / 输出路径 ----------


def test_fresh_runs_of_three_modes_get_different_next_with_in_and_out_paths() -> None:
    lines = {}
    for mode in ("open", "score", "identify"):
        _run([_init(mode)], claims=[_claim("H0")] if mode != "open" else [])
        (line,) = _next_lines(research_kit.anchor(RUN))
        assert " · in: " in line and " · out: " in line and " · why: " in line, line
        assert f"research-work/{RUN}/" in line.split(" · out: ")[1]
        lines[mode] = line.split(" · in: ")[0]
    assert len(set(lines.values())) == 3, lines


def test_identify_walks_info_then_families_then_discrimination() -> None:
    _run([_init("identify")], claims=[_claim("H0")])
    assert "world_simulate(mode=info)" in _next_lines(research_kit.anchor(RUN))[0]

    info = {"ts": "t1", "op": "world.info"}
    _run([_init("identify"), info], claims=[_claim("H0")])
    first = _next_lines(research_kit.anchor(RUN))[0]
    assert "families.md" in first

    _run([_init("identify"), info], claims=[_claim("H0"), _claim("H1"), _claim("H2")])
    first = _next_lines(research_kit.anchor(RUN))[0]
    assert "nbsim" in first and "prereg_write" in first and "world-engine.md" in first


def test_pending_prereg_routes_to_probe_run_before_anything_else() -> None:
    _run(
        [_init("identify"), {"ts": "t1", "op": "world.info"}, {"ts": "t2", "op": "prereg.write", "pid": "P1"}],
        claims=[_claim("H0"), _claim("H1")],
        probes=[{"pid": "P1", "status": "PREREG"}],
    )
    assert _next_lines(research_kit.anchor(RUN))[0].startswith("NEXT: probe_run P1")


def test_one_survivor_routes_to_forecast_then_report() -> None:
    base = [_init("identify"), {"ts": "t1", "op": "world.info"}]
    _run(base, claims=[_claim("H5")], graveyard=[_claim("H0", "REFUTED")])
    assert "world_forecast" in _next_lines(research_kit.anchor(RUN))[0]

    _run(base + [{"ts": "t2", "op": "world.forecast"}], claims=[_claim("H5")], graveyard=[_claim("H0", "REFUTED")])
    first = _next_lines(research_kit.anchor(RUN))[0]
    assert "report_declare" in first and f"research-work/{RUN}/REPORT.md" in first


def test_concluded_run_has_no_warning_and_no_work() -> None:
    _run([_init("identify")], verdicts=[{"passed": True}], graveyard=[_claim("H1", "SUPPORTED")])
    out = research_kit.anchor(RUN)
    assert "⚠" not in out
    assert _next_lines(out) == ["NEXT: — · 已结案（gate 通过）"]


# ---------- NEXT: synthesize lessons（按 journal 计数，01 §6.4） ----------


_LANDED = {"op": "probe.land", "exit_code": 0, "metric": 1.0}


def test_terminal_transition_without_lessons_asks_for_synthesis() -> None:
    events = [_init("identify"), {"ts": "t1", "op": "claim.transition", "id": "H2", "to": "REFUTED", "by_probe": "P1"}]
    _run(events, claims=[_claim("H0"), _claim("H1")], graveyard=[_claim("H2", "REFUTED")])
    out = research_kit.anchor(RUN)
    synth = [line for line in _next_lines(out) if line.startswith("NEXT: synthesize lessons")]
    assert len(synth) == 1
    assert f"research-work/{RUN}/lessons.md" in synth[0]
    assert "through-seq: 2" in synth[0]  # 父会话追加时写进 lessons.md 的覆盖点


def test_lessons_through_current_seq_silence_synthesis_until_three_landings() -> None:
    events = [_init("identify"), {"ts": "t1", "op": "claim.transition", "id": "H2", "to": "REFUTED", "by_probe": "P1"}]
    _lessons("## W5 · through-seq: 2 · .rlm-jobs/r1/w5/all/ab12/out.md\n- [leaf] P1 的 reps 不足以否定家族 (cites: H2, P1)\n")
    _run(events, claims=[_claim("H0"), _claim("H1")], graveyard=[_claim("H2", "REFUTED")])
    assert not any(line.startswith("NEXT: synthesize lessons") for line in _next_lines(research_kit.anchor(RUN)))

    _run(events + [_LANDED, _LANDED], claims=[_claim("H0"), _claim("H1")])
    assert not any(line.startswith("NEXT: synthesize lessons") for line in _next_lines(research_kit.anchor(RUN)))
    _run(events + [_LANDED, _LANDED, _LANDED], claims=[_claim("H0"), _claim("H1")])
    assert any(line.startswith("NEXT: synthesize lessons") for line in _next_lines(research_kit.anchor(RUN)))


# ---------- 约束块：lessons / narrowed / 等价类 / nugget ----------


def test_lessons_render_by_level_as_run_scoped_constraints() -> None:
    _lessons(
        "## W5 · through-seq: 1\n"
        "- [global] 否定家族前先扫自由参数 (cites: H2, P1)\n"
        "- [direction] 失活门 hk 符号先打印核对 (cites: H1)\n"
        "- [leaf] P1 单 rep (cites: P1)\n"
        "不是 bullet 的行不渲染\n"
    )
    _run([_init("identify")], claims=[_claim("H0"), _claim("H1")])
    out = research_kit.anchor(RUN)
    assert "LESSONS" in out and "本 run 全局" in out
    for text in ("否定家族前先扫自由参数", "失活门 hk 符号先打印核对", "P1 单 rep"):
        assert text in out
    assert out.index("[global]") < out.index("[direction]") < out.index("[leaf]")
    assert "不是 bullet" not in out


def test_scoped_with_statement_is_narrowed_live_not_graveyard_ban() -> None:
    narrowed = _claim("H2", "SCOPED", scopedStatement="只在 40ms 协议上无增强", byProbe="P2")
    _run([_init("identify")], claims=[_claim("H0"), _claim("H1")], graveyard=[narrowed, _claim("H3", "REFUTED")])
    out = research_kit.anchor(RUN)
    assert "LIVE (narrowed)" in out
    assert "H2: 只在 40ms 协议上无增强" in out
    graveyard = out.split("GRAVEYARD")[1].split("\n\n")[0]
    assert "H3" in graveyard and "H2 SCOPED" not in graveyard


def test_legacy_run_keeps_scoped_in_graveyard() -> None:
    narrowed = _claim("H2", "SCOPED", scopedStatement="x", byProbe="P2")
    _run([_init(None)], claims=[_claim("H1")], graveyard=[narrowed])
    out = research_kit.anchor(RUN)
    assert "LIVE (narrowed)" not in out
    assert "H2 SCOPED" in out


def test_equivalence_ruling_is_rendered_and_counts_as_contraction() -> None:
    _rulings("Ruling: depth=light — x — y\nRuling: equiv{H5, H7} — max min |Δpred|/σ = 0.6 < 1 — 报告写等价类\n")
    info = {"ts": "t1", "op": "world.info"}
    _run([_init("identify"), info, _observe(8)], claims=[_claim("H5"), _claim("H7")], graveyard=[_claim("H0", "REFUTED")])
    out = research_kit.anchor(RUN)
    assert "EQUIV" in out and "{H5, H7}" in out
    assert "world_forecast" in _next_lines(out)[0]


def test_equivalence_that_misses_a_live_claim_does_not_short_circuit() -> None:
    _rulings("Ruling: equiv{H5,H7} — x — y\n")
    info = {"ts": "t1", "op": "world.info"}
    _run([_init("identify"), info], claims=[_claim("H5"), _claim("H7"), _claim("H0")])
    assert "world_forecast" not in _next_lines(research_kit.anchor(RUN))[0]


def test_open_mode_warns_until_nugget_is_written_and_shows_it_above_next() -> None:
    _run([_init("open")])
    assert "⚠ nugget" in research_kit.anchor(RUN)

    _rulings("Ruling: K1 C1 PURSUE — x — y\nnugget: 长上下文检索失败是位置编码外推的残差（HYPOTHETICAL）\n")
    out = research_kit.anchor(RUN)
    assert "⚠ nugget" not in out
    nugget = out.index("NUGGET: 长上下文检索失败是位置编码外推的残差（HYPOTHETICAL）")
    assert nugget < out.index("NEXT:")


# ---------- mode run 的活集 = MCP isAlive：LIVE ∪ CONTESTED ∪ SUPPORTED ∪ narrowed（Wave 2 review HIGH-1） ----------


def _lead(cid: str, requested: str, caps: list[str], pid: str = "P1") -> dict[str, Any]:
    return _claim(cid, "CONTESTED", byProbe=pid, lead={"requested": requested, "byProbe": pid, "caps": caps})


def _lead_event(cid: str, requested: str, caps: list[str], pid: str = "P1") -> dict[str, Any]:
    """与 MCP claim_transition 被封顶时写的事件同形（server.ts：to=CONTESTED + requested + lead[]）。"""
    return {"ts": "t", "op": "claim.transition", "id": cid, "to": "CONTESTED", "by_probe": pid,
            "requested": requested, "lead": caps}


def _identify_lead_run() -> None:
    """review 复现：identify，H0 与 H5 被封顶到 lead，H7 LIVE。"""
    events = [
        _init("identify"), {"ts": "t1", "op": "world.info"},
        {"ts": "t2", "op": "prereg.write", "pid": "P1", "claims": ["H0", "H5"]},
        {"ts": "t3", "op": "probe.start", "pid": "P1"}, {"ts": "t4", **_LANDED, "pid": "P1"},
        _lead_event("H0", "REFUTED", ["asserted_band"]),
        _lead_event("H5", "SUPPORTED", ["rival_overlap", "no_audit"]),
    ]
    claims = [
        _lead("H0", "REFUTED", ["asserted_band"]),
        _lead("H5", "SUPPORTED", ["rival_overlap", "no_audit"]),
        _claim("H7"),
    ]
    _run(events, claims=claims, probes=[{"pid": "P1", "status": "LANDED", "metric": 1.0}], debts=[])


def test_identify_lead_claims_stay_alive_and_next_keeps_discriminating() -> None:
    _identify_lead_run()
    out = research_kit.anchor(RUN)
    assert "LEAD (2)" in out
    assert "H5 requested=SUPPORTED caps=rival_overlap,no_audit" in out
    assert "H0 requested=REFUTED caps=asserted_band" in out
    (next_work,) = [line for line in _next_lines(out) if not line.startswith("NEXT: synthesize")]
    assert "world_forecast" not in next_work
    assert "nbsim" in next_work and "3 条" in next_work
    assert research_kit.counters(RUN)["live"] == 3
    assert "LIVE=3/" in out


def test_score_lead_does_not_route_to_report() -> None:
    events = [_init("score"), _lead_event("H1", "SUPPORTED", ["no_discrimination"])]
    _run(events, claims=[_claim("H0"), _lead("H1", "SUPPORTED", ["no_discrimination"])])
    next_work = [line for line in _next_lines(research_kit.anchor(RUN)) if not line.startswith("NEXT: synthesize")][0]
    assert "report_declare" not in next_work


def test_supported_in_mode_run_is_alive_not_a_graveyard_ban() -> None:
    supported = _claim("H5", "SUPPORTED", byProbe="P2")
    _run([_init("identify"), {"ts": "t1", "op": "world.info"}],
         claims=[_claim("H0"), supported], graveyard=[supported])
    out = research_kit.anchor(RUN)
    assert "GRAVEYARD" not in out
    assert "H5 [SUPPORTED]" in out
    assert research_kit.counters(RUN)["live"] == 2


def test_revived_then_narrowed_claim_is_not_also_banned() -> None:
    narrowed = _claim("H2", "SCOPED", scopedStatement="只在 40ms 协议上", byProbe="P3")
    _run([_init("identify")], claims=[_claim("H0"), narrowed],
         graveyard=[_claim("H2", "REFUTED", byProbe="P1"), _claim("H3", "REFUTED")])
    out = research_kit.anchor(RUN)
    assert "H2: 只在 40ms 协议上" in out
    banned = out.split("GRAVEYARD")[1].split("LIVE (narrowed)")[0]
    assert "H3" in banned and "H2" not in banned


def test_legacy_alive_set_is_unchanged() -> None:
    _run([_init(None)], claims=[_claim("H1"), _claim("H2", "CONTESTED")])
    assert research_kit.counters(RUN)["live"] == 1
    assert "LEAD" not in research_kit.anchor(RUN)


# ---------- M4：攻击债读 register.debts；W5 计数含 lead 迁移 ----------


def test_attack_debt_reads_register_debts_when_present() -> None:
    events = [
        _init("identify"),
        {"ts": "t1", "op": "attack.record", "gid": "G1", "target": "H5", "kind": "new_h"},
        {"ts": "t2", "op": "claim.propose", "id": "H7"},  # journal 代理会把它算成清偿；MCP 按 claim 不清
    ]
    _run(events, claims=[_claim("H5"), _claim("H7")], debts=[{"gid": "G1", "target": "H5", "kind": "new_h"}])
    assert research_kit.counters(RUN)["attack_debt"] == 1
    assert "攻击债=1" in research_kit.anchor(RUN)


def test_lead_transition_counts_toward_lessons_synthesis() -> None:
    _identify_lead_run()
    _lessons("## W5 · through-seq: 5\n- [leaf] x (cites: P1)\n")
    synth = [line for line in _next_lines(research_kit.anchor(RUN)) if line.startswith("NEXT: synthesize lessons")]
    assert len(synth) == 1 and "2 次终态/lead 迁移" in synth[0]


# ---------- 预算（01 K2-1）：没花完的预算记为失败；活对手未分开时锚继续点名下一探针（含阻断剂） ----------


def _observe(cost: int, blockers: str = "") -> dict[str, Any]:
    """与 MCP world.observe 事件同形（server.ts：cost = reps，blockers 逗号分隔）。"""
    return {"ts": "t", "op": "world.observe", "cost": cost, "blockers": blockers}


_INFO = {"ts": "t1", "op": "world.info"}


def test_budget_left_with_unseparated_rivals_names_next_probe_with_blockers() -> None:
    _run([_init("identify"), _INFO, _observe(4)], claims=[_claim("H0"), _claim("H1"), _claim("H2")])
    (line,) = _next_lines(research_kit.anchor(RUN))
    assert line.startswith("NEXT: 剩余预算 4 → 选判别度最高的下一探针（含阻断剂）"), line
    assert "prereg_write" in line and "world-engine.md" in line and "world_forecast" not in line


def test_budget_total_comes_from_kernel_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROMA_EVAL_BUDGET", "12")
    _run([_init("identify"), _INFO, _observe(3), _observe(2, "X")], claims=[_claim("H0"), _claim("H1")])
    assert _next_lines(research_kit.anchor(RUN))[0].startswith("NEXT: 剩余预算 7 →")


def test_equivalence_ruling_does_not_skip_unspent_budget() -> None:
    _rulings("Ruling: equiv{H5, H7} — max min |Δpred|/σ = 0.6 < 1 — 报告写等价类\n")
    _run([_init("identify"), _INFO, _observe(4)], claims=[_claim("H5"), _claim("H7")], graveyard=[_claim("H0", "REFUTED")])
    (line,) = _next_lines(research_kit.anchor(RUN))
    assert line.startswith("NEXT: 剩余预算 4 → 选判别度最高的下一探针（含阻断剂）"), line


def test_lead_rivals_with_budget_left_keep_probing() -> None:
    _identify_lead_run()
    (line,) = [ln for ln in _next_lines(research_kit.anchor(RUN)) if not ln.startswith("NEXT: synthesize")]
    assert line.startswith("NEXT: 剩余预算 8 →"), line


def test_budget_spent_with_unseparated_rivals_routes_to_forecast() -> None:
    _run([_init("identify"), _INFO, _observe(8)], claims=[_claim("H0"), _claim("H1")])
    (line,) = _next_lines(research_kit.anchor(RUN))
    assert "world_forecast" in line and "预算已尽" in line and "equiv" in line, line


def test_single_survivor_with_budget_left_forecasts_but_report_must_say_why() -> None:
    base = [_init("identify"), _INFO, _observe(4)]
    _run(base, claims=[_claim("H5")], graveyard=[_claim("H0", "REFUTED")])
    (line,) = _next_lines(research_kit.anchor(RUN))
    assert "world_forecast" in line and "(sim:<记录 id>)" in line, line
    assert "预算剩 4" in line and "01 K2-1" in line

    _run(base + [{"ts": "t2", "op": "world.forecast"}], claims=[_claim("H5")], graveyard=[_claim("H0", "REFUTED")])
    (line,) = _next_lines(research_kit.anchor(RUN))
    assert "report_declare" in line and "预算剩 4" in line and "01 K2-1" in line, line


def test_forecast_closes_probing_even_with_budget_and_rivals_left() -> None:
    _run([_init("identify"), _INFO, _observe(2), {"ts": "t2", "op": "world.forecast"}], claims=[_claim("H0"), _claim("H1")])
    (line,) = _next_lines(research_kit.anchor(RUN))
    assert "report_declare" in line and "剩余预算" not in line, line
