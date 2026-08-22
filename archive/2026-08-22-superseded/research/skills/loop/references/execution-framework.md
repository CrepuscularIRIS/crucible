# Execution Framework — the economics of turning questions into validated constraints (2026-07-24)

**LOAD WHEN:** before any T3+ experiment, or a run is in flight.

> Platt's *strong inference* (1964): the fields that moved fastest treated every experiment as a branch-point
> deliberately designed to kill hypotheses. Hamming's compound-interest view: consistent output is a property
> of the *system* (verdicts per week, marginal cost falling), not the ideas (per-bet variance is high for
> everyone). Everything below is those two ideas, operationalized for the loop.

## 1. The objective: constraints per GPU-hour

The unit of progress is a **constraint added to the mechanism space** ("whatever the root is, it must survive
state-reset and explain the B>S inversion"). Deltas are the receipts; the constraint set is the asset.
`plan/HYPOTHESIS-REGISTER.md` is already the ledger of the right thing — treat it as the thing
being maximized.

**Strong-inference design rule:** before any run, write the outcome table. Every possible result must kill at
least one live hypothesis; if some outcome kills nothing, the experiment is decorative — redesign it. This
requires **≥2 live mechanisms at all times** (Chamberlin's discipline), because with one hypothesis every
experiment degenerates into confirmation-seeking.

The outcome table tests *informativeness*. It does not test **severity** — whether the test would have failed
had the hypothesis been false. Both are required, and severity is the one usually skipped; see
`research-judgment.md` §2 before committing any T3+ test.

**Pricing:** value-per-bit for oracle signals (from `missing-point-method.md`) generalizes one level up —
**price experiments in expected information per GPU-hour** and the scheduling problem collapses.

## 2. Carry a model that predicts, not a story that explains

After every diagnostic battery, force a **minimal parametric model** (2–4 fitted quantities, each
independently testable). The exemplar: `damage ≈ coupling × integration_length × relational_destruction`.
Before every run, **Fermi-predict** the effect size ± range from the model. Then:

- Observed lands inside the band → model confirmed, constraint added, move on.
- Module "wins" but lands OUTSIDE the band → the model is wrong, which is worth more than the win.
- A residual anomaly the model can't absorb → a missing-point *candidate* — after it clears the anomaly
  triage ladder (`research-judgment.md` §4). Most residuals are artifacts, bugs, or noise.

This is where abstractions become a procedure: a good abstraction is a compression that **predicts** — one
fitted product-law replaces a dozen exploratory runs with derivations. Algorithm design falls out: "build
only what the model names." The module is disposable; the fitted model is the deliverable.

The model is also the most likely source of self-deception once it starts absorbing everything — spend one
cheap probe per cycle trying to *break* it (`research-judgment.md` §7).

## 3. The instrument ladder

Make cost tiers explicit and law-governed:

| Tier | Work | Cost |
|---|---|---|
| **T0** | Derivation / thought experiment | Free |
| **T1** | Retrieval (`search` agent) | Minutes |
| **T2** | Probes on **cached activations** — linear probes, cosine drift, patching on stored features | CPU, seconds |
| **T3** | Eval-only interventions on the frozen model — state-reset, oracle injection, ablation classes | GPU minutes |
| **T4** | The ≤3h train (frozen backbone + adapter) | GPU hours |
| **T5** | Full runs, ≥3 seeds, 2nd arch family | GPU days |

**Two laws:** (1) a hypothesis ascends only by surviving the tier below; (2) within each tier the queue is
sorted by **P(kill) × 1/cost** — fail-fastest first. The "falsify FIRST" rule is the T3 special case; this
is the general scheduler. **Health metric:** the kill-tier histogram — a well-run pipeline kills ~90% of
ideas below the GPU line. If deaths concentrate at T4, the ladder is leaking.

**Two one-time investments that buy the most speed:**

1. **Proxy calibration.** Pick a 5–10% eval subset, verify its Spearman ρ against full mIoU across a few
   checkpoints ONCE, then live on the subset for all T3/T4 iteration. Full eval + 3 seeds only at claim time.
   An uncalibrated proxy is how you optimize noise at high speed.
2. **Dump stage-2 activations for the eval set under every corruption class ONCE.** After that, thousands of
   probe-experiments cost CPU. Given that the first missing point lives in stage-2 features, this single cache
   probably changes iteration speed more than any architectural idea will.

## 4. Compounding capital — four assets, each grows every cycle

| Asset | What it is | How it grows |
|---|---|---|
| **Harness** | One-command eval + diagnostic battery running automatically on every checkpoint (diagnostics-as-CI) | Every new diagnostic probe is promoted from one-off script to standing tool |
| **Instrument library** | State-reset battery, equivalence-class ablations, oracle grid — as standing tools, not ad-hoc scripts | Each experiment that produces a reusable diagnostic → `promote` |
| **Constraint graveyard** | the register's `killed directions` section — directions killed with their lesson | Each kill adds a lesson that prevents re-proposal |
| **Schema library** | `{abstract_schema, load_bearing_property, preconditions, kill_signature}` per grill bridge (successful or killed) | Cross-domain breadth is a *cache*, not a talent — the next campaign *recognizes* structures instead of re-searching |

**Loop obligation:** a cycle isn't done until something made the next cycle cheaper — and if nothing did, that
cycle underperformed *even if it won*. The marginal cost of experiment N falls with N. "Technical foundations"
for an autonomous loop is not a property of model weights — it's the verified code substrate and instruments
the loop accumulates. Depth is capital.

## 5. Manufactured intuition — the prediction ledger

In humans, intuition is a predictive model trained on thousands of tight predict-observe-error loops.
Manufacture the training pairs deliberately: every hypothesis that reaches T3+ gets a ledger row:

```
PREDICTION:
  claim: <the mechanism hypothesis>
  P_true: <0–1>
  predicted_delta: <Δ ± range, from the parametric model>
  tier: <T3/T4/T5>
  cost: <GPU-h>
  outcome: <measured Δ>
  error: <predicted − observed>
  lesson: <one sentence — what to update>
```

The meta-round scores calibration and reviews the misses. Over time this yields sentences like "architecture-
class bridges have been overrated 2:1; distillation-class predictions are well-calibrated" — and that sentence
*is* research taste, in portable form.

**The agent-specific point:** Opus has no synapses across sessions. Whatever intuition the campaign develops
lives in **`.grill/STATE.md` + the register or it doesn't exist.** LOAD should reload not just constraints but the
calibration summary. This closes the "learns continuously" requirement literally: the loop manufactures
prediction-outcome pairs, distills them, and re-reads them at boot.

Experts don't predict winners well either — they **reject losers fast and cheaply**, so survivors are enriched.
Precision through selection pressure, not clairvoyance. Kill signatures + a learned tax on historically-
overrated idea classes are the implementable version.

## 6. Scheduling and stopping

- **WIP limit:** one T4+ build at a time; T0–T3 probes unbounded.
- **Interleaving invariant:** the GPU is never idle while a survivor exists, and the orchestrator is never
  idle while the GPU is busy — GPU-busy windows are when the questioning organ and T0–T2 work run.
- **Kill thresholds** are pre-registered before launch. Stopping is Wald-style sequential: act when the
  evidence crosses the threshold, not when curiosity is satisfied. Most researchers over-run experiments
  whose verdict was already in.
- **Time-box** every hypothesis. After each result, re-ask "would I start this today?" (sunk-cost guard).
- **Tie-breaks** go to option value: prefer the experiment that also yields an instrument.

## 7. Instrument the loop itself

The pipeline's own bottleneck is just another missing point. Dashboard fields:
- GPU-hours per validated constraint
- Median question→verdict latency
- Fraction of runs that were decisive
- Kill-tier histogram
- Proxy-ρ drift

**Standing rule:** when velocity degrades, the next investment is tooling, not ideas.

## 8. The GPU-busy agenda — a 4–5h run is the largest block of free reasoning time in the campaign

**Re-arming the heartbeat without doing anything is the `wait-is-not-the-deliverable` anti-pattern.** On
every heartbeat fire while a run is in flight: read `state.json`/the log, then execute the next agenda item
below. The agenda is ordered by value, and item 1 is time-critical — it is only valid *before* the result
lands.

**1. PRE-MORTEM the running experiment (do this first, in the first window).**
Write, before you can be biased by the outcome:
- *"The run finished and the result is null. Why?"* — list the three most likely causes.
- *"The run finished and it worked. What is the most likely MUNDANE explanation other than my mechanism?"*
  (schedule, regularization side-effect, seed luck, eval artifact.)
This is the only moment these answers can be written without hindsight, and they convert directly into the
controls step 9 will need. Record in `.grill/prediction-ledger.md` alongside the prediction row.

**2. STRESS-TEST THE FRAMING — the highest-value use of the window.**
The running experiment embodies a *framing*, and the framing is itself an untested hypothesis. First
intuitions are frequently not the best ones, and this is the one time you can attack yours at zero
opportunity cost — you cannot act on the conclusion until the run finishes anyway.

Open a **fresh ChatGPT conversation** (cold start, no anchoring — `browser-patterns.md`) and attack the
framing, not the mechanism:
- Re-run the RECAST from scratch. Does the same bottleneck description come out? If a different one does,
  that difference is the finding.
- *"What would have to be true for this whole framing to be the wrong one?"*
- *"What is the strongest paper someone could write that CONTRADICTS our thesis?"* Then ask what evidence
  it would need — and whether we are about to produce it.
- Re-run the problem-class test (`research-judgment.md` §1) independently. A class change here is a big deal.

**3. RE-ENTER THE EARLIER STEPS — dispatch the agents, they run in parallel with the GPU.** This is the
part most easily skipped, and it is free. Dispatch `search` for what the write-up needs regardless of this
run's outcome (baselines, related-work positioning, and — most cheaply — literature supporting the "what
doesn't work and why" section from the graveyard). Dispatch `analyst` (THESIS ∥ MECHANISM) on the reframed question
from item 2, or on the next candidate. Run `screen.py rank` over the queued candidates so the next cycle
starts already decided. None of this competes with the GPU for anything.

**4. WARM THE NEXT CYCLE.** T0–T2 work on the *next* candidate: derivations, probes on cached activations,
the cheap kill-tests that would let it skip straight to T3. A cycle that starts warm is a cycle that ends
sooner.

**5. CAPITALIZE EARLY.** Promote instruments, update the schema library and calibration summary while the
details are fresh, rather than at the end when attention is on the result.

### If the stress-test invalidates the running experiment

This is a real outcome, not a hypothetical — decide deliberately rather than drifting:

| Situation | Action |
|---|---|
| The framing shifted but the run's outcome table still discriminates | **Let it finish.** The datapoint remains informative; re-interpret it under the new framing at step 9. |
| The outcome table is now void — no result would change any decision | **Kill the run.** It has become a decorative experiment (governance: an outcome that kills nothing). Record why in the register; the reasoning is the finding. |
| A strictly better experiment is now obvious | **Let the current one finish anyway** if <1h remains; otherwise kill and relaunch. Never run two T4s concurrently to avoid the choice. |

Whatever you decide, write the reframing to `.grill/STATE.md` **before** the result lands, timestamped. A reframing
recorded after the outcome is indistinguishable from rationalization — and worth much less.
