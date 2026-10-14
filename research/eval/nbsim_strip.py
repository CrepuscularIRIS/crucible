#!/usr/bin/env python3
"""nbsim_strip — build the truth-stripped `nbsim` package from neuronbench, and scan a package for truth
leaks (03 §3). Host-side only: called by `world-meter.py env`; the agent only ever sees the output dir.

Allowlist extraction, not blocklist deletion: only the top-level definitions named in KEEP are copied.
A top-level name in neither KEEP nor DROP fails the build (AllowlistError) so a human re-reviews the
upstream change. Docstrings are removed and `ast.unparse` drops every comment.

This file holds no truth literal: every fingerprint is computed from the real package at call time.

    python3 nbsim_strip.py NB_ROOT WORLD OUT_DIR     # build; prints the env record as JSON
"""
from __future__ import annotations

import ast
import dataclasses
import hashlib
import importlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Interface 9 (02 §11.4): track D's RDS reads this tuple as text — keep it a literal.
FACADE_EXPORTS = ("load_task", "protocol", "simulate", "observe_like")
GENERATOR_VERSION = "nbsim-strip/1"


class AllowlistError(RuntimeError):
    """Upstream changed shape: an unknown top-level name or a disallowed import."""


def _names(spec: str, dest: str) -> dict[str, str]:
    return {n: dest for n in spec.split()}


# source module -> {kept top-level name: nbsim module}   (43 names, 03 §3.1)
KEEP: dict[str, dict[str, str]] = {
    "_foxlu": _names("ENa EK EL GNA GK GL ab minf hinf gate_step tau_gate_step extra_init extra_step", "_foxlu"),
    "worlds": {**_names("ENa EK EL _ab _clip Chan _minf _hinf build_I simulate spikes", "kernel"),
               **_names("TEXTBOOK ADVANCED POOL", "protocols")},
    "stochastic": _names("SIG_OBS DT _chan_to_dict _slow_na_init _slow_na_step run_particles make_protocol",
                         "stochastic"),
    "blockers": _names("BLOCKERS CA_E_THRESHOLD blocks_base_na blocks_base_k blocks_channel resolve", "blockers"),
    "features": _names("spike_count spikes_in", "features"),
    "protocols": _names("labels", "protocols"),
}
DROP: dict[str, set[str]] = {
    "_foxlu": set(),
    "worlds": set("Z IH MT ID MC _NOVEL_NAME _NOVEL_HINT WORLDS world_models _selftest __main__".split()),
    "stochastic": {"observe_voltage"},
    "blockers": set(),
    "features": set(),
    "protocols": {"by_label", "discriminator", "test_protocols", "__all__"},
}
ALLOWED_ABSOLUTE = {"numpy", "__future__", "dataclasses"}

# Truth accessors (03 §3.4 S_id); the Chan assignment targets are added from the AST at scan time.
S_ID_BASE = frozenset((
    "WORLDS world_models _truth_name _truth_kwargs true_mechanism held_out_targets held_out_feature_targets "
    "discriminator test_protocols load_world World run forecast_mse spike_forecast_mse evaluator").split())

