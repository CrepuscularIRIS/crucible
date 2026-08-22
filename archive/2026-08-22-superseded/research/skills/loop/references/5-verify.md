# Phase 5 — VERIFY + WRITE  ·  gate 2026-09-21

Resolve every claim against its evidence, then write the paper the evidence actually supports.

**LOAD:** `references/claim-ledger.md`.

## 5.1 Audit the numbers first

A kill justified by a corrupted number is worse than no kill, and it is unrecoverable — the claim is
already dead and the time already reallocated. Before anything moves:

- Is the ground truth real, or reconstructed from the thing being evaluated?
- Is any score normalized against something that moved between arms?
- Does every reported number have a file behind it, with a seed count?
- Does the eval command in `TARGET.md` still produce the number in the draft?

## 5.2 Resolve the register

Every claim its prereg rule names, resolved with evidence:

- **A kill requires a result artifact on disk** carrying `experiment_id · metric · value · delta ·
  seed_count`. Prose cannot kill a claim.
- **Kill only on dimensions the evidence can observe.** A falsifier that measured probe accuracy
  cannot kill a claim about behaviour.
- **Three things downgrade rather than kill** — seeds below the floor, a missing declared artifact, a
  delta inside the falsifier's own MDE. The claim becomes `CONTESTED`, not `REFUTED`. Sub-standard
  evidence is still information; it just is not a death.
- **A dying primary claim moves the thesis.** If the phenomenon is scoped, the paper's spine changed
  and the abstract is now wrong. Fix it here, not in the last 48 hours.

Ask `analyst` (AGGREGATE mode) the two questions worth a fresh reading: *did the evidence actually
observe the dimension this kill rests on?* and *does each surviving claim still say what the evidence
supports?* A claim that survived an experiment which could have killed it is either strong or
untested, and this is where you find out which.

## 5.3 Score every prediction

Close `.grill/prediction-ledger.md` on the whole campaign — each predicted band against each observed
value, and the class of prediction you were systematically wrong about. Also run the screen's
retrospective:

```bash
python3 .claude/scripts/screen.py score .grill/screen-<candidate>.json
```

Q3's seven-day estimate against actual days; Q4's three models against how many showed the effect;
Q6's one-liner against what got built. Systematic optimism on any one question is a calibration
finding, and it is the only thing that keeps the screen from decaying into ceremony.

## 5.4 Write what the evidence supports

The spine, in order: **the phenomenon · why it is not an artifact · the mechanism · the prediction it
made and that landed · the method that follows from it · where it stops working.**

Three things carry disproportionate weight in this paper class:

1. **The controls, in the main body.** Random-init and matched-rank random are not appendix material —
   they are the reason the reviewer believes the first figure. Put them on the same axes.
2. **The wrong prediction, quoted.** *"One would expect X"* — from Q2's blind panel, collected before
   you measured. It is the honest version of a motivating sentence and you can only have it because
   you collected it early.
3. **The failure boundary, stated by you.** An unstated boundary is one the reviewer gets to choose.

State plainly what you could not establish. An unstated gap is what costs a campaign three cycles
later, or one desk reject now.

## 5.5 The fallbacks — decide at the gate, not at 09-23

If the full arc did not close, two real papers are already paid for:

- **Phenomenon paper** (L0 + L1): systematic phenomenon, geometric mechanism, predicted failure mode
  confirmed, candidate explanations that failed. A mechanism that predicts is a contribution with no
  method attached.
- **Artifact paper** (a control killed it): *"this widely reported geometric property is present in
  random-init networks / is an artifact of pooling"*. Publishable, cheap, and the evidence already
  exists because you ran the controls. Same rigour required — it is not a consolation prize.

A characterized negative is a product when it is **general** (a property of the method class, not of
one implementation) and **explained** (a mechanism for why, not a null number).

## 5.6 Capitalize

A cycle is not done until something made the next one cheaper. Before closing: the register updated
with every final state, the killed directions recorded so they are not re-proposed, the preprocessing
and extraction code left runnable, and `.grill/STATE.md` written for whoever opens the next session.

## Exit

**L4** in `plan/COMPLETION-CRITERIA.md`, or the deadline with the highest level actually cleared.

**Next:** submit, then `loop/1-candidate.md` for the ICML 2027 upgrade — same direction, one level
deeper, per `plan.md`.
