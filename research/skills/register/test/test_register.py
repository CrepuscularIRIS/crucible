"""register 的 BDD 风格测试。

计划 §2.1 的硬要求：四道验证器各有一条"必须踩响"的拒绝测试；
外加正常路径、TRIAGE、锚点有界性、journal 记录（含拒绝）。
"""

from __future__ import annotations

import json
import os
import time

import pytest

from register import ClaimState, RefusalError, Register


@pytest.fixture()
def run_dir(tmp_path):
    R = Register(str(tmp_path))
    R.set_case("toy")
    R.set_thesis("在玩具分布 D 上，两个植入假设只有一个能存活")
    return R


def _abduce_two(R: Register) -> tuple[str, str]:
    h1 = R.abduce(
        claim="D 的均值明显大于 0.5",
        kind="phenomenon",
        predicts=["seed 均值落在 [0.60, 0.70]"],
        conflicts="none",
    )
    h2 = R.abduce(
        claim="D 的均值在 0.5 附近（无偏）",
        kind="phenomenon",
        predicts=["seed 均值落在 [0.45, 0.55]", "扩大 seed 数后方差按 1/n 收缩"],
        conflicts="none",
    )
    return h1, h2


def _prereg(R: Register, claim: str, **over):
    kwargs = dict(
        claim=claim,
        tests="跑 200 个 seed 的均值",
        predictions=[
            {"branch": "支持大于", "band": [0.60, 0.70], "on_hit": {"kill": [claim == "H1" and "H2" or "H1"]}},
            {"branch": "支持无偏", "band": [0.45, 0.55], "on_hit": {"support": [claim]}},
        ],
        rule={"apply": "first_hit"},
        controls=["seed=0 基线", "顺序反转"],
        severity="对 H1/H2 互相致命",
        eval_cmd="python eval.py --seeds 200",
        recompute={"kind": "json", "path": "metrics.json", "key": "mean"},
    )
    kwargs.update(over)
    return R.prereg(**kwargs)


def _fake_result(R: Register, pid: str, mean: float, eval_cmd: str | None = None,
                 prereg_path: str | None = None, produced_by: str = "probe.run",
                 claimed: float | None = None):
    spec = json.load(open(os.path.join(R.run_dir, "prereg", f"{pid}.json")))
    result_dir = os.path.join(R.run_dir, "results", pid)
    raw = os.path.join(result_dir, "raw")
    os.makedirs(raw, exist_ok=True)
    with open(os.path.join(raw, "metrics.json"), "w") as fh:
        json.dump({"mean": mean}, fh)
    cmd = eval_cmd if eval_cmd is not None else spec["eval_cmd"]
    import hashlib
    prov = {
        "produced_by": produced_by,
        "eval_cmd": cmd,
        "eval_cmd_hash": hashlib.sha256(cmd.encode()).hexdigest(),
        "unix_started": time.time(),
        "seeds": 200,
    }
    if claimed is not None:
        prov["claimed_metric"] = claimed
    with open(os.path.join(result_dir, "provenance.json"), "w") as fh:
        json.dump(prov, fh)
    return spec


# ---------- abduce：正常路径 + distinctness + graveyard 纪律 + re-proposal ----------

def test_abduce_ok_creates_live(run_dir):
    h1, h2 = _abduce_two(run_dir)
    assert h1 == "H1" and h2 == "H2"
    assert run_dir.state["claims"]["H1"]["state"] == ClaimState.LIVE.value
    assert ClaimState(run_dir.state["claims"]["H2"]["state"]) in (ClaimState.LIVE,)


def test_abduce_distinctness_refuses_subset_predictions(run_dir):
    _abduce_two(run_dir)
    with pytest.raises(RefusalError, match="distinctness"):
        run_dir.abduce(
            claim="D 的均值在 0.5 附近（换个说法）",
            kind="phenomenon",
            predicts=["seed 均值落在 [0.45, 0.55]"],  # H2 预测集的子集
            conflicts="none",
        )
    # 拒绝也被记录
    ops = [e["op"] for e in run_dir.journal.replay()]
    assert ops.count("abduce") == 3  # 2 成功 + 1 拒绝


