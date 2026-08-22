# The research object model — thesis → primary claims → falsifiers → kills

**LOAD WHEN:** enumerating claims, or killing one (phase 5).

> **Kill claims, not ideas. Kill them as early as possible, because early kills are the
> cheapest. And before killing a claim, make sure the evidence can actually observe the
> dimension being used to judge it.**

## The object above the claim (2026-08-01)

Claims fixed project-level kills. But a claim is not the top of the model either, and the
tell was the old gate rule: *"exactly one live rank-1 claim carries the paper."* That is a
**thesis** wearing a claim's clothes — the ledger faking an object it did not have.

A paper argues one thesis through **one to three primary claims**, each carrying a ROLE:

| Role | What it asserts | Dies to |
|---|---|---|
| **phenomenon** | the effect exists and was previously unnoticed | it does not reproduce |
| **mechanism** | *this* is why it happens | the effect survives removing the mechanism |
| **intervention** | targeting the mechanism improves the outcome | the fix does not move the metric |
| **generality** | it holds across datasets / models / orders | one setting where it does not |

Roles are what make primaries *add up to an argument* instead of a portfolio of wins. Two
structural checks fall straight out and neither was expressible before:

- An **intervention** primary with no live phenomenon or mechanism = a fix for something the
  ledger never established. `check` notes it; `consistency` files it under `role`.
- A primary that **dies or is scoped** forces `thesis.status` off `active`/`supported` —
  `check` BLOCKS until it moves. This is the exact downgrade that used to happen by hand,
  during writing, at maximum cost.

```yaml
thesis:  {id: T1, statement: <what becomes true beyond a number moving>,
          status: candidate|active|weakened|supported|dead, venue_target: <venue>,
          novelty: {...}}
claims:  [{id: C1, role: phenomenon, rank: primary, ...}, ...]
```

## Novelty is a state machine, not a vote

```
unsearched → not_found_under_queries → novelty_supported → novelty_challenged / collided
```

`not_found_under_queries` requires the literal queries and databases on record. It is a
**candidate**, never evidence: our queries finding nothing says nothing about what exists.
`novelty_supported` additionally requires all four cross-checks — synonyms · citation chain ·
code repositories · surveys — and `check` BLOCKS the claim otherwise. Only that state may back
a novelty claim in the paper.

Models are excellent at generating query terms, summarising papers, and spotting neighbouring
formulations. **They cannot establish by majority vote that nobody has done the work before**,
because that is not a reasoning task — a panel asked to confirm novelty answers from parametric
memory and returns a confident absence indistinguishable from a real one. This gate is why the
question is delegated to a *procedure* rather than to a panel.

## Why the unit matters

A project-level kill SOP would have ended this campaign the day the SUN-RGBD result came back
at +0.06 — and that would have been wrong. The neutral-element criterion and the protocol
critique never depended on the phenomenon holding.

What deserved to die were *claims*: the untested architecture-family assertions, the implied
universality of the recoverable component, the cross-architecture generalization of the
frontier. Each was eventually downgraded by hand, during writing, at maximum cost.

**Projects rarely deserve to be abandoned. Individual claims should be dying continuously.**
Without claims as objects the pipeline has one forward state — idea → experiment → paper — and
every termination collapses onto the whole project.

## The ledger

> ⚠ **`claims.py` does not exist in this workspace.** It came from the previous campaign's plugin and
> was never copied. The ledger is therefore `plan/HYPOTHESIS-REGISTER.md`, maintained by hand, and the
> contract below is enforced by *you* rather than by an exit code. Everything the script used to refuse
> mechanically is still a rule — it just no longer refuses on its own, which is exactly the weakness a
> gate script exists to remove. Building it is a live proposal, not a decision.

The register carries, per claim: **statement · role** (phenomenon / mechanism / intervention /
generality) · **kind** (scientific / protocol / validity) · **state** · **falsifier** (test, the
dimensions it can observe, cost, MDE) · **result artifact**.

Three rules to apply by hand, in place of the gate:

1. **A claim with no falsifier is not a claim.** Write the falsifier or delete the row.
2. **A kill requires a result artifact on disk** carrying `experiment_id · metric · value · delta ·
   seed_count`, and the metric must be one the falsifier declared it could observe. Prose cannot kill.
3. **A primary claim that dies or is scoped moves the thesis.** Walk the dependents in the same
   sitting — a register where a parent died and the children still read `LIVE` is worse than no
   register, because it looks maintained.

Seven mechanisms, each answering a specific way this goes wrong:

