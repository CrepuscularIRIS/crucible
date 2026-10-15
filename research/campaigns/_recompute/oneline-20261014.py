"""Recompute the numbers in 轨迹偏离审计-ca_rebound-一句话-20261014.md (ca_rebound, stochastic N=100).

Run: python3 research/campaigns/_recompute/oneline-20261014.py [--json OUT]   (needs ~/oss/neuronbench importable; ~10 min)
`--json OUT` also writes the numbers the judge report interpolates (keys `one.*`, see 04 §2.3).
"""
import json
import sys

import numpy as np
from neuronbench import evaluator, features, stochastic
from neuronbench.worlds import MT, POOL, WORLDS

PLAIN = dict(extra=[], slow_na=False)
TRUTH = dict(extra=[MT], slow_na=False)
SPEC = WORLDS["ca_rebound"]
# The one-sentence run's four probes (journal lines 32 / 65 / 88 / 99) -> pool label.
ONE_PROBES = {"P1": "hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA)",
              "P2": "brief hyperpol conditioning + test (-30 uA/40 ms, then +12 uA)",
              "P3": "brief step (12 uA, 40 ms)",
              "P4": "paired long pulses (12 uA/300 ms, 60 ms gap, 12 uA/300 ms)"}


def counts(mech, seg, reps, seed, block=()):
    I, _, ts = stochastic.make_protocol(seg)
    V = stochastic.run_particles(reps, I, mech, 100.0, np.random.default_rng(seed), block=block)
    return np.asarray(features.spike_count(V, ts), float)


def effect_sizes(reps: int = 48) -> dict:
    out = {}
    for lab, seg in list(POOL) + [SPEC["discriminator"]]:
        p, t = counts(PLAIN, seg, reps, 11), counts(TRUTH, seg, reps, 12)
        diff, sd = t.mean() - p.mean(), np.sqrt((p.var() + t.var()) / 2)
        need = int(np.ceil((2 * sd / abs(diff)) ** 2)) if abs(diff) > 1e-9 else -1
        print(f"{lab[:62]:62s} {p.mean():6.2f} {t.mean():6.2f} {diff:+5.2f} sd {sd:4.2f} reps@2SE {need}")
        out[lab] = dict(base_mean=round(p.mean(), 2), truth_mean=round(t.mean(), 2), delta=round(diff, 2),
                        sd=round(sd, 2), r_star=need)
    return out


def ttx(reps: int = 120) -> dict:
    P, out = dict(POOL), {}
    for key, lab in (("hypc", "hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA)"),
                     ("brhc", "brief hyperpol conditioning + test (-30 uA/40 ms, then +12 uA)")):
        for name, mech, seed in (("plain", PLAIN, 31), ("truth", TRUTH, 32)):
            hits = int((counts(mech, P[lab], reps, seed, block=("TTX",)) > 0).sum())
            p = hits / reps
            print(f"TTX {lab[:40]:40s} {name}: p_spike={p:.3f} P(>=1 in 8)={1 - (1 - p) ** 8:.3f}")
            out[f"one.ttx.{key}.{name}_hits"] = hits
            out[f"one.ttx.{key}.{name}_p8"] = round(1 - (1 - p) ** 8, 3)
    out["one.ttx.reps"] = reps
    return out


def forecast() -> dict:
    t = evaluator.held_out_targets("ca_rebound", stochastic=True, N=100.0, seed=20261014)
    out = {}
    for name, mech in (("plain", PLAIN), ("truth", TRUTH)):
        pred = {lab: float(counts(mech, seg, 64, 5).mean()) for lab, seg in SPEC["test"]}
        mse = evaluator.forecast_mse(pred, t)
        print(f"forecast mse {name}-model 64 reps: {mse:.3f} (agent: 8.989)")
        out[f"one.forecast.{name}_mse"] = round(mse, 2)
    out["one.forecast.release_target"] = round(float(np.mean([v for k, v in t.items() if "release" in k])), 1)
    return out


def to_keys(eff: dict) -> dict:
    out = {}
    for pid, lab in ONE_PROBES.items():
        out.update({f"one.{pid}.{k}": v for k, v in eff[lab].items()})
    out.update({f"one.disc.{k}": v for k, v in eff[SPEC["discriminator"][0]].items()})
    return out


if __name__ == "__main__":
    eff = effect_sizes()
    data = {**to_keys(eff), **ttx(), **forecast()}
    # Sanity: the TTX discriminator must have zero false positives under the plain model.
    assert (counts(PLAIN, dict(POOL)["hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA)"],
                   40, 99, block=("TTX",)) == 0).all()
    if "--json" in sys.argv:
        path = sys.argv[sys.argv.index("--json") + 1]
        doc = {"schema": "crucible.recompute/1", "script": "research/campaigns/_recompute/oneline-20261014.py", "values": data}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.write("\n")
        print("wrote", path)
