"""grill 的 BDD 测试：prompt 盲化与镜头轮转、typed 落盘回传协议、散文拒绝。"""

from __future__ import annotations

import json
import os

import time

import pytest

from grill import GrillError, build_prompt, poll
from register import Register


@pytest.fixture()
def R(tmp_path):
    reg = Register(str(tmp_path))
    reg.set_case("toy")
    h1 = reg.abduce("均值高", "phenomenon", predicts=["均值在[0.60,0.70]"], conflicts="none")
    h2 = reg.abduce("均值0.5", "phenomenon", predicts=["均值在[0.45,0.55]", "方差"], conflicts="none")
    reg.demote(h1, "提出者内心独白：其实我有点心虚 SECRET_REASONING")
    return reg, h1, h2


def test_build_prompt_blinds_proposer_reasoning(R):
    reg, h1, h2 = R
    view = reg.claim_view(h1)
    prompt = build_prompt(view, "G1", "/tmp/x/grill/G1.json", 0)
    assert "SECRET_REASONING" not in prompt
    assert "均值高" in prompt  # claim 本身在
    assert "G1.json" in prompt and "new_h" in prompt and "constraint" in prompt and "no_change" in prompt


def test_build_prompt_rotates_lenses(R):
    reg, h1, _ = R
    view = reg.claim_view(h1)
    p0 = build_prompt(view, "G1", "/a/G1.json", 0)
    p1 = build_prompt(view, "G2", "/a/G2.json", 1)
    assert "竞争作者" in p0 and "机制怀疑者" in p1


def test_poll_lands_typed_new_h_through_validators(R):
    reg, h1, h2 = R
    reg.promote(h1, "复活")  # LIVE 才能被攻击
    gid = reg.add_attack(h1, "prompt-v1")
    path = os.path.join(reg.run_dir, "grill", f"{gid}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(
        {"gid": gid, "type": "new_h", "claim": "攻击者新假设",
         "kind": "mechanism", "predicts": ["全新可观察量"], "conflicts": "none"},
        open(path, "w", encoding="utf-8"),
    )
    results = poll(reg)
    assert results and results[0]["accepted"] is True
    assert reg.state["claims"][results[0]["spawned"]]["state"] == "LIVE"
    assert reg.state["attacks"][gid]["status"] == "resolved"


def test_poll_records_prose_as_refused(R):
    reg, h1, _ = R
    gid = reg.add_attack(h1, "prompt-v1")
    path = os.path.join(reg.run_dir, "grill", f"{gid}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"gid": gid, "type": "essay", "body": "我觉得还行"}, open(path, "w", encoding="utf-8"))
    results = poll(reg)
    assert results and results[0]["accepted"] is False
    assert reg.state["attacks"][gid]["status"] == "rejected_malformed"


def test_poll_ignores_unregistered_files(R):
    reg, h1, _ = R
    path = os.path.join(reg.run_dir, "grill", "G999.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"gid": "G999", "type": "no_change", "reason": "x"}, open(path, "w", encoding="utf-8"))
    assert poll(reg) == []


def test_claim_view_carries_what_the_validators_demand(tmp_path):
    """攻击者必须拿得到 graveyard 与其它 live 假设的 predicts。

    abduce 的两道验证器要求新假设 (a) 预言没人预言过的量、(b) conflicts 点名
    graveyard 里的 id。若 claim_view 不含这两份材料，子代理**在结构上无法**满足，
    每次 new_h 攻击都会被机械拒绝——实测 toy-7/toy-8 各出现过一次。
    这是 impossible-instructions 那一类：看着像模型不听话，其实是它做不到。
    """
    import sys  # noqa: F401
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), "register", "src"))
    from register import Register

    R = Register(str(tmp_path))
    h1 = R.abduce("均值高", "phenomenon", ["均值 > 0.6"], "")
    h2 = R.abduce("均值中", "phenomenon", ["均值 ~ 0.5", "方差小"], "")
    pid = R.prereg(
        claim=h1, tests="t",
        predictions=[{"band": [0.6, 1.0], "on_hit": {"kill": [h2]}},
                     {"band": [0.0, 0.55], "on_hit": {"kill": [h1]}}],
        rule={}, controls=["c"], severity="s", eval_cmd="true",
        recompute={"kind": "json", "path": "m.json", "key": "acc"},
    )
    os.makedirs(os.path.join(str(tmp_path), "results", pid, "raw"), exist_ok=True)
    json.dump({"acc": 0.8}, open(os.path.join(str(tmp_path), "results", pid, "raw", "m.json"), "w"))
    spec = json.load(open(os.path.join(str(tmp_path), "prereg", f"{pid}.json")))
    R.mark_running(pid)
    json.dump({"produced_by": "probe.run", "eval_cmd_hash": spec["eval_cmd_hash"],
               "exit_code": 0, "unix_started": time.time() + 1},
              open(os.path.join(str(tmp_path), "results", pid, "provenance.json"), "w"))
    R.land(pid)

    view = R.claim_view(h1)
    assert [g["id"] for g in view["graveyard"]] == [h2], "graveyard 必须可见"
    assert h2 not in view["other_live_predicts"], "死者不算 live"

    # 用视图里的材料构造的攻击结果，必须真的能通过验证器
    gid = R.add_attack(h1, "prompt")
    out = R.record_attack(gid, {
        "type": "new_h",
        "claim": "均值受右尾拉动",
        "kind": "mechanism",
        "predicts": ["右尾占比 > 0.25"],
        "conflicts": f"与 {view['graveyard'][0]['id']} 不同：它讲中心位置，本假设讲尾部形状",
    })
    assert out["accepted"], out
