---
name: research-scoop
description: >-
  Use when the campaign's deliverable is a NEW idea or method (open-ended research)
  and a mechanism hypothesis is about to be registered with claim_propose with no
  scoop ruling in RULINGS.md yet; or when the user asks whether this idea has already
  been done. DO NOT TRIGGER when the deliverable is an answer about a named system,
  command or world (world tasks with world_* tools; empirical questions such as
  "does X improve Y on this eval"), because "already published" says nothing about
  "true". DO NOT TRIGGER to generate hypotheses (research-abduce), to attack a LIVE
  claim with evidence (research-grill), to score idea quality (research-grill
  references/idea-quality.md), for artifact/confound rival hypotheses, or for a
  general literature review.
version: 0.1.1
---

# research-scoop: prior-work collision gate

## What you are doing

Before the first measurement is spent on a hypothesis, check whether published
work already covers it. The output is a 5-level verdict plus one delta sentence
that names the closest prior work. Port of ResearchStudio Scoop Check
(microsoft/ResearchStudio, `ResearchStudio-Idea/skills/scoop_check/SKILL.md`, MIT;
steps 1/2a/2c/3/4/5b/6/7); retrieval and recording are adapted to Proma.

**Novelty tasks only.** Run this gate only when the deliverable is a new idea or
method. When the deliverable is an answer about a named system, command or world
(world tasks with `world_*` tools / `spec.observe` probes; empirical questions such as
"does PCA improve accuracy on this eval"), the question is whether a mechanism is
*true*, and "already published" says nothing about "true". No scoop ruling, no
idea-quality gate; go straight to `claim_propose`.

## Iron law

```
Abstract-only does not count as read. No verdict without a delta sentence or a named blocker.
```

**Violating the letter is violating the spirit.** Abstracts hide the premises,
objective and scope that decide whether two papers are the same work. A paper you
only saw as an abstract leaves its axes `unverified`; it cannot lower a level and it
cannot clear one. A "no hits" result is evidence only together with its queries.

## Inputs

- **Research problem**: the campaign question.
- **Novelty**: the candidate's statement + mechanism (the proposition you would pass
  to `claim_propose`).

Missing or conflated input: infer the most reasonable reading, write it in step1,
continue. Do not stop to ask the user.

Work in `<project root>/.research-handoffs/scoop-<the id you will propose>/` (never
inside `.proma-research/`). Each step writes `step<N>.md`; later steps and the child read
these files, not the conversation.

## Procedure

1. **Decompose** the novelty into four axes: *problem framing* (task, inputs,
   outputs, evaluation), *core mechanism*, *key insight* (what prior work lacked),
   *application domain*. Mark restated context as context, not novelty.
   (research-grill `references/idea-gauntlet.md` §B Prior-art hunter uses other axes,
   phenomenon / mechanism / evaluation / intervention, for attacking a LIVE claim; this
   gate scores with these four.)
2. **2a Queries** (write them before searching): Q1 original problem restated;
   Q2 broad domain, 3-5 words; Q3 method signature, 5-8 words. Add the aliases a
   neighbouring field would use for the mechanism.
   **2b Retrieve**: run each query with `WebSearch` in the parent session (the probe
   sandbox has no network). Merge, dedup by normalized title / arXiv id / DOI.
   **2c Recall** (a separate pass after 2b): list 0-5 papers you know are directly
   relevant but the keywords missed, tagged `Source: model-recall`. Confirm each
   exists with one `WebSearch`; one you cannot locate is dropped, never cited.
3. **Triage** every paper from title + abstract: the four axes as the abstract
   states them, `overlap 0-4`, source URL. "The abstract does not say" stays
   uncertain; do not resolve it either way.
4. **Pick 3-7 candidates.** Any one qualifies: overlap >= 2; a core-mechanism match
   regardless of domain; same narrow subfield within 24 months; abstract ambiguous
   on the method. Fewer than 3 qualify: take the next most similar. More than 7:
   highest overlap, ties to mechanism match then recency. Write the reason for each.
5. **Fetch full text (5a, parent).** Two routes; write which one you used in step4.md.
   - **Kernel download (preferred).** The parent ipython kernel is not the probe
     sandbox; if one `urllib.request.urlopen` succeeds there, download each body (for
     arXiv `https://arxiv.org/html/<id>`, else the PDF) straight to `papers/<id>.*`.
     The file is the full text and nobody retypes it.
   - **WebFetch (kernel has no network).** Call it with `maxChars: 80000` (default is
     20000). Do not retype the whole output: save to `papers/<id>.md` only the
     sections the child needs (intro, method, experiments, limitations), each copied
     verbatim. If the output ends with the `已截断` marker, mark the paper `truncated`;
     every axis whose deciding section was cut off is `unverified`.
   Only an abstract page came back: mark the candidate `abstract-only` and keep it in
   the set.
