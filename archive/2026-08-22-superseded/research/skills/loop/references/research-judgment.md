# Research Judgment — the layer above method (2026-07-25)

**LOAD WHEN:** a surprise landed, or the problem class must be named.

> The other references answer *how to interrogate*, *how to import a mechanism*, *how to find a causal root*,
> and *what an experiment costs*. They all assume the problem is given and the question is how to attack it.
> This doc covers what actually separates competent research from good research: **choosing the problem,
> knowing whether a passed test means anything, triaging surprise, and knowing when to stop.**
>
> These are **decision principles, not a checklist.** Hold them as judgment and apply the ones that bite.
> Running all nine sections mechanically on every cycle is itself a failure mode.

## 1. Problem selection — the highest-leverage act

Most research quality is determined before any experiment runs. Three tests, in order:

**The importance test.** If this succeeds, what changes? Honest answers ranked:
- *"A number moves."* → benchmark exercise. Legitimate, but it is not a contribution by itself.
- *"A standing assumption is falsified."* → contribution.
- *"A class of methods becomes unnecessary."* → strong contribution.
- *"The problem dissolves."* → the best outcome available, and the most commonly missed.

**The newly-tractable test.** Important × intractable = famous unsolved problem, don't. Tractable ×
unimportant = busywork. The sweet spot is **newly tractable**: an important problem that a *new instrument*
just made attackable. When you build a diagnostic, immediately ask what previously-abandoned question it
reopens — that is where the cheap wins live (this is generator G6 with teeth).

**The problem-class test.** Classify before attacking, because misclassification is the most expensive early
error:

| Class | Signature | What fails if you misread it |
|---|---|---|
| **Capacity** | bigger model fixes it; the small one can't represent the target at all | you burn cycles tuning couplings that were never the constraint |
| **Identifiability** | the information is present but not recoverable by this readout | you add capacity that has nothing new to read |
| **Optimization** | the solution is representable and reachable but not found | you redesign an architecture that only needed a schedule |
| **Measurement** | the metric doesn't track the property | every "gain" is an artifact and nothing replicates |
| **Specification** | the objective rewards the wrong thing | you get reward hacking and call it a win |

A campaign that spent three cycles on coupling parameters for what was a *capacity* problem lost those cycles
to a five-minute classification it never made. State the class explicitly, and state what would change it.

**Reformulation beats solution.** Before committing, spend one deliberate pass asking: *is there an adjacent
formulation in which this problem does not arise?* The strongest result this campaign produced came from
exactly that move — "recover the missing information" reformulated into "remove an unnecessary dependency."
Reformulation is cheap, high-variance, and almost never attempted; budget one honest attempt per cycle.

## 2. Severity — the sharpest instrument in the kit

**A hypothesis passing a test means nothing unless the test would probably have FAILED had the hypothesis
been false.** This is the single most useful idea in experimental epistemology (Mayo), and it is distinct
from the outcome table:

- The **outcome table** asks: *does every result kill something?* → tests informativeness.
- **Severity** asks: *if H were false, how probable is it this test still passes?* → tests discriminating power.

A test can be perfectly informative on paper and still ceremonial in practice. Before every T3+ test, state
the severity in one sentence. If the answer is "it would probably pass anyway," redesign it.

**Severity boosters, cheapest first:**
- A **negative control that should fail** — if it also "succeeds," your pipeline measures nothing. (The
  random-subspace control that validated the Loop-2 win is exactly this, and it is what made that result
  worth believing.)
- **Adversarial parameter choice** — evaluate at the setting most likely to break your claim, not the one
  that showcases it.
- **Pre-registered direction and magnitude** — a claim that predicts only "something will change" is unfalsifiable.
- **A matched control that differs in one factor** — the factor you claim is load-bearing.

Severity is also the honest reply to a large effect: a big number from a low-severity test is weaker evidence
than a small number from a high-severity one.

## 3. What makes one explanation better than another

Abduction needs criteria or it degenerates into "the story I thought of first." Rank candidate explanations on:

1. **Consilience** — explains several *independent* anomalies, not one anomaly several ways.
2. **Independent testability** — makes a NEW prediction outside the data that generated it. This is the
   criterion that separates an explanation from a post-hoc narrative; weight it highest.
3. **Simplicity** — fewer free parameters, less special pleading. Count the escape hatches.
4. **Mechanism depth** — names a *process*, not a correlation. "X is associated with Y" is not an explanation.
5. **Fertility** — opens new questions and suggests new instruments.

**The killer question: what does this explanation FORBID?** An explanation that forbids nothing explains
nothing. If you cannot name an observation that would be impossible under it, you have a description.

## 4. Anomaly triage — earn the right to chase it

Surprise is the raw material, but most surprises are junk. Climb this ladder cheapest-first, and **never
promote an anomaly past a rung it has not cleared:**

1. **Metric artifact** — does it survive a *continuous* metric, a different aggregation, a different split?
   (Two-regime "findings" die here more often than anywhere else.)
2. **Implementation bug** — does it survive a targeted unit test of the data/eval path? A single unit test
   caught a train/val preprocessing mis-edit in this campaign before it cost a 3-hour run.
3. **Statistical noise** — seed band, bootstrap CI over per-item deltas. Cheapest form first: bootstrap
   existing checkpoints before retraining anything.
4. **Known phenomenon** — a literature check before claiming novelty. Being second is not a finding.
5. **Real** — only now is it a missing-point candidate.

