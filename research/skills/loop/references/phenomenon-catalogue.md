# Phenomenon catalogue — the entry points for a representation-geometry paper

**LOAD WHEN:** choosing or proposing a candidate phenomenon (phase 1.1).

Used at **step 1.1** of `loop/1-candidate.md`. The question is never *"what model should I build?"* but
*"what strange thing is true of this representation?"*

Every row below is a **question with a measurement attached**. A phenomenon with no measurement is a
vibe; a measurement with no control is an artifact. Both columns are mandatory before the phenomenon
enters `plan/HYPOTHESIS-REGISTER.md`.

Almost all of this is **T0–T2 work on cached activations** — no training. That is why this direction
fits a five-week sprint, and it is the reason to prefer it over anything requiring a fine-tune.

---

## The ten

**1 · Layer-wise information distribution.** Why does information sit differently across depth?
*Measure:* per-layer linear probe accuracy · CKA between adjacent layers · effective rank per layer ·
per-layer intrinsic dimension. *Control:* the same curve on a **random-init** network — depth-wise
structure appears without any training, and untrained curves are rarely flat. *T1.*

**2 · Stable vs fragile directions.** Some feature directions survive perturbation; others collapse.
*Measure:* direction-wise variance under seed / augmentation / input-noise resampling; cosine drift of
top singular vectors across checkpoints or seeds. *Control:* fragility must not be a monotone function
of singular value — if fragile just means *small*, there is no phenomenon. *T1.*

**3 · Does fine-tuning reshape everything, or a small subspace?** *Measure:* rank and energy of
`W_ft − W_pre` and of `h_ft − h_pre`; fraction of representation change captured by the top-k
directions. *Control:* compare against the drift from **a different random seed of the same
fine-tune** — that is the noise floor for "changed". *T1–T2.*

**4 · When accuracy drops, did the information leave?** *Measure:* probe the degraded representation
for the label. High probe accuracy + low task accuracy = the information is present but unused.
*Control:* probe capacity — a strong enough probe recovers labels from nearly anything, including
random features. Report the **random-feature probe baseline** or the result means nothing. *T2.*

**5 · Do larger models compress harder?** *Measure:* effective rank / participation ratio /
spectral decay exponent across a model-size family, at matched data and matched layer-depth fraction.
*Control:* normalize for width — raw rank grows with dimension; the claim must be about *relative*
compression. *T1.*

**6 · ID → OOD: what actually changes?** Decompose the shift into **magnitude · direction · rank ·
spectrum · class geometry** and report which moves first as severity increases.
*Measure:* norm shift · mean cosine drift · effective-rank change · inter/intra-class distance ratio ·
prototype displacement, all as a function of severity 0…5. *Control:* a shift that moves *everything*
proportionally is a scaling artifact — show the components separate. *T1–T2.*

**7 · Probe-extractable ≠ model-usable.** The sharpest question in the list, and the most defensible
paper. *Measure:* probe recovers attribute A, then **causally intervene** — ablate or project out A's
subspace and measure the behavioural change. *Control:* project out a **random subspace of equal
rank**; if behaviour degrades equally, you have measured dimensionality, not A. *T2–T3.*

**8 · Do different tasks occupy different subspaces?** *Measure:* principal angles between task
subspaces · overlap of top-k task-gradient directions · cross-task probe transfer.
*Control:* two random subspaces of the same rank in the same ambient dimension are near-orthogonal by
default. Report that baseline overlap or the finding is geometry-of-high-dimensions, not of the model.
*T1–T2.*

**9 · How much of the representation is redundant?** *Measure:* accuracy retained after projecting to
the top-k directions, sweeping k · reconstruction error vs task error. *Control:* random-k projection
at matched k. *T1.*

**10 · Are concepts concentrated in few directions / dims / layers?** *Measure:* sparsity of the
concept-relevant direction set; accuracy after ablating the top-m dimensions for that concept.
*Control:* ablate m random dimensions — anisotropy alone makes some dimensions matter more. *T1–T2.*

---

## The four controls that decide whether the phenomenon survives review

This paper class dies from artifacts far more often than from wrong conclusions. Run all four:

1. **Random-init / untrained control.** Does the phenomenon appear in a network that learned nothing?
   Layer curves, anisotropy, near-orthogonality and heavy-tailed spectra all do. If yours does too, it
   is a property of the architecture and the data dimension, not of learning.
2. **Matched-rank random control.** Any claim of the form *"these k directions are special"* needs the
   same operation on k random directions. Without it, the claim is about k.
3. **Measurement hygiene, stated explicitly.** Centering, normalization, pooling (CLS vs mean vs
   token), batch composition, and the rank threshold all change spectra. Fix them in `TARGET.md` and
   report them; a spectrum without its preprocessing is unreproducible.
4. **Causal, not correlational.** A probe finding is a correlation. Intervene — ablate, project out,
   or steer — and measure the behavioural consequence. `grill-loop`'s root-vs-shadow distinction is
   exactly this: a phenomenon that vanishes under intervention was a downstream shadow.

## Systematicity — what "not accidental" requires

A phenomenon is systematic when it holds across **≥3 seeds · ≥3 models crossing ≥2 axes · ≥2 datasets**, and moves
**monotonically** with a variable you control (depth, scale, severity, k). One model, one dataset, one
seed is an anecdote, and phase 2 does not close on an anecdote.