6. **Verify and compare (5b/6, rlm child).** These are the extreme-judgement
   steps; never run them in the same context as the fetching. Following
   research-loop `references/delegation.md`: `job, name = research_kit.new_job(run,
   "scoop", "<id>")`, write the `proma-research-reviewer` contract plus the task into
   `job/brief.md`, then call `await rlm(<the 3-line job prompt>, name=name)` without
   `model=` (a fixed name fails on the second spawn). The brief contains only paths:
   step1.md, step4.md, the `papers/` files; the child writes its record to
   `job/out.md`, last line the STATUS line. The child must:
   - **5b** for each candidate read intro / method / experiments / limitations and
     mark each axis `match / partial / differ`, quoting the passage that decides it.
     Same mechanism under different names is `match`; shared vocabulary with
     different premises, objective, information or guarantees is `differ`.
     `partial` counts as not matching; `abstract-only` axes and axes lost to
     truncation are `unverified`.
   - **6** per paper `level = 5 - matched axes`; overall = the minimum level.
   Then `(result,) = await research_kit.wait([job], timeout_s=1200)` in the same turn.
   `status == "ok"`: copy `job/out.md` to step56.md and check each quote against
   `papers/` before accepting it (concerns in its SUMMARY go into the ruling). Any other
   status (`blocked`, `failed`, `timeout`), or a child that cannot run: do 5b/6 in the
   parent and write `single-context verdict` in the ruling.
7. **Delta (parent).** Write the delta sentence (template below) against the closest
   paper, taking its phrasing from the 5b record, or state that no delta holds and
   name the blocking paper. The reviewer child is read-only; this step is yours.
8. **Record and route** (below).

| Matched axes | Level | Label |
|---|---|---|
| 0 | 5 | No Overlap |
| 1 | 4 | Low Overlap |
| 2 | 3 | Medium Overlap |
| 3 | 2 | High Overlap: the delta hangs on one axis |
| 4 | 1 | Full Overlap: scooped |

Delta template (REQUIRED, one sentence):

> Unlike [closest prior work], which [does X under assumption Y], the proposed work
> [does X' / drops Y / extends to Z], yielding [concrete measurable difference].

## Record and route

Append one line to `RULINGS.md` in the project root:

```
Ruling: scoop <id> = Level <N> <Label>; closest = <title> (<url/id>); delta: <sentence | none, blocked by <title>> — <why> — <cost if wrong>
```

Then put the closest prior work into the claim's `conflicts`, which
`claim_propose` takes at registration: `prior art: <title> (<id>), Level <N>;
<delta>`, alongside any graveyard text the server requires. That is why this gate
runs before `claim_propose`. For a claim already LIVE there is no MCP call that
edits `conflicts`; the RULINGS line is the record. Do not invent a tool.

| Verdict | Next |
|---|---|
| Level <= 2 | Do not `claim_propose`. Back to `research-abduce` for another mechanism, or `research-moves` `references/reframe.md` to move the claim onto the axis that differs |
| Level >= 3 | Quality gate `research-grill` `references/idea-quality.md`, then `claim_propose`; the delta stays in `conflicts` and in the report |
| Not run (no WebSearch) | Continue to `claim_propose`; the ruling says `scoop not run`, and nothing may call the idea novel |

**Claim already LIVE** (registered before this check, e.g. the user asked for it
later) and the verdict is Level <= 2: after the RULINGS line, `claim_transition` it to
`CONTESTED` with note `scooped: <paper id>` (LIVE→CONTESTED needs no probe). Then
reframe or abduce as in the table.

No WebSearch available (tool disabled or failing): the gate has not run. Record
`Ruling: scoop <id> = not run, no retrieval`, and never write "novel" anywhere.

## Excuses | reality

| Excuse | Reality |
|---|---|
| "The abstract makes it clear enough" | Premises, objective and scope live in the body. RS verifies 5b only against body text, never a summary; an abstract is a summary. |
| "Search found nothing, so it is novel" | A miss is `not found under Q1-Q3` (research-grill idea-gauntlet §B). Missing the canonical paper behind an alias is the most common way this check fails; that is what 2a aliases and 2c recall are for. |
| "I remember a paper like this, cite it" | A recalled paper that WebSearch cannot locate is dropped. A fabricated citation is worse than a smaller pool. |
| "Fetching and verifying in one go saves a call" | Merging 5a into 5b turns verification into summarization (RS rule 2). The child reads files only. |
| "No clean delta, but the idea is still different" | If the sentence cannot be written, the claim overlaps. Name the blocker and reframe; rhetoric is not a delta. |
| "Level 2 is close enough, register it" | The delta hangs on one axis. Propose that axis only after a reframe makes it the claim. |