_FACADE = '''from __future__ import annotations

import json
import os

import numpy as np

from .features import spike_count
from .kernel import Chan
from .protocols import POOL
from .stochastic import SIG_OBS, make_protocol, run_particles

__all__ = __ALL__
_TASK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "task.json")


def load_task():
    with open(_TASK, encoding="utf-8") as fh:
        return json.load(fh)


def protocol(label):
    table = [(lab, seg) for lab, seg in POOL] + [(lab, seg) for lab, seg in load_task()["held_out"]]
    for lab, seg in table:
        if lab == label:
            return lab, [tuple(s) for s in seg]
    raise KeyError(f"unknown protocol label {label!r}; available: {[lab for lab, _ in table]}")


def _mechanism(mechanism):
    extra = [c if isinstance(c, Chan) else Chan(**c) for c in mechanism.get("extra", ())]
    return {"extra": extra, "slow_na": bool(mechanism.get("slow_na", False))}


def simulate(mechanism, segments, reps=64, *, seed, block=()):
    if isinstance(segments, tuple) and len(segments) == 2 and isinstance(segments[0], str):
        segments = segments[1]
    I, obs_idx, test_start = make_protocol([tuple(s) for s in segments])
    V = run_particles(int(reps), I, _mechanism(mechanism), load_task()["n_channels"],
                      np.random.default_rng(seed), block=tuple(block))
    counts = spike_count(V, test_start)
    sd = float(counts.std(ddof=1)) if len(counts) > 1 else 0.0
    return {"counts": counts, "mean": float(counts.mean()), "sd": sd, "V": V,
            "test_start": int(test_start), "obs_idx": obs_idx}


def observe_like(V, obs_idx, seed):
    trace = np.asarray(V)
    trace = trace[0] if trace.ndim == 2 else trace
    return trace[obs_idx] + np.random.default_rng(seed).normal(0.0, SIG_OBS, len(obs_idx))
'''

_FACADE = _FACADE.replace("__ALL__", repr(list(FACADE_EXPORTS)))

_README = """# nbsim: the benchmark's generative model, without the hidden cell
    import sys; sys.path.insert(0, "<parent dir of this nbsim/>"); import nbsim
    task = nbsim.load_task()   # problem() fields + held_out segments + blockers + n_channels, SIG_OBS, DT
    lab, seg = nbsim.protocol(label)   # any pool or held-out label; any other segment list works too
    r = nbsim.simulate(mechanism, seg, reps=64, seed=0, block=("TTX",))   # counts/mean/sd/V; seed required
Blockers are in task["blockers"]. Observing the real cell stays metered (world_observe / probes).
"""

_OBSERVE_RULES = ("world_observe accepts only labels in `protocols`, with any combination of `blockers`; "
                  "held-out and self-written protocols can only be simulated (nbsim.simulate)")


# ── build ───────────────────────────────────────────────────────────────────────────────────────────

def _load_nb(nb_root: Path):
    root = str(nb_root)
    if root not in sys.path:
        sys.path.insert(0, root)
    return importlib.import_module("neuronbench")


def _top_names(node: ast.stmt) -> list[str]:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return [node.name]
    if isinstance(node, (ast.Assign, ast.AnnAssign)):
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        return [n.id for t in targets for n in ast.walk(t) if isinstance(n, ast.Name)]
    if isinstance(node, ast.If) and "__name__" in ast.unparse(node.test):
        return ["__main__"]
    return [f"<{type(node).__name__}>"]  # any other statement kind is unknown → fails the allowlist


def _is_docstring(node: ast.stmt) -> bool:
    return isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)


def _strip_docstrings(node: ast.AST) -> None:
    for n in ast.walk(node):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.body and _is_docstring(n.body[0]):
            n.body = n.body[1:] or [ast.Pass()]


def _referenced(nodes: list[ast.stmt]) -> set[str]:
    return {n.id for node in nodes for n in ast.walk(node) if isinstance(n, ast.Name)}


def _rewrite_import(node: ast.stmt, src: str, dest: str, kept_refs: set[str]) -> list[ast.stmt]:
    """Point relative imports at nbsim modules; allow only numpy / __future__ / dataclasses absolutely."""
    if isinstance(node, ast.Import) or node.level == 0:
        mods = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
        if any(m.split(".")[0] not in ALLOWED_ABSOLUTE for m in mods):
            raise AllowlistError(f"{src}: disallowed import {ast.unparse(node)!r}")
        return [node]
    if node.level != 1:
        raise AllowlistError(f"{src}: disallowed import {ast.unparse(node)!r}")
    if node.module is None:  # from . import _foxlu as fx
        out = []
        for a in node.names:
            targets = set(KEEP.get(a.name, {}).values())
            if len(targets) != 1:
                raise AllowlistError(f"{src}: cannot map module import {a.name!r}")
            out.append(ast.ImportFrom(module=None, names=[ast.alias(targets.pop(), a.asname)], level=1))
        return out
    if node.module not in KEEP:
        raise AllowlistError(f"{src}: import from non-allowlisted module {node.module!r}")
    grouped: dict[str, list[ast.alias]] = {}
    for a in node.names:
        target = KEEP[node.module].get(a.name)
        if target is None:
            if (a.asname or a.name) in kept_refs:
                raise AllowlistError(f"{src}: kept code needs dropped name {node.module}.{a.name}")
            continue
        if target != dest:
            grouped.setdefault(target, []).append(ast.alias(a.name, a.asname))
    return [ast.ImportFrom(module=t, names=names, level=1) for t, names in grouped.items()]


