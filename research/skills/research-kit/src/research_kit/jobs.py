"""rlm 窗口的作业目录、STATUS 契约、回收与阻塞等待（01-统一架构 §4.2–§4.3，P0 最小版）。

只信磁盘：out.md 末行的 STATUS 是唯一的完成判据；`rlm.list_subagents()` 的注册表只在
内存里，dispose / 重启即清空——只在 `wait` 里作"child 已终态却没写 STATUS"的早判提示，
不作完成依据。本模块只写 `<cwd>/.rlm-jobs/<run>/` 之内（作业目录与 failures.jsonl），
在 `.proma-research/` 之外——研究隔离守卫禁止任何人写状态根，child 写 out.md 也不例外；
从不碰 MCP 拥有的文件。
"""

from __future__ import annotations

import asyncio
import json
import re
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

JOBS_DIR = ".rlm-jobs"
SELF_SUFFIX = "-self"
DEFAULT_TIMEOUT_S = 1200.0  # §4.3-2 [INF] W1/W2 初值 20 min；K0 信封给值时以它为准
_POLL_MIN_S = 2.0
_POLL_MAX_S = 30.0
_DELETE_TIMEOUT_S = 30.0  # 宿主不回 comm 时 delete 永不返回；wait 不能跟着挂住父会话
_LIST_TIMEOUT_S = 5.0  # list_subagents 只是提示，拿不到就跳过这一轮
_TERMINAL = frozenset({"completed", "error"})

# 全文唯一写法：STATUS: <ok|blocked|failed>[ SELF_REVIEWED] PATH: <相对工作目录的路径，以 .rlm-jobs/ 开头>
# 用 search 而非 fullmatch：同一个解析器也读完成通知（"…Last assistant text: STATUS: …"）。
# 弱模型常见走样（`**STATUS: ok**`、`OK`、行内代码、句末标点）都容忍：解析失败的代价是整段 timeout。
_STATUS_RE = re.compile(r"STATUS:\s*(ok|blocked|failed)(\s+SELF_REVIEWED)?\s+PATH:\s*(\S+)", re.I)
_PATH_TRAILING = ".,;:!?)]}>\"'"
_PART_RE = re.compile(r"[A-Za-z0-9_.]+(?:-[A-Za-z0-9_.]+)*")


def parse_status(text: str) -> dict[str, Any] | None:
    """解析一行 STATUS（out.md 末行，或完成通知预览）；不合契约返回 None。"""
    m = _STATUS_RE.search(text.replace("`", "").replace("*", ""))
    path = m.group(3).rstrip(_PATH_TRAILING) if m else ""
    if not path:
        return None
    return {"status": m.group(1).lower(), "self_reviewed": bool(m.group(2)), "path": path}


def new_job(run: str | Path, step: str, target: str) -> tuple[Path, str]:
    """建 `<cwd>/.rlm-jobs/<run 名>/<step>/<target>/<nonce4>/`，返回 (job 目录, child 名 `<step>-<target>-<nonce4>`)。

    cwd = 研究工作目录（`.proma-research/` 的父目录，kernel 的 cwd）；run 名取 run 参数解析后的
    目录名（`"r1"` 与 `<cwd>/.proma-research/r1` 同为 `r1`）。作业目录不在 `.proma-research/` 下：
    研究隔离守卫拦一切写状态根的 ipython，否则 child 写不了 out.md、父会话的 `-self` 降级也写不了。

    固定名第二次 spawn 必抛错（已完成的 child 仍占名，PA :9603-9616），所以名字带 nonce；
    nonce 以目录不存在为准，兄弟之间唯一。
    ponytail: 4 位 hex 只在同一 <step>/<target> 下查重；跨 run 同名碰撞 ~1/65536，撞了 spawn 抛错，换 nonce 重派即可。
    """
    for part in (step, target):
        if not _PART_RE.fullmatch(part):
            raise ValueError(f"step/target 只允许字母数字 . _ -（不含空白与 /）：{part!r}")
    from . import _root  # 延迟导入：__init__ 反向导入本模块

    run_name = _root(str(run)).resolve().name
    if not _PART_RE.fullmatch(run_name):
        raise ValueError(f"run 名只允许字母数字 . _ -：{run_name!r}")
    base = (Path.cwd() / JOBS_DIR / run_name / step / target).resolve()  # 3 行 prompt 与 watchdog 都要绝对路径
    base.mkdir(parents=True, exist_ok=True)
    while True:
        job = base / secrets.token_hex(2)
        try:
            job.mkdir()
        except FileExistsError:
            continue
        return job, job_name(job)


