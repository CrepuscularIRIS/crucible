# Idea quality — A/B/C score for a frozen proposition packet

**When to load (novelty tasks only, deliverable = a new idea or method):** `research-scoop` returned Level >= 3 and the
proposition is about to go to `claim_propose`; or a candidate without an idea-quality
ruling passed the hard gates of `research-probe` `references/candidate-screen.md`
(Q1–Q6) and is about to receive its first real measurement cost; or two candidates
compete for the same budget. One ruling per candidate; reuse it, do not re-score.

**Answer-about-a-system tasks: do not run.** World tasks (`world_*` tools /
`spec.observe` probes) and empirical questions about a named system or eval ask
whether a mechanism is *true*. Axis A asks whether the gap is still open, and "already
published" says nothing about "true".

Sources (line refs are to these files in the upstream repos; provenance only, see
`NOTICE.md`): RS = ResearchStudio (github.com/microsoft/ResearchStudio),
`ResearchStudio-Idea/evaluation/idea_quality/SKILL.md`; RC = research-companion
(github.com/andrehuang/research-companion).

A decision discipline, not MCP state. The result is one line in `RULINGS.md`; never
invent a tool call for it.

## Input: the proposition packet

Score the packet from `references/idea-gauntlet.md`, mapped onto RS's
Title/Motivation/Method (RS :10-29):

- **Motivation** = the bottleneck/residual sentence (research-abduce) + `THESIS` →
  feeds A and the "problem" half of C.
- **Method** = `CLAIMS` (mechanism / intervention) + `EVIDENCE PLAN` → feeds B and
  the "method" half of C.

Not scored: `NOVELTY DELTA` (prior art is `research-scoop`'s job, RS :31-36) and any
result. Nothing has been measured; score the plausibility of the argument, never an
imagined outcome (RS :33). A thin section: infer the most reasonable reading and say
so, do not stall (RS :29).

## Three axes, integer 1–5 (RS :38-56)

| Axis | Question | Low score means |
|---|---|---|
| A Problem position | Is the gap real, important, non-obvious, still open? | soft target chosen so a cheap fix "wins" |
| B Method quality | One number; the reason must name **depth · soundness · feasibility** | incremental tweak, hand-waved step, or unbuildable |
| C Problem-fit | Does the mechanism act on *this* gap, so the gap closes if it works? | method aimed at an adjacent / easier problem |

- depth dominates B; feasibility means "buildable in principle" and only breaks ties.
- B-soundness = the method's own logic holds; C = that logic reaches this problem.
  Score them separately.
- **Every score quotes the packet phrase that justifies it.** No quote, no score
  (RS :95). Judge substance, not length or fluency (RS :155-160).

## Arithmetic and gate (RS :97-107)

```
overall = round(100 * (A + B + C - 3) / 12)
strong >= 67 · borderline 34–66 · weak < 34
A <= 2 or C <= 2  ->  verdict capped at borderline (state the cap in one line)
low B alone does NOT cap
```

Recompute `overall` from the axes yourself; never copy a judge's arithmetic (RS :78-80).

## Two add-on checks (RC)

Reported beside the verdict; they do not enter the formula.

- **Nugget** (RC `principles/research-strategy.md:27-33`, `agents/idea-critic.md:67-74`):
  state the key insight in one sentence → `clear | fuzzy | missing`.
- **Conclusion-first** (RC `principles/research-strategy.md:19-25`,
  `agents/idea-critic.md:31-38`): write the 2–3 sentence best-case conclusion now, as
  if every predict lands. We do not write papers: this is the answer the campaign
  REPORT would give — what becomes true beyond the number. If the best you can write
  is "metric X improves by Y%" → `hollow`.

## What the verdict does

| Result | Action |
|---|---|
| `weak`, nugget `missing`, or conclusion `hollow` | no `claim_propose` / no measurement cost yet; back to research-abduce (rewrite residual / mechanism) or `research-moves` `references/reframe.md` |
| `borderline` (including an A/C cap) | may proceed; the most fixable weakness becomes an explicit premise/control in the prereg or a ruling |
| `strong` | proceed to SELECT ranking (P(kill)/cost unchanged) |

Unanswered items count as failures, as in candidate-screen. The score defers or
demotes a candidate; only a landed measurement ends a claim.

## One model only: a "panel" measures variance (RS :58-89)

Only one model is available. Several blind judges on the same model measure that
model's sampling variance, not the idea's quality (RS :69-72).

- `n=1` (parent or one reviewer child) is valid; report it as `n=1` (RS :88-89).
- `n>=2`: each judge gets only the packet path + this file, never another judge's
  score or the fact that a panel exists (RS :74-76). Report per-axis mean and median,
  the majority verdict (an exact tie stays a tie), how many fired the gate, and every
  judge's own numbers (RS :78-84). Label it `n=<k>, same model <id>`; never call it
  a multi-model panel. Add no score of your own on top (RS :84).
- A split is a finding about the packet (often an ambiguous THESIS), not noise to
  average away (RS :82-83).

## Two candidates, one budget (RS :93, :109-113)

Also run pairwise: per axis `1 | 2 | tie` with a one-line reason, B split by
depth/soundness/feasibility. A decisive C loss usually decides the overall. Pairwise
is the more trustworthy signal; absolute numbers bunch around 3. Ignore which
session/child produced which candidate.

## Record

```
Ruling: idea-quality <candidate> A=<a> B=<b> C=<c> overall=<NN> <strong|borderline|weak> [cap:A|C] nugget=<clear|fuzzy|missing> conclusion=<ok|hollow> n=<k> same-model — <strongest point / most fixable weakness> — <cost if wrong>
```

Keep the axis table (score · quoted evidence · reason) in the review notes, not in MCP.
