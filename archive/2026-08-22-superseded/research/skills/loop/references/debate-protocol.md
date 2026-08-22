# DEBATE — the idea review gate (ChatGPT web, role-contracted)

**LOAD WHEN:** running the debate gate, or ANY browser role play (phase 1.6).

> The loop could kill a *claim* with evidence and rank a *candidate* with a blind panel, but it
> had no stage that reviewed an **idea** the way a reviewer will. Grok is the wrong instrument
> for this: it is code- and results-scoped, and on pre-implementation ideas it is systematically
> over-conservative — it killed two cheaply-testable proposals outright. Idea judgment has to
> come from **outside the family that generated the idea**, and it has to be adversarial by
> role rather than by temperament.
>
> That instrument is the ChatGPT web interface, and this file is how to drive it.

## The one boundary

> **A debate may DEMOTE, SCOPE, or REWRITE a claim. It may not kill one.**

Same rule as every other reasoning stage (`campaign-questioning.md`). A fluent adversary is a
fast, articulate way to eliminate good work — the scar where over-gating emptied an entire
candidate pool is exactly this failure. The debate's output is claim edits and new falsifiers,
never a state change to `dead`.

## Why role contracts, and not just "critique this"

The web model is powerful and **compliant**: it does what is explicitly requested and little
more. Unlike Opus it will not volunteer the sharpest objection unless the objection is the job
it was given. An unspecified "what do you think of this idea?" returns balanced, agreeable
prose — the least useful output in the building.

So every role is issued as a **contract with four mandatory fields**, and a fifth that does
most of the work:

```
ROLE:      who you are, and whose interests you serve
OBJECTIVE: the single thing you are trying to achieve — stated adversarially
CRITERIA:  the specific dimensions you judge on, enumerated
OUTPUT:    the exact shape to return, field by field
OUT OF SCOPE: what you must NOT do — usually "do not be balanced", "do not
           suggest improvements", "do not hedge"
```

**`OUT OF SCOPE` is what makes the role bite.** Without it the model reverts to helpfulness and
softens the attack it was asked to make. Ask for a rejection and you get a rejection with three
compliments attached unless you forbid the compliments.

## The procedure — four conversations, three of them blind

One idea per debate. Four **separate** ChatGPT conversations (`browser-patterns.md` — a fresh
conversation, not a new turn):

```
        PROPOSITION (you write it — the idea, the claims, the evidence plan)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   R1 REVIEWER-2      R2 COMPETING-AUTHOR    R3 METHODS-SKEPTIC     ← blind to each other
        └─────────────────────┼─────────────────────┘
                              ▼
                    R4 REFORMULATOR (sees all three)
```

**R1–R3 must not see each other.** Run in one conversation they converge into a single voice
agreeing with itself, and three correlated objections read as consensus when they are one
objection restated. Separate conversations is the whole reason this produces breadth.

**R4 sees everything**, and its job is the opposite of the others: find the version that
survives. It is the structural guard against over-gating.

### The PROPOSITION packet (you write this, once, reused verbatim)

Never reveal which claim you believe or what you expect the verdict to be — the information
asymmetry is the same one the grill depends on.

```
THESIS: <one sentence — what becomes true beyond a number moving>
VENUE:  <target venue>
PRIMARY CLAIMS:
  C1 [phenomenon]   <statement>
  C2 [mechanism]    <statement>
  C3 [intervention] <statement>
EVIDENCE PLAN: <per claim: the experiment, the metric, the decision threshold, seeds>
WHAT WE BELIEVE IS NEW: <the contribution, stated flatly>
WHAT WE HAVE ALREADY RULED OUT: <graveyard entries relevant to this idea>
```

### R1 — REVIEWER 2