Rungs 1–3 are usually eval-only and cost minutes. The discipline is not "be skeptical"; it is *"spend the
ten cheap minutes before the ten expensive hours."*

## 5. Explore vs exploit — and the regime switch nobody makes

A monotone hunt→fix→hunt loop silently converges to a local optimum. Watch for the regime and switch
deliberately:

- **Rich vein → EXPLOIT.** Recent wins share a mechanism family. Drill: ablate the family, find the *general
  law* behind the individual wins, and try to state the one principle that predicts all of them. A family
  with a stated law is a paper section; three unrelated wins are a list.
- **Exhausted vein → EXPLORE.** Two consecutive cycles where the best candidate's predicted Δ sits inside
  the noise band, or where the constraint set stopped growing. Jump: fresh grill, distant fields, and
  deliberately re-run the RECAST from scratch rather than reusing the old one.
- **Forced exploration quota.** Even inside a rich vein, spend roughly one cycle in four on a distant
  direction. The justification is not expected value — it is that a portfolio of near-identical wins is a
  weaker paper than a portfolio showing the mechanism holds across categories.

## 6. Negative results are products, not just pruned lessons

A *characterized* negative is a contribution and this campaign keeps generating them and filing them as
graveyard entries. Promote a negative to a **result** when it clears two bars:

- **General** — it is a property of the method class, not of one implementation. ("Adapter-class cannot
  manufacture the capacity the backbone lacks" — supported by a capacity ladder — is general. "Our adapter
  underperformed" is not.)
- **Explained** — there is a mechanism for *why*, not just a null number.

Every pruned node deserves one pass against this bar before it is buried. For the publication goal
specifically, the "what does not work and why" section is where a scoping claim lives, and it is usually
cheaper to write than another win — you already paid for the evidence.

## 7. Break your own model

The fitted parametric model is the campaign's best asset and its most likely source of self-deception.

- Each cycle, spend **one cheap probe designed to break the current model**, not to confirm it. Confirmation
  is free and worthless; the loop already produces plenty of it.
- Track the model's **scope of validity**: which regime was it fitted in? Any claim outside that regime is
  extrapolation and must be labelled as such.
- **Suspicion trigger:** if the model has absorbed three or more results without modification, ask what
  observation *could* refute it. If nothing could, it has become unfalsifiable — a story, not a model.

**The framing is under test too, not just the mechanism.** Every running experiment embodies a framing of
the problem, and that framing is an untested hypothesis carrying far more weight than the mechanism inside
it. A wrong mechanism costs one cycle; a wrong framing costs every cycle built on it. First intuitions about
framing are frequently not the best available, and they are the least revisited part of a campaign precisely
because everything downstream depends on them.

The cheapest time to attack a framing is **while an experiment on it is already running** — the conclusion
costs nothing to reach, because you cannot act on it until the run finishes anyway. Re-run the RECAST cold,
and ask what would have to be true for the whole framing to be wrong. See the GPU-busy agenda in
`../SKILL.md` step 8 for the operational form.

**Pre-mortem, before the result lands.** Ask, while the run is still in flight: *"it came back null — why?"*
and *"it worked — what is the most likely mundane explanation other than my mechanism?"* Written afterwards,
these answers are contaminated by the outcome; written beforehand they are a genuine prior, they name the
controls the analysis will need, and they make hindsight rationalization visible when it happens. Timestamp
them.

## 8. Construct validity — the question proxy calibration cannot answer

Proxy calibration (Spearman ρ against the full metric) answers *"does the cheap measure track the expensive
one."* It does **not** answer *"does the expensive one measure the thing we care about."* Ask once per
campaign, and again whenever the headline metric moves in a way that feels too easy:

- What would a **high score with no real improvement** look like? That description is your reward-hacking
  surface — write it down explicitly and check results against it.
- What **real improvement would this metric fail to reward**? That gap is where genuine contributions get
  discarded as null.

## 9. Three stoppings, three different triggers

Currently easy to conflate; keep them distinct:

| Stop | Trigger |
|---|---|
| **Stop the experiment** | Evidence crossed the pre-registered threshold. Sequential, not "when curiosity is satisfied" — most experiments are over-run long after the verdict was in. |
| **Stop the hypothesis** | It is falsified, OR the remaining uncertainty no longer changes any decision you would make. Residual curiosity is not a reason to continue. |
| **Stop the vein** | Constraint-yield per GPU-hour over the last k cycles fell below the campaign average. Switch regime (§5) rather than pushing harder. |

The sunk-cost guard, applied after every result: **"knowing what I know now, would I start this today?"**
If no, stop regardless of how much is already invested.


---

## The bar: a principle, not a heuristic

> **A heuristic tells you what to do. A principle tells you why anything works.**

A candidate clears the bar only if all five hold:

1. It names an **OBJECT you can measure**, not a procedure you follow.
2. **Existing heuristics fall out of it** as special cases or limits.
3. It **predicts where they fail**, checkably, in our protocol.
4. It **survives deletion of the domain words** — state it without "depth", "RGB", "segmentation".
   If it stops meaning anything, it is a recipe in a theory's clothes.
5. It **changes what someone MEASURES**, not just what they train.

Beating a baseline by a fraction of a point does not clear this. Explaining *why the baseline works
at all* does.

**And the rule the 2026-08-10 audit earned:** **measure both quantities with the same code before
comparing them.** Every instrumentation defect that audit found — cross-run transport, unit
transport between protocols, threshold specification, the range confound — was a comparison across
a changed measurement.
