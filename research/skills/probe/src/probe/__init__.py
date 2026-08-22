"""probe.run —— 唯一受认可的实验执行路径。

信任模型：eval 命令在 prereg 阶段被登记并哈希锁定；本函数核验哈希后在
独立 git worktree 中执行它，产物连同 provenance 落到 results/<pid>/raw/。
land() 只认 produced_by == "probe.run" 的产物。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import time
from typing import Any

from register import Register

DEFAULT_CASE_DIR = "/work/case"
DEFAULT_WORKTREE_ROOT = "/work/worktrees"


class ProbeError(Exception):
    pass


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _recompute_targets(recompute: dict[str, Any]) -> list[str]:
    kind = recompute.get("kind")
    if kind == "json":
        return [recompute["path"]]
    if kind == "regex":
        return [recompute["file"]]
    return []


def _collect(src_dir: str, raw_dir: str, rel_paths: list[str]) -> list[str]:
    copied: list[str] = []
    for rel in rel_paths:
        src = os.path.join(src_dir, rel)
        if not os.path.isfile(src):
            continue
        dst = os.path.join(raw_dir, rel)
        os.makedirs(os.path.dirname(dst) or raw_dir, exist_ok=True)
        shutil.copy2(src, dst)
        copied.append(rel)
    return copied


def _prepare_worktree(pid: str, case_dir: str, worktree_root: str) -> tuple[str, str]:
    """返回 (worktree 路径, mode)。git 仓库用 worktree；否则整树拷贝。"""
    is_git = os.path.isdir(os.path.join(case_dir, ".git"))
    branch = f"probe/{pid}"
    wt = os.path.join(worktree_root, pid)
    if os.path.exists(wt):
        shutil.rmtree(wt)
    os.makedirs(worktree_root, exist_ok=True)
    if is_git:
        subprocess.run(
            ["git", "worktree", "add", "-b", branch, wt, "HEAD"],
            cwd=case_dir, capture_output=True, text=True, check=True,
        )
        return wt, "git-worktree"
    shutil.copytree(case_dir, wt)
    return wt, "copy-fallback"


def run_sync(pid: str, R: Register | None = None, case_dir: str | None = None) -> dict[str, Any]:
    if R is None:
        # kernel 内复用共享实例 register.R（同一进程单一事实源）；kernel 外按环境变量自建
        from register import R as shared_R
        if shared_R is not None:
            R = shared_R
    if R is None:
        run_dir = _env("CRUCIBLE_RUN_DIR", "")
        if not run_dir:
            raise ProbeError("未设置 CRUCIBLE_RUN_DIR 且未传入 R")
        R = Register(run_dir)
    if pid not in R.state["probes"]:
        raise ProbeError(f"未知 probe: {pid}（先 R.prereg(...)）")
    p = R.state["probes"][pid]
    prereg_path = os.path.join(R.run_dir, p["prereg_path"])
    with open(prereg_path, encoding="utf-8") as fh:
        spec = json.load(fh)
    with open(prereg_path, "rb") as fh:
        current_sha = hashlib.sha256(fh.read()).hexdigest()
    if current_sha != p["prereg_sha"]:
        raise ProbeError("prereg 文件与登记哈希不符，拒绝执行")

    case = case_dir or _env("CRUCIBLE_CASE_DIR", DEFAULT_CASE_DIR)
    worktree_root = _env("CRUCIBLE_WORKTREE_ROOT", DEFAULT_WORKTREE_ROOT)
    wt, mode = _prepare_worktree(pid, case, worktree_root)

    started = time.time()
    proc = subprocess.run(
        spec["eval_cmd"],
        shell=True,
        cwd=wt,
        capture_output=True,
        text=True,
        timeout=int(spec.get("timeout_s", 600)),
    )
    finished = time.time()

    result_dir = os.path.join(R.run_dir, "results", pid)
    raw_dir = os.path.join(result_dir, "raw")
    os.makedirs(raw_dir, exist_ok=True)
    with open(os.path.join(result_dir, "eval.log"), "w", encoding="utf-8") as fh:
        fh.write(f"$ {spec['eval_cmd']}\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}")

    targets = list(dict.fromkeys(
        spec.get("outputs", []) + _recompute_targets(spec["recompute"])
    ))
    copied = _collect(wt, raw_dir, targets)

    provenance = {
        "produced_by": "probe.run",
        "eval_cmd": spec["eval_cmd"],
        "eval_cmd_hash": spec["eval_cmd_hash"],
        "unix_started": started,
        "unix_finished": finished,
        "exit_code": proc.returncode,
        "timeout_s": spec.get("timeout_s", 600),
        "worktree": wt,
        "worktree_mode": mode,
        "branch": f"probe/{pid}",
        "collected": copied,
        "seeds": spec.get("notes", ""),
    }
    with open(os.path.join(result_dir, "provenance.json"), "w", encoding="utf-8") as fh:
        json.dump(provenance, fh, ensure_ascii=False, indent=1)

    # 状态：PREREG→RUNNING（首次）或 RUNNING→RUNNING（重跑）
    R.mark_running(pid)
    R.journal.append(
        "probe.run", proc.returncode == 0,
        pid=pid, exit_code=proc.returncode, mode=mode, collected=copied,
    )
    return {
        "pid": pid,
        "exit_code": proc.returncode,
        "collected": copied,
        "provenance": os.path.relpath(os.path.join(result_dir, "provenance.json"), R.run_dir),
        "stdout_tail": proc.stdout[-400:],
        "stderr_tail": proc.stderr[-400:],
    }


async def run(pid: str, R: Register | None = None, case_dir: str | None = None) -> dict[str, Any]:
    """kernel 里的异步入口（ipython 内 await probe.run(...)）。"""
    return await asyncio.to_thread(run_sync, pid, R, case_dir)
