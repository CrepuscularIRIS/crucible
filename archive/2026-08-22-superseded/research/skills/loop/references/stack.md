# The stack — which lane owns which job

**LOAD WHEN:** wiring a new step, or unsure which lane owns a job.

Replaces `surface-routing.md` and `skill-routing.md` (both retired 2026-08-19 with MoA).

## Five lanes

| Lane | Owns | Never |
|---|---|---|
| **Opus** — you | orchestration · all code · all browser driving · every decision · every file write | delegating a decision |
| **Fable** — `analyst` | THESIS · MECHANISM · FALSIFIER · MATH · AGGREGATE | killing a claim, reframing the target, touching a file |
| **ChatGPT web** | the grill (answerer) · the debate gate (4 role contracts) | being delegated to a subagent |
| **Scholar web** | literature discovery, associative | proving a citation — that is the corpus |
| **local corpus** — `research` | 80k papers on `/data` · asset acquisition and load-verification | ranking, selecting, designing, browsing |
| **Grok** — `grok-verifier` | code + results review at deploy time | judging an unbuilt idea |

**The browser lanes are main-agent only.** A CLI substitute returns same-family evidence dressed as
cross-family, and a subagent driving a browser cannot be supervised mid-session.

## Discovery vs proving — they are different jobs

| | Best at | Worst at |
|---|---|---|
| **ChatGPT** | *finding* — surfaces anything publicly searchable, reformulates like a person | *proving* — will state a plausible title it cannot cite |
| **Scholar** | citation chains, adjacent fields, who cited whom | full text without a session |
| **local corpus** | *proving* — instant, deterministic, PDF already on disk | *finding* — title-only index |

The pattern: **discover in the browser, confirm in the corpus.** A title is a lead until
`corpus.py search` returns it. A corpus miss is `not titled that`, never `does not exist`.

```bash
python3 .claude/scripts/corpus.py search "<terms>" --venue ICLR --from 2024 --paths
python3 .claude/scripts/corpus.py venues
```

## What MoA used to own, and who owns it now

MoA was removed 2026-08-19. A quorum over independent samples raises the floor and lowers the ceiling,
because a genuinely novel idea is a minority view and a quorum is a machine for removing minority
views. Four seams, all re-homed — none left unowned:

| Old seam | Now |
|---|---|
| claim generation (UNION) | the ChatGPT grill for breadth, `analyst` THESIS for structure |
| candidate ranking (VOTE) | **`screen.py rank`** — deterministic, and it already replaced this |
| experimental design (VOTE) | `analyst` FALSIFIER, plus `grok-verifier` at deploy |
| falsification counterfactual (VOTE) | `analyst` FALSIFIER |

Also retired with it: `moa-rank`, `kimi-reviewer`, `thesis-locate`, `mechanism-locate`, `model-math`
(the last three merged into `analyst`), and `workflows/debate-gate.js` (a four-model panel). The
`grill-moa` binary still exists on the box and is **not** called by this loop.

**Prefer a script to a panel wherever one exists.** `screen.py` and `corpus.py` are both seams that
stopped costing latency and stopped being arguable. That is the right direction of travel.

## Arbor

Retired from the loop 2026-08-19. Its value was a cross-campaign idea tree with pruned lessons; this
sprint is one paper, one candidate at a time, five weeks — and the JSON-RPC blocks were a large share
of the old loop's length and a recurring reason to improvise around it.

Memory is now three flat files: `.grill/STATE.md` (where we are) · `plan/HYPOTHESIS-REGISTER.md`
(what is live and what died) · `.grill/prediction-ledger.md` (calibration). The `arbor` binary is
untouched if it is ever wanted back.

## The standing rule

**An unrouted capability is a standing invitation to improvise a stage nobody designed.** If something
is needed and is not in the tables above, it becomes a reference file under `grill-loop` with a
`LOAD WHEN:` line, or a mode on an existing agent — never a new skill hoping to self-trigger, and
never a fourth agent.