def _extract(pkg_src: Path) -> dict[str, str]:
    """{nbsim module name: source text} from the allowlist."""
    bodies: dict[str, list[ast.stmt]] = {}
    imports: dict[str, list[ast.stmt]] = {}
    for src, keep in KEEP.items():
        tree = ast.parse((pkg_src / f"{src}.py").read_text(encoding="utf-8"))
        body = tree.body[1:] if tree.body and _is_docstring(tree.body[0]) else tree.body
        kept_nodes, src_imports = [], []
        for node in body:
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                src_imports.append(node)
                continue
            names = _top_names(node)
            unknown = [n for n in names if n not in keep and n not in DROP[src]]
            if unknown:
                raise AllowlistError(f"{src}.py: top-level name(s) {unknown} are in neither KEEP nor DROP — review upstream")
            dests = {keep[n] for n in names if n in keep}
            if len(dests) > 1 or (dests and any(n not in keep for n in names)):
                raise AllowlistError(f"{src}.py: statement mixes kept and dropped names {names}")
            if dests:
                _strip_docstrings(node)
                kept_nodes.append((dests.pop(), node))
        for dest in {d for d, _ in kept_nodes}:
            mine = [n for d, n in kept_nodes if d == dest]
            bodies.setdefault(dest, []).extend(mine)
            refs = _referenced(mine)
            for imp in src_imports:
                imports.setdefault(dest, []).extend(_rewrite_import(imp, src, dest, refs))
    out = {}
    for dest, body in bodies.items():
        refs = _referenced(body)
        seen, imps = set(), []
        for imp in imports.get(dest, []):
            aliases = [a for a in imp.names
                       if (isinstance(imp, ast.ImportFrom) and imp.module == "__future__") or (a.asname or a.name.split(".")[0]) in refs]
            if not aliases:
                continue
            imp = type(imp)(**{**{f: getattr(imp, f) for f in imp._fields}, "names": aliases})
            text = ast.unparse(imp)
            if text not in seen:
                seen.add(text)
                imps.append(imp)
        out[dest] = ast.unparse(ast.Module(body=imps + body, type_ignores=[])) + "\n"
    return out


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _files(pkg: Path) -> list[str]:
    return sorted(p.relative_to(pkg).as_posix() for p in pkg.rglob("*") if p.is_file())


def tree_sha256(pkg: Path) -> str:
    """sha256 over the per-file sha256 hex digests, concatenated in path order; MANIFEST.json and __pycache__
    excluded — the same recipe server.ts (env-snapshot.ts treeSha256) uses to recompute it host-side."""
    files = [f for f in _files(pkg) if f != "MANIFEST.json" and "__pycache__" not in f.split("/")]
    return _sha256("".join(_sha256((pkg / f).read_bytes()) for f in files).encode())


def _nb_commit(nb_root: Path) -> str:
    proc = subprocess.run(["git", "-C", str(nb_root), "rev-parse", "HEAD"], capture_output=True, text=True)
    return proc.stdout.strip() if proc.returncode == 0 else "unknown"


def _task(nb, world: str) -> dict:
    problem = nb.load_world(world).problem()
    return {**problem,
            "held_out": [(lab, seg) for lab, seg in nb.protocols.test_protocols(world)],
            "blockers": dict(nb.blockers.BLOCKERS),
            "n_channels": nb.World(name=world).n_channels,
            "SIG_OBS": nb.stochastic.SIG_OBS,
            "DT": nb.stochastic.DT,
            "observe_rules": _OBSERVE_RULES}