| Mechanism | The failure it prevents |
|---|---|
| **Frozen falsifier** — the falsifier is hashed against the claim text | Edit the claim and its test silently answers a question nobody is asking. Drift voids the falsifier; `kill` refuses. |
| **Observability guard** — a falsifier declares the dimensions it can measure | Screens are biased on dimensions they cannot see. Killing a good method on clean-condition performance a 40-epoch screen cannot resolve is how an SOP becomes *worse than none*. |
| **Power guard** — `min_detectable` vs `decision_rule.threshold` | `observes` is a **word**; whether the test resolves the delta is a **number**. A 3-seed screen at seed-sd 0.35 has an MDE of ~1.1 mIoU — it cannot see a 0.3 effect, however honestly its `observes` field was filled in. `check` blocks `UNDERPOWERED`. |
| **Kill contract** — a kill requires a result ARTIFACT on disk | The old `kill` checked one thing: does the free-text evidence contain a word from `observes`. **Prose could kill a claim** — no experiment id, no number, no comparison against the claim's own threshold. It advertised a guarantee it did not hold, which is worse than advertising none. Six checks now REFUSE (missing/unreadable artifact · drift · incomplete record · metric not in `observes` · result predating the falsifier · a rule that does not fire); three DOWNGRADE to `challenged`/`inconclusive` instead of killing (seeds below floor · declared artifact missing · delta inside the MDE). |
| **Leverage order** — free first, then cost per unit of leverage | Rank-first sends you to spend 6 GPU-h on the primary claim before a 0.5 GPU-h test that could have *scoped that very claim*. Cost-first defers the load-bearing tests forever. Leverage = the claim's own rank + every claim its rule kills or scopes + every experiment it cancels + a bonus for a claim already under challenge (budget sunk, contest open). |
| **Thesis + roles** — 1–3 primaries, each with a role | A dead primary used to be absorbed silently. Now it forces `thesis.status` to move, and an intervention with no phenomenon under it is a finding rather than a paper. |
| **Novelty states** — absence must be earned | "The search found nothing" and "this is novel" were the same sentence. Now they are different states, and only the fully cross-checked one may back a paper claim. |
| **Protocol claims** — `kind: protocol` is first-class | *"Our baseline is comparable to the published one"* is a claim. It feels like setup, so nobody enumerates it, so nothing tests it — and it invalidated a headline here until M1 landed. |

## Prereg a decision rule, not a test

A prereg that names a measurement tells you a number. A prereg that names a **rule** tells you
which claims die:

```json
"decision_rule": {"if": "EM delta < 0.5 on SUN",
                  "kills": ["C2"], "scopes": ["C3"], "cancels": ["E7","E8"]}
```

The ledger then falls out for free: **the union of everything preregs can kill is the claim
list**, and kill events write themselves as preregs resolve. `cancels` is where the budget is
actually saved — the experiments that become unnecessary the moment a claim dies.

**Full training is the final check on a surviving claim, never the instrument that discovers
whether it is true.** Every ≤1 GPU-h falsifier runs first.

## Who adjudicates a claim transition  *(rewritten 2026-08-19 — MoA removed)*

Every point below is a **claim state transition**, which is what makes the integration structural
rather than sprinkled. What changed is only *who* adjudicates each one:

| Transition | Now owned by |
|---|---|
| **Claim generation** — which claims are worth enumerating | the ChatGPT grill for breadth, `analyst` THESIS for structure |
| **Hypothesis refinement** — falsifiable as written, or needs splitting? | `analyst` THESIS, then `screen.py check` |
| **Candidate ranking** | **`screen.py rank`** — deterministic; the six-question screen replaced this seam |
| **Experimental design** — tests the claim, or a neighbour of it? | `analyst` FALSIFIER, then `grok-verifier` at deploy |
| **Falsification planning** — *"if the result is X, does C4 really die?"* | `analyst` FALSIFIER |
| **Evidence synthesis** — did the evidence observe the dimension the kill rests on? | the kill contract in this file; the artifact requirement refuses what prose would wave through |
| **Claim validation** — does the surviving claim still say what the evidence supports? | `analyst` AGGREGATE, at phase 5 |

**A script beats a panel wherever one exists.** Two of these stopped being arguable the moment they
became code, and that is the direction of travel — not a compromise forced by removing MoA.

## Sequential and parallel — the real axis

Not "parallel vs sequential." The property that matters is **whether the next question depends
on the last answer**:

- **Grill** — the question is *unknown until you look*. Path-dependent; cannot be parallelised
  without destroying it. Use where the failure is *not knowing what to ask*.
- **Analysis** (`analyst`) — the question is *fixed*, the answer *contested*. Dispatch two modes in
  one message when you want independent readings of different questions.
- **Retrieval** — the answer *already exists in a corpus*. Use where the failure is *not
  having looked*.

At each stage ask which the bottleneck is. Retrieval cannot answer *"is my baseline comparable
to the published one"* — no corpus holds that, only an experiment does. Analysis cannot generate a
claim list nobody has written. Grill cannot cheaply cover twenty candidates.

## Across projects

**The graveyard transfers as a taxonomy, not a rate.** *"Claims of form X die because Y was
never controlled"* is usable on the next project immediately. A survival *rate* needs ~30
projects to beat a prior, and it is confounded — a claim killed early is the system working,
while one that survived to publication may simply never have been tested.

**Kill latency is the metric on the system.** How long a claim survived past the point its
falsifier first became runnable. Survival rate measures the claims; latency measures the
scheduler — the number that says whether the pipeline is improving *itself*.
