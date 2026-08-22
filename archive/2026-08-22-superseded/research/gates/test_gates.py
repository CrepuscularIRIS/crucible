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


# ---------- 整套 gate 的联合契约（这些是"为什么缺陷能出厂"的直接答案） ----------

def test_all_gates_green_together_with_unprobed_live_claim(landed_run):
    """三道 gate 必须能被同一份报告同时满足。

    这是本轮评审发现的第一个死锁：review 要求 register 里每个 claim 都有 verdict 行，
    reconcile 又拒绝报告里任何没有 artifact 的 H#。只要存在一个还没跑 probe 的 LIVE
    claim（grill 派生新假设时必然出现），模型就无解——写它被 reconcile 拒，
    不写它被 review 拒。十个单 gate 测试都发现不了，因为它们从不同时跑。
    """
    run_dir, h1, h2, pid, metric = landed_run
    from register import Register

    R = Register(str(run_dir))
    h3 = R.abduce("均值受尾部影响", "mechanism", predicts=["尾部占比 > 0.2"], conflicts=f"与 {h2} 不同：它讲的是尾部而非中心")
    _write_report(run_dir, metric, h1, h2, verdicts=[(h1, "LIVE"), (h2, "REFUTED"), (h3, "LIVE")])
    for gate in ("integrity", "prereg", "reconcile", "review"):
        code, out = run_gate(gate, run_dir)
        assert code == 0, f"{gate} 未通过：\n{out}"


def test_integrity_catches_hand_edited_register(landed_run):
    """把 register.json 里的 claim 直接改成终态——journal 里没有对应的 land。"""
    run_dir, h1, h2, pid, metric = landed_run
    reg_path = run_dir / "register.json"
    reg = json.load(open(reg_path, encoding="utf-8"))
    reg["claims"][h1]["state"] = "SUPPORTED"
    reg["claims"][h1]["killed_by"] = pid
    json.dump(reg, open(reg_path, "w", encoding="utf-8"), ensure_ascii=False)
    code, out = run_gate("integrity", run_dir)
    assert code == 1, out
    assert "applied 未点名" in out or "land ok" in out


def test_integrity_refuses_empty_campaign(tmp_path):
    """什么都没发生的战役不能拿绿灯——空循环没有拒绝条件可踩。"""
    run_dir = tmp_path / "empty"
    run_dir.mkdir()
    json.dump({"claims": {}, "probes": {}, "evidence": [], "constraints": []},
              open(run_dir / "register.json", "w", encoding="utf-8"))
    (run_dir / "journal.jsonl").write_text('{"op":"set_case","ok":true}\n', encoding="utf-8")
    (run_dir / "report.md").write_text("# r\n\n## 核心结论\n\n## 评审\n", encoding="utf-8")
    code, out = run_gate("integrity", run_dir)
    assert code == 1, out
    assert "空跑" in out


def test_reconcile_catches_bracketed_uncited_number(landed_run):
    """[0.91] 这类任意方括号不再享受频段豁免——否则加个括号就能藏住任何数字。"""
    run_dir, h1, h2, pid, metric = landed_run
    _write_report(run_dir, metric, h1, h2)
    text = (run_dir / "report.md").read_text(encoding="utf-8")
    (run_dir / "report.md").write_text(text + "\n最终准确率 [0.91]，显著高于基线。\n", encoding="utf-8")
    code, out = run_gate("reconcile", run_dir)
    assert code == 1, out
    assert "0.91" in out


def test_reconcile_rejects_precision_dodge(landed_run):
    """降精度不能当脱逃路线：真值 0.646… 时 '约 1 (P1)' 必须被拒。"""
    run_dir, h1, h2, pid, metric = landed_run
    _write_report(run_dir, metric, h1, h2)
    text = (run_dir / "report.md").read_text(encoding="utf-8")
    (run_dir / "report.md").write_text(text + f"\n准确率约 1 ({pid})。\n", encoding="utf-8")
    code, out = run_gate("reconcile", run_dir)
    assert code == 1, out
    assert "幻觉数字" in out


