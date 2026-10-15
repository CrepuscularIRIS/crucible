"""Recompute the numbers in 轨迹偏离审计-ca_rebound-s0-20261014.md (GLM 5.3 Flash, ca_rebound seed 0).

Run: PYTHONPATH=~/oss/neuronbench python3 research/campaigns/_recompute/s0-p0-20261014.py [--json S0_OUT P0R_OUT]   (~8 min; neuronbench is read-only)
`--json` also writes the numbers the judge report interpolates: keys `s0.*` for the s0 run and `p0.*` for the
P0-image one-sentence run (same world, same seed 0; its P2/P4 are replayed by `replay_p0()`).

Reuses `counts` / PLAIN / TRUTH from oneline-20261014.py. Candidate mechanisms are copied verbatim from
the s0 session transcript (proma-glm-demo:/root/.proma-dev/agent-sessions/857f75fc-....jsonl, the
`mechanism` argument of each world_simulate call; the journal itself does not record them).
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

import numpy as np
import neuronbench as nb
from neuronbench import evaluator, features, stochastic
from neuronbench.worlds import Chan, WORLDS

_spec = importlib.util.spec_from_file_location("audit1", Path(__file__).with_name("oneline-20261014.py"))
_a1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_a1)
counts, PLAIN, TRUTH = _a1.counts, _a1.PLAIN, _a1.TRUTH

LONG = "long step (10 uA, 300 ms)"
DEPC = "depolarising conditioning + test (+15 uA/250 ms, then +12 uA)"
HYPC = "hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA)"
WEAK = "hyperpol pre-pulse + weak test (-30 uA/250 ms, gap, +6 uA)"
BRHC = "brief hyperpol conditioning + test (-30 uA/40 ms, then +12 uA)"
PROBES = {"P1": (LONG, 1, 32.0), "P2": (DEPC, 2, 34.0), "P3": (HYPC, 2, 13.5), "P4": (WEAK, 1, 8.0)}
EXTRA = ["brief step (12 uA, 40 ms)", "strong step (18 uA, 120 ms)",
         "paired long pulses (12 uA/300 ms, 60 ms gap, 12 uA/300 ms)", BRHC]


def _m(**kw):
    return dict(extra=[Chan(**kw)], slow_na=False)


# Agent candidates, verbatim (session world_simulate call index in brackets).
CA_T = dict(name="ca_t", g=0.5, E=40, mvh=-60, mk=8, mtau=10, mpow=2, hvh=-70, hk=-6, htau=120)          # [12] H1
CA_T_FAST = dict(CA_T, name="ca_t_fast", hvh=-68, htau=30)                                              # [33] H6
CA_P = dict(name="ca_p", g=0.5, E=-30, mvh=-60, mk=8, mtau=10, mpow=1, hvh=-70, hk=-5, htau=150)        # [40] H5 (= "ih" [14])
IH_TRUE = dict(name="ih_true", g=0.5, E=-30, mvh=-75, mk=-8, mtau=100, mpow=1, hvh=-45, hk=6, htau=30)  # [22] H3
CA_P_INACT2 = dict(CA_P, name="ca_p_inact2", hvh=-55, hk=-6, htau=200)                                  # [45] H7
MODELS = {
    "plain (H2/H4 ref)": PLAIN,
    "TRUTH (MT)": TRUTH,
    "H2 slow_na": dict(extra=[], slow_na=True),
    "H1 ca_t (hk=-6)": _m(**CA_T),
    "H1 ca_t hk=+6 (sign fixed)": _m(**dict(CA_T, hk=6)),
    "H6 ca_t_fast (hk=-6)": _m(**CA_T_FAST),
    "H6 ca_t_fast hk=+6": _m(**dict(CA_T_FAST, hk=6)),
    "H5 ca_p": _m(**CA_P),
    "H3 ih_true": _m(**IH_TRUE),
    "H7 ca_p_inact2": _m(**CA_P_INACT2),
}
R = 64


def replay() -> None:
    """The meter rebuilds load_world(seed) on every call, so each (protocol, reps, blockers) cell is one frozen draw."""
    for pid, (lab, reps, obs) in PROBES.items():
        got = nb.load_world("ca_rebound", seed=0).run(nb.protocols.by_label(lab), reps=reps).spike_count
        print(f"replay {pid} reps={reps}: {got} (journal {obs})")
        assert got == obs, (pid, got, obs)
    for lab in (HYPC, BRHC):
        row = [nb.load_world("ca_rebound", seed=0).run(nb.protocols.by_label(lab), reps=r, block=("TTX",)).spike_count
               for r in range(1, 9)]
        print(f"TTX seed0 {lab[:34]:34s} reps1..8 mean count: {[round(x, 2) for x in row]}")


def table() -> dict:
    stats = {}
    for i, (name, mech) in enumerate(MODELS.items()):
        for j, lab in enumerate([p[0] for p in PROBES.values()] + EXTRA):
            c = counts(mech, dict(nb.protocols.POOL)[lab], R, 1000 + 37 * i + j)
            stats[name, lab] = (c.mean(), c.std(ddof=1))
    for pid, (lab, reps, obs) in PROBES.items():
        print(f"\n{pid} {lab}  obs={obs} reps={reps}")
        for name in MODELS:
            mu, sd = stats[name, lab]
            print(f"  {name:28s} mean {mu:6.2f} sd {sd:4.2f}  z(obs) {(obs - mu) / (sd / np.sqrt(reps) + 1e-9):+6.2f}")
    print()
    for lab in EXTRA:
        print(f"{lab[:40]:40s} " + "  ".join(f"{n.split()[0]}:{stats[n, lab][0]:.1f}" for n in MODELS))
    p, t = stats["plain (H2/H4 ref)", LONG], stats["TRUTH (MT)", LONG]
    print(f"\nP1 baseline single draw 23 vs plain mean {p[0]:.2f}±{p[1]:.2f}; truth {t[0]:.2f}")
    return stats


def cell_keys(stats: dict, prefix: str, lab: str, reps: int, obs: float, kill=None) -> dict:
    """Judge-report numbers for one metered cell: baseline vs truth, r*, z of the observation under truth,
    and (normal approximation on the reps-mean) the chance that truth / baseline lands in a kill band."""
    (pm, ps), (tm, ts) = stats["plain (H2/H4 ref)", lab], stats["TRUTH (MT)", lab]
    sd = math.sqrt((ps ** 2 + ts ** 2) / 2)
    out = dict(base_mean=round(pm, 2), base_sd=round(ps, 2), truth_mean=round(tm, 2), truth_sd=round(ts, 2),
               delta=round(tm - pm, 2), r_star=math.ceil((2 * sd / abs(tm - pm)) ** 2), obs=obs, reps=reps,
               z_truth=round((obs - tm) / (ts / math.sqrt(reps)), 2))
    if kill:
        def inside(mu, s):
            se = s / math.sqrt(reps)
            phi = lambda x: 0.5 * (1 + math.erf((x - mu) / (se * math.sqrt(2))))
            return round(phi(kill[1]) - phi(kill[0]), 2)
        out.update(truth_p_kill=inside(tm, ts), base_p_kill=inside(pm, ps), kill_lo=kill[0], kill_hi=kill[1])
    return {f"{prefix}.{k}": v for k, v in out.items()}


def replay_p0(n: int = 40) -> dict:
    """P0-image run (seed 0): P2 = hyperpol-cond x4 -> 16, P4 = same protocol x1 -> 16 (journal 53 / 66).
    Is P4 the first rep of P2, and how correlated are a reps=4 and a reps=1 cell of one protocol across seeds?"""
    hy = nb.protocols.by_label(HYPC)
    p2 = nb.load_world("ca_rebound", seed=0).run(hy, reps=4).spike_count
    p4 = nb.load_world("ca_rebound", seed=0).run(hy, reps=1).spike_count
    assert (p2, p4) == (16.0, 16.0), (p2, p4)
    w = nb.load_world("ca_rebound", seed=0)
    I, _, ts = stochastic.make_protocol(hy[1])
    per = features.spike_count(stochastic.run_particles(4, I, w._truth_kwargs, w.n_channels, w._rng), ts)
    pairs = np.array([[nb.load_world("ca_rebound", seed=s).run(hy, reps=r).spike_count for r in (4, 1)]
                      for s in range(n)])
    rho = float(np.corrcoef(pairs[:, 0], pairs[:, 1])[0, 1])
    rerun = nb.load_world("ca_rebound", seed=0).run(hy, reps=1).spike_count
    print(f"\nP0R replay: P2 x4 = {p2} (per rep {per.tolist()}), P4 x1 = {p4}, rerun P4 = {rerun}, "
          f"corr(reps4, reps1) over {n} seeds = {rho:.2f}")
    return {"p0.replay.P2": p2, "p0.replay.P4": p4, "p0.replay.P2_reps": "/".join(f"{x:g}" for x in per),
            "p0.replay.P4_equals_P2_rep1": bool(per[0] == p4), "p0.replay.rerun_P4": rerun,
            "p0.replay.corr_r4_r1": round(rho, 2), "p0.replay.seeds": n}


def forecast() -> None:
    tg = evaluator.held_out_targets("ca_rebound", stochastic=True, N=100.0, seed=0)
    agent = {"brief step (12 uA, 40 ms)": 8, "hyperpol -25 then release": 6, "hyperpol -30 then release": 6,
             "hyperpol -35 then release": 6, "hyperpol -40 then release": 6, LONG: 32}
    mse = evaluator.forecast_mse(agent, tg)
    print("\ntargets seed0:", {k: round(v, 2) for k, v in tg.items()})
    print("agent per-label sq err:", {k: round((agent[k] - tg[k]) ** 2, 1) for k in tg}, f"MSE {mse:.4f}")
    assert abs(mse - 30.883095833333332) < 1e-9, mse
    for name in ("plain (H2/H4 ref)", "TRUTH (MT)", "H5 ca_p", "H7 ca_p_inact2", "H1 ca_t (hk=-6)"):
        pred = {lab: float(counts(MODELS[name], seg, R, 5).mean()) for lab, seg in WORLDS["ca_rebound"]["test"]}
        print(f"forecast {name:22s} {R} reps: MSE {evaluator.forecast_mse(pred, tg):6.3f}  "
              + " ".join(f"{v:.1f}" for v in pred.values()))


def crn(n: int = 40) -> None:
    """Same seed => same noise stream for every protocol: are reps=1 errors correlated across cells?"""
    labs = [LONG, "strong step (18 uA, 120 ms)", "paired long pulses (12 uA/300 ms, 60 ms gap, 12 uA/300 ms)"]
    x = np.array([[nb.load_world("ca_rebound", seed=s).run(nb.protocols.by_label(lab)).spike_count for lab in labs]
                  for s in range(n)])
    print(f"\nseed0 reps=1 {[x[0, k] for k in range(3)]}; truth-cell means over {n} seeds {x.mean(0).round(2)}")
    print("corr(long,strong) %.2f  corr(long,paired) %.2f  corr(strong,paired) %.2f" % (
        np.corrcoef(x[:, 0], x[:, 1])[0, 1], np.corrcoef(x[:, 0], x[:, 2])[0, 1], np.corrcoef(x[:, 1], x[:, 2])[0, 1]))
    # Counterfactual probes the debt rules pointed at (G4 paired, G11 brief, P6 strong), seed 0, reps=1.
    for lab in labs[1:] + ["brief step (12 uA, 40 ms)"]:
        print(f"seed0 counterfactual {lab[:40]:40s} reps=1: {nb.load_world('ca_rebound', seed=0).run(nb.protocols.by_label(lab)).spike_count}")


if __name__ == "__main__":
    replay()     # built-in check 1: the four metered numbers are reproduced bit-for-bit
    crn()
    stats = table()
    forecast()   # built-in check 2: agent forecast MSE recomputed to 30.883095833333332
    p0 = replay_p0()  # built-in check 3: the P0-image run's P2 / P4 are reproduced bit-for-bit
    print("\nCHECKS PASSED")
    if "--json" in sys.argv:
        i = sys.argv.index("--json")
        s0 = {}
        for pid, (lab, reps, obs) in PROBES.items():
            kill = {"P3": (9, 15), "P4": (3, 8)}.get(pid)  # H6 / H1 kill region (prereg P3 branches 9-10 + 11-15; P4 3-8)
            s0.update(cell_keys(stats, f"s0.{pid}", lab, reps, obs, kill))
        p0.update(cell_keys(stats, "p0.P2", HYPC, 4, 16.0, (14, 19)))  # H1 kill band, prereg P2
        for out, vals in ((sys.argv[i + 1], s0), (sys.argv[i + 2], p0)):
            doc = {"schema": "crucible.recompute/1", "script": "research/campaigns/_recompute/s0-p0-20261014.py", "values": vals}
            Path(out).write_text(json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
            print("wrote", out)
