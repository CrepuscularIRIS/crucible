# Campaign questioning — interrogating ourselves (2026-07-30)

**LOAD WHEN:** at a phase boundary, to discharge S1-S6.

> `iterative-questioning.md` interrogates **the field**, through ChatGPT as a proxy for the
> consensus — G1–G8 hunt where the *literature* is thin. This file interrogates **the
> campaign**: our own premises, our own decisions, our own contradictions. Same technique,
> opposite target. Do not merge them; the good one works because its target is fixed.

The other file already names this gap and leaves it undone: *"the sharpest interrogation target
is often your own reasoning… an unexamined orchestrator prior is the most expensive error in the
loop, because nothing downstream checks it."* That is one paragraph of exhortation beside two
hundred lines of mechanism. This file is the mechanism.

## The one boundary that keeps this engineering, not philosophy

> **Reasoning of any kind — Socratic, analytic, adversarial — may DEMOTE a claim.
> Only a measurement may kill one.**

In Plato a definition dies when it conflicts with intuition: verbal adjudication is the terminal
court. In research the terminal court is measurement. We already enforce this for mathematics
(`references/stack.md`); it generalises to every form of
a-priori reasoning, and it is what stops a fluent questioner from becoming a fast, articulate
way to eliminate good work. S2 therefore never blocks: it reports
adjudications, never verdicts.

## What actually transfers

Four structures are portable. Two were already here under other names — which is the useful
finding, because it means the work is naming the set, not importing a tradition.

| Socratic structure | Status |
|---|---|
| **Definition by criterion, not example** — Cephalus's "justice is repaying debts" dies to one counterexample; Socrates demands a criterion surviving every case | present — construct = **computable index**, five-minute test |
| **Counterexample as the engine** | present — the falsifier |
| **Elenchus from the interlocutor's own commitments** | **S2** — a read pass over the register |
| **Hypothesis ladder** (*Phaedo* 100a) | **S4** — re-point the falsifier at what it rests on |

**Why the elenchus is the real gap.** Its force is not that Socrates objects — it is *where the
premises come from*. He secures assent to Q and R from the interlocutor's own admissions, then
shows Q ∧ R → ¬P. You cannot escape by saying "you assume something different," because they
are your assumptions. Every other check in this loop measures a claim against an **external**
standard: beats baseline, survives Grok, adequately powered. Nothing asked whether a claim
contradicts what we ourselves already wrote down — and our commitments are all machine-readable
(`claims.json`, the decision rules, the mechanism bank's `needs`). It is a script, not a stance.

**Why the ladder is not a nicety.** *Phaedo*: when the hypothesis itself is attacked, do not
defend it in place — posit the higher hypothesis it follows from and test **that**. `depends_on`
already runs downward (a claim whose parent is dead cannot stand). Upward was missing, and it is
usually the **cheaper kill**: ancestors are more general, so their falsifiers are more often
free, and one kill takes every descendant with it. It attacks kill-latency directly.

**What does not transfer.** The dialogue form adds tokens, not rigour. Aporia-as-a-goal is
dangerous: a questioner optimising for impasse kills good directions — the scar where over-
gating emptied a whole candidate pool. And Plato has no stopping rule, which is why the
dialogues run forever; ours is below.

## The six types — coverage, not a script

Predefined **types**; free content, order, depth and wording. Predefining the *sequence* would
destroy the mechanism — questioning is path-dependent, which is exactly why GRILL cannot be
parallelised, and a fixed sequence degrades into a checklist that gets satisfied rather than
used. But wholly free questioning puts variance in the worst place: the questions that matter
most are the boring ones. The post-mortem failures were never *insufficient depth* — they were
**categories nobody thought to question**.

| | Type | The question | Discharges as |
|---|---|---|---|
| **S1** | Hidden premise | *What must already be true for this to work, that we never wrote down?* | a new claim, usually `kind: protocol` |
| **S2** | Own-commitment contradiction | *Does this contradict something we already committed to?* | a read pass over the register |
| **S3** | Definition | *Could two people compute this and agree?* | a computable index, or a rewrite |
| **S4** | Ladder | *Don't defend it — name what it rests on. Is that cheaper to test?* | a re-pointed falsifier |
| **S5** | Boundary | *What is the minimal case where this fails?* | the falsifier itself |
| **S6** | Provenance | *Measured, derived, or assumed?* | derived ⇒ `kind: analytic` + its own falsifier |

S3, S5 and S6 already existed as the definition-first ruling, G4, and the PROVENANCE pressure
move. Naming them as a closed set is what makes coverage checkable.

## The discharge rule — the stopping condition Plato lacks

> A question is **discharged** when it produces one of: **(a)** a claim edit, **(b)** a
> falsifier, or **(c)** an explicit *"no change, because —"*.
> **A stage may not exit with an undischarged type.**

And the guard that keeps every question decision-bearing, extending the existing heuristic
(*two believable answers leading to different actions*):

> **A question that cannot name what would change if answered is not asked.**

Most types discharge in a single line. The expensive one, S2, is a script run rather than a
reasoning pass — which is what keeps distributed questioning from stalling the loop. Budget by
*coverage*, never by quota: six discharges, however short, beat three essays.

## Questioning and convergence are BOTH distributed

The tempting architecture is questioning everywhere and one big MoA convergence at the end.
Resist it, for two reasons.

MoA was confined to convergence once already, and it was narrow **because the pipeline had no
contestable objects** — claims fixed that, and MoA now sits at six seams. Re-terminalising it
recreates the original defect.

Worse, a campaign-terminal aggregator decides **after the budget is spent**. That is precisely
the failure this whole line of work came from: claims downgraded by hand, during writing, at
maximum cost.

So the pairing is the rule:

> **Every stage that opens questions closes them before it exits.** An open question crossing a
> stage boundary is *debt*, and accumulated debt is what makes a terminal aggregator feel
> necessary in the first place.

If the pairing holds, the final adjudication has almost nothing left to do — and that emptiness
is the signal that the loop worked, not that the loop was skipped.

## Placement

| Step | Types to discharge | Why here |
|---|---|---|
| 1b ENUMERATE | S1 · S3 | the claim list is written; unwritten premises are cheapest to catch now |
| 4b MECHANISM MINING | S1 · S2 | `needs` preconditions enter the bank — cross-check them the moment they exist |
| 5 KILL/RANK | S2 · S4 | before spending rank on a claim, check what it rests on |
| 6 DIAGNOSE | S3 · S5 · S6 | the instrument is being designed; definitions and provenance bind here |
| 7 PREREG | S4 · S5 | the ladder re-points the falsifier before the cost is committed |
| 9 VERIFY | S2 · S6 | results change claim states — re-run consistency once they do |

> **`claims.py` does not exist here** (see `claim-ledger.md`). S2 and S4 are read passes over
> `plan/HYPOTHESIS-REGISTER.md`, not script runs — the questions below are unchanged, only the
> enforcement is manual.

**S2 by hand** — read the register top to bottom and look for five shapes: an unwritten mechanism
precondition · a general claim resting on a **scoped** parent · a primary claim resting on an
**untested** support · a claim still `LIVE` whose falsifier already ran · two claims that cannot both
be true. Findings, never verdicts.

**S4 by hand** — for the claim about to be paid for, name what it *rests on* rather than defending it,
and ask whether that support is cheaper to test. If it is, re-point the falsifier there.

`consistency` checks five shapes: an unwritten mechanism precondition · a general claim resting
on a **scoped** parent · a primary claim resting on an **untested** support · a claim `alive`
with no evidence behind it (*assent is noise*) · two decision rules acting on one target.