def _set_mode(root: Path, dirs: int, files: int) -> None:
    for p in [root, *root.rglob("*")]:
        os.chmod(p, dirs if p.is_dir() else files)


def _rmtree(path: Path) -> None:
    _set_mode(path, 0o755, 0o644)
    shutil.rmtree(path)


def build(nb_root: Path, world: str, out: Path) -> dict:
    """Generate <out> (files 0444, dirs 0555). An existing <out> with the same tree sha is reused; one that
    differs (modified in the run) is moved aside, not deleted, so the evidence survives the rebuild.
    Returns the meter `env` record: {path, sha256, nb_commit, generator_version, files} (+ `replaced`)."""
    nb_root, out = Path(nb_root), Path(out)
    nb = _load_nb(nb_root)
    if world not in nb.list_worlds():
        raise ValueError("unknown world")
    modules = _extract(nb_root / "neuronbench")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.parent / f".{out.name}.tmp-{os.getpid()}"
    if tmp.exists():
        _rmtree(tmp)
    tmp.mkdir()
    for name, text in {**modules, "__init__": _FACADE}.items():
        (tmp / f"{name}.py").write_text(text, encoding="utf-8")
    (tmp / "task.json").write_text(json.dumps(_task(nb, world), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (tmp / "README.md").write_text(_README, encoding="utf-8")
    shutil.copyfile(nb_root / "LICENSE", tmp / "LICENSE")
    files = _files(tmp)
    manifest = {"generator_version": GENERATOR_VERSION, "nb_commit": _nb_commit(nb_root),
                "python_version": platform.python_version(),
                "files": {f: _sha256((tmp / f).read_bytes()) for f in files},
                "tree_sha256": tree_sha256(tmp)}
    (tmp / "MANIFEST.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    listed = sorted(files + ["MANIFEST.json"])
    record = {"path": str(out), "sha256": manifest["tree_sha256"], "nb_commit": manifest["nb_commit"],
              "generator_version": GENERATOR_VERSION, "files": listed}
    if out.exists() and _files(out) == listed and tree_sha256(out) == manifest["tree_sha256"]:
        _rmtree(tmp)
        return record
    if out.exists():
        aside = out.parent / f"{out.name}.replaced-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}"
        out.rename(aside)
        record["replaced"] = str(aside)
    tmp.rename(out)
    _set_mode(out, 0o555, 0o444)
    return record


# ── leak scan (03 §3.4) ─────────────────────────────────────────────────────────────────────────────

def _is_num(node: ast.AST) -> bool:
    return isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool)


def numbers(node: ast.AST) -> set[float]:
    """Signed numeric literals under `node` (`-54` counts as -54, not 54)."""
    out: set[float] = set()

    def visit(n: ast.AST) -> None:
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub) and _is_num(n.operand):
            out.add(-float(n.operand.value))
        elif _is_num(n):
            out.add(float(n.value))
        else:
            for c in ast.iter_child_nodes(n):
                visit(c)
    visit(node)
    return out


def seg_key(seg) -> tuple | None:
    """Canonical form of a segment list [(dur_ms, amp), ...]; None if `seg` is not one."""
    try:
        key = tuple((float(d), float(a)) for d, a in seg)
    except (TypeError, ValueError):
        return None
    return key or None


def _strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from _strings(k)
            yield from _strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _strings(v)


def _lists(obj):
    if isinstance(obj, (list, tuple)):
        yield obj
        for v in obj:
            yield from _lists(v)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _lists(v)


def truth_fingerprints(nb_root: Path) -> dict:
    """Collect every truth fingerprint from the real package (nothing hand-listed)."""
    nb = _load_nb(Path(nb_root))
    specs = nb.worlds.WORLDS
    text = []  # (needle, what, world)
    for w in nb.list_worlds():
        spec = specs[w]
        text += [(spec["desc"], "desc", w), (spec["name"], "name", w), (spec["discriminator"][0], "disc_label", w),
                 (w, "world", w)]
    pool = {seg_key(seg) for _, seg in nb.protocols.POOL}
    segs = {}
    for w in nb.list_worlds():
        key = seg_key(specs[w]["discriminator"][1])
        if key not in pool:
            segs[key] = w
    tree = ast.parse((Path(nb_root) / "neuronbench" / "worlds.py").read_text(encoding="utf-8"))
    chan_vars = [t.id for n in tree.body if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call)
                 and getattr(n.value.func, "id", None) == "Chan" for t in n.targets if isinstance(t, ast.Name)]
    channels = {v: dataclasses.asdict(getattr(nb.worlds, v)) for v in chan_vars}
    allowed: set[float] = set()
    for src, keep in KEEP.items():
        for node in ast.parse((Path(nb_root) / "neuronbench" / f"{src}.py").read_text(encoding="utf-8")).body:
            if not isinstance(node, (ast.Import, ast.ImportFrom)) and any(n in keep for n in _top_names(node)):
                allowed |= numbers(node)
    f_num = {v: {float(x) for x in ch.values() if isinstance(x, (int, float)) and not isinstance(x, bool)} - allowed
             for v, ch in channels.items()}
    problems = {w: set(_strings(nb.load_world(w).problem())) for w in nb.list_worlds()}
    return {"text": text, "segments": segs, "ids": S_ID_BASE | set(chan_vars), "channels": channels,
            "f_num": f_num, "problem_strings": problems}


