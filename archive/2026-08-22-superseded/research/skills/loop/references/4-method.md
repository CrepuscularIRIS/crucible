# Phase 4 — METHOD  ·  gate 2026-09-12

Derive one simple principle from the mechanism, implement it as close to one line as it goes, and
validate it across the three models.

## 4.1 The principle — written before the implementation

One sentence, derived from phase 3's mechanism. *"Directions differ in reliability, so weight by
reliability."* *"Late layers carry unstable variance, so select rather than pool."*

If the method exists before the sentence, the mechanism is decoration and a reviewer will say so. The
order is not a formality — it is the difference between a finding and a module.

## 4.2 Derive — `analyst`, MATH mode

```
Agent(subagent_type="analyst", prompt=BRIEF + "MODE: MATH")
```

Returns candidate formulations with derivations and the assumption each breaks under. **It does not
select — you do.** Skip it only when the operation is a one-line change to something already derived,
and say so out loud when you skip.

**The mandatory filter:** does this differ from a rescaled learning rate, a reweighted loss, or a
change of normalization? If not, say so plainly and stop. That is the line between a contribution and
a hyperparameter, and it is cheaper to admit here than in a rebuttal.

## 4.3 Implement — training-free first

```
h' = h - P_bad @ h                    # project out the fragile subspace
w  = softmax(reliability(d)) * h      # reweight by per-direction reliability
use layer argmax_l stability(l)       # select instead of pooling
```

Training-free is a schedule decision, not an aesthetic one: a projection validates across three
backbones in an afternoon, a fine-tune per backbone does not fit the remaining weeks.

YOU write the code. Staged: **SMOKE** (does it run, do gradients flow, any NaN — seconds) → **small
scale** (any signal at all — minutes) → **full** (only if both pass).

If a T4 run is needed at all:

```bash
CUDA_VISIBLE_DEVICES=1 nohup python train.py --config <cfg> > .grill/train-<name>.log 2>&1 &
echo $! > .grill/train-<name>.pid
```

GPU1 for single-GPU work. Never migrate a running job. WIP limit: **one** T4 build at a time; T0–T3
probes are unbounded. **Never idle while it runs** — `loop/0-orient.md` has the in-flight agenda.

## 4.4 The controls that decide whether it is real

| Control | Without it |
|---|---|
| **matched-rank random** — same operation, k random directions | the result is about k, not about your structure |
| **matched-effective-LR** — for anything that gates or scales an update | the honest description is "we retuned a hyperparameter" |
| **shuffled** — identical modulation values, permuted | the same, with extra steps |

Report **per-seed raw values**. Score against the operative margin `max(declared, realized MDE)`. Arms
share seeds, checkpoint policy, preprocessing, weights and budget — a difference in any of those is
the result you are actually measuring.

## 4.5 Validate

**≥3 models crossing ≥2 axes × ≥2 datasets, ID and OOD.** These are Q4's models, verified loadable in
phase 1, which is why this step is cheap now.

Then the **failure boundary**: where the method stops working, measured. A result with no stated
boundary invites the reviewer to find one, and they will pick the worst case.

## 4.6 Before the numbers move any claim — Grok

```
Agent(subagent_type="grok-verifier", prompt="<diff · claim · intended design · eval command ·
results with seed counts · controls already run>")
```

This is the deploy-time review, and the packet must include **the intended design** — a reviewer
cannot flag a missing control if it was never told what the design was supposed to be. A REFUTED
blocks advance. You fix it, not the reviewer; otherwise the next review is no longer independent.

## Exit

Principle stated before the method · method implemented · all three controls run · ≥3 models × ≥2
datasets, ID and OOD · failure boundary measured · Grok clean. That is **L2 + L3**.

**Next:** `loop/5-verify.md`.
