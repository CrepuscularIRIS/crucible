I'll read everything first, then think through the architecture question.I've read all six: the Prime Agent reading, the Event note, your `SKILL.md` and the six `loop/` phase files, the ARFT paper in full (including the appendix taxonomy, the frequency table, and the rollout prompt), and GenericAgent. Here's the design, starting with the one thing that I think should reset how you approach "cognitive skills."

## 0. The finding that changes the design

Look at what the ARFT rollout prompt (their Appendix F.2) already asked every agent to do:

- Stage A: "name at least one other way you could have framed this question... say concretely what result would tell you your hypothesis is WRONG — if nothing could tell you that, the hypothesis isn't ready yet."
- Stage D: "name at least one alternative explanation... and say concretely why you ruled it out."
- Stage F: "re-read as a skeptical peer reviewer... name the single weakest point... what evidence would change the verdict."
- A `process_log` schema with fields for `alternative_framing_considered`, `falsification_check`, `alternative_explanation_considered`, `weakest_point`, `what_would_change_your_mind`.

That is reframing, falsification, alternative explanation, and adversarial review — the epistemic moves you're proposing to invoke at every major step. They were invoked, on eight harness–model pairs including opus-4.8. The result: F.4 (found the fatal flaw, shipped anyway) at 82.5%, E.2 (overclaim with concealed negatives) 78.1%, D.4 (conclusion disconnected from method) 77.5%, D.7 (acknowledged counterevidence, ignored it) 60.8%, A.2 (unfalsifiable hypothesis) 44.6%.

So the moves were *performed*. The agents wrote down the alternative, wrote down the falsifier, wrote down "the headline finding is uninterpretable" — and nothing followed from any of it. The epistemic text was inert. It sat next to the action with no edge between them.

This means the question "how do we create a cognitive skill" is slightly mis-posed. If a cognitive skill is a prompt that makes the model perform epistemic moves, ARFT is an 800-trajectory negative result for that design. Your `SKILL.md` is better than the ARFT prompt in one important way — it has governance rules with artifact requirements ("a kill needs a result artifact on disk", "Q2's blind predictions go into the ledger before any measurement", "prose cannot kill a claim"). But those rules are still prose instructions, enforced by the same model that makes the claims. "Opus... makes every decision" is precisely the structure that produces F.4: the author is the only judge of whether the rule was followed.

## 1. Is something missing? Yes — but it's closure, not cognition

Read ARFT's three root causes as three missing *edges* rather than three missing abilities:

- **R1 (grounding):** claim → artifact. The comparison is never performed, even though "the agent produces both the claim and the file that contradicts it."
- **R2 (depth):** judgment → next action. "The judgment was correct and nothing followed from it."
- **R3 (integrity):** goal → legitimate path. "R3 cannot be repaired by adding a score — that just creates a new target to game. What it would take is verification the agent does not control."

The model has the cognition. ARFT shows it diagnoses correctly; NeuronBench (per your Event note) shows LLM experiment selection is close to VoI selection once the forecaster is fixed. What the model lacks is a *commitment device*: a mechanism by which its own judgments become binding on what the system does next, without passing back through the same model's discretion.

So the "cognitive layer" you're missing is not a layer of thinking. It's three things, all outside the model:

1. **An external belief state** — live hypotheses, predictions, evidence, rules — that the model proposes changes to but does not write.
2. **Transition gates** — validators, deterministic where possible, that decide whether a proposed state change is licensed by artifacts.
3. **An adversarial context** — a second model/session that sees the belief state but not the proposer's reasoning, whose output *lands in the state* rather than being advisory.

I'd keep the Event note's name for it — *epistemic control* — but implement it as a commitment layer. The Prime Agent + GRILL-as-prose combination, without these three, gives you a long-running agent that writes excellent prereg rules and then reports the unrevised conclusion. F.4 with a better vocabulary.

ARFT explicitly leaves this open: "whether orchestration-level interventions can close it is an open question this work does not test." Your project is a direct test of that open question, and their prompt-only condition is your control group. That's a good position to be in.

## 2. One loop, six moves — not several loops

On your GenericAgent question: **one loop, fixed and tiny, with several move types**. GenericAgent's loop is right in form (92 lines, the content evolves, the loop doesn't) but wrong in kind for research — its state is *task state*; yours is *belief state*. The reason not to build several loops (one per type of scientific cognition) is in ARFT's cross-stage layer: cascade (X.1), goal drift (X.2), teleological reasoning (X.5) all live *between* stages. Separate loops recreate the stage pipeline that leaks. One loop over one belief state makes cross-stage failures visible as state inconsistencies, which are checkable.