def text_hits(s: str, fp: dict, world: str | None, *, skip_world_names: bool = False) -> list[dict]:
    if world is not None and s in fp["problem_strings"].get(world, ()):
        return []
    low, out = s.lower(), []
    for needle, what, w in fp["text"]:
        if what == "world":
            if skip_world_names or not re.search(rf"(?<![A-Za-z0-9_]){re.escape(needle)}(?![A-Za-z0-9_])", s, re.I):
                continue
        elif needle.lower() not in low:
            continue
        out.append({"check": "string", "what": what, "world": w})
    return out


def numeric_hits(nums: set[float], fp: dict, threshold: int = 2) -> list[str]:
    return [v for v, fn in fp["f_num"].items() if len(nums & fn) >= threshold]


def _scan_py(text: str, fp: dict, world: str | None, *, idents: bool) -> list[dict]:
    try:
        tree = ast.parse(text)
    except SyntaxError as e:
        return [{"check": "files", "what": f"unparseable: {e.msg}"}]
    out = []
    for n in ast.walk(tree):
        if idents:
            name = (n.id if isinstance(n, ast.Name) else n.attr if isinstance(n, ast.Attribute)
                    else n.name if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                    else n.arg if isinstance(n, (ast.keyword, ast.arg)) else None)
            names = [n.name, n.asname] if isinstance(n, ast.alias) else [name]
            out += [{"check": "ident", "what": x} for x in names if x in fp["ids"]]
        if isinstance(n, ast.Constant) and isinstance(n.value, str):
            out += text_hits(n.value, fp, world)
        if isinstance(n, (ast.List, ast.Tuple)):
            try:
                key = seg_key(ast.literal_eval(n))
            except (ValueError, TypeError, SyntaxError):
                key = None
            if key in fp["segments"]:
                out.append({"check": "segment", "what": "disc_segment", "world": fp["segments"][key]})
        if isinstance(n, (ast.Call, ast.Dict, ast.Tuple, ast.List)):
            out += [{"check": "numeric", "what": v} for v in numeric_hits(numbers(n), fp)]
    return out


def _scan_json(obj, fp: dict, world: str | None) -> list[dict]:
    out = [h for s in _strings(obj) for h in text_hits(s, fp, world)]
    for lst in _lists(obj):
        key = seg_key(lst)
        if key in fp["segments"]:
            out.append({"check": "segment", "what": "disc_segment", "world": fp["segments"][key]})
    return out


