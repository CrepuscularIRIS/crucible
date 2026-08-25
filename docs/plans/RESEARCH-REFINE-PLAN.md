# RESEARCH-REFINE-PLAN — Research-aware Continual Refinement Loop (architecture)

Status: architecture plan, pre-implementation.
Companion docs: `docs/product/PrimeAgent.md`, `docs/product/Fable5.md`,
`docs/product/2608.14905v2.txt` (ARFT), `docs/plans/EVAL-PLAN.md` §7.2 (E-refine).

Scope of this document: components, responsibilities, data flow, Prime/Proma
integration points, refinement lifecycle, validation/promotion/rollback rules,
and the MCP↔Harness state boundary. No implementation code.

---

## 0 · One-paragraph summary

Research = the agent performing ABDUCE on the world (belief state, owned by the
research MCP). Continual Harness = the agent performing ABDUCE on itself (policy
state, owned by Prime). Both run the same loop — prediction → action → residual
→ hypothesis → validation — over two strictly separate registers. This plan
closes the second loop by **configuring Prime's existing refinement lifecycle,
not modifying it**: a deterministic reviewer decides *when* refinement runs, a
mechanical residual digest decides *what it attends to*, scope discipline plus a
content lint decide *what survives*, and a checkpoint predicate decides *what is
promoted*. The model authors patch content (proposal is free); it never licenses
a policy transition (trigger, validation, promotion, rollback are all computed).

## 0.1 · Standing constraints (from the design discussion; all binding)

1. The MCP belief state is not rewritten or extended.
2. The Harness never learns scientific claims, metrics, bands, run names, or
   campaign conclusions.
3. The seven Research Skills are not redesigned. No new skill is required for
   the loop to close (an informational anchor counter is a later, optional add).
4. RLM remains continuously available; refinement never blocks or overlaps a
   primary model request.
5. No autonomous stack, no `agent_observe`, no deep recursive RLM.
6. Prime's refinement algorithm (trajectory summarization → typed edits) is
   used verbatim.

## 0.2 · Design principles (derived, not asserted)

- **One pattern, two registers.** The epistemic loop's proven pattern —
  external state · anchor+counters · event-dispatched operation · mandatory
  landing · authority-owned validation — is instantiated a second time over
  policy state. No new pattern is introduced.
- **The model proposes; only counted evidence licenses.** π-side twin of
  "reasoning may demote, only measurement may kill": prose may propose a patch;
  only recurrence statistics may promote it. (ARFT F.4, 82.5%: self-diagnosis
  without a checked edge to action is inert. E1 t7max: self-report of moves is
  fabricable. Therefore every lifecycle decision is deterministic.)