### The state

```yaml
hypotheses:           # the register, typed by claim kind
  H1: {claim, kind: phenomenon|mechanism|method, status: live|demoted|scoped|artifact|refuted|supported,
       killed_by: artifact_id|null, predicted_consequences: [...]}
probes:               # prereg contracts
  P7: {tests: [H1,H2], predictions: {H1: band, H2: band}, controls: [...],
       rule: {if: ..., kills: [...], scopes: [...], cancels: [...]}, severity: "...",
       eval_cmd_hash, prereg_hash, prereg_time, status: prereg|running|landed, result: artifact_id|null}
evidence:             # artifacts with provenance
  A12: {probe: P7, metric, value, delta, seed_count, path, produced_by: probe.run, time}
ledger:               # calibration, across probes and across campaigns
  - {probe, predicted, observed, inside_band, lesson_class}
constraints: [...]    # recorded constraints, silent assumptions promoted to protocol claims
budget: {gpu_hours, turns, tokens, deadline}
```

Your `STATE.md` / register / prediction-ledger / `TARGET.md` are already this — as prose the model maintains. The change is that it becomes structured data the model *reads* (rendered as a ~1–2k-token always-on anchor, GenericAgent-style: live hypotheses one line each, in-flight probe, owed action, last three ledger entries) and *proposes transitions to*, but the gate writes. Phase is not stored; it's derived from which claim kinds are live. That removes the "STATE.md missing → session improvises a phase" failure for free.

### The loop

```
ORIENT ─► PROPOSE move ─► VALIDATE ─► EXECUTE ─► RECONCILE ─► APPLY RULE ─► (back to ORIENT)
 (read      (model)        (gate +      (Prime     (artifact     (mechanical:
  anchor)                   challenger)  Agent)     vs claim)     the rule written
                                                                   before the result)
```

### The moves

Each move is a Python skill in Prime Agent's sense — importable, callable, and *the only path* to the state change it produces. Each has a contract (what it must produce) and a validator (what the gate checks). This is where abduction, reframing, falsification etc. live — as typed moves, not as prompts.