def job_name(job_dir: str | Path) -> str:
    """作业目录 → child 名（`<step>-<target>-<nonce>`）。"""
    job = Path(job_dir)
    return f"{job.parent.parent.name}-{job.parent.name}-{job.name}"


def _jobs_run_dir(job: Path) -> Path | None:
    """job 目录 → `<cwd>/.rlm-jobs/<run>`（failures.jsonl 所在）；不在该布局下返回 None。"""
    for parent in job.parents:
        if parent.parent.name == JOBS_DIR:
            return parent
    return None


def _last_line(path: Path) -> str:
    try:
        lines = path.read_text(encoding="utf-8").rstrip().splitlines()
    except (FileNotFoundError, UnicodeDecodeError):
        return ""
    return lines[-1] if lines else ""


def collect(job_dirs: Iterable[str | Path]) -> list[dict[str, Any]]:
    """读各 job 的 out.md 末行 STATUS（只读磁盘，不阻塞）。

    每项：`job`（绝对路径）· `name` · `out` · `status`（ok/blocked/failed；None = 末行还没有
    STATUS：没写完，或 child 已死——由调用方结合 wait / 通知判断）· `self_reviewed` · `path`。
    `<nonce>-self/` 目录是父会话的降级代写：即使 STATUS 行漏了 SELF_REVIEWED 也照样标记，
    其结论在合并时封顶 `lead`（M12）。
    """
    results: list[dict[str, Any]] = []
    for raw in job_dirs:
        job = Path(raw).resolve()
        out = job / "out.md"
        parsed = parse_status(_last_line(out)) or {"status": None, "self_reviewed": False, "path": None}
        results.append(
            {
                "job": str(job),
                "name": job_name(job),
                "out": str(out),
                **parsed,
                "self_reviewed": parsed["self_reviewed"] or job.name.endswith(SELF_SUFFIX),
            }
        )
    return results