- **License strength bounds irreversibility.** Behavioral validation ("the
  failure stopped recurring") is the weakest license in the system — a policy
  cannot be recomputed the way a metric can. Therefore π transitions are the
  most reversible: local-first, promotion always rollback-capable, nothing
  terminal.
- **Zero is the ideal.** A run with no repeated residuals performs zero
  refinements. Refinement count is a residual statistic, never a target; no
  report may present "N lessons learned" as an achievement (anti-Goodhart,
  anti-F.5).

---

## 1 · Component inventory

### 1.1 New components (all Proma-side; each ≤ ~100 lines + its test)

| # | Component | Layer | Responsibility |
|---|---|---|---|
| C1 | **Residual Stream** | adapter lib | Append-only, single-writer record of behavioral residuals: guard denials, research-MCP tool rejections, gate reds, spawn/record reconciliation mismatches, explicit user corrections. Assigns each record a **failure class**. The only new data artifact in the design. |
| C2 | **Research Refine Reviewer** | adapter lib | Deterministic implementation of Prime's `AutoRefineReviewer` hook. On each native tick (`turn_interval` \| `compact`), reads C1 + journal boundaries and returns decline, or approve + the mechanical digest as `instructions`. Replaces the model-backed review gate for research sessions. Never authored by the model. |
| C3 | **Refine Lint** | adapter lib | Content firewall. Consumes `refine_complete` events; scans `appliedEdits` against the deny vocabulary (§6.2) and the target ban (§6.3). On violation: immediate native rollback (`refine({ rollbackId })`) and a `lint_violation` residual record. |
| C4 | **Refine Ledger** | adapter lib | Append-only lifecycle record per refinement: id → attributed failure classes → status (§5). Read by C2 (budget/decline rules) and C5 (promotion). Proma-owned, archived with the run. |
| C5 | **Promotion Checkpoint** | campaign lifecycle | At the pre-dispose seam: evaluates the validation predicate per refinement, issues at most one native `refine({ global: true })` carrying the promotion manifest, lints the resulting diff against the manifest, then archives π state into the campaign bundle. |

### 1.2 Existing machinery, used unmodified

| Component | Owner | Used as |
|---|---|---|
| Refinement algorithm, `HarnessScope` local/global, `refinements.jsonl` history, `rollbackId`, `serializedRefine`, `refine_complete` events, harness-overview context injection | Prime | The entire π store, actuation path, and rollback mechanism. Nothing added, nothing patched. |
| Research MCP (journal, register, prereg, gates) | research-mcp | Read-only signal source: phase-boundary events for C2, provenance ids for digests. Zero new tools, zero writes. |
| Isolation guard + permission authorizers | Proma | Unchanged behavior; their **denials** become C1 records via a tap at the adapter seam. |
| `resolvePiAutoRefineOverride`, `refineNow`, `getRefineState`, resident-session config | Proma adapter | The wiring surface (§4). The current `{ enabled: false }` stopgap is superseded by reviewer installation — the proper implementation of the intent its test already names ("由阶段 checkpoint 显式调度"). |
| `disposeAndArchiveResearchSession` + archive entries | campaign scripts | Gains two entries (π state, C1/C4 files) and one pre-dispose call (C5). |
| Seven Research Skills, `research_kit` anchor | research stack | Untouched. Optional later: one informational ⚠ line in the anchor sourced from C1. |

---

## 2 · Data flow (end to end)

```
                      ┌────────────────────────────────────────────────┐
                      │                Prime session                   │
  tool call ──────────►  guard / MCP / gate adjudicates (unchanged)    │
                      └───────┬────────────────────────────────────────┘
                              │ denial / rejection / red / mismatch
                              ▼
   [C1] Residual Stream  ◄── single writer: adapter tap
        (failure-classed, append-only, on disk, survives compaction)
                              │
        native tick           │ read                     read
   (turn_interval|compact) ───┴──► [C2] Reviewer ◄────── MCP journal (boundaries)
                                     │
                        decline      │ approve + digest(instructions)
                     (no residuals)  ▼
                              Prime refine — native, scope local
                              (summarize trajectory → typed edits)
                                     │ refine_complete(appliedEdits)
                                     ▼
                              [C3] Lint ── violation ──► native rollback + C1 record
                                     │ pass
                                     ▼
                              [C4] Ledger: PENDING + attributed classes
                                     │
                              Prime harness overview → later turns' context   (actuation)
                                     │
                 subsequent eligible actions observed via C1 (recurrence or silence)
                                     │
                        ┌────────────┴─────────────┐
                        ▼                          ▼
                 class recurs                 k eligible actions, zero recurrence
                 → native rollback            → C4: VALIDATED
                 → C4: REFUTED, class reopens
                                     │
                     pre-dispose     ▼
                  [C5] Checkpoint: manifest refine (global) → lint vs manifest
                        → archive harness_state + refinements.jsonl + C1 + C4
                        → dispose (all unpromoted local entries die natively)
```

Properties worth naming: C1 has exactly one writer (the adapter), all stores are
append-only, every arrow into Prime uses a public option (`autoRefineReviewer`,
`instructions`, `global`, `rollbackId`), and the model appears in exactly one
box — the native refine turn, where it authors patch content.

---

## 3 · Data artifacts (conceptual schemas; field lists, not code)

**Residual record (C1)** — `ts`, `sessionId`, `run`, `source`
(`guard` | `mcp` | `gate` | `reconcile` | `user` | `lint_violation`), `tool`,
`ruleId` (guard reason category / MCP error code / gate id), `messageExcerpt`
(truncated verbatim), `journalEventId?` (when derivable), `failureClass`
(computed, below), `activeRefinementIds` (from C4, for recurrence attribution).

**Failure class** — the operational definition of "structurally similar":
`source × ruleId × tool`. Deterministic, computable at append time. Coarse by
design; refuted patches narrow via digest content, not via a finer key.

**Digest (C2 → `instructions`)** — fixed preamble (procedural focus, prefer
empty edits, local only, deny rules); per open class: count, first/last
residual ids, message excerpts, and — for reopened classes — a summary of the
refuted previous patch ("attempt `<id>` did not stop recurrence"). Assembled
mechanically; contains no scientific content beyond what §6.2 permits (rule
identifiers are procedural vocabulary, not claims).

**Ledger record (C4)** — `refinementId`, `attributedClasses` (the classes named
in the digest that produced it), `status`, `statusEvidence` (residual ids /
counter values), `scope`, timestamps.

**Promotion manifest (C5)** — list of VALIDATED `refinementId`s and their entry
ids; the global refine's `instructions` demand verbatim persistence of exactly
these and nothing else; the post-refine lint asserts the diff equals the
manifest.

**Archive additions** — `harness_state.json` (local+global as merged view plus
raw stores), `refinements.jsonl`, C1 stream, C4 ledger. π becomes part of the
experimental record; eval arms pin or disable it (§7).

Storage location: a Proma-owned per-run directory (decided at implementation;
requirement: outside `.proma-research/` — that directory stays server-owned —
append-only, included in the archive entries list).

---

## 4 · Integration points (exact seams)

| Seam | Existing symbol | Change |
|---|---|---|
| Session config (research sessions) | `resolvePiAutoRefineOverride` in `pi-agent-adapter.ts` | Returns reviewer installation instead of `{ enabled: false }`: auto-refine **enabled**, `autoRefineReviewer` = C2, `serializedRefine: true` for headless; native default turn interval kept as the sampling clock. Test updated to match its already-stated intent. |
| Guard/permission denials | adapter permission callback / isolation extension result handling | One append call into C1. Guard behavior itself unchanged. |
| Research-MCP rejections | adapter tool-result path (rejections are visible as tool errors) | One append call into C1. |
| Gate verdicts / reconciliation mismatches | campaign lifecycle where gate outputs and spawn/record accounting already surface | Append into C1. |
| Refine outcome | `refine_complete` event (`RefinementResult.appliedEdits`) | C3 subscribes; on violation calls native `refine({ rollbackId })`. |
| Rollback / recurrence | C1 recurrence detection (a residual whose `failureClass` matches an `activeRefinementIds` attribution) | Native `refine({ rollbackId })`; C4 status update. |
| Pre-dispose | campaign scripts, immediately before `disposeAndArchiveResearchSession` | C5 runs; two archive entries added. |
| UI resident sessions | same adapter config path | Same reviewer; background (non-serialized) refine remains acceptable because the reviewer gates it identically. `refineNow` stays available as a human-initiated explicit path and is exempt from C2's decline rules but not from C3's lint. |

Explicitly **not** integration points: research-mcp server code, gate scripts,
the isolation guard's classification logic, the seven skills, Prime source.

---

## 5 · Refinement lifecycle (state machine)

Unit of lifecycle = **one refinement** (Prime's native unit — the granularity of
`rollbackId`), not individual entries. Attribution, validation, promotion, and
rollback all operate at this granularity.

```
DIGEST issued (C2)
   │  native refine runs, scope local
   ▼
PENDING ── lint violation (C3) ──────────────► ROLLED_BACK(lint)   [immediate]
   │
   ├─ any attributed class recurs while active ─► ROLLED_BACK(refuted)
   │       └─ class reopens; next digest carries the refuted-patch summary
   │
   ├─ every attributed class: ≥ k eligible actions, zero recurrence ─► VALIDATED
   │
   ▼ (at pre-dispose, C5)
VALIDATED ── manifest refine (global) + manifest lint ─► PROMOTED
PENDING / anything unpromoted ──────────────────────────► EXPIRED
                                    (no code: local scope + dispose IS the quarantine)
```

Transition authorities: C3 (lint), C1-derived counters (refuted/validated),
C5 (promoted). The model authors content inside the refine turn only; it holds
no transition authority anywhere in this machine.

**Eligible action** (validation denominator): a subsequent action matching the
class key's `source × tool` context — i.e., an action that *could have*
re-triggered the class. Default k = 3 (small is acceptable because every
transition is reversible; tune empirically in E-refine).

**Global rollback after promotion** is out of this loop's scope: promoted
entries carry Prime's native cross-session rollback via `refinements.jsonl`,
and reverting one is a human/eval-driven decision, recorded like any ruling.

---

## 6 · Rules

### 6.1 Trigger, decline, and budget rules (C2)

Approve a tick iff **all** of: (a) unconsumed residuals since the last review
meet the threshold (default: ≥ 2 records in one failure class, or ≥ 1 on a
`compact` tick — compaction is the last chance to see the full trajectory), or
a phase-boundary journal event crossed with open residuals; (b) the per-run
refine budget is not exhausted (default: 3 residual-triggered + 1 promotion);
(c) no refine already in flight. Otherwise decline. Declines are the normal
case; a zero-residual run performs zero refines. Never approve on: model
self-report of failure, scores, liveness numbers, or judge output (no signal
that a model can author may trigger learning).

### 6.2 Content boundary — MCP scientific state vs Harness behavioral state

| | MCP (belief) | Harness (policy) |
|---|---|---|
| Holds | claims, hypotheses, prereg, bands, evidence, graveyard, calibration, campaign conclusions | procedural lessons: prompt notes, memories, skills, subagent specs about *how to operate* |
| Changed by | checked MCP tool calls only | Prime refine calls under this loop only |
| May reference the other | may record that behavior was corrected (journal events exist anyway) | **never**: no claim ids, hypothesis text, metric names, band values, run names, benchmark/world paths, seed values, or any number originating in an evaluation |
| Lifetime | campaign-scoped, archived | local until promoted; global thereafter, always rollback-capable |

Deny vocabulary for C3 (reuse and extend the isolation-guard vocabulary):
benchmark roots and world/meter paths, run names, register claim ids, metric
identifiers from the journal, numeric bands/values traceable to prereg or
results. Rule identifiers and tool names are *permitted* (procedural
vocabulary). Enforcement is layered and honestly graded: digest preamble
(soft), C3 lint with native rollback (structural, mid-run), manifest lint at
promotion (structural, the only door to cross-session state). Residual risk
stated: a contaminated local entry can influence later turns of its own run
between refine and rollback — bounded, same-session, no cross-campaign channel.

### 6.3 Target ban

No refinement may create or modify anything that adjudicates: gate scripts,
guard configuration, MCP server behavior, permission policy, the reviewer/lint
themselves. The type-checker is not learnable (otherwise ARFT R3 returns as
"the agent learns to edit its scorer's environment"). C3 enforces by kind/path
inspection of `appliedEdits`.

### 6.4 RLM availability

`serializedRefine` places refinement strictly between turns (Prime's own
headless design); the reviewer only ever runs on Prime's tick, and the kernel
and rlm children are untouched by refine. No additional mechanism required.

---

## 7 · Eval integration (binds to EVAL-PLAN §7.2)

- **Sequencing gate:** the manual E-refine experiment (§7.2, t8max → 3.7-plus)
  runs *before* implementation of this plan; it tests whether promoted harness
  lessons transfer at all. Null result → this plan is deprioritized, not built.
- **Arm pinning:** every eval arm declares its π state — `off` (no reviewer),
  `frozen` (global store snapshot, reviewer declines all), or `learning`.
  `harness_state` in the bundle makes the declaration auditable.
- **Metrics:** repeated-error rate per failure class, recovery speed (residual →
  passed retry), rollback rate, refine cost (tokens/turns), and the two
  **invariance checks that prove loop separation**: gate verdicts and
  unsupported-claim counts must be unchanged between `off` and `learning` arms.
- **Known blind spot (accepted):** a patch that degrades behavior without
  re-triggering any residual is invisible to the loop; only the eval ladder
  catches it.

---

## 8 · Acceptance criteria (testable without reading code)

1. A research session with zero residuals completes with zero refine calls.
2. A synthetic repeated guard denial (same class ×2) yields exactly one local
   refine whose digest cites the residual ids; the ledger shows PENDING.
3. An `appliedEdits` fixture containing a claim id, band value, or benchmark
   path is rolled back within the same session and logged as `lint_violation`.
4. Recurrence of an attributed class rolls the refinement back natively;
   the reopened class's next digest references the refuted attempt.
5. k clean eligible actions flip the ledger to VALIDATED; pre-dispose produces
   one global refine whose diff equals the manifest; the bundle contains
   `harness_state.json`, `refinements.jsonl`, the residual stream, the ledger.
6. An unvalidated refinement leaves no trace in global state after dispose.
7. Existing suites (isolation guard, gates, liveness) pass unchanged with the
   loop armed; `resolvePiAutoRefineOverride`'s test reflects reviewer
   installation.
8. No file under `.proma-research/` is written by any new component; no MCP
   tool is added; no skill file is modified.

## 9 · Out of scope

Autonomous gate wiring, `agent_observe`, recursive RLM depth changes, ABDUCE
delayed credit assignment (a later batch query over the journal feeding C5, not
a live mechanism), the optional anchor ⚠ REFINE counter, cross-campaign global
GC/size management (flagged as a future need once promoted entries accumulate),
and any UI beyond the existing refine badge fed by `getRefineState`.

## 10 · Open questions for implementation (small, non-blocking)

1. Exact on-disk location of the C1/C4 files (Proma-owned, per-run; §3).
2. Threshold and k defaults (§6.1, §5) — start values given; tune in E-refine.
3. Whether MCP rejection taps read the tool-result path or derive from the
   journal where the server already records refusals (prefer whichever yields
   `journalEventId` provenance).
4. Digest size cap and excerpt truncation lengths.
5. Whether `compact`-tick refines should run before or after Prime's compaction
   summarization in serialized mode (requirement: the refine turn must still
   see the pre-compaction trajectory; verify ordering in Prime's serialized
   checkpoint).
