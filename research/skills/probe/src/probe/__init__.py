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
    """返回 (worktree 路径, mode)。

    用 `git clone` 而不是 `git worktree add`，有两个理由：
    - clone 只读源即可（case 现在是只读挂载），worktree add 要往 case 的 .git 里写；
    - clone 不复制 config 与 hooks，模型改不到宿主 git 的执行面。
    重跑是被支持的路径（崩溃恢复），所以这里必须可重入——旧的 worktree add 会因为
    分支已存在而直接抛 CalledProcessError，把唯一的恢复路径堵死。
    """
    is_git = os.path.isdir(os.path.join(case_dir, ".git"))
    wt = os.path.join(worktree_root, pid)
    if os.path.exists(wt):
        shutil.rmtree(wt)
    os.makedirs(worktree_root, exist_ok=True)
    if is_git:
        result = subprocess.run(
            ["git", "clone", "--quiet", "--no-hardlinks", "--shared", case_dir, wt],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            return wt, "git-clone"
        # clone 失败（浅仓库/无提交等）不该让整个 probe 死掉：退回整树拷贝
    shutil.copytree(case_dir, wt, symlinks=True, ignore=shutil.ignore_patterns(".git"))
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
    R._reload_if_stale()  # 共享实例可能已被别处写过；先对齐磁盘再判状态
    if pid not in R.state["probes"]:
        raise ProbeError(f"未知 probe: {pid}（先 R.prereg(...)）")
    p = R.state["probes"][pid]
    # 只有还没落地的 probe 能执行。落地后重跑会覆写 raw/，而 register 里留着旧指标——
    # 于是 gate 从新文件重算，和已经据此改过的信念状态对不上。
    if p["state"] not in ("PREREG", "RUNNING"):
        raise ProbeError(
            f"{pid} 状态 {p['state']}，不可再执行；结果已落地。要重测请预登记一个新 probe"
        )
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

    # 采集到的原始文件当场记摘要：land() 重算前会核对，把"重算所依据的文件"
    # 与"probe.run 真正产出的文件"绑在一起。执行后再改 raw/ 就会被挡下。
    digests: dict[str, str] = {}
    for rel in copied:
        with open(os.path.join(raw_dir, rel), "rb") as fh:
            digests[rel] = hashlib.sha256(fh.read()).hexdigest()

    provenance = {
        "produced_by": "probe.run",
        "eval_cmd": spec["eval_cmd"],
        "eval_cmd_hash": spec["eval_cmd_hash"],
        "raw_sha256": digests,
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
        raw_sha256=digests,
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