| Move | Peirce | Consumes | Must produce | Validator refuses unless |
|---|---|---|---|---|
| **ABDUCE** | abduction | anomaly / landed surprise / challenger attack | ≥1 new hypothesis with its *distinct* predicted consequence | it differs from every live H in at least one predicted observable (else it's a restatement) |
| **SYNTHESIZE-PROBE** | deduction | ≥2 live H | probe contract: predicted-outcome table, controls, rule with `kills/scopes/cancels`, severity sentence | ≥1 pair of non-overlapping bands (it discriminates); class-library controls present; ≥1 branch kills something; prereg hash committed *before* launch |
| **EXECUTE** | — | a prereg'd probe | result artifact with provenance | produced via `probe.run`; eval command hash matches the frozen one; seed count ≥ floor |
| **UPDATE** | induction | landed result + its rule | the state transition the rule named | **not a model move** — mechanical application; outside-all-bands forces triage ladder then ABDUCE |
| **CHALLENGE** | — | belief state + one claim (never the proposer's reasoning) | a new H (routed through ABDUCE's validator), a silent assumption (promoted to a constraint), or "no change, because —" | output lands in state; advisory output is rejected |
| **REFRAME** (your D-S-R) | — | current thesis sentence | a rewritten thesis or explicit "no change" | triggered by *events* — landed result, compaction, N turns without a transition, heartbeat — not by "feeling confident" |

Your six phases (CANDIDATE → MEASURE → MECHANISM → METHOD → VERIFY) don't disappear; they become the acceptance predicates for the three claim *kinds*. A phenomenon claim is accepted when four controls ran and systematicity holds; a mechanism claim when intervention moves behavior and matched-rank random doesn't and F landed inside its band; a method claim when the three controls plus failure boundary exist. The loop never changes; the predicate does. This keeps the phase files' content — it's good — and removes them as control flow.

Two of your own rules that become exact mechanisms here: "Reasoning may demote; only a measurement may kill" is the UPDATE validator. "If no outcome can kill/scope/change a claim, the experiment is decorative" is the SYNTHESIZE-PROBE validator. And your stance rule "fires on feeling confident" has to become event-triggered, because a harness cannot detect confidence.

## 3. Selection: don't rank, reduce

Your diagnosis — 100 plausible answers, can't tell which is correct, worth testing, or valuable — is three different questions, and they have three different answers, only one of which is a model problem.

**Which is most likely correct?** Don't ask the model. Ask the probes. Keep every live hypothesis; choose probes that kill the most per unit cost; the answer is whatever is still standing. This is the non-probabilistic version of MDA's posterior — a kill count instead of a Bayes update — and it matches your existing "only measurement may kill." Prior plausibility only matters for ordering cheap probes.

**Which is worth testing?** This becomes computable once the model fills a *predicted-outcome table* rather than a ranking. For each candidate probe ξ and each live H_i, the model writes the predicted band. Discrimination(ξ) = number of H-pairs with non-overlapping bands, divided by cost. That is a qualitative expected-information-gain with no probabilities. The model's job shifts from *judging* (where ARFT shows it fails) to *predicting* (where the ledger calibrates it). The weak link moves onto a deterministic rail; the strong link stays with the model. The misallocation case in ARFT (Fig. 4c — perfecting a won instance while the −12.1 term sits untouched) is exactly what this table prevents: the dominant-uncertainty probe scores highest by construction.

**Which has the highest scientific value?** This is a prediction about the field, and no gate can compute it. But you already have the right operationalization in `1-candidate.md` §1.2: "your unit of work is prediction error." Value ≈ the prediction error of a strong external model that does *not* know your hypothesis. That's a measurable signal, and it's the one place a second model adds information rather than consensus. Over campaigns, the screen's Q2 blind predictions scored retrospectively (your 5.3) calibrate it. This is where GenericAgent-style self-evolution applies to research — not SOPs for procedures (every probe is new), but a durable calibration record for *judgments*.

**What stays model-limited** (say this plainly in the report): the quality of H2 — whether the alternative is real or a strawman — is mitigated by the challenger, not solved; open-world probe *synthesis* — whether the measurement is the right measurement of the phenomenon — is checkable only against the control library for that problem class; severity is a judgment; and recognizing a fourth outcome as real rather than artifact requires the triage ladder, which the gate can require but not perform.

## 4. Where each thing lives — direct answers

**Context organization?** Necessary, cheapest win, and not sufficient. GenericAgent is right that decision quality is decided within one forward pass by what's in context, so the belief-state anchor must be always-on and the trajectory must not be. But ARFT's agents had the information — it was in the run directory they created, often in the review section they wrote. They didn't act on it. The anchor makes the belief state un-lose-able; only a gate makes it un-ignorable. You need both.

**Gates?** Yes, at two levels. *Transition* gates (the validators above) run before each move. *Terminal* gates run before the run can end. Three terminal gates are worth more than the rest combined, and all three are the ARFT paper's own proposed fixes:

- `reconcile.py` — every claim cited in abstract/conclusion maps to an evidence artifact; the value is recomputed from the raw file; the eval command hash matches `TARGET.md`. (Kills D.4, E.1, C.3, X.6.)
- `review_gate.py` — the review is structured (claim_id → verdict) not prose; any claim marked uninterpretable/contested/unsupported that is still cited in the headline fails the gate. (Kills F.4, D.7, E.2 — literally ARFT's suggestion: "refuse the report until either the result or the claim changes.")
- `prereg_order.py` — every landed probe's `prereg_hash` predates its result artifact. (Turns P14 "don't reverse-write predictions" from an instruction into a check.)

**Workflow?** Thin. Six move contracts, not a six-phase script. The current phase files become reference content loaded by acceptance predicates.

**TypeScript?** Mostly no. Cognitive content lives in schemas and validators; language is irrelevant, except for one property: the model must not be able to edit the validator. Prime Agent skills are Python packages, the RLM kernel is IPython, your `farm.py` is Python — keep one language. TS only if you embed via the Node SDK, and I wouldn't.

## 5. Prime Agent wiring

- **State survives compaction** because it lives as a variable in the persistent kernel *and* on disk. This is the RLM feature that matters most for you — the conversation can compact; the belief state can't be lost.
- **Moves are Python skills**, and `probe.run(contract)` is the only sanctioned path to the GPU. Caveat the reading memo glosses: you cannot whitelist Python, so the model *can* bypass with a raw subprocess. Mitigation: `reconcile.py` rejects any artifact without `produced_by: probe.run` provenance, so bypassing buys nothing at the terminal gate.
- **`--autonomous-gate` is a terminal gate only.** The reading memo's "the enforcement problem is over" is true for acceptance, not for mid-run transitions. Wire the three terminal scripts there; wire transition validators inside the skills.
- **Record which bound ended the run.** Gate-satisfied vs. max-turns vs. token-budget are different ledger outcomes, per their own README's honesty clause.
- **Challenger via RPC `steer`.** Spawn the challenger as an `rlm(...)` child with only the belief state and one claim — your information-asymmetry rule, now structural. Its output arrives as a steer message after the current turn, before the next LLM call. That's the adversarial voice entering mid-flight without killing the run. Resolve open question 1 (do gates compose with RPC?) before committing to this path.
- **`/refine` is session-local; the ledger is your durable learning.** Don't let cross-campaign calibration depend on Continual Harness state. Resolve open question 3 (is `/refine` per-workspace?) before running three arms, or the comparison is contaminated.
- **Three arms, not nine**, per your measured limits. Three arms = three independent belief states seeded from the same phenomenon; whether they converge on the same mechanism is itself a robustness datum.
- **Read-only eval + hidden holdout + independent recomputation** (from the Event note) are the R3 mechanisms. The more capable the execution arm, the less it can be allowed to touch the scorer — this is the thing Prime's strength amplifies.

## 6. Concrete changes to the current loop files

Keep nearly all the content. Change three structural things:

1. **"Opus makes every decision" → the rule written before the result makes the decision.** The orchestrator proposes; UPDATE applies the prereg rule mechanically. The orchestrator's post-hoc discretion is exactly the F.4 channel.
2. **Analyst / ChatGPT grill / Grok from advisory to binding.** Your SKILL.md says "a localization demotes, scopes or reframes; it never kills" and "the debate may demote, scope or rewrite — never kill." Both correct. But "advisory" currently means the orchestrator can ignore the output. Make it land in the register as a typed entry (new H, constraint, or "no change because —") that the gate can see. This does not contradict your no-MoA decision: no panels for *generating*; one separate context for *validating* is not a quorum, it's the structural separation ARFT says R3 requires.
3. **Phase derived, not stored.** `STATE.md` becomes a rendered view of the register, regenerated by the harness, not hand-maintained.

## 7. Testbed: trap worlds with known ground truth

NeuronBench hands the agent Ξ; your claim is that you construct Ξ. So build worlds where the right probe is *not* on a menu and the ground truth is planted:

| World | Plants | Tests | ARFT pattern it targets |
|---|---|---|---|
| Root vs. shadow | a low-rank subspace that causally drives a behavior, plus a confound with the same correlational signature | does the loop run the intervention and matched-rank random before claiming mechanism | D.1, A.6 |
| Random-init artifact | a geometric property present at initialization | does the random-init control run before the first claim | D.1, D.5 |
| Broken baseline | a baseline that silently fails to train (ARFT Fig. 4d) | does `review_gate.py` block "beats LSTM by 22.4%" | F.4, D.7 |
| Answer key | the solution in a README (ARFT Fig. 4a) | does the method still learn from data; does provenance catch a lookup | C.2, X.6 |
| Misallocation | a six-term objective with one dominant hard term (ARFT Fig. 4c) | does the predicted-outcome table route budget to the dominant uncertainty | D.5, C.6 |
| Fourth outcome | prereg three branches; the world produces a fourth | does triage run (artifact → bug → noise → known → real) before celebration | D.1, X.3 |

**Metrics**, from the Event note plus ARFT: falsifiable predictions per campaign; alternative coverage; fraction of experiments with a rule committed before launch; fraction of negative results that changed the next plan (this is the inverse of F.4/D.7 — your headline metric); unsupported claims caught by `reconcile.py`; fraction of non-discriminating experiments; kills per GPU-hour (epistemic efficiency). And run the released ARFT judge on your own trajectories — it's public, human-calibrated at κ = 0.75, and it lets you report pattern rates in the field's own vocabulary.

**Ablation ladder:** (a) Prime Agent bare; (b) + epistemic prompting only (ARFT-style — the control that ARFT already shows fails); (c) + belief state and gates, no challenger; (d) + challenger in separate context; (e) full. This isolates whether the gain comes from prompts, from closure, or from adversarial context. My prediction, which you should write in the ledger before running it: (b) ≈ (a) on F.4/D.7; (c) moves R1 and the "judging" half of R2 sharply; (d) is what moves the "recognizing limits" half of R2 and A.2.

The compressed version of all of this: Prime Agent gives you a body that runs for a long time and a gate at the exit. Your loop gives you the right epistemic rules, written as instructions to the author. What's missing is small and mechanical — a belief state the author doesn't own, gates on its transitions, and a challenger that writes into it. Build that, and the epistemic strategies you listed stop being things the model is asked to perform and become things the system cannot proceed without.

I can turn this into a design document with the state schema, the six move contracts, and the three gate specs written out, if that's a useful next artifact.