# Phase 2 — MEASURE  ·  gate 2026-08-26

Produce the **first key figure** and decide whether the phenomenon is real. Ends by freezing
`TARGET.md`, which is the moment the campaign acquires a contract.

**LOAD:** `references/execution-framework.md` if anything reaches T3.

## 2.1 Extract, at T0–T2

Cached activations. No training in this phase — if the figure needs a fine-tune, Q3 of the screen was
answered wrong and the candidate should not have reached here.

**Freeze the preprocessing before the first number, and write it into `TARGET.md`:** centering ·
normalization · pooling (CLS / mean / token) · batch composition · rank or eigenvalue threshold. A
spectrum without its preprocessing is unreproducible, and two arms preprocessed differently are not
comparable no matter what the plot looks like.

YOU write all the extraction code.

## 2.2 The four controls — before believing anything

This paper class dies from artifacts far more often than from wrong conclusions. All four, every time:

1. **Random-init.** Does the phenomenon appear in a network that learned nothing? Layer curves,
   anisotropy, near-orthogonality and heavy-tailed spectra all do. If yours does too, it is a property
   of the architecture and the data dimension, not of learning.
2. **Matched-rank random.** Any claim of the form *"these k directions are special"* needs the same
   operation on k random directions. Without it the claim is about k.
3. **Preprocessing sensitivity.** Re-measure under ±1 change of centering, pooling, threshold. A
   result that moves is a finding about your pipeline.
4. **Causal, not correlational.** A probe is a correlation. This one can wait for phase 3, but name it
   now.

A candidate that fails a control becomes `ARTIFACT` in the register — **not** `REFUTED`. Record which
control killed it; that is what stops the next candidate dying the same way.

## 2.3 Systematicity

**≥3 seeds × ≥3 models crossing ≥2 axes × ≥2 datasets**, monotone in a variable you control (depth ·
scale · severity · k). The three models are the ones Q4 named and `research` verified loadable.

One seed on one model is an anecdote. Three variants of one model are one model.

## 2.4 The first key figure

Exactly the figure Q3 specced: the axes, the N per point, the curves, **and the control overlays on
the same axes**. A control in an appendix is a control nobody reads.

Check it against Q3's three predicted outcomes. If the result is a fourth thing nobody wrote down,
that is interesting — triage it before celebrating (`references/research-judgment.md` §4: metric
artifact → bug → noise → known → real; most surprises die on the first three rungs for minutes of
work).

## 2.5 Name F — before measuring it

The failure mode the phenomenon **predicts**. Named now, measured in phase 3. Naming it after seeing
it is not a prediction, and a reviewer can tell.

Write the prediction with a band into `.grill/prediction-ledger.md`.

## 2.6 Freeze TARGET.md

Fill every field: model · phenomenon · measurement and preprocessing · controls · systematicity ·
predicted F · protocol · baselines · ablations owed. Then stamp the freeze record.

**From this moment: reframe the EXPLANATION, never the TARGET.** A better benchmark, a cleaner metric,
a stronger framing — all correct, all **queued to `.grill/next-cycle.md`**, none of them a reason to
reopen. Being right is not a licence to reopen; wrongly deferring a good idea costs one cycle, wrongly
reopening costs the experiment.

Editing a frozen `TARGET.md` is an escalation to the user.

## Exit

First figure exists · four controls run · systematic on ≥3 models · F named and unmeasured ·
`TARGET.md` frozen. That is **L0** in `plan/COMPLETION-CRITERIA.md`.

**If the phenomenon died here:** it was cheap, which was the point. Move it to `ARTIFACT` with the
failing control, promote the next screened candidate, and re-enter `loop/1-candidate.md` at 1.5. If
*every* candidate died the same way, that convergence is itself the finding — see the artifact-paper
fallback in `COMPLETION-CRITERIA.md`.

**Next:** `loop/3-mechanism.md`.
