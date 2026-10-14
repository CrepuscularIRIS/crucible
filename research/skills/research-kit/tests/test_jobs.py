"""P0 作业目录 / STATUS 契约 / collect / field / wait（01-统一架构 §4.2–§4.3，§10 检查 ⑤ 与 ⑥ 的 kit 半边）。"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import types
from pathlib import Path

import pytest

import research_kit
from research_kit import jobs


RUN = "r1"
JOBS = Path(".rlm-jobs") / RUN  # 相对研究工作目录；autouse fixture 把 cwd 切到 tmp_path


@pytest.fixture(autouse=True)
def _cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)


def _write_out(job: Path, body: str, status: str | None) -> Path:
    out = job / "out.md"
    text = body if status is None else f"{body}\n{status}\n"
    out.write_text(text, encoding="utf-8")
    return out


def _rel(run: Path, job: Path) -> str:
    return (job / "out.md").relative_to(run).as_posix()


# ---------- STATUS 契约 ----------


def test_parse_status_ok_and_self_reviewed() -> None:
    assert research_kit.parse_status("STATUS: ok PATH: .rlm-jobs/r1/certify/C2/7f3a/out.md") == {
        "status": "ok",
        "self_reviewed": False,
        "path": ".rlm-jobs/r1/certify/C2/7f3a/out.md",
    }
    parsed = research_kit.parse_status("STATUS: ok SELF_REVIEWED PATH: .rlm-jobs/r1/k3/H5/91c0-self/out.md")
    assert parsed == {"status": "ok", "self_reviewed": True, "path": ".rlm-jobs/r1/k3/H5/91c0-self/out.md"}
    assert research_kit.parse_status("STATUS: blocked PATH: a/out.md")["status"] == "blocked"


@pytest.mark.parametrize(
    "line",
    ["STATUS: done PATH: a/out.md", "STATUS: ok", "SUMMARY: fine", "", "status ok path a"],
)
def test_parse_status_rejects_malformed(line: str) -> None:
    assert research_kit.parse_status(line) is None


def test_notice_preview_status_matches_out_md_last_line(tmp_path: Path) -> None:
    """⑥ kit 半边：Prime 把 child 最后一条消息压成一行（\\s+→空格，≤160 字符）放进完成通知；
    从通知里解析出的 STATUS 必须与 out.md 末行一致。"""
    job, name = research_kit.new_job(RUN, "certify", "C2")
    line = f"STATUS: ok PATH: {_rel(tmp_path, job)}"
    _write_out(job, "## SUMMARY\nfine", line)
    last_message = f"{line}\n\nSUMMARY: candidate survives, two minor findings."
    compact = re.sub(r"\s+", " ", last_message).strip()
    preview = compact if len(compact) <= 160 else compact[:157].rstrip() + "..."
    notice = f"RLM child {name} (abc123) completed without sending a reply. Last assistant text: {preview}"
    (collected,) = research_kit.collect([job])
    assert research_kit.parse_status(notice) == {k: collected[k] for k in ("status", "self_reviewed", "path")}


# ---------- 作业目录 + nonce 名 ----------


def test_new_job_nonce_dir_and_unique_names(tmp_path: Path) -> None:
    job1, name1 = research_kit.new_job(RUN, "grill", "H5")
    job2, name2 = research_kit.new_job(RUN, "grill", "H5")
    for job, name in ((job1, name1), (job2, name2)):
        assert job.is_dir()
        assert job.parent == tmp_path / JOBS / "grill" / "H5"
        assert re.fullmatch(r"[0-9a-f]{4}", job.name)
        assert name == f"grill-H5-{job.name}"
        assert research_kit.job_name(job) == name
    assert job1 != job2 and name1 != name2


@pytest.mark.parametrize("step,target", [("cer tify", "C2"), ("certify", "a/b"), ("", "C2")])
def test_new_job_rejects_unsafe_parts(tmp_path: Path, step: str, target: str) -> None:
    with pytest.raises(ValueError):
        research_kit.new_job(RUN, step, target)


# ---------- collect ----------


def test_collect_reads_last_line_status_only_from_disk(tmp_path: Path) -> None:
    ok, _ = research_kit.new_job(RUN, "certify", "C2")
    _write_out(ok, "## SUMMARY\nfine", f"STATUS: ok PATH: {_rel(tmp_path, ok)}\n\n")  # 尾随空行容忍
    mid, _ = research_kit.new_job(RUN, "certify", "C3")
    _write_out(mid, f"STATUS: ok PATH: {_rel(tmp_path, mid)}\n## SUMMARY\nstill writing", None)
    missing, _ = research_kit.new_job(RUN, "certify", "C4")

    got = {Path(r["job"]): r for r in research_kit.collect([ok, mid, missing])}
    assert got[ok]["status"] == "ok" and got[ok]["self_reviewed"] is False
    assert got[ok]["path"] == _rel(tmp_path, ok)
    assert got[mid]["status"] is None  # STATUS 不在末行 = 还没写完
    assert got[missing]["status"] is None


def test_collect_accepts_self_dir_and_flags_it(tmp_path: Path) -> None:
    job = tmp_path / JOBS / "k3" / "H5" / "91c0-self"
    job.mkdir(parents=True)
    # 父会话代写时漏了 SELF_REVIEWED：目录结构本身就说明它是降级产物
    _write_out(job, "## verdict\nSUPPORTED", f"STATUS: ok PATH: {_rel(tmp_path, job)}")
    (result,) = research_kit.collect([job])
    assert result["status"] == "ok"
    assert result["self_reviewed"] is True


# ---------- field ----------


def test_field_extracts_heading_section_and_key_line(tmp_path: Path) -> None:
    job, _ = research_kit.new_job(RUN, "certify", "C2")
    body = (
        "## SUMMARY\nCandidate holds.\n\n"
        "verdict: REFINE\n\n"
        "## findings\n- [major] band too wide\n- [minor] typo"
    )
    out = _write_out(job, body, f"STATUS: ok PATH: {_rel(tmp_path, job)}")
    assert research_kit.field(out, "summary").startswith("Candidate holds.")
    assert research_kit.field(job, "verdict") == "REFINE"  # 也接受 job 目录
    findings = research_kit.field(out, "findings")
    assert "[minor] typo" in findings and "STATUS" not in findings
    assert research_kit.field(out, "watch") is None


# ---------- wait ----------


@pytest.fixture
def fast_poll(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jobs, "_POLL_MIN_S", 0.01)
    monkeypatch.setattr(jobs, "_POLL_MAX_S", 0.02)


@pytest.fixture
def fake_rlm(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    deleted: list[str] = []
    module = types.ModuleType("rlm")

    async def delete_subagent(target: str) -> None:
        deleted.append(target)

    module.delete_subagent = delete_subagent  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rlm", module)
    return deleted


def test_wait_returns_when_all_jobs_report(tmp_path: Path, fast_poll: None, fake_rlm: list[str]) -> None:
    job, _ = research_kit.new_job(RUN, "recall", "frontier")

    async def scenario() -> list[dict]:
        async def child() -> None:
            await asyncio.sleep(0.05)
            _write_out(job, "## SUMMARY\nok", f"STATUS: ok PATH: {_rel(tmp_path, job)}")

        task = asyncio.ensure_future(child())
        results = await research_kit.wait([job], timeout_s=5)
        await task
        return results

    (result,) = asyncio.run(scenario())
    assert result["status"] == "ok"
    assert fake_rlm == []
    assert not (tmp_path / JOBS / "failures.jsonl").exists()


def test_wait_timeout_deletes_child_logs_failure_and_returns(
    tmp_path: Path, fast_poll: None, fake_rlm: list[str]
) -> None:
    """⑤：故意不写 out.md 的 child → 超时返回、child 被删、failures.jsonl 一行 timeout，其余 job 照常返回。"""
    silent, silent_name = research_kit.new_job(RUN, "certify", "C2")
    done, _ = research_kit.new_job(RUN, "certify", "C3")
    _write_out(done, "## SUMMARY\nok", f"STATUS: blocked PATH: {_rel(tmp_path, done)}")

    results = asyncio.run(research_kit.wait([silent, done], timeout_s=0.05))

    by_job = {Path(r["job"]): r for r in results}
    assert by_job[silent]["status"] == "timeout"
    assert by_job[silent]["deleted"] is True
    assert by_job[done]["status"] == "blocked"
    assert fake_rlm == [silent_name]
    lines = (tmp_path / JOBS / "failures.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["kind"] == "timeout"
    assert record["job"] == silent.relative_to(tmp_path).as_posix()
    assert record["name"] == silent_name
    assert record["ts"]


def test_wait_timeout_survives_delete_error(tmp_path: Path, fast_poll: None, monkeypatch: pytest.MonkeyPatch) -> None:
    module = types.ModuleType("rlm")

    async def delete_subagent(target: str) -> None:
        raise RuntimeError(f'No direct RLM subagent matches "{target}"')

    module.delete_subagent = delete_subagent  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rlm", module)
    job, _ = research_kit.new_job(RUN, "grill", "H1")

    (result,) = asyncio.run(research_kit.wait([job], timeout_s=0.02))

    assert result["status"] == "timeout"
    assert result["deleted"] is False
    assert "No direct RLM subagent" in result["error"]
    record = json.loads((tmp_path / JOBS / "failures.jsonl").read_text(encoding="utf-8"))
    assert record["kind"] == "timeout" and record["deleted"] is False


def test_wait_timeout_bounds_a_hanging_delete(tmp_path: Path, fast_poll: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """宿主不回 comm（kernel 外 / 宿主卡住）时 delete_subagent 永不返回；wait 不能跟着挂住父会话。"""
    module = types.ModuleType("rlm")

    async def delete_subagent(target: str) -> None:
        await asyncio.Event().wait()

    module.delete_subagent = delete_subagent  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rlm", module)
    monkeypatch.setattr(jobs, "_DELETE_TIMEOUT_S", 0.05, raising=False)
    job, _ = research_kit.new_job(RUN, "grill", "H2")

    (result,) = asyncio.run(asyncio.wait_for(research_kit.wait([job], timeout_s=0.02), 2))

    assert result["status"] == "timeout" and result["deleted"] is False
    assert (tmp_path / JOBS / "failures.jsonl").is_file()


# ---------- review 修复：解析容错 / 绝对路径 / field 缺文件 / list 提示 / -self ----------


@pytest.mark.parametrize(
    "line,expected",
    [
        ("**STATUS: ok** PATH: a/out.md", ("ok", False, "a/out.md")),
        ("STATUS: OK PATH: a/out.md", ("ok", False, "a/out.md")),
        ("`STATUS: ok PATH: x/out.md`", ("ok", False, "x/out.md")),
        ("STATUS: blocked PATH: a/out.md.", ("blocked", False, "a/out.md")),
        ("status: Failed self_reviewed path: a/out.md),", ("failed", True, "a/out.md")),
    ],
)
def test_parse_status_tolerates_markdown_case_and_punctuation(line: str, expected: tuple) -> None:
    parsed = research_kit.parse_status(line)
    assert parsed is not None
    assert (parsed["status"], parsed["self_reviewed"], parsed["path"]) == expected


def test_new_job_returns_absolute_dir_for_relative_run(tmp_path: Path) -> None:
    job, _ = research_kit.new_job("runs/r1", "certify", "C2")
    assert job.is_absolute()
    assert job.parent == tmp_path / JOBS / "certify" / "C2"


def test_new_job_lives_outside_state_root(tmp_path: Path) -> None:
    """N1：研究隔离守卫拦一切写 `.proma-research/` 的 ipython，作业目录必须在它之外。
    run 名与 run 路径解析到同一个 `<cwd>/.rlm-jobs/<run>/`。"""
    by_name, _ = research_kit.new_job(RUN, "certify", "C2")
    by_path, _ = research_kit.new_job(tmp_path / ".proma-research" / RUN, "certify", "C2")
    assert by_name.parent == by_path.parent == tmp_path / JOBS / "certify" / "C2"
    assert ".proma-research" not in str(by_name)


def test_field_returns_none_when_out_md_missing(tmp_path: Path) -> None:
    job, _ = research_kit.new_job(RUN, "certify", "C2")
    assert research_kit.field(job, "verdict") is None
    assert research_kit.field(job / "out.md", "verdict") is None


def _fake_registry(monkeypatch: pytest.MonkeyPatch, entries: object) -> list[str]:
    """rlm 假模块：list_subagents 返回 entries（Exception 实例 = 抛出），delete 记名字。"""
    deleted: list[str] = []
    module = types.ModuleType("rlm")

    async def list_subagents() -> list:
        if isinstance(entries, Exception):
            raise entries
        return entries  # type: ignore[return-value]

    async def delete_subagent(target: str) -> None:
        deleted.append(target)

    module.list_subagents = list_subagents  # type: ignore[attr-defined]
    module.delete_subagent = delete_subagent  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rlm", module)
    return deleted


def test_wait_marks_terminal_child_without_status_failed_early(
    tmp_path: Path, fast_poll: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """⑥ 补：child 已终态（completed/error）却没写 STATUS → 早早判 failed 并记账，不等满 timeout。"""
    dead, dead_name = research_kit.new_job(RUN, "certify", "C2")
    _write_out(dead, "## SUMMARY\nhalf", None)
    done, done_name = research_kit.new_job(RUN, "certify", "C3")
    _write_out(done, "## SUMMARY\nok", f"STATUS: ok PATH: {_rel(tmp_path, done)}")
    registry = [
        types.SimpleNamespace(session_name=dead_name, status="error"),
        types.SimpleNamespace(session_name=done_name, status="completed"),
    ]
    deleted = _fake_registry(monkeypatch, registry)

    results = asyncio.run(asyncio.wait_for(research_kit.wait([dead, done], timeout_s=30), 2))

    by_job = {Path(r["job"]): r for r in results}
    assert by_job[dead]["status"] == "failed"
    assert by_job[done]["status"] == "ok"
    assert deleted == []
    (record,) = [json.loads(x) for x in (tmp_path / JOBS / "failures.jsonl").read_text().splitlines()]
    assert record["kind"] == "failed" and record["name"] == dead_name


def test_wait_running_child_in_registry_still_waits_for_disk(
    tmp_path: Path, fast_poll: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    job, name = research_kit.new_job(RUN, "certify", "C2")
    _fake_registry(monkeypatch, [types.SimpleNamespace(session_name=name, status="running")])

    (result,) = asyncio.run(research_kit.wait([job], timeout_s=0.05))

    assert result["status"] == "timeout"


def test_wait_tolerates_list_subagents_errors(tmp_path: Path, fast_poll: None, monkeypatch: pytest.MonkeyPatch) -> None:
    job, _ = research_kit.new_job(RUN, "certify", "C2")
    _fake_registry(monkeypatch, RuntimeError("host gone"))

    async def scenario() -> list[dict]:
        async def child() -> None:
            await asyncio.sleep(0.05)
            _write_out(job, "## SUMMARY\nok", f"STATUS: ok PATH: {_rel(tmp_path, job)}")

        task = asyncio.ensure_future(child())
        results = await research_kit.wait([job], timeout_s=5)
        await task
        return results

    (result,) = asyncio.run(scenario())
    assert result["status"] == "ok"


def test_wait_timeout_does_not_delete_self_dirs(tmp_path: Path, fast_poll: None, fake_rlm: list[str]) -> None:
    job = tmp_path / JOBS / "k3" / "H5" / "91c0-self"
    job.mkdir(parents=True)

    (result,) = asyncio.run(research_kit.wait([job], timeout_s=0.02))

    assert result["status"] == "timeout"
    assert fake_rlm == []
    assert result["deleted"] is False
