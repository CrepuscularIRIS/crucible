"""F1 track E acceptance (03 §3.4, §3.5, §10): nbsim leak scan (A1), fidelity (A2), kernel venv (A5),
meter `env`, and the B0–B9 rerun checker.

This file must not hold any truth literal (channel parameters, world descriptions, world names,
discriminator segments): every fingerprint and every planted mutant is computed from the real package
at test time. `test_sources_hold_no_truth_literal` enforces that on this file too.

    cd research/eval && NEURONBENCH_ROOT=$HOME/oss/neuronbench python3 -m pytest -q
"""
from __future__ import annotations

import ast
import importlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
NB_ROOT = os.environ.get("NEURONBENCH_ROOT", "").strip()
# the 10-14 one-sentence run; globbed so this file never spells the world name
OLD_RUN = next((HERE.parent / "campaigns").glob("2026-10-14-glm53flash-oneline-*"), None)

pytestmark = pytest.mark.skipif(not NB_ROOT, reason="NEURONBENCH_ROOT unset: nothing to strip or compare against")

if NB_ROOT and NB_ROOT not in sys.path:
    sys.path.insert(0, NB_ROOT)


@pytest.fixture(scope="module")
def nb():
    return importlib.import_module("neuronbench")


@pytest.fixture(scope="module")
def ns():
    return importlib.import_module("nbsim_strip")


@pytest.fixture(scope="module")
def fp(ns):
    return ns.truth_fingerprints(Path(NB_ROOT))


@pytest.fixture(scope="module")
def built(ns, nb, tmp_path_factory):
    """One generated package per world: {world: <dir>/nbsim}."""
    out = {}
    for world in nb.list_worlds():
        pkg = tmp_path_factory.mktemp("gen") / "nbsim"
        ns.build(Path(NB_ROOT), world, pkg)
        out[world] = pkg
    return out


def _writable_copy(src: Path, dst: Path) -> Path:
    shutil.copytree(src, dst, copy_function=shutil.copyfile)
    for p in [dst, *dst.rglob("*")]:
        os.chmod(p, 0o755 if p.is_dir() else 0o644)
    return dst


def _hits(findings, check):
    return {f["what"] for f in findings if f["check"] == check}


# ── A1 leak scan: green on the generator output, red on a plain copy and two planted mutants ─────────

def test_generated_package_has_no_truth_leak(ns, fp, built):
    for world, pkg in built.items():
        assert ns.scan_package(pkg, fp, world) == [], world


def test_plain_copy_of_the_real_package_is_red(ns, fp, nb, tmp_path):
    copy = tmp_path / "nbsim"
    shutil.copytree(Path(NB_ROOT) / "neuronbench", copy)
    findings = ns.scan_package(copy, fp, None)
    desc_worlds = {f["world"] for f in findings if f["check"] == "string" and f["what"] == "desc"}
    assert desc_worlds == set(nb.list_worlds())
    assert {"WORLDS", "_truth_kwargs", "run"} <= _hits(findings, "ident")
    assert "MT" in _hits(findings, "numeric")
    assert _hits(findings, "runtime")
    assert _hits(findings, "files")


def test_planted_truth_channel_is_red(ns, fp, nb, built, tmp_path):
    world = nb.list_worlds()[0]
    pkg = _writable_copy(built[world], tmp_path / "nbsim")
    src = (Path(NB_ROOT) / "neuronbench" / "worlds.py").read_text(encoding="utf-8")
    node = next(n for n in ast.parse(src).body
                if isinstance(n, ast.Assign) and any(getattr(t, "id", None) == "MT" for t in n.targets))
    with open(pkg / "kernel.py", "a", encoding="utf-8") as fh:
        fh.write("\n" + ast.get_source_segment(src, node) + "\n")
    findings = ns.scan_package(pkg, fp, world)
    assert "MT" in _hits(findings, "numeric")
    assert "MT" in _hits(findings, "ident")
    assert _hits(findings, "runtime")


def test_planted_world_key_in_task_json_is_red(ns, fp, nb, built, tmp_path):
    world = nb.list_worlds()[-1]
    pkg = _writable_copy(built[world], tmp_path / "nbsim")
    task = json.loads((pkg / "task.json").read_text(encoding="utf-8"))
    task["world"] = nb.list_worlds()[0]
    (pkg / "task.json").write_text(json.dumps(task), encoding="utf-8")
    findings = ns.scan_package(pkg, fp, world)
    assert any(f["check"] == "string" and f["what"] == "world" for f in findings)


