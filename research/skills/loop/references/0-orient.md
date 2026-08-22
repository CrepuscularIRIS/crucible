# Phase 0 — ORIENT

Runs at every session start and after every compaction. Costs two minutes. Skipping it is how a
session spends an hour re-deriving what is already written down.

## Read, in this order

```bash
cat .grill/STATE.md                    # phase · candidate · what is owed · next action
cat plan/HYPOTHESIS-REGISTER.md        # what is live, artifact, refuted, supported
tail -40 .grill/prediction-ledger.md   # calibration — which of your predictions have been wrong
```

`STATE.md` names the phase. Load **that one phase file** from `loop/`. Not the others.

## Then re-grill the thesis — before resuming anything

Inherited framings decay silently and nothing else checks them. One D-S-R pass over the current
candidate's Q1 sentence:

- **DECOMPOSE** — what independently-checkable pieces is it made of? Which weld is unexamined?
- **SIMPLIFY** — what is the weakest assumption it actually needs?
- **RECONSTRUCT** — what is the best claim the surviving pieces support?

If the reconstruction differs from what `STATE.md` says, **that is the finding**: update the sentence,
and note that the six-question screen's other five answers were about a different candidate
(`references/six-question-screen.md` — the drift rule).

Terminate the pass in one of: a testable Δ · a recorded constraint · an explicit *"no change"*.

## If STATE.md is missing or stale

Rebuild it before anything else. The template:

```markdown
# STATE — <date>

PHASE: <0 ORIENT | 1 CANDIDATE | 2 MEASURE | 3 MECHANISM | 4 METHOD | 5 VERIFY>
GATE:  <the date this phase must close>  ·  days left: <n>

CANDIDATE: <the Q1 sentence, or `none selected`>
SCREEN:    <not screened | BLOCKED on Q<n> | passed — ceiling <L>>

LOAD NOW:
  - loop/<phase file>
  - <at most two references, by their LOAD WHEN trigger>

OWED:
  - [ ] <the specific next action, small enough to start in two minutes>

IN FLIGHT: <running job + log path, or `nothing`>
LAST DECISION: <what was decided, and why — one line>
```

## While a run is in flight

Training is never a terminal phase. A run in flight is the campaign's largest block of free reasoning
time, and re-arming a heartbeat without doing anything is the failure this note exists to prevent.

Re-enter any earlier phase — the agents and the browser cost the GPU nothing:

| Re-enter | Why it is free |
|---|---|
| the **grill** (ChatGPT) | a fresh conversation; the running job cannot be changed anyway |
| **`analyst`** on the next candidate | pure reasoning, no GPU |
| **`research`** on the corpus | disk and CPU only |
| **screening** the next candidate | it is a document |

**Pre-mortem the running experiment first** — it is only valid *before* the result lands. Write down
what you expect and what each outcome would mean, into `.grill/prediction-ledger.md`. Afterwards it is
not a prediction.

## Exit

Phase named, one phase file loaded, thesis re-grilled, `STATE.md` current.

**Next:** whatever `STATE.md` says. If it says `1 CANDIDATE`, load `loop/1-candidate.md`.