def test_reconcile_finds_hid_without_word_boundary(landed_run):
    """中文里 '假设H9的分析' 没有词边界——\\b 会整条漏掉。"""
    run_dir, h1, h2, pid, metric = landed_run
    _write_report(run_dir, metric, h1, h2)
    text = (run_dir / "report.md").read_text(encoding="utf-8")
    (run_dir / "report.md").write_text(text + "\n据H99的分析可知该效应稳健。\n", encoding="utf-8")
    code, out = run_gate("reconcile", run_dir)
    assert code == 1, out
    assert "H99" in out


def test_host_gate_refuses_python_recompute(landed_run):
    """宿主是裁决层，永不执行模型写的代码。"""
    sys.path.insert(0, GATES)
    from common import recompute_metric

    with pytest.raises(ValueError, match="python"):
        recompute_metric({"kind": "python", "source": "print(1)"}, str(landed_run[0]))


def test_host_gate_confines_paths(landed_run):
    """recompute 的路径不得逃出 raw/——否则 gate 会把宿主任意文件读进 artifacts 日志。"""
    sys.path.insert(0, GATES)
    from common import recompute_metric

    with pytest.raises(ValueError, match="逃出"):
        recompute_metric({"kind": "json", "path": "../../../../etc/hostname", "key": "x"},
                         str(landed_run[0]))


def test_recompute_implementations_agree(landed_run):
    """双份实现的等价性必须有测试盯着，否则'改一处同步另一处'只是注释里的愿望。"""
    sys.path.insert(0, GATES)
    from common import recompute_metric
    from register.recompute import run_spec

    run_dir, h1, h2, pid, metric = landed_run
    raw = str(run_dir / "results" / pid / "raw")
    spec_json = {"kind": "json", "path": "metrics.json", "key": "mean"}
    assert recompute_metric(spec_json, raw) == run_spec(spec_json, raw)
    (run_dir / "results" / pid / "raw" / "eval.log").write_text("mean=0.6465\n", encoding="utf-8")
    spec_re = {"kind": "regex", "file": "eval.log", "pattern": r"mean=([0-9.]+)", "group": 1}
    assert recompute_metric(spec_re, raw) == run_spec(spec_re, raw)


def test_reconcile_allows_honest_enumeration_of_unprobed_claim(landed_run):
    """如实列出还活着的竞争假设不该被拒——藏起来才是 ARFT 的 E.2/D.7。"""
    run_dir, h1, h2, pid, metric = landed_run
    from register import Register

    R = Register(str(run_dir))
    h3 = R.abduce("混合总体解释", "mechanism", predicts=["双峰性 > 0.3"],
                  conflicts=f"与 {h2} 不同：它讲位置，本假设讲混合比例")
    _write_report(run_dir, metric, h1, h2,
                  verdicts=[(h1, "LIVE"), (h2, "REFUTED"), (h3, "LIVE")])
    text = (run_dir / "report.md").read_text(encoding="utf-8")
    (run_dir / "report.md").write_text(
        text.replace("# 报告", f"# 报告\n\n## 假设\n\n- {h3}: 混合总体解释（尚未检验）\n"),
        encoding="utf-8")
    code, out = run_gate("reconcile", run_dir)
    assert code == 0, out


def test_reconcile_still_refuses_unbacked_claim_next_to_a_measurement(landed_run):
    """但把未检验的假设摆在测量值旁边，就是在拿它当证据——必须拒。"""
    run_dir, h1, h2, pid, metric = landed_run
    from register import Register

    R = Register(str(run_dir))
    h3 = R.abduce("混合总体解释", "mechanism", predicts=["双峰性 > 0.3"],
                  conflicts=f"与 {h2} 不同：它讲位置，本假设讲混合比例")
    _write_report(run_dir, metric, h1, h2,
                  verdicts=[(h1, "LIVE"), (h2, "REFUTED"), (h3, "LIVE")])
    text = (run_dir / "report.md").read_text(encoding="utf-8")
    (run_dir / "report.md").write_text(
        text + f"\n{h3} 得到支持：实测均值 {metric:.6f} ({pid}) 与之一致。\n", encoding="utf-8")
    code, out = run_gate("reconcile", run_dir)
    assert code == 1, out
    assert h3 in out