```
ROLE: You are Reviewer 2 for <venue>. You have reviewed in this area for ten years, you are
  unimpressed by increments, and your default recommendation is reject.
OBJECTIVE: Write the strongest possible rejection of the work below. Not a balanced review —
  the rejection a hostile expert would actually write, in their voice.
CRITERIA, in the order you weight them:
  1. Is the contribution an INSIGHT or a DELTA? A number moving is not a contribution.
  2. Does the claimed novelty survive contact with the obvious prior work?
  3. Can the stated experiments actually support the stated claims, or is there a gap
     between what is measured and what is asserted?
  4. Is there a cheaper, more obvious explanation for the expected result?
  5. What would you demand in a revision before you would move off reject?
OUTPUT:
  REJECTION: <8-15 sentences, the review as written>
  STRONGEST_SENTENCE: <the single sentence that does the most damage>
  DEMANDS: <the 1-3 things that would move you off reject, each concrete>
OUT OF SCOPE: Do not list strengths. Do not suggest how to improve the idea. Do not hedge or
  balance. Do not soften the verdict. If you find the work strong, say exactly where the
  rejection fails — but do not write a positive review.
```

### R2 — THE COMPETING AUTHOR

This role doubles as retrieval, which is why it is worth a whole conversation.

```
ROLE: You are a researcher who works on exactly this problem and has published in this area.
  You are being shown a competitor's unpublished idea.
OBJECTIVE: Establish that this has already been done, or that it is a small edit away from
  something already done. Find the work that scoops it.
CRITERIA — search each of these axes SEPARATELY, they fail independently:
  1. The same PHENOMENON under different terminology (including in adjacent fields).
  2. The same MECHANISM applied to a different problem.
  3. The same EVALUATION or protocol critique.
  4. The same INTERVENTION under a different name.
OUTPUT — for each axis:
  AXIS: <name>
  CLOSEST_WORKS: <up to 3: exact title · venue · year · authors>
  OVERLAP: <none | partial | direct> and one sentence saying which part collides
  QUERY_TERMS: <the search terms you used, and the terms WE should have used>
OUT OF SCOPE: Do not evaluate whether the idea is good. Do not cite a paper you cannot name
  exactly — if you are unsure of a title, say "uncertain" rather than reconstructing it. An
  invented citation is worse than an empty axis.
```

> **Every title R2 returns is a lead, not a fact.** Verify the ones that matter through
> `paper-search` before any of it touches `thesis.novelty.collisions`. A debate can move
> novelty to `not_found_under_queries` at most — `novelty_supported` requires the full
> cross-check, and no conversation earns it.

### R3 — THE METHODS SKEPTIC

```
ROLE: You are a methodologist reviewing the experimental design. You do not care whether the
  idea is interesting; you care whether the evidence could support the claim.
OBJECTIVE: Show that the proposed experiments cannot establish what they are said to establish.
CRITERIA:
  1. SEVERITY — for each experiment: if the hypothesis were FALSE, how likely is it that this
     test still passes? Name any test that would probably pass either way.
  2. CONSTRUCT VALIDITY — does the metric measure the property being claimed? Describe what a
     high score with no real improvement would look like.
  3. CONFOUNDS — name the uncontrolled factor most likely to produce the expected result.
  4. THE MISSING CONTROL — the single negative control whose absence you find most damaging.
  5. PROTOCOL ASSUMPTIONS being made silently (comparability of baselines, tuning and
     evaluation on the same distribution, seed handling, selection of the reported setting).
OUTPUT:
  PER_EXPERIMENT: <experiment id · severity verdict · one sentence why>
  WORST_CONFOUND: <one, named, with why it is the worst>
  MISSING_CONTROL: <one, stated as a runnable experiment>
  SILENT_ASSUMPTIONS: <list — each phrased as a claim someone could test>
OUT OF SCOPE: Do not comment on novelty or significance. Do not propose a better idea. Do not
  accept "we will check that later" as an answer.
```

`SILENT_ASSUMPTIONS` is the highest-yield field in the whole protocol — each one converts
directly into a `kind: protocol` claim, and that is the category the campaign has repeatedly
failed to enumerate on its own.

### R4 — THE REFORMULATOR