def test_sources_hold_no_truth_literal(ns, fp):
    for name in ("test_nbsim.py", "nbsim_strip.py", "check_f1_run.py", "test_check_f1_run.py"):
        assert ns.scan_source_literals(HERE / name, fp) == [], name


def test_allowlist_rejects_an_unknown_upstream_name(ns, nb, tmp_path):
    fake = _writable_copy(Path(NB_ROOT) / "neuronbench", tmp_path / "nb" / "neuronbench").parent
    with open(fake / "neuronbench" / "features.py", "a", encoding="utf-8") as fh:
        fh.write("\nnew_upstream_helper = 1\n")
    with pytest.raises(ns.AllowlistError, match="new_upstream_helper"):
        ns.build(fake, nb.list_worlds()[0], tmp_path / "out" / "nbsim")


def test_package_shape_and_permissions(ns, nb, built):
    world, pkg = next(iter(built.items()))
    manifest = json.loads((pkg / "MANIFEST.json").read_text(encoding="utf-8"))
    assert manifest["tree_sha256"] == ns.tree_sha256(pkg)
    assert (pkg / "LICENSE").is_file() and (pkg / "README.md").is_file()
    assert all(not (p.stat().st_mode & 0o222) for p in [pkg, *pkg.rglob("*")])
    task = json.loads((pkg / "task.json").read_text(encoding="utf-8"))
    problem = nb.load_world(world).problem()
    assert json.loads(json.dumps(problem)).items() <= task.items()
    assert set(task["blockers"]) == set(nb.blockers.BLOCKERS)
    assert [lab for lab, _ in task["held_out"]] == problem["test_protocol_labels"]
    assert world not in json.dumps(task)
    assert ns.FACADE_EXPORTS == ("load_task", "protocol", "simulate", "observe_like")


# ── A2 fidelity: same (mechanism, segments, reps, seed, block) → bit-identical to World.simulate ──────

_OWN_CHANNEL = {"name": "X", "g": 1.7, "E": -12.0, "mvh": -48.0, "mk": 7.0, "mtau": 11.0,
                "mpow": 1, "hvh": -71.0, "hk": 3.5, "htau": 45.0}
_MECHS = {"reference": {"extra": [], "slow_na": False},
          "own_channel": {"extra": [_OWN_CHANNEL], "slow_na": False},
          "slow_na": {"extra": [], "slow_na": True}}


@pytest.fixture(scope="module")
def nbsim_mod(nb, built):
    pkg = built[nb.list_worlds()[0]]
    sys.path.insert(0, str(pkg.parent))
    try:
        return importlib.import_module("nbsim")
    finally:
        sys.path.remove(str(pkg.parent))


@pytest.mark.parametrize("block", [(), ("TTX",)])
@pytest.mark.parametrize("seg_kind", ["textbook", "advanced", "held_out"])
@pytest.mark.parametrize("mech_kind", list(_MECHS))
def test_simulate_is_bit_identical_to_world_simulate(nb, nbsim_mod, mech_kind, seg_kind, block):
    world = nb.load_world(nb.list_worlds()[0])
    label, seg = {"textbook": nb.protocols.TEXTBOOK[0], "advanced": nb.protocols.ADVANCED[4],
                  "held_out": nb.protocols.test_protocols(world.name)[0]}[seg_kind]
    mech = _MECHS[mech_kind]
    seed, reps = 11, 3

    got = nbsim_mod.simulate(mech, nbsim_mod.protocol(label)[1], reps, seed=seed, block=block)

    nb_mech = {"extra": [nb.Chan(**c) for c in mech["extra"]], "slow_na": mech["slow_na"]}
    V = world.simulate(nb_mech, (label, seg), reps, rng=np.random.default_rng(seed), block=block)
    _, _, ts = nb.stochastic.make_protocol(seg)
    want = nb.features.spike_count(V, ts)
    assert np.array_equal(got["V"], V)
    assert np.array_equal(got["counts"], want)
    assert got["test_start"] == ts


def test_simulate_requires_a_seed(nbsim_mod):
    with pytest.raises(TypeError):
        nbsim_mod.simulate(_MECHS["reference"], nbsim_mod.protocol(nbsim_mod.load_task()["protocols"][0][0])[1], 2)


# ── A5: the kernel venv must not be able to import the real package ─────────────────────────────────

