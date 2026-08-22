# Phase 3 — MECHANISM  ·  gate 2026-09-02

Explain the phenomenon, prove the explanation by intervention, and land the predicted failure mode.
This is the phase that separates a paper from a measurement report.

**LOAD:** `references/missing-point-method.md`. Add `references/research-judgment.md` if a surprise
lands.

## 3.1 The candidate explanation

A geometric account: spectrum · subspace · principal angles · class geometry · layer-wise structure.
It must say **why** the phenomenon holds, not restate that it does. A mechanism that only re-describes
the figure is a caption.

Dispatch `analyst` in MECHANISM mode with everything inline:

```
Agent(subagent_type="analyst", prompt=BRIEF + "MODE: MECHANISM")
```

What comes back that matters: **root or shadow** · the **problem class** · the **repair lever, named
separately from the cause** · and the **mundane alternative first**. In representation geometry the
mundane alternative is usually anisotropy, ambient dimensionality, or normalization in a costume —
measure it and exclude it rather than arguing past it.

## 3.2 Root vs shadow — the intervention

**A probe result is a correlation.** The mechanism claim requires that intervening on the named
structure changes behaviour, and that doing the same thing to random structure of the same size
does not.

| | What you do | What it shows |
|---|---|---|
| **intervene** | ablate / project out / steer the named structure | behaviour moves → candidate cause |
| **matched-rank random** | the same operation on k random directions | behaviour moves equally → you measured k, not the structure |
| **shadow test** | intervene on the *downstream* correlate instead | behaviour moves → your structure was the shadow |

A structure that vanishes under intervention was never the root. Say so and go back to 3.1 — this is
the loop working, and it is far cheaper here than at 09-18.

## 3.3 Prereg the decision rule — before the F measurement

A test tells you a number; a **rule** tells you which claims die.

```json
{"if": "F delta < 1.0pp at severity 5", "threshold": 1.0,
 "kills": ["M1"], "scopes": ["P1"], "cancels": ["the phase-4 method arm"]}
```

`cancels` is where time is actually saved — the work that becomes unnecessary the moment a claim dies.

**Branch the result space first.** Write four to six outcomes — likely, worst, wild card, contrarian —
and **one rule per branch**. A prereg with a single rule has only imagined the outcome it expects, and
the unwritten branch is the one that gets adjudicated after the fact.

Dispatch `analyst` in FALSIFIER mode on the counterfactual: *if the result is X, does M1 really die,
or only narrow?* A single perspective under-kills its own hypothesis, which is exactly why this is
asked of a different model than the one that formed the belief.

State **severity** in one sentence before running: would this test have passed even if the mechanism
were false? If yes it is ceremonial, and a ceremonial test is worse than none because it produces
false confidence at full cost.

## 3.4 Measure F

The failure mode named in phase 2, now measured against the band written before it.

- **Inside the band** — the mechanism predicts. This is the strongest evidence the paper will have.
- **Outside the band** — the mechanism is wrong or incomplete. Record it as a finding in
  `.grill/prediction-ledger.md`, do not quietly rescope. A win outside the band is an *unexplained*
  win, and unexplained wins do not replicate.
- **Wrong sign** — go back to 3.1 with a sharper constraint: whatever the root is, it must also
  explain this.

## 3.5 Score the prediction

```markdown
## OUTCOME — <date> — <mechanism name>
predicted: <band, written before>
observed:  <value>
error:     <inside / outside, by how much>
lesson:    <which class of prediction you are systematically wrong about>
```

The ledger is the campaign's calibration instrument. Skipping this makes every later estimate a guess.

## Exit

The mechanism explains P · an intervention moves behaviour where matched-rank random does not · the
predicted F lands inside its band · the mundane alternatives are measured and excluded. That is **L1**.

**Next:** `loop/4-method.md`.