def test_abduce_conflicts_must_address_graveyard(run_dir):
    h1, h2 = _abduce_two(run_dir)
    pid = _prereg(run_dir, "H1")
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65)  # 落在 [0.60,0.70] → kill H2
    run_dir.land(pid)
    assert run_dir.state["claims"]["H2"]["state"] == ClaimState.REFUTED.value
    with pytest.raises(RefusalError, match="graveyard"):
        run_dir.abduce(
            claim="全新假设，但 conflicts 不点名 H2",
            kind="mechanism",
            predicts=["完全不同的可观察量 X"],
            conflicts="none",
        )
    ok = run_dir.abduce(
        claim="同上但回应了死者",
        kind="mechanism",
        predicts=["完全不同的可观察量 X", "另一个可观察量 Y"],
        conflicts="与 H2 不同：H2 假设无偏，本假设假设方差结构不同",
    )
    assert ok == "H3"


def test_abduce_reproposal_refused(run_dir):
    _abduce_two(run_dir)
    pid = _prereg(run_dir, "H1")
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65)
    run_dir.land(pid)
    assert run_dir.state["claims"]["H2"]["state"] == ClaimState.REFUTED.value
    with pytest.raises(RefusalError, match="re-proposal"):
        run_dir.abduce(
            claim="D 的均值在 0.5 附近（无偏）",  # 与 H2 文本相同
            kind="phenomenon",
            predicts=["新可观察量"],
            conflicts="与 H2 的关系：换个角度",
        )


# ---------- prereg：lethality 两类拒绝 ----------

def test_prereg_refuses_overlapping_bands(run_dir):
    h1, _ = _abduce_two(run_dir)
    with pytest.raises(RefusalError, match="装饰性实验"):
        _prereg(
            run_dir, h1,
            predictions=[
                {"branch": "A", "band": [0.0, 0.7], "on_hit": {"kill": ["H2"]}},
                {"branch": "B", "band": [0.5, 1.0], "on_hit": {"support": [h1]}},
            ],
        )


def test_prereg_refuses_no_lethal_branch(run_dir):
    h1, _ = _abduce_two(run_dir)
    with pytest.raises(RefusalError, match="lethality"):
        _prereg(
            run_dir, h1,
            predictions=[
                {"branch": "A", "band": [0.6, 0.7], "on_hit": {"support": [h1]}},
                {"branch": "B", "band": [0.45, 0.55], "on_hit": {"support": [h1]}},
            ],
        )


def test_prereg_writes_timestamped_file_before_launch(run_dir):
    h1, _ = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)
    path = os.path.join(run_dir.run_dir, "prereg", f"{pid}.json")
    assert os.path.exists(path)
    spec = json.load(open(path))
    assert spec["unix_prereg_ts"] <= time.time()
    assert run_dir.state["probes"][pid]["state"] == "PREREG"


# ---------- land：precedence / provenance / recompute 三道拒绝 + 规则应用 ----------

def test_land_refuses_tampered_prereg(run_dir):
    h1, _ = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65)
    # 事后改 prereg 文件
    path = os.path.join(run_dir.run_dir, "prereg", f"{pid}.json")
    spec = json.load(open(path))
    spec["predictions"][0]["band"] = [0.0, 1.0]
    json.dump(spec, open(path, "w"))
    with pytest.raises(RefusalError, match="precedence"):
        run_dir.land(pid)


def test_land_refuses_handmade_artifact(run_dir):
    h1, _ = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65, produced_by="model.hands")
    with pytest.raises(RefusalError, match="produced_by"):
        run_dir.land(pid)


def test_land_refuses_claimed_metric_mismatch(run_dir):
    h1, _ = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65, claimed=0.55)  # 口头数字与原始文件不符
    with pytest.raises(RefusalError, match="不一致"):
        run_dir.land(pid)


def test_land_refuses_result_predating_prereg(run_dir):
    h1, _ = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)
    p = run_dir.state["probes"][pid]
    p["unix_prereg_ts"] = time.time() + 3600  # 伪造登记时间在未来
    run_dir._save()
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65)
    with pytest.raises(RefusalError, match="precedence"):
        run_dir.land(pid)


