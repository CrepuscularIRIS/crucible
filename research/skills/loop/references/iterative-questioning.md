# Iterative Questioning — the interrogation organ (2026-07-24)

**LOAD WHEN:** opening a ChatGPT grill session (phase 1.2).

> The pipeline hunts the next missing point "the same way the human found the first one." The human found
> it by asking an embarrassing question — *"wait, does the small model even need depth?"* — not by mining
> literature. This doc mechanizes that move. The unit of work is **prediction error**, not answers.

## Core reframe

The answering model is a compressed simulacrum of the field's consensus. Where it is confidently wrong,
conspicuously vague, or can only recite — the *literature itself* is probably thin there. That's a hypothesis,
not evidence (see grounding caveat); but it makes interrogation a legitimately cheap probe of the field.

Before every question, the questioner privately **pre-registers** its expected answer (one sentence +
confidence). After the answer, it scores the deviation: **matched** (move on) · **deviated-LEAD** (the only
currency — push with pressure moves) · **deviated-instrument** (a note about the model, not the field).
Scoring: surprise-per-round = `deviated-LEAD` with `survived_pressure:yes` / total rounds.

## When you out-reason the answerer (read this first)

On many questions you now reason better than the model you are interrogating. That does not make the grill
pointless — it **changes what the instrument is for**, and misreading this wastes the whole session:

- **Not** "extract knowledge I lack." You will mostly get back a competent summary of the consensus, and
  mistaking that for insight is the main way a grill session produces nothing.
- **Yes** "map the boundary of the consensus." The answerer is a *compression of the field's received view*.
  Its confident regions mark what the field considers settled; its vague, colliding, or recitation-only
  regions mark where the field is actually thin. **You are measuring the field through a proxy, not
  consulting an expert.**

Two consequences. First, an answer that is *correct but generic* is a finding about the field (this question
has a standard answer), not a failure of the question. Second, **your own pre-registered answer is often the
stronger prior** — when you and the answerer disagree and you can mechanize your reasoning while it cannot,
the deviation is evidence about the field's blind spot, not a correction to you. Record it that way.

The corollary is uncomfortable and load-bearing: **the sharpest interrogation target is often your own
reasoning**, and it deserves the same pressure moves. Run MECHANIZE and PROVENANCE on your own claims before
you run them on ChatGPT's. An unexamined orchestrator prior is the most expensive error in the loop, because
nothing downstream checks it.

## What makes a question good

Cheap heuristic, applied before asking: **a good question has at least two answers you would find
believable, and they lead to different actions.** If you can only imagine one believable answer, you are
confirming. If the answers lead to the same action, the question is decorative regardless of how interesting
it sounds.

## Role integrity — three hard constraints

1. **Output vocabulary ban.** Questions, challenges, reconciliation demands, and (once) the exit statement.
   Every solution impulse → interrogative form. Designing = violation.
2. **Information asymmetry.** Never reveal hypothesis or preferred answer. Sycophantic answerer + known
   target = worthless output.
