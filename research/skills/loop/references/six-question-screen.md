# The six-question screen — the candidate gate

**LOAD WHEN:** screening a candidate, before any measurement is spent on it (phase 1.5).

Runs on **every candidate research question**, in writing, at **step 1.5** of `loop/1-candidate.md` —
after the grill and the localizations, before the debate, and before any measurement is spent.

Its purpose is to **simulate the entire paper in one page for the cost of an afternoon**. Each of the
six answers is a prediction about how the campaign will go; each gets scored later against what
actually happened, in `.grill/prediction-ledger.md`. A screen that is never scored decays into
ceremony within two cycles.

```bash
python3 .claude/scripts/screen.py check   .grill/screen-<candidate>.json   # GATE — exit 1 blocks
python3 .claude/scripts/screen.py rank    .grill/screen-*.json             # order the survivors
python3 .claude/scripts/screen.py score   .grill/screen-<candidate>.json   # after the fact
```

## The scoring policy — the six are not equal

| | Question | Class | A NO means |
|---|---|---|---|
| **Q1** | One clear sentence? | **HARD GATE** | does not proceed |
| **Q2** | Counterintuitive? | **RANK** | proceeds, ranked below every candidate that surprises |
| **Q3** | First key figure in ~7 days? | **HARD GATE** | does not proceed *this sprint* → `.grill/next-cycle.md` |
| **Q4** | Validates across ≥3 models? | **HARD GATE** | does not proceed |
| **Q5** | Beyond probing — real mechanism? | **CEILING** | caps at a descriptive paper; allowed only if Q2 is a strong YES |
| **Q6** | Path to an extremely simple method? | **CEILING** | caps at the phenomenon paper (`COMPLETION-CRITERIA.md` fallback 1) |

**Why this split.** Q1/Q3/Q4 are cheap to check now and fatal to discover late — they are feasibility
and they gate. Q2 is not a gate because a boring-but-true phenomenon can still be worth doing; it is
what *orders* the survivors. Q5/Q6 do not gate either, because a phenomenon paper is a real paper —
but the answer decides **which paper you are writing**, and knowing that on day 3 rather than day 24
is most of the value of screening at all.

**An unanswered question is a NO.** **A "probably" is a NO.** Both rules exist because the screen's
only failure mode is being answered aspirationally.

**Re-run the screen when the candidate changes.** A rewritten Q1 sentence voids the other five answers
— they were about a different candidate. `screen.py check` fires a drift error if the sentence hash
moved and the rest were not re-dated.

---

## Q1 — Can the phenomenon be stated clearly in one sentence?

**The bar.** One sentence, **≤35 words**, containing four things: the **model**, the **measured
quantity**, the **pattern**, and the **variable it varies over**. Plus a second sentence naming what
observation would make it **false**.

**The rigorous test — reconstruction agreement.** Hand the sentence *alone*, with no surrounding
context, to **three independent readers**: two fresh ChatGPT conversations (fresh, so they cannot
anchor on each other) and `analyst`. Ask each:

> Here is one sentence describing a claimed representation phenomenon: "<sentence>".
> State (a) the exact experiment you would run to check it, (b) the plot you would produce,
> (c) the single result that would contradict it. Do not evaluate the claim.

If they reconstruct **materially different experiments**, the sentence is not clear — and it will not
be clear to a reviewer either. Rewrite and re-run; this costs minutes.

This is a **coverage check, not a vote**: you are asking whether the sentence has one reading, not
which reading is best. No quorum is involved and none should be.

**Why hard.** A phenomenon you cannot state in a sentence at screen time is one you will be unable to
state in an abstract at 09-21, when the cost of discovering that is the whole sprint.

## Q2 — Is the phenomenon at least somewhat counterintuitive?

**The bar.** The field-proxy, asked to predict the result **before seeing it**, gets it wrong — wrong
sign, wrong ordering, or confidently wrong magnitude.

**The rigorous test — blind pre-registration.** This is the loop's existing instrument
(`iterative-questioning.md`: the unit of work is *prediction error*), applied to the candidate:

