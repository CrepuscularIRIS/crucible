"""grill 的 BDD 测试：prompt 盲化与镜头轮转、typed 落盘回传协议、散文拒绝。"""

from __future__ import annotations

import json
import os

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