def test_land_applies_kill_rule_mechanically(run_dir):
    h1, h2 = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)  # band [0.60,0.70] → kill H2
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65)
    out = run_dir.land(pid)
    assert out["branch"] == "支持大于"
    assert run_dir.state["claims"][h2]["state"] == ClaimState.REFUTED.value
    assert run_dir.state["claims"][h2]["killed_by"] == pid
    assert run_dir.state["probes"][pid]["state"] == "LANDED"


def test_land_triage_when_outside_every_band(run_dir):
    h1, _ = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.30)  # 两个频段都不含
    out = run_dir.land(pid)
    assert out["probe_state"] == "TRIAGE"
    assert any(c.get("owed") for c in run_dir.state["constraints"])


def test_land_refuses_wrong_eval_cmd(run_dir):
    h1, _ = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65, eval_cmd="python eval.py --seeds 999")
    with pytest.raises(RefusalError, match="eval"):
        run_dir.land(pid)


# ---------- 文本移动与 stale / 锚点 ----------

def test_demote_scope_promote_reversible(run_dir):
    h1, _ = _abduce_two(run_dir)
    run_dir.demote(h1, "口头理由：先放一放")
    assert run_dir.state["claims"][h1]["state"] == ClaimState.DEMOTED.value
    run_dir.scope(h1, "仅限 seed<100", "收窄")
    run_dir.promote(h1, "重新激活")
    assert run_dir.state["claims"][h1]["state"] == ClaimState.LIVE.value


def test_terminal_cannot_be_text_moved(run_dir):
    h1, h2 = _abduce_two(run_dir)
    pid = _prereg(run_dir, h1)
    run_dir.mark_running(pid)
    _fake_result(run_dir, pid, mean=0.65)
    run_dir.land(pid)
    with pytest.raises(RefusalError):
        run_dir.demote(h2, "想翻案")


def test_stale_reports_untested_live_claim(run_dir):
    h1, _ = _abduce_two(run_dir)
    s = run_dir.stale()
    assert any(h1 in item for item in s["owed"])


def test_anchor_bounded(run_dir):
    for i in range(30):
        run_dir.abduce(
            claim=f"假设编号 {i}，文本刻意写得很长以测试锚点截断行为——" + "x" * 200,
            kind="mechanism",
            predicts=[f"可观察量 {i}-a", f"可观察量 {i}-b"],
            conflicts="none",
        )
    assert len(run_dir.anchor()) <= 7000


def test_claim_view_hides_reasoning(run_dir):
    h1, _ = _abduce_two(run_dir)
    run_dir.demote(h1, "内部辩护理由：作者认为证据不足 ABCDEF")
    view = run_dir.claim_view(h1)
    blob = json.dumps(view, ensure_ascii=False)
    assert "ABCDEF" not in blob  # 提出者的推理不进攻击者视图


# ---------- grill 结果落地 ----------

def test_record_attack_new_h_goes_through_validators(run_dir):
    h1, h2 = _abduce_two(run_dir)
    gid = run_dir.add_attack(h1, "攻击 prompt")
    out = run_dir.record_attack(
        gid,
        {"type": "new_h", "claim": "攻击者假设", "kind": "mechanism",
         "predicts": ["攻击者可观察量"], "conflicts": "none"},
    )
    assert out["accepted"] is True and out["spawned"] == "H3"
    gid2 = run_dir.add_attack(h1, "攻击 prompt 2")
    out2 = run_dir.record_attack(
        gid2,
        {"type": "new_h", "claim": "不可区分假设", "kind": "mechanism",
         "predicts": ["seed 均值落在 [0.60, 0.70]"], "conflicts": "none"},
    )
    assert out2["accepted"] is False  # 验证器拒绝，攻击被记为 rejected


def test_record_attack_rejects_prose(run_dir):
    h1, _ = _abduce_two(run_dir)
    gid = run_dir.add_attack(h1, "p")
    with pytest.raises(RefusalError, match="new_h / constraint / no_change"):
        run_dir.record_attack(gid, {"type": "essay", "body": "我觉得这个假设挺不错的，建议……"})
