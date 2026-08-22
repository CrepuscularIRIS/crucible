"""probe.run 的 BDD 测试：worktree 隔离、哈希冻结、provenance、失败如实记录。"""

from __future__ import annotations

import json
import os
import subprocess

import pytest

from probe import ProbeError, run_sync
from register import Register


@pytest.fixture()
def case_repo(tmp_path):
    """玩具 case 仓库：eval.py 用固定 seed 算均值写 metrics.json。"""
    case = tmp_path / "case"
    case.mkdir()
    (case / "eval.py").write_text(
        "import random, json, sys\n"
        "random.seed(int(sys.argv[sys.argv.index('--seeds')+1]))\n"
        "vals = [random.random() * 0.7 + 0.3 for _ in range(200)]\n"  # 均值≈0.65
        "json.dump({'mean': sum(vals)/len(vals)}, open('metrics.json','w'))\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "init", "-q"], cwd=case, check=True)
    subprocess.run(["git", "add", "-A"], cwd=case, check=True)
    subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], cwd=case, check=True)
    return str(case)


@pytest.fixture()
def setup(tmp_path, case_repo, monkeypatch):
    run_root = tmp_path / "run"
    run_root.mkdir()
    monkeypatch.setenv("CRUCIBLE_RUN_DIR", str(run_root))
    monkeypatch.setenv("CRUCIBLE_CASE_DIR", case_repo)
    monkeypatch.setenv("CRUCIBLE_WORKTREE_ROOT", str(tmp_path / "wts"))
    R = Register(str(run_root))
    R.set_case("toy")
    h1 = R.abduce(
        "均值明显高于 0.5", "phenomenon",
        predicts=["200-seed 均值在 [0.60,0.70]"], conflicts="none",
    )
    h2 = R.abduce(
        "均值在 0.5 附近", "phenomenon",
        predicts=["200-seed 均值在 [0.45,0.55]", "别的观察"], conflicts="none",
    )
    pid = R.prereg(
        claim=h1,
        tests="200 seed 均值",
        predictions=[
            {"branch": "支持高均值", "band": [0.60, 0.70], "on_hit": {"kill": [h2]}},
            {"branch": "支持无偏", "band": [0.45, 0.55], "on_hit": {"support": [h1]}},
        ],
        rule={"apply": "first_hit"},
        controls=["seed 固定"],
        severity="互斥判决",
        eval_cmd="python eval.py --seeds 7",
        recompute={"kind": "json", "path": "metrics.json", "key": "mean"},
        outputs=["metrics.json"],
    )
    return R, pid, h1, h2


def test_probe_run_produces_provenance_and_lands(setup):
    R, pid, h1, h2 = setup
    out = run_sync(pid)
    R.reload()  # run_sync 内部自建实例写了盘，显式重读
    assert out["exit_code"] == 0
    assert "metrics.json" in out["collected"]
    prov = json.load(open(os.path.join(R.run_dir, "results", pid, "provenance.json")))
    assert prov["produced_by"] == "probe.run"
    assert prov["worktree_mode"] == "git-clone"
    assert R.state["probes"][pid]["state"] == "RUNNING"
    result = R.land(pid)
    assert 0.60 <= result["metric"] <= 0.70
    assert R.state["claims"][h2]["state"] == "REFUTED"


def test_probe_run_isolates_case_tree(setup, case_repo):
    R, pid, *_ = setup
    run_sync(pid)
    # worktree 里产生的 metrics.json 不污染 case 主树
    assert not os.path.exists(os.path.join(case_repo, "metrics.json"))
    assert os.path.exists(os.path.join(R.run_dir, "results", pid, "raw", "metrics.json"))


def test_probe_run_refuses_tampered_prereg(setup):
    R, pid, *_ = setup
    path = os.path.join(R.run_dir, "prereg", f"{pid}.json")
    spec = json.load(open(path))
    spec["eval_cmd"] = "echo hacked > metrics.json"
    json.dump(spec, open(path, "w"))
    with pytest.raises(ProbeError, match="哈希"):
        run_sync(pid)


def test_probe_run_records_failure_honestly(setup):
    R, pid, *_ = setup
    # 把 eval 改成必失败（合法路径：重新 prereg 一个失败的探针）
    h1 = R.state["probes"][pid]["claim"]
    pid2 = R.prereg(
        claim=h1, tests="失败路径", 
        predictions=[
            {"branch": "A", "band": [0.60, 0.70], "on_hit": {"kill": [h1]}},
            {"branch": "B", "band": [0.45, 0.55], "on_hit": {"kill": [h1]}},
        ],
        rule={"apply": "first_hit"}, controls=["x"], severity="x",
        eval_cmd="python eval.py --seeds notanumber",
        recompute={"kind": "json", "path": "metrics.json", "key": "mean"},
    )
    out = run_sync(pid2)
    assert out["exit_code"] != 0
    prov = json.load(open(os.path.join(R.run_dir, "results", pid2, "provenance.json")))
    assert prov["exit_code"] != 0
    # 失败产物不能 land：raw 缺失 → RefusalError
    from register import RefusalError
    with pytest.raises(RefusalError):
        R.land(pid2)
