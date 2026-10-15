# Changelog

Crucible changes, newest first. Format follows [Keep a Changelog](https://keepachangelog.com/);
commits follow Conventional Commits. The Proma desktop app keeps its own notes in `release-notes/`.

## [Unreleased] — 2026-10-15 · redesign delivered

One interlocking research architecture (single agent + isolated rlm windows), built in
slices, each test-first and Opus-reviewed. Design docs live in `mindset/调研/redesign/`
(01 architecture, 02 self-evolution, 03 experiment split, 04 canvas + judge report).

### Added
- **rlm job contract** (`aa4a2a7`, `eafd494`, `5533e6a`): `research_kit.new_job / wait /
  collect / field`; children report through `out.md` with a STATUS line; timeouts delete the
  child and log to `failures.jsonl`; host watchdog; children cannot change research state.
- **Truth-stripped simulator** (`cc7e585`): per-run `nbsim` the agent and children can
  simulate with freely; observing the true cell stays metered; held-out protocols simulate,
  never observe; leak test must catch planted mutants.
- **Mode contract and caps** (`2fd502e`): `research_init{mode, success_predicate, depth,
  recall}`, built-in H0, weak evidence capped to `lead` instead of refused, narrowed SCOPED
  stays alive, attack debt per claim, `rejections.jsonl`.
- **K0 single stop, world-engine power check, lead-aware anchor** (`c4eb24c`, `93d5477`).
- **Self-evolution guarded** (`afef901`, `62bf1ad`): refine may propose, only the host or the
  user acquits; host restores unsanctioned harness writes; frozen arm in research sessions.
- **Judge report generated from the run record** (`264aaa4`) and **research canvas** in Proma
  (`05532a6`); defense page is now generated, with a scripted two-minute test.
- **B0–B9 behaviour checker** for acceptance runs (`3baf8f7`).

### Fixed
- Two prereg gates rejected valid probes: hand-copied sim hashes are now optional (host
  freezes the digest) and the band-direction check skips observe probes (`d4c5d5d`).
- A page opened mid-run now shows the running turn, and the research canvas takes the
  right panel over the built-in browser (`6c14629`).
- The agent never writes the research state root; drafts go to `research-work/<run>/` and the
  host copies them in at declare (`1b52704`) — ends a whole class of guard bypasses.
- Research sessions without a workspace had no `research_kit` in the kernel (`a269383`).
- Meter could not simulate held-out protocols; the defense page had called our bug a model
  limit (`444f74c`).

### Evidence
- Delivery one-sentence run (`c2400c7`, image `0388ed3`): held-out forecast MSE **0.73**, all
  three gates green, 783 simulations before the first prereg, 5 of 6 metered observations
  with blockers, 6 of 8 budget spent. B0–B9: P P P F F P P P F F. Still open: no self-written
  protocols (B3), d/σ missing in three preregs (B4), 2 budget units unspent (B9).
- Final one-sentence run (`d6e5003`): the true T-type family was no longer wrongly refuted
  (capped to `lead`), forecast MSE 3.33 vs 8.99 / 30.9 in earlier runs, 238 simulations of
  ≥64 reps before the first prereg. Still open: blockers unused, half the budget unspent.

## 2026-10-14 — first redesign pass

Driven by a full GLM 5.3 Flash research run (ca_rebound seed 0: 4 preregistered probes,
7 hypotheses, 11 recorded attacks, all three host gates green) and two Opus reviews.

### Added
- **Post-compaction rlm re-check** (`566902d`). After every compaction the agent must spawn
  one rlm child that rebuilds state from durable files before using other tools.
- **Per-turn research routing block** (`4b10f78`). Trigger → skill/tool → depth, with deep
  steps sent to an isolated rlm child.
- **research-scoop skill and judgment cards from ResearchStudio / ResearchCompanion**
  (`63bd12f`). Scoop Check, Idea Quality, nugget and conclusion-first checks, reviewer merge
  rules, Continue/Pivot/Kill triage, intake out-of-scope checks. Novelty gates run only when
  the deliverable is a new idea or method.
- Isolated LiteLLM gateway for demo runs (`620619f`).

### Fixed
- **A probe can now challenge a SUPPORTED claim** (`d29a9bf`, research-mcp 0.3.1). The old
  "≥2 LIVE claims" rule blocked the deciding H5-vs-H7 experiment twice in the GLM run.
  Clones of SUPPORTED claims are rejected at `claim_propose`.
- **Reviewer subagent specs land where Prime reads them** (`f222b14`).
- Prime silently dropped `research-scoop` over invalid YAML frontmatter; every default
  SKILL.md is now parsed with Prime's YAML parser in tests (`63bd12f`).

### Changed
- `ccf-*` / `nature-*` paper-writing skills install inactive by default (`63bd12f`).
  Crucible runs experiments; it does not write papers.

## 2026-10-14 — `e1cb0f3`
- One evidence primitive (observe probes), budget meter, journal hash chain, cited forecasts.

## 2026-08-29 — competition submission
- Judge-facing API gateway, static demo site, deploy runbook; official 1B template report.