_RUNTIME_PROBE = r'''
import dataclasses, importlib, json, pkgutil, sys, types
parent, name = sys.argv[1], sys.argv[2]
fp = json.loads(sys.stdin.read())
ids, channels, found = set(fp["ids"]), fp["channels"], []
try:
    import neuronbench  # noqa: F401
    found.append("neuronbench importable")
except ModuleNotFoundError:
    pass
sys.path.insert(0, parent)
try:
    pkg = importlib.import_module(name)
    mods = [pkg] + [importlib.import_module(f"{name}.{m.name}") for m in pkgutil.iter_modules(pkg.__path__)]
except Exception as e:
    print(json.dumps(found + [f"import failed: {type(e).__name__}"]))
    raise SystemExit(0)
seen = set()

def is_truth(fields):
    return any(all(k in fields and fields[k] == v for k, v in ch.items()) for ch in channels.values())

def walk(obj, depth):
    if id(obj) in seen or depth > 8:
        return
    seen.add(id(obj))
    if isinstance(obj, types.ModuleType):
        if not obj.__name__.startswith(name):
            return
        for k, v in vars(obj).items():
            if k in ids:
                found.append(f"attribute {obj.__name__}.{k}")
            walk(v, depth + 1)
    elif dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        if is_truth(dataclasses.asdict(obj)):
            found.append(f"truth channel instance {type(obj).__name__}")
    elif isinstance(obj, dict):
        if is_truth(obj):
            found.append("truth channel dict")
        for v in obj.values():
            walk(v, depth + 1)
    elif isinstance(obj, (list, tuple, set, frozenset)):
        for v in obj:
            walk(v, depth + 1)
    elif callable(obj) and getattr(obj, "__name__", None) in ids:
        found.append(f"callable {obj.__name__}")

for m in mods:
    walk(m, 0)
print(json.dumps(sorted(set(found))))
'''


def _scan_runtime(pkg: Path, fp: dict) -> list[dict]:
    payload = json.dumps({"ids": sorted(fp["ids"]), "channels": fp["channels"]})
    proc = subprocess.run([sys.executable, "-I", "-c", _RUNTIME_PROBE, str(pkg.parent), pkg.name],
                          input=payload, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        return [{"check": "runtime", "what": f"probe crashed: {proc.stderr.strip()[-200:]}"}]
    return [{"check": "runtime", "what": w} for w in json.loads(proc.stdout)]


def scan_package(pkg: Path, fp: dict, world: str | None) -> list[dict]:
    """Every truth leak found in a package dir; [] means clean. `world` enables the problem() exemption."""
    pkg = Path(pkg)
    out: list[dict] = []
    files = _files(pkg)
    try:
        listed = set(json.loads((pkg / "MANIFEST.json").read_text(encoding="utf-8"))["files"]) | {"MANIFEST.json"}
    except (OSError, ValueError, KeyError):
        listed = set()
        out.append({"check": "files", "what": "no MANIFEST.json"})
    if listed:
        out += [{"check": "files", "what": f"unlisted {f}"} for f in sorted(set(files) - listed)]
        out += [{"check": "files", "what": f"missing {f}"} for f in sorted(listed - set(files))]
    for f in files:
        path = pkg / f
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue  # binary (e.g. a stray .pyc) — already flagged by the file-list check
        try:
            found = (_scan_py(text, fp, world, idents=True) if f.endswith(".py")
                     else _scan_json(json.loads(text), fp, world) if f.endswith(".json")
                     else text_hits(text, fp, world))
        except ValueError:
            found = [{"check": "files", "what": "unparseable json"}]
        out += [{**h, "file": f} for h in found]
    return out + _scan_runtime(pkg, fp)


def scan_source_literals(path: Path, fp: dict) -> list[dict]:
    """For our own scripts/tests (A1): no truth string, discriminator segment or channel-number cluster."""
    return [{**h, "file": str(path)} for h in _scan_py(Path(path).read_text(encoding="utf-8"), fp, None, idents=False)]


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        raise SystemExit(2)
    print(json.dumps(build(Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])), ensure_ascii=False))