def field(out_md: str | Path, name: str) -> str | None:
    """从 out.md 结构化取一个字段，不把整份读进父会话上下文。

    认两种写法（不区分大小写）：标题节 `## name`（取到下一个同级或更高级标题为止）；
    键行 `name: value`。末行 STATUS 不算任何字段的内容。找不到（含 out.md 不存在）返回 None。
    """
    path = Path(out_md)
    if path.is_dir():
        path = path / "out.md"
    try:
        lines = path.read_text(encoding="utf-8").rstrip().splitlines()
    except FileNotFoundError:
        return None
    if lines and parse_status(lines[-1]):
        lines = lines[:-1]
    key = name.strip().lower()
    for i, line in enumerate(lines):
        heading = re.match(r"(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if heading and heading.group(2).strip().lower() == key:
            level = len(heading.group(1))
            body: list[str] = []
            for nxt in lines[i + 1 :]:
                h = re.match(r"(#{1,6})\s", nxt)
                if h and len(h.group(1)) <= level:
                    break
                body.append(nxt)
            return "\n".join(body).strip()
    for line in lines:
        kv = re.match(r"\s*[-*]?\s*\**([^:*]+?)\**\s*:\s*(.*)$", line)
        if kv and kv.group(1).strip().lower() == key:
            return kv.group(2).strip()
    return None


def _record_failure(job: Path, record: dict[str, Any]) -> None:
    run_dir = _jobs_run_dir(job)
    log = (run_dir or job.parent) / "failures.jsonl"
    entry = {"job": job.relative_to(run_dir.parent.parent).as_posix() if run_dir else str(job), **record}
    with log.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


async def _delete_child(name: str) -> tuple[bool, str | None]:
    try:
        import rlm  # Prime kernel 里的 prime-agent-runtime；延迟导入，测试可替换

        await asyncio.wait_for(rlm.delete_subagent(name), _DELETE_TIMEOUT_S)
        return True, None
    except Exception as exc:  # 名字不存在 / 已删 / 宿主无回应：记下来，不阻断父会话
        return False, f"{type(exc).__name__}: {exc}"


async def _terminal_children() -> set[str]:
    """rlm 注册表里已终态（completed / error）的 child 名。只作提示：注册表只在内存里，
    拿不到（kernel 外、宿主不回、dispose 后清空）就当空集，判据仍是磁盘。"""
    try:
        import rlm

        entries = await asyncio.wait_for(rlm.list_subagents(), _LIST_TIMEOUT_S)
        return {e.session_name for e in entries if e.status in _TERMINAL}
    except Exception:
        return set()


async def wait(job_dirs: Iterable[str | Path], timeout_s: float = DEFAULT_TIMEOUT_S) -> list[dict[str, Any]]:
    """阻塞等待一次扇出的全部 job：`results = await research_kit.wait(jobs, timeout_s)`。

    只轮询磁盘（各 out.md 末行 STATUS），退避 2 s → 30 s，零 LLM token；全部有 STATUS
    或超时即返回——父会话在同一 turn 内继续，不靠"等通知"。超时的 job：
    `rlm.delete_subagent(<name>)` 删掉 child（运行中的也能删），往
    `<cwd>/.rlm-jobs/<run>/failures.jsonl` 追加 `{job, kind: "timeout", name, deleted, ts}`，
    结果里 `status == "timeout"`（`deleted` / `error` 说明删除是否成功；`-self` 目录没有 child，
    不删）。每轮还看一眼 `rlm.list_subagents()`：child 已终态却没写 STATUS → 不等超时，
    直接 `status == "failed"` 并记 `{kind: "failed"}`。之后按 §4.3：换新 job 重派一次，
    仍失败走 `-self` 降级。
    """
    jobs = [Path(j).resolve() for j in job_dirs]
    deadline = time.monotonic() + max(0.0, float(timeout_s))
    interval = _POLL_MIN_S
    dead: set[str] = set()
    while True:
        terminal = await _terminal_children()  # 先看注册表再读盘：终态 child 的写入此时已落盘
        results = collect(jobs)
        for r in results:
            if r["status"] or not (r["job"] in dead or r["name"] in terminal):
                continue
            r["status"] = "failed"
            if r["job"] not in dead:
                dead.add(r["job"])
                _record_failure(
                    Path(r["job"]),
                    {
                        "kind": "failed",
                        "name": r["name"],
                        "reason": "child finished without a STATUS line",
                        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    },
                )
        remaining = deadline - time.monotonic()
        if all(r["status"] for r in results) or remaining <= 0:
            break
        await asyncio.sleep(min(interval, remaining))
        interval = min(interval * 2, _POLL_MAX_S)

    for r in results:
        if r["status"]:
            continue
        if r["name"].endswith(SELF_SUFFIX):  # 父会话代写的目录，没有 child 可删
            deleted, error = False, None
        else:
            deleted, error = await _delete_child(r["name"])
        r.update(status="timeout", deleted=deleted, error=error)
        _record_failure(
            Path(r["job"]),
            {
                "kind": "timeout",
                "name": r["name"],
                "deleted": deleted,
                "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            },
        )
    return results