```
ROLE: You are a senior collaborator who believes there is something real here and wants the
  strongest publishable version of it.
OBJECTIVE: Given the idea and the three attacks below, produce the version that SURVIVES them
  — by narrowing, reframing, or changing what is claimed. Not by defending the original.
CRITERIA:
  1. Which attacks are fatal to the CLAIM AS WRITTEN, and which are fatal to the IDEA?
     These are different, and conflating them is how good work gets abandoned.
  2. Is there an adjacent formulation in which the strongest objection does not arise?
  3. What is the smallest true claim the evidence plan could actually support?
  4. Which single experiment would do the most to defuse the strongest objection?
OUTPUT:
  FATAL_TO_CLAIM: <attacks that require rewriting a claim — with the rewrite>
  FATAL_TO_IDEA: <attacks that no rewrite survives — empty is a valid answer>
  SURVIVING_VERSION: <the thesis and primary claims, restated>
  DELTA: <what changed from the original, and why>
  DEFUSING_EXPERIMENT: <one experiment, with what it must show>
OUT OF SCOPE: Do not be encouraging. Do not preserve the original wording out of politeness.
  If nothing survives, say so plainly and say which attack did it.
```

## Discharge — what the debate is allowed to change

Write the transcript to `.grill/debate-<date>-<idea>.md`, then discharge into the ledger. The
debate has produced nothing until this happens.

| Debate output | Ledger action |
|---|---|
| `SURVIVING_VERSION` differs from the original | edit the claim statements — **the falsifier is voided by drift; re-derive it** |
| `SILENT_ASSUMPTIONS` | add each as a claim with `kind: protocol` and its own falsifier |
| `MISSING_CONTROL`, `DEFUSING_EXPERIMENT` | new falsifiers, or a re-pointed existing one |
| `CLOSEST_WORKS` with direct overlap | verify via `paper-search` → `thesis.novelty.collisions`; state → `collided` only on a verified direct hit |
| `FATAL_TO_IDEA` non-empty | `thesis.status` → `weakened`, and the killing objection becomes a claim with a falsifier |
| an attack you reject | write the explicit **"no change, because —"**. An undischarged attack is debt |

After the debate, by hand in `plan/HYPOTHESIS-REGISTER.md` (`claims.py` does not exist here):
**a rewritten claim voids its falsifier** — re-derive it, do not carry the old one forward. Then check
the new protocol claims against what was already committed to.

## Operating rules

- **Fresh conversation per role.** Reusing a thread makes the second role agree with the first.
- **Never state which claim you believe**, and never tell a role what another role said —
  except R4, which is defined by seeing them.
- **A role that returns unusable output gets its contract re-issued with the defect named**
  ("you listed strengths; the contract forbids it"). Do not accept a soft review and do not
  pause the campaign over it — reissue, take the second result, and note the degradation.
- **Budget:** four conversations, one pass. A second debate round on the same idea is only
  worth it after an experiment has moved something — otherwise it is the same four opinions.
- **Run it before spending, not after.** The debate gate sits between selection and diagnosis
  (Step 5d). Its whole value is that it is cheaper than the experiment it redirects.

## ChatGPT web as the literature search engine

With Scholar retired, the browser is the primary discovery instrument, and it is a good one —
it will find essentially anything publicly searchable. It gets the same treatment: a contract,
not a question.

```
ROLE: You are a literature search engine for a machine-learning research group.
OBJECTIVE: Find the published work most relevant to the question below. Prefer primary sources
  — papers and official repositories — over surveys, blogs, or summaries.
CRITERIA: relevance to the SPECIFIC question, not the general area; recency where the area is
  moving; venue quality; whether an official implementation exists.
OUTPUT — per hit:
  TITLE · AUTHORS · VENUE · YEAR · arXiv-or-DOI · CODE (url or none)
  RELEVANCE: <one sentence — which part of the question it addresses>
  CONFIDENCE: <certain | uncertain about the exact title>
Also return: QUERIES_USED, and NOT_FOUND — what you looked for and did not find.
OUT OF SCOPE: Do not summarise the field. Do not recommend a direction. Do not include a paper
  whose exact title you cannot state — list it under `uncertain` instead.
```

Two standing conditions on anything it returns:

1. **`NOT_FOUND` is a candidate, never evidence.** It maps to `not_found_under_queries` and no
   further — the novelty state machine enforces this.
2. **Titles are leads until `paper-search` confirms them.** The deterministic lane exists for
   exactly this, and it is cheap.
