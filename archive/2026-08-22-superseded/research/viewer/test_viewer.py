"""viewer 的 BDD 测试：从 landed_run 工件渲染出完整静态 HTML。"""

from __future__ import annotations

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gates"))

from viewer import render_run  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GATES = os.path.join(os.path.dirname(HERE), "gates")


def _make_landed(tmp_path):
    """复用 gates 测试的构造逻辑（最小化重建）：一次落地 + 报告。"""
    run_dir = tmp_path / "run"
    case = tmp_path / "case"
    case.mkdir()
    (case / "eval.py").write_text(
        "import random, json, sys\n"
        "random.seed(int(sys.argv[sys.argv.index('--seeds')+1]))\n"
        "vals=[random.random()*0.7+0.3 for _ in range(200)]\n"
        "json.dump({'mean':sum(vals)/len(vals)},open('metrics.json','w'))\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "init", "-q"], cwd=case, check=True)
    subprocess.run(["git", "add", "-A"], cwd=case, check=True)
    subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "i"], cwd=case, check=True)
    run_dir.mkdir()
    os.environ.update(
        CRUCIBLE_RUN_DIR=str(run_dir), CRUCIBLE_CASE_DIR=str(case),
        CRUCIBLE_WORKTREE_ROOT=str(tmp_path / "wts"),
    )
    from register import Register

    R = Register(str(run_dir))
    R.set_case("viewer-test")
    h1 = R.abduce("均值高", "phenomenon", predicts=["均值在[0.60,0.70]"], conflicts="none")
    h2 = R.abduce("均值0.5", "phenomenon", predicts=["均值在[0.45,0.55]", "方差"], conflicts="none")
    pid = R.prereg(
        claim=h1, tests="t",
        predictions=[
            {"branch": "A", "band": [0.60, 0.70], "on_hit": {"kill": [h2]}},
            {"branch": "B", "band": [0.45, 0.55], "on_hit": {"support": [h1]}},
        ],
        rule={}, controls=["c"], severity="s",
        eval_cmd="python eval.py --seeds 7",
        recompute={"kind": "json", "path": "metrics.json", "key": "mean"},
    )
    import probe

    probe.run_sync(pid, R=Register(str(run_dir)))
    metric = Register(str(run_dir)).land(pid)["metric"]
    (run_dir / "report.md").write_text(
        f"# 报告\n\n均值 {metric:.6f} ({pid})。\n\n## 评审\n\n- {h1}: LIVE\n- {h2}: REFUTED\n",
        encoding="utf-8",
    )
    return run_dir, metric, pid, h1, h2


def test_viewer_renders_full_story(tmp_path):
    run_dir, metric, pid, h1, h2 = _make_landed(tmp_path)
    out = render_run(str(run_dir))
    assert h1 in out and h2 in out
    assert pid in out and f"{metric:.6f}"[:6] in out or "重算指标" in out
    assert "Journal 时间线" in out and "宿主裁决" in out
    assert "report.md" in out
    assert "<script" not in out  # 惰性：零脚本
    # CLI 出口
    proc = subprocess.run(
        [sys.executable, os.path.join(HERE, "viewer.py"), str(run_dir), "-o", str(tmp_path / "o.html")],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert (tmp_path / "o.html").stat().st_size > 3000
