# Missing-Point Discovery Method (from Deep · Final · Relevant · Spark, 2026-07-24)

**LOAD WHEN:** separating a root cause from a downstream shadow (phase 3).

> The campaign's objective is no longer "improve all 4 metrics at once" (proven infeasible — adapter-class
> can't clear it). It is: **systematically discover high-leverage MISSING POINTS and fix them one at a time,
> each a measured benchmark gain.** A portfolio of individual wins. This doc is the method — the way the
> human found the first missing point; the pipeline hunts the next ones the same way.

## What a "missing point" IS

A **causally-verified ROOT mechanism** (not a downstream shadow) that (a) explains an observed anomaly,
(b) is a genuine root rather than a consequence, and (c) admits a **small, cheaply-trainable fix** that
translates to a benchmark delta. **Root cause ≠ repair lever — separate them** (`Final.md`: "root cause and
repair lever have come apart — the single most important structural fact"). A site being important does NOT
mean a module there helps (localization ≠ editing).

**The first missing point (the worked example):** the corruption is NOT "missing information" — it is a
**falsified relational-geometry kernel**: a tiny per-block disturbance (~3% direct effect) becomes ~97% of
the damage by **integration over ~18 stage-2 blocks** in an open-loop cascade with no feedback
(`damage ≈ coupling × integration_length × relational_destruction`; state-reset at the stage-2 boundary
recovers 99.5%; inverted depth ≈ clean depth → the model reads a transform-invariant *relational field*).
Higher-stakes sibling: **the gap may be self-inflicted** — `B-without-depth (0.5439) > S-with-depth (0.5308)`;
only the small model couples to the prior → "recover missing info" becomes "remove an unnecessary dependency."

## The DISCOVERY procedure (load-bearing moves only)

A **paired-run causal battery** (clean vs corrupted on the SAME input — an activation-patching analog):
1. **Activation-patching / interchange + sequential STATE-RESET** — localize the damage loci and split ROOT
   from LEVER (find where it's caused vs where it merely amplifies).
2. **Feature-drift tracking across blocks** — cosine gradually falling reveals an *integration* mechanism
   (the disturbance is an integral, not a point event).
3. **Relational-invariance ablation** (inverted / zeros / constant / noise) — sort corruptions into
   equivalence classes → name the consumed statistic (here: a relational field).
4. **Capacity ladder** (S/B/L strict-loading) — surfaces "self-inflicted" anomalies (the sharpest signal).
5. **Reverse-ablation "God's-eye oracle grid"** — oracle signal × site × strength, progressively degraded
   (bits / resolution / rank) → **value-per-bit curves** that name what is most worth predicting.

**DEMOTE (analytically rich, performance-poor — `Final.md` §5):** cross-corruption subspace geometry,
exhaustive SAE/dictionary fitting, forensic probe-anomaly explanation, high-precision PID accounting *before*
anatomy, full manifold characterization of the residual — these characterize *shadows* of a shared
propagation operator, not the operator. Do the anatomy first.

## VALIDATION — real vs seductive-but-dead (reverse logic)

- **Necessary conditions:** damage needs ALL of {coupling, integration length, relational destruction};
  remove any one and it collapses. A candidate that survives removal of a factor is NOT the root.
- **Root vs consequence:** locus / low-rank residual / probe drops / decoder dependence / "fork stage" are
  labeled *consequences, not causes and not levers*.
- **Protocol dependence (kill test):** one arch + 3 ckpts + 1 dataset + macro-mIoU-over-40-classes is NOT a
  paper claim. Graduate anecdote → phenomenon ONLY if it replicates on a **2nd arch family + dataset**
  (cheap, eval-only).
- **Falsify FIRST:** kill the cheapest / highest-stakes hypothesis before building anything.
- **Metric-artifact traps:** confirm the effect survives a *continuous* metric; distinguish "prior-disabled"
  (constant depth ≠ no prior) — "deprived" vs "poisoned" must be separated before claiming the mechanism.

## TRANSLATION to a gain — measure → build → RE-MEASURE CAUSALLY

(i) a causal recovery number `= (mIoU_patched − mIoU_corrupted)/(mIoU_clean − mIoU_corrupted)`;
(ii) a **rank/bit sweep** sizing the fixable component (e.g. rank-16 recovers 0.77 ≈ ceiling 0.79) — the
value-per-bit curve names the cheapest sufficient signal; (iii) a **≤3h-trainable, frozen-backbone module on
ONLY the causally-verified directions** (not dense KD / full-feature alignment — provably sub-optimal), so
the delta is attributable. **Every built module must RE-PASS the causal test after training**, not just win mIoU.

## RANK candidate missing points — two independent axes

These are different questions and both must be answered. Ranking on one alone is the standard failure.

**Axis A — is it TRUE?** (epistemic; criteria in `research-judgment.md` §3): consilience · independent
testability · simplicity · mechanism depth · what it forbids. A candidate that is strategically delicious and
epistemically weak is how campaigns waste months.

**Axis B — is it WORTH IT?** (strategic):
1. **Explanatory power** — explains the MOST standing anomalies jointly.
2. **Untouched lever** — points at a bottleneck existing methods (gating/alignment/KD/dropout) don't address.
3. **Strategic stakes** — resolving it redirects the trajectory (highest when it *dissolves* the problem).
4. **Categorically distinct** from gating/alignment/distillation — a genuinely different object.
5. **Generality** — cheaply testable/replicable, ideally eval-only across a 2nd family/dataset.

**Selection rule (which to fix NEXT):** among candidates that survive Axis A, the highest **value-per-bit**
oracle signal at its best injection site is, by construction, the thing most worth predicting.

## When the battery finds nothing

A causal battery returning no clean root is itself information, and it has three distinct readings — decide
which before spending another cycle:

- **The instrument is too coarse.** The intervention granularity is above the mechanism's scale (block-level
  probes on a head-level effect). Fix: refine the intervention, not the hypothesis.
- **The damage is genuinely distributed.** No single root exists because the effect is diffuse. This is a
  *finding*, not a failure — it forbids the whole class of localized-fix methods, which is a publishable
  scoping claim (`research-judgment.md` §6) and redirects the campaign toward global interventions.
- **The problem is misclassified.** You are running a causal-localization battery on what is actually a
  capacity, identifiability, or measurement problem. Re-run the problem-class test
  (`research-judgment.md` §1) before another battery — this is the cheapest of the three checks and the one
  most often skipped.

## Method in one line

Paired-run causal battery → sort ROOT-vs-consequence under necessary-conditions reverse logic → rank by the
5 criteria → falsify the cheapest/highest-stakes FIRST → size the fixable component (rank/bit sweep) → build
a small frozen-backbone module on ONLY the causally-verified component → **re-validate causally, not just by
final mIoU** → each survivor = one missing point fixed = one benchmark gain.