1. Write the setup with the outcome **removed**. Describe the model, the measurement, the axis.
2. Ask **three independent readers** to predict the outcome **with a confidence**: two fresh ChatGPT
   conversations (ChatGPT is the field-consensus proxy — that is the grill's whole premise) and
   `analyst`. Never reveal your result; the information asymmetry is structural.
3. Record every prediction verbatim in `.grill/prediction-ledger.md` **before** you measure.

| Predictions | Reading |
|---|---|
| ≥2 of 3 predict correctly **and** confidently | **folklore** — everyone already believes this. Rank last |
| split, or correct but low-confidence | **open question** — publishable, motivates as "it was unclear whether…" |
| ≥2 of 3 predict the **wrong sign** | **counterintuitive** — rank first |

This counts *predictions*, not votes on a decision. The distinction matters: a quorum deciding what to
do removes minority views, but a quorum failing to predict your result is exactly the evidence you
want, and more independent readers only makes it stronger.

**The payoff nobody expects:** the panel's wrong prediction, quoted, *is* the paper's opening move —
*"one would expect X; across three model families we find Y."* You cannot write that sentence
honestly after the fact, which is the whole reason to collect the prediction before measuring.

**Not a gate**, because a boring-but-true phenomenon can still be worth doing. A candidate the readers
find obvious but nobody has actually measured is still a candidate — it just loses every tie.

## Q3 — Can the first key figure be produced on public assets in ~7 days?

**The bar.** A **figure spec written before the work**, containing all of:

- the **axes**, and what each curve is;
- **N per point** — seeds, samples, and which of them the error bars are over;
- the exact **models and datasets**, all public, all verified **downloadable and loadable today**
  (a 10-minute check, not an assumption — this is `research`'s environment-prep job);
- the **control overlays** that will appear on the same axes (random-init, matched-rank random —
  `phenomenon-catalogue.md`);
- the **commands** that produce it, and the **tier** (must be **T0–T2**, cached activations; a first
  figure that needs training does not fit seven days);
- **three ways it could come out**, all three informative.

That last item is the one people skip and the one that pays. A figure that is only interesting if it
comes out one particular way is a lottery ticket, not an experiment — and it is exactly the shape that
consumes a week and produces a shrug.

**Why hard.** If the spec cannot be written in twenty minutes, the figure cannot be built in seven
days; the spec is strictly easier than the work. The sprint's phase 1+2 window *is* this seven days
(`.claude/CLAUDE.md` — the 08-26 gate), so a NO here is a NO for this venue, not forever.

## Q4 — Can it be validated across ≥3 different models?

**The bar.** Name the three. They must **differ on an axis that matters** — three CLIP variants are
one model. At least two of these axes must be crossed:

- **pretraining objective** — contrastive · self-distillation · masked prediction · supervised
- **architecture family** — ViT · ConvNet · a different tokenizer or patching scheme
- **scale** — ≥4× parameter separation within a family
- **modality or data distribution** — image-text · image-only · text-only

Each checkpoint **verified loadable at screen time**. Record the identifiers, not the intentions.

**Why hard.** A phenomenon on one model is a model quirk, and three-model validation is the cheapest
thing in this entire direction — cached activations, no training. Discovering at 09-12 that the second
model does not show the effect is a sprint-ending event; discovering it at screen time costs an hour.

**The one exception, recorded not waived:** a single-model phenomenon *with an argument for why it
must be single-model* is a legitimate but harder paper. It does not proceed in this sprint; it goes to
`.grill/next-cycle.md` with the argument attached.

## Q5 — Can we go beyond probing and visualization to a real mechanism?

**The bar.** Name the **intervention** now, in advance:

- **what gets changed** — which subspace is projected out, which directions ablated, what is steered;
- **the behavioural readout** — the task metric that moves, not another representation statistic;
- **the matched-rank random control** — the same operation on random directions of equal rank;
- **the shadow test** — the result that would show your structure is a *downstream shadow* rather than
  the cause. If you cannot state it, you cannot distinguish the two, which is `grill-loop`'s central
  distinction (`missing-point-method.md`).

**A probe is a correlation.** t-SNE, a heatmap, and a probe accuracy are all descriptions. The
mechanism claim requires that intervening on the named structure *changes behaviour*, and that doing
the same thing to random structure of the same size does not.

**Ceiling, not gate.** NO → the candidate can still produce a descriptive paper, but only if Q2 is a
strong YES: a *surprising* description is publishable, an *unsurprising* one is a technical report.
Record the cap in `plan/HYPOTHESIS-REGISTER.md` when the candidate is selected.

## Q6 — Is there a plausible path to an extremely simple method?

**The bar.** Write the method as **one line of pseudocode, now**:

```
h' = h - P_bad @ h                       # project out the fragile subspace
w  = softmax(reliability(d)) * h         # reweight by per-direction reliability
use layer argmax_l stability(l)          # select instead of pooling all layers
```

Plus three things: **what it fixes** (the failure mode F), **the rough size of the effect** you would
call a success, and **the null** — what the matched-rank random version of that same operation does.
If the operation cannot be written in one line, it is not "extremely simple", and the honest answer
is NO.

**Training-free is the target.** A projection, a reweighting, a selection, a filter — these validate
across all three models of Q4 in an afternoon. A method needing a fine-tune per backbone multiplies
Q4 by the training cost and does not fit the sprint.

**Ceiling, not gate.** NO → the phenomenon paper (`COMPLETION-CRITERIA.md`, fallback 1). That is a
real ICLR contribution when the mechanism predicts something, and it is better than a method bolted on
at 09-18 because the screen promised one.

---

## Discharge — the screen did not happen unless this exists

1. `.grill/screen-<candidate>.json` written and `screen.py check` exits 0.
2. The Q2 predictions in `.grill/prediction-ledger.md`, **dated before** the first measurement.
3. The ceiling (from Q5/Q6) recorded in `plan/HYPOTHESIS-REGISTER.md` next to the candidate.
4. Every rejected candidate kept with its failing question — **state, not deletion**
   (`.claude/rules/evidence.md`). A candidate rejected on Q3 in August may pass in October.

## Scoring the screen itself

At the end of each cycle, `screen.py score` compares the six answers to what happened:
Q3's seven-day estimate against the actual days; Q4's three models against how many actually showed
the effect; Q6's one-liner against the method actually built. Systematic optimism on any one question
is a **calibration finding**, and it is the reason the screen gets sharper instead of becoming a
formality — the same logic the prediction ledger already applies to hypotheses.