def test_kernel_venv_cannot_import_neuronbench(tmp_path):
    py = os.environ.get("PROMA_KERNEL_PYTHON", "").strip() or str(Path.home() / ".prime/agent/kernel-venv/bin/python")
    if not Path(py).exists():
        pytest.skip(f"kernel python not found: {py}")
    proc = subprocess.run([py, "-c", "import neuronbench"], cwd=tmp_path, capture_output=True, text=True)
    assert proc.returncode != 0 and "ModuleNotFoundError" in proc.stderr


# ── meter `env` (interface 7): build read-only, stdout contract, idempotent ─────────────────────────

def _meter_env(tmp_path, world, out):
    proc = subprocess.run(
        [sys.executable, str(HERE / "world-meter.py"), "--ledger", str(tmp_path / "ledger.jsonl"),
         "--budget", "8", "env", world, "0", "--out", str(out)],
        capture_output=True, text=True, env={**os.environ, "NEURONBENCH_ROOT": NB_ROOT})
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_meter_env_builds_readonly_package(ns, nb, tmp_path):
    world = nb.list_worlds()[1]
    out = tmp_path / "research-work" / "run-x" / "nbsim"
    first = _meter_env(tmp_path, world, out)
    assert set(first) == {"path", "sha256", "nb_commit", "generator_version", "files"}
    assert Path(first["path"]) == out and first["sha256"] == ns.tree_sha256(out)
    assert not (out.stat().st_mode & 0o222)
    assert world not in json.dumps(first)
    assert _meter_env(tmp_path, world, out)["sha256"] == first["sha256"]


# ── F1-T5: B0–B9 checker ────────────────────────────────────────────────────────────────────────────

def test_checker_flags_the_old_run(tmp_path):
    import check_f1_run
    results = check_f1_run.check(OLD_RUN)
    status = {r["id"]: r["status"] for r in results}
    assert status["B0"] == "UNKNOWN"
    assert sum(s == "FAIL" for s in status.values()) >= 5
    assert {"B1", "B2", "B4", "B5", "B7"} <= {k for k, s in status.items() if s == "FAIL"}


