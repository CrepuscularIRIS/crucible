"""三道宿主 gate 的 BDD 测试。

硬要求（计划 §6.5）：种入幻觉数字的阳性对照是强制的——reconcile 必须踩响它；
prereg 顺序倒置、review 的 CONTESTED-in-headline 也要各有一条拒绝测试。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

GATES = os.path.dirname(os.path.abspath(__file__))


@pytest.fixture()
def landed_run(tmp_path, monkeypatch):
    """构造一个完整落地的 run：H1 kill H2，P1 LANDED，真实重算链路。"""
    run_dir = tmp_path / "run"
    case = tmp_path / "case"
    case.mkdir()
    (case / "eval.py").write_text(
        "import random, json, sys\n"
        "random.seed(int(sys.argv[sys.argv.index('--seeds')+1]))\n"
        "vals = [random.random() * 0.7 + 0.3 for _ in range(200)]\n"
        "json.dump({'mean': sum(vals)/len(vals)}, open('metrics.json','w'))\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "init", "-q"], cwd=case, check=True)
    subprocess.run(["git", "add", "-A"], cwd=case, check=True)
    subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "i"], cwd=case, check=True)
    run_dir.mkdir()
    monkeypatch.setenv("CRUCIBLE_RUN_DIR", str(run_dir))
    monkeypatch.setenv("CRUCIBLE_CASE_DIR", str(case))
    monkeypatch.setenv("CRUCIBLE_WORKTREE_ROOT", str(tmp_path / "wts"))
    from register import Register

    R = Register(str(run_dir))
    R.set_case("toy")
    h1 = R.abduce("均值明显高于 0.5", "phenomenon", predicts=["均值在[0.60,0.70]"], conflicts="none")
    h2 = R.abduce("均值在 0.5 附近", "phenomenon", predicts=["均值在[0.45,0.55]", "方差观察"], conflicts="none")
    pid = R.prereg(
        claim=h1, tests="200 seed",
        predictions=[
            {"branch": "支持高均值", "band": [0.60, 0.70], "on_hit": {"kill": [h2]}},
            {"branch": "支持无偏", "band": [0.45, 0.55], "on_hit": {"support": [h1]}},
        ],
        rule={"apply": "first_hit"}, controls=["seed 固定"], severity="互斥判决",
        eval_cmd="python eval.py --seeds 7",
        recompute={"kind": "json", "path": "metrics.json", "key": "mean"},
    )
    import probe

    R2 = Register(str(run_dir))  # 独立实例模拟另一进程
    assert probe.run_sync(pid, R=R2)["exit_code"] == 0
    R3 = Register(str(run_dir))
    landed = R3.land(pid)
    return run_dir, h1, h2, pid, landed["metric"]


def _write_report(run_dir, metric, h1, h2, verdicts=None, headline_claims=None):
    verdicts = verdicts if verdicts is not None else [
        (h1, "LIVE"), (h2, "REFUTED"),
    ]
    headline_claims = headline_claims if headline_claims is not None else []
    lines = ["# 报告", "", f"实验测得均值 {metric:.6f} ({pid_of(run_dir)})，H1 存活，H2 被否证。", "", "## 核心结论", ""]
    for c in headline_claims:
        lines.append(f"{c} 成立。")
    lines += ["", "## 评审", ""]
    for hid, v in verdicts:
        lines.append(f"- {hid}: {v}")
    (run_dir / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def pid_of(run_dir):
    reg = json.load(open(run_dir / "register.json", encoding="utf-8"))
    return next(iter(reg["probes"]))


def run_gate(name, run_dir):
    proc = subprocess.run(
        [sys.executable, os.path.join(GATES, f"{name}.py"), str(run_dir)],
        capture_output=True, text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


# ---------- prereg gate ----------

def test_prereg_gate_passes_on_clean_run(landed_run):
    run_dir, *_ = landed_run
    code, out = run_gate("prereg", run_dir)
    assert code == 0, out
    assert "GATE prereg: PASS" in out


def test_prereg_gate_catches_posthoc_timestamp(landed_run):
    run_dir, h1, *_ = landed_run
    # 篡改：把 prereg 时间戳挪到结果之后（同时改 register 里的哈希对，模拟一次"自洽"的倒填）
    pid = pid_of(run_dir)
    for rel in (f"prereg/{pid}.json", "register.json"):
        pass
    ppath = run_dir / "prereg" / f"{pid}.json"
    spec = json.load(open(ppath))
    spec["unix_prereg_ts"] = spec["unix_prereg_ts"] + 3600
    json.dump(spec, open(ppath, "w"))
    import hashlib
    reg_path = run_dir / "register.json"
    reg = json.load(open(reg_path))
    reg["probes"][pid]["prereg_sha"] = hashlib.sha256(open(ppath, "rb").read()).hexdigest()
    reg["probes"][pid]["unix_prereg_ts"] = spec["unix_prereg_ts"]
    json.dump(reg, open(reg_path, "w"))
    code, out = run_gate("prereg", run_dir)
    assert code == 1
    assert "不早于结果开始时间" in out


# ---------- reconcile gate ----------

def test_reconcile_passes_with_honest_report(landed_run):
    run_dir, h1, h2, pid, metric = landed_run
    _write_report(run_dir, metric, h1, h2)
    code, out = run_gate("reconcile", run_dir)
    assert code == 0, out


def test_reconcile_catches_planted_hallucinated_number(landed_run):
    """§6.5 强制阳性对照：种入幻觉数字，gate 必须踩响。"""
    run_dir, h1, h2, pid, metric = landed_run
    _write_report(run_dir, metric - 0.21, h1, h2)  # 真值 0.65 → 报 0.44
    code, out = run_gate("reconcile", run_dir)
    assert code == 1
    assert "幻觉数字" in out


def test_reconcile_catches_uncited_number(landed_run):
    run_dir, h1, h2, pid, metric = landed_run
    (run_dir / "report.md").write_text(
        f"# 报告\n\n均值是 0.6533，没有出处。\n\n## 评审\n\n- {h1}: LIVE\n- {h2}: REFUTED\n",
        encoding="utf-8",
    )
    code, out = run_gate("reconcile", run_dir)
    assert code == 1
    assert "缺少 (P#) 出处" in out


def test_reconcile_cites_claim_without_artifact(landed_run):
    run_dir, h1, h2, pid, metric = landed_run
    (run_dir / "report.md").write_text(
        f"# 报告\n\n据 H9 的分析均值 {metric:.6f} ({pid})。\n\n## 评审\n\n- {h1}: LIVE\n- {h2}: REFUTED\n",
        encoding="utf-8",
    )
    code, out = run_gate("reconcile", run_dir)
    assert code == 1
    assert "H9" in out


# ---------- review gate ----------

def test_review_passes_on_structured_report(landed_run):
    run_dir, h1, h2, pid, metric = landed_run
    _write_report(run_dir, metric, h1, h2)
    code, out = run_gate("review", run_dir)
    assert code == 0, out


def test_review_catches_missing_verdict_section(landed_run):
    run_dir, h1, h2, pid, metric = landed_run
    (run_dir / "report.md").write_text(
        f"# 报告\n\n均值 {metric:.6f} ({pid})。\n", encoding="utf-8",
    )
    code, out = run_gate("review", run_dir)
    assert code == 1
    assert "评审" in out


def test_review_catches_unsettled_claim_in_headline(landed_run):
    """H1 还是 LIVE（未终态），进 headline 必须被拒——D.7。"""
    run_dir, h1, h2, pid, metric = landed_run
    _write_report(run_dir, metric, h1, h2, headline_claims=[h1])
    code, out = run_gate("review", run_dir)
    assert code == 1
    assert "核心结论" in out


def test_review_catches_verdict_state_mismatch(landed_run):
    run_dir, h1, h2, pid, metric = landed_run
    _write_report(run_dir, metric, h1, h2, verdicts=[(h1, "SUPPORTED"), (h2, "REFUTED")])
    code, out = run_gate("review", run_dir)
    assert code == 1
    assert "不一致" in out
