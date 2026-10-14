# Changelog

Crucible changes, newest first. Format follows [Keep a Changelog](https://keepachangelog.com/);
commits follow Conventional Commits. The Proma desktop app keeps its own notes in `release-notes/`.

## [Unreleased] — 2026-10-14

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