def _good_run(tmp_path, ns, nb):
    """A synthetic rerun that satisfies B0–B9 — proves the checker can go green."""
    world = nb.load_world(nb.list_worlds()[0])
    cwd = tmp_path / "cwd"
    run_dir = cwd / ".proma-research" / "r1"
    work = cwd / "research-work" / "r1"
    (run_dir / "prereg").mkdir(parents=True)
    (work / "sim").mkdir(parents=True)
    ns.build(Path(NB_ROOT), world.name, work / "nbsim")
    pool_label, pool_seg = nb.protocols.POOL[0]
    own_seg = [[30.0, 7.5]]
    for sid, seg, block in (("s1", pool_seg, ["TTX"]), ("s2", own_seg, [])):
        (work / "sim" / f"{sid}.json").write_text(json.dumps({
            "mechanism": {"extra": [], "slow_na": False}, "segments": seg, "block": block,
            "reps": 64, "seed": 1, "counts_mean": 1.0, "counts_sd": 0.5, "nbsim_sha256": "x"}))
    held = [lab for lab, _ in world.test_protocols]
    later = "2099-01-01T00:00:00.000Z"
    (run_dir / "prereg" / "P1.json").write_text(json.dumps({
        "pid": "P1", "question": "d=1.1 σ=0.5 r*=4 sim:s1 sha256:abc",
        "observe": {"world": world.name, "seed": 0, "protocol": pool_label, "reps": 8, "blockers": "TTX"}}))
    events = [
        {"op": "run.init", "run": "r1", "ts": later},
        {"op": "world.info", "world": world.name, "seed": 0, "ts": later},
        {"op": "claim.propose", "id": "H1", "ts": later},
        {"op": "prereg.write", "pid": "P1", "ts": later},
        {"op": "world.observe", "pid": "P1", "protocol": pool_label, "reps": 8, "blockers": "TTX", "cost": 8, "ts": later},
        {"op": "claim.transition", "id": "H1", "to": "REFUTED", "by_probe": "P1", "ts": later},
        {"op": "world.forecast", "counts": {lab: 1.0 for lab in held}, "ts": later},
    ]
    (run_dir / "journal.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
    (run_dir / "REPORT.md").write_text("H1 REFUTED (P1).\n\n" + "".join(f"| {lab} | 1.0 (sim:H1) |\n" for lab in held))
    (run_dir / "world-ledger.jsonl").write_text("")
    k0 = tmp_path / "k0-host.json"
    # track C's SE7b shape (pi-research-host-status.ts ResearchHostStatus.arm)
    k0.write_text(json.dumps({"arm": {"mode": "frozen", "source": "env", "contaminated": False, "reasons": []}}))
    session = tmp_path / "session.jsonl"
    session.write_text(json.dumps({"type": "session", "rlmDepth": 0}) + "\n" + json.dumps({
        "timestamp": later, "message": {"role": "assistant", "content": [{
            "type": "toolCall", "name": "ipython", "arguments": {"code": "import nbsim"}}]}}) + "\n")
    return run_dir, k0, session


def test_checker_passes_a_conforming_run(ns, nb, tmp_path):
    import check_f1_run
    run_dir, k0, session = _good_run(tmp_path, ns, nb)
    results = check_f1_run.check(run_dir, k0=k0, sessions=[session])
    assert {r["id"]: r["status"] for r in results} == {f"B{i}": "PASS" for i in range(10)}, results


def test_checker_ignores_misplaced_sim_records(ns, nb, tmp_path):
    import check_f1_run
    run_dir, k0, session = _good_run(tmp_path, ns, nb)
    work = run_dir.parent.parent / "research-work" / "r1"
    jobs = run_dir.parent.parent / ".rlm-jobs" / "r1" / "step"
    jobs.mkdir(parents=True)
    for rec in (work / "sim").iterdir():
        rec.rename(jobs / rec.name)
    status = {r["id"]: r["status"] for r in check_f1_run.check(run_dir, k0=k0, sessions=[session])}
    assert status["B1"] == status["B2"] == status["B3"] == "FAIL"


def test_facade_exports_match_the_constant(ns, nbsim_mod):
    assert nbsim_mod.__all__ == list(ns.FACADE_EXPORTS)
    assert all(callable(getattr(nbsim_mod, name)) for name in ns.FACADE_EXPORTS)


def test_checker_b0_reads_a_contaminated_arm(ns, nb, tmp_path):
    import check_f1_run
    run_dir, k0, session = _good_run(tmp_path, ns, nb)
    k0.write_text(json.dumps({"arm": {"mode": "frozen", "source": "env", "contaminated": True, "reasons": ["refineNow"]}}))
    assert check_f1_run.check(run_dir, k0=k0, sessions=[session])[0]["status"] == "FAIL"


def test_tree_sha_matches_the_host_recipe(ns, built):
    """Interface 7/8: server.ts recomputes the tree sha ignoring __pycache__; the meter must agree."""
    pkg = next(iter(built.values()))
    cache = pkg / "__pycache__"
    os.chmod(pkg, 0o755)
    try:
        cache.mkdir()
        (cache / "x.pyc").write_bytes(b"\0")
        assert ns.tree_sha256(pkg) == json.loads((pkg / "MANIFEST.json").read_text(encoding="utf-8"))["tree_sha256"]
    finally:
        shutil.rmtree(cache, ignore_errors=True)
        os.chmod(pkg, 0o555)


def test_rebuild_keeps_a_modified_tree_as_evidence(ns, nb, tmp_path):
    """Regenerating over a modified nbsim must not erase the evidence that it was modified (A6)."""
    world = nb.list_worlds()[2]
    out = tmp_path / "research-work" / "r" / "nbsim"
    first = ns.build(Path(NB_ROOT), world, out)
    os.chmod(out / "features.py", 0o644)
    (out / "features.py").write_text("# edited\n", encoding="utf-8")
    again = ns.build(Path(NB_ROOT), world, out)
    assert again["sha256"] == first["sha256"] == ns.tree_sha256(out)
    aside = Path(again["replaced"])
    assert aside.parent == out.parent and (aside / "features.py").read_text(encoding="utf-8") == "# edited\n"
    assert "replaced" not in ns.build(Path(NB_ROOT), world, out)


def test_checker_ignores_planted_k0_and_session_in_the_run_dir(ns, nb, tmp_path):
    """The host never writes k0-host.json / session.jsonl into the run dir; files found there are not evidence."""
    import check_f1_run
    run_dir, k0, session = _good_run(tmp_path, ns, nb)
    (run_dir / "k0-host.json").write_text(k0.read_text())
    (run_dir / "session.jsonl").write_text(session.read_text())
    status = {r["id"]: r["status"] for r in check_f1_run.check(run_dir)}
    assert status["B0"] == "UNKNOWN" and status["B1"] == "UNKNOWN"