3. **Agreement is noise; resistance is signal.** Assent has near-zero evidential value. If the answerer
   folds instantly, the trial is void — reframe from the opposite side. Run symmetric framings (steelman P
   and ¬P), score which survives. Kill-signature: "gotcha theater" (surprise that isn't decision-relevant).

## Pre-registration ledger

```
ROUND <n>
  generator: <G1–G8>   question: <verbatim>
  pre-registered: <one sentence>   confidence: <0–1>
  actual: <one sentence>   deviation: matched | instrument | LEAD
  note: <what cracked>   pressure: <which moves>   survived: y/n
  stack: push <line> | pop | hold | —
```

## Generators (taste, operationalized)

| # | Generator | What it hunts |
|---|-----------|---------------|
| G1 | **Failure autopsy** | One concrete instance, mechanistic walk-through. Statistics forbidden. |
| G2 | **Suspicious success** | "Works better than its story predicts — what actually carries the gain?" |
| G3 | **Inherited assumption** | "Why does everyone do it this way?" (regime/era/protocol check) |
| G4 | **Boundary construction** | The minimal input/condition that kills the method |
| G5 | **Negative space** | The experiment nobody runs; apply three-way check |
| G6 | **Too-hard pile revisit** | Old intractable questions × new instruments |
| G7 | **Unification smell** | Two phenomena with separate stories that look like one operator |
| G8 | **Naive-question quota** | Force basic questions. The settled basement is where assumptions live. |

WIDE phase: 4–6 generators, 1–2 probes each. COMMIT: recurse on the deepest-signal line.

When a crack surfaces, name which IdeaSpark pattern it maps to (the 15 corpus-induced patterns from
`~/.claude/skills/idea-spark/references/ideation-patterns/overview.md`). A crack with a named pattern is sharper
than an unnamed anomaly. Read the pattern card only when operationalizing into a candidate, not during
questioning.

## Pressure moves

| Move | The move | When |
|---|---|---|
| **Mechanize** | "Causal chain, step by step, no abstractions" | Always first on a lead |
| **Quantify** | "Commit to a number" | Unfalsifiable answer |
| **Counterfactual observable** | "If your story is right, what should we see?" | Converts stories → probes |
| **Reverse** | "Now argue the opposite" | Answerer agrees too easily |
| **Provenance** | "Measured, derived, or folklore?" | Authoritative-sounding claim |
| **Confidence audit** | "Weakest part?" — then dig there | After a smooth answer |
| **Cross-examine** | Compare against round-k answers | Every ~3 rounds on active lines |
| **Control** | Known-answer question, calibrate the instrument | Session start + domain switches |

## Externalization rule

**The model must externalize everything it knows that may be relevant — never compress, summarize, or hide.**
This is load-bearing: crack signals (fluency asymmetry, deflection, collapse) are only visible in concrete,
un-abstracted output. MECHANIZE and QUANTIFY are the enforcement moves. The questioner demands the same of
itself — the ledger, stack, and meta-round exist to externalize *its own* reasoning.

## Instrument panel

| Signal | Meaning | Action |
|---|---|---|
| Fluency asymmetry | Smooth answer to hard question = recitation | MECHANIZE |
| Deflection | Avoiding the hard part | Re-ask the exact hard part |
| Answer-collapse | Different questions → same answer | Edge of the map — dig |
| Can't instantiate | Names the abstraction, not one example | Thin knowledge |
| Compression-without-loss | "In summary…" drops a detail | Re-ask for the dropped detail |

## Session shape

WIDE (4–6 generators) → COMMIT (deepest-signal line, pressure) → CRYSTALLIZE (exit template or pop).
Question stack: push on surprise, pop on kill. Kill signatures for LINES: answerable by lookup ·
decision-irrelevant · unanswerable at budget · 3 consecutive no-surprise rounds · leading-the-witness.
**Meta-round every ~5:** "which lines am I asking because they're easy? What am I avoiding?"
Recursion: the exit re-enters as a pre-mortem seed; every experimental result gets G1/G2 treatment.

## Exit template (the ONLY output that advances the loop)

```
EXIT:
  1. unasked_question: <one sentence>
  2. why_unasked: <no concept | failed quietly | structurally impossible>
  3. evidence: {where_cracked, round_refs}
  4. fork: answer_A → do X · answer_B → do Y
  5. cheapest_probe: <1-GPU-day or eval-only>
```

Can't fill it → not converged; pop to the next line, not more rounds on a dead one.

## Worked example, compressed

The first missing point came from a naive **G8** question — *"does the small model even need depth?"* —
and the four rounds that followed are the method in miniature:

1. **G8, matched.** *"Does the small model benefit from depth?"* → confident yes. Pre-registered the same.
   No signal, but it set up the next question.
2. **G4 boundary, LEAD.** *"What is the MINIMAL capacity at which removing depth starts to hurt?"* → the
   answerer deflected to "it depends" and, under QUANTIFY, would not commit to a number. **Fluency
   asymmetry**: a suspiciously smooth non-answer to a concrete comparison.
3. **MECHANIZE, LEAD.** *"Walk the exact causal chain, no abstractions."* → fluent on the fusion mechanism,
   but **answer-collapse**: every reframing returned to "depth provides geometric priors." Different
   questions, same answer, is the edge of the map.
4. **COUNTERFACTUAL OBSERVABLE, matched — and the finding.** *"If depth is genuinely helping, what
   observable should we see that nobody has looked at?"* → it named the measurement. The answer matched;
   **the question was the finding**, because nobody had run it.

Exit: *unasked_question* = "is the coupling net-negative — does removing depth IMPROVE the small model?" ·
*why_unasked* = "failed quietly; every paper assumes fusion helps, nobody tested the sign at small
capacity" · *fork* = amputate-and-reinvest vs look elsewhere · *cheapest_probe* = eval existing
checkpoints with and without depth, **0 GPU-h**.

The transferable shape: the naive question nobody asks (G8) → an instrument-panel signal, not an assertion
→ a pressure move converting a story into a probe → an exit that is a *fork plus a cheap test*, not a plan.

## Grounding caveat

An answerer's crack ≠ a field gap. Two filters before it counts: (1) replicate in a **fresh ChatGPT conversation**
(cold start — does the crack reproduce without the prior thread's anchoring?) and/or `analyst` (a different family, nearly free); (2) hand to `research` for a corpus novelty check. Only cracks surviving both enter the register.

## Apparatus

One surface, ChatGPT, driven as itself here (no role contract — its unforced answers *are* the
measurement). Playwright mechanics and the fresh-conversation primitive: `browser-patterns.md`. Search and
debate contracts: `debate-protocol.md`.

**Casting:** Opus = questioner (state-tracking). Answerer = ChatGPT, with fresh-conversation replication;
`analyst` is a cheap second opinion on a crack, not a second answerer.
**Governance:** advisory, feeds the register, never gates, preemptible by the heartbeat.
