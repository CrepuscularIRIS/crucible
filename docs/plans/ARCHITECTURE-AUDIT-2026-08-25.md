# Architecture Audit — Automated-Research Stack (2026-08-25)

Auditor inputs: ARFT paper (2608.14905v2, full text incl. 45 pattern definitions),
Prime Agent technical report (2608.23552v1, full text), Prime source at
`~/oss/prime-agent` (refinement/agent-session/agent surfaces verified),
`packages/research-mcp` (state/server/sandbox), the seven Research Skills,
the refine-loop implementation landed in `9679cc4`, orchestration modules from
`e753f94`, campaign scripts, and the prior `Research-Refine-Audit.md`.

Verdict up front: **the architecture is fundamentally sound** — the strongest
part of the system (the epistemic loop: MCP journal-replay + structural
rejections + gates + sandbox) is a direct, correct build-out of both papers'
prescriptions. The Research-aware refinement loop is **architecturally correct
but operationally wedged**: four wiring/lifecycle defects (F1–F4) make it
partially inert or self-blocking as deployed. None require redesign; all are
small fixes at existing seams.

---

## 1 · Fundamental soundness (Q1)

The system implements a three-register design with a deterministic authority at
every state transition:

| Register | Authority | Transition license |
|---|---|---|
| Belief (claims/probes/attacks/reports) | research-mcp: journal is the only truth; `replay()` shared by tools and gates | artifact + frozen prereg + in-band observation |
| Policy (prompt/memory/skill/subagent) | Prime Continual Harness via refine | deterministic reviewer + lint + recurrence validation |
| Working state (anchor, counters, handles) | kernel (`research_kit.LAST`) | survives compaction; rebuilt by ritual on kernel restart |

This is exactly the closure both papers call for. ARFT's three root causes map
to implemented mechanisms, not prose: R1 (claim↔artifact) → `metric_recompute`
from raw + reconcile gate; R2 (judgment→action) → the landing rule ("a cognitive
move that doesn't land as an MCP call didn't happen") + ⚠ counters + mandatory
triage on out-of-band; R3 (path legitimacy) → verification the model doesn't
control: server-side structural rejections, bwrap sandbox with attestation,
declare-time gates, run pinning, journal tamper poisoning. The Prime report's
Factorio remedy triple — least-privilege interfaces, independent state
validation, auditable rollback of contaminated refinements — maps to the lint
target-ban, the deterministic reviewer/lifecycle, and the episode stream +
native `rollbackId` respectively.

Also verified sound: E1 hole #1 (reps budget boundary) is now guarded at
`server.ts:447` (`spent + reps > budget` rejects before the meter runs).

## 2 · Findings, ranked (Q2)

### F1 · BLOCKING — validation denominator never accrues for guard/lint classes; the loop wedges

`evaluateRefinementTransitions` counts eligible actions as `success` events with
the same `source × tool`. But successes are only ever recorded by
`installResearchRefineToolTap` for `mcp__research*` tools (`source:'mcp'`). The
isolation observer records **only residuals** (`source:'guard'`,
tool=bash/ipython); nothing ever appends `{type:'success', source:'guard'}`.
`lint_violation` classes likewise have no success emitter.

Consequence chain: first guard-triggered refinement → PENDING with a guard
class → can never reach k eligible successes → stays PENDING forever → the
reviewer declines **all** further refines (`hasPending` check) → the learning
loop is dead for the rest of the run. The only escape is recurrence of the same
class (rollback), after which the next refine wedges again.

Fix direction (pick one, record the ruling): (a) instrument successes for
guarded tools — when isolation is active, a bash/ipython call that passes the
guard appends `{success, source:'guard', tool}` (matches plan §5's definition:
"an action that could have re-triggered the class"); or (b) per-source
eligibility rules (guard classes validate on N clean guarded calls; lint classes
on M lint-clean refines). Option (a) is smaller and truer to the plan.

### F2 · BLOCKING — C5 promotion has zero callers; the promotion/rollback lifecycle is dead code

`runtime.beforeDispose` exists; nothing calls it. `resident.dispose()` calls
`session.dispose()` only; the residency idle-disposal path doesn't call it; the
campaign scripts don't wire refine at all (grep for
`researchRefine|beforeDispose|refine` over first/two-round/routing scripts:
zero hits). `runtime.archiveSource` is likewise never added to archive entries.

Consequences: every refinement EXPIREs regardless of validation; the manifest
refine, manifest lint, and `manifest_mismatch` rollback paths never execute;
the headless E-refine **learning arm cannot run** (scripts create sessions via
`createAgentSessionServices` directly — no reviewer, no serializedRefine, no
tap — de-facto mode `off`); refine evidence (`events.jsonl`, harness state) is
not archived into any campaign bundle. The prior audit flagged this as "the
biggest wiring gap" (step 9); the shared runtime factory was built, but the
scripts were never converted. Manual §7.2 (human-driven distillation) is
unaffected.

Fix: campaign scripts adopt the runtime factory (settings + reviewer +
serializedRefine + tap + `beforeDispose` passed to
`disposeAndArchiveResearchSession` + archive entries for
`research-refine/` and harness state); UI residency disposal awaits
`beforeDispose` before `session.dispose()`.

### F3 · HIGH — `refineNow` breaks the loop's invariants in all three arms

- **learning arm**: a manual `refineNow` produces a refine with no reviewer
  approval → `approvedClassId` unset → `attributedClassIds: []` →
  `allReached = attributedClassIds.length > 0` is false → PENDING forever →
  same wedge as F1, triggered by one button press.
- **off/frozen arms**: `resident.researchRefineRuntime` is undefined → the
  `refine_complete` handler no-ops → **no lint at all**, and frozen-arm
  contamination via manual refine is possible. The comment at
  `pi-agent-adapter.ts:158` ("refineNow 显式路径仍可用，且始终过 C3 lint")
  claims a property the code does not hold in these arms.

Fix: in learning mode, either route `refineNow` through the reviewer
(attribute to the oldest open class, else decline) or record it as an
untracked-but-linted refinement that can never become PENDING; in frozen mode,
disable `refineNow` for research sessions (prior audit's demand); correct the
comment.

### F4 · HIGH — MCP residual taxonomy conflates disciplinary rejections with procedural failures

`ruleId` is the constant `'mcp-iserror'`, so the failure class is
`mcp§mcp-iserror§<tool>` — one class per tool, all error kinds pooled. Two
problems:

1. **Cross-kind refutation**: a patch that fixes "forgot to init before state"
   gets refuted by an unrelated schema error on the same tool → churn.
2. **The epistemic loop's designed rejections count as policy residuals.** An
   out-of-band `claim_transition` rejection *is triage working*; budget
   exhaustion and forecast-closed rejections are the meter's terminal
   discipline. Learning "how to avoid these rejections" borders on learning to
   avoid the discipline itself (e.g., avoiding transitions that would trigger
   triage). The refine digest's procedural-only framing softens but does not
   remove this: the class key cannot distinguish them.

Fix: derive `ruleId` from a normalized error prefix (the prior audit's
suggestion; error texts are stable server-authored strings), and maintain an
explicit small list of **non-learnable rejection kinds** (band/out-of-band,
budget-exhausted, forecast-closed, graveyard-conflicts-required…) that are
either excluded from residuals or classed separately as
`discipline§<kind>§<tool>` with no refine trigger. This is a boundary question
between the two loops, not a tuning knob — it deserves a recorded ruling.

### F5 · MEDIUM — undocumented deviations from the prior audit's revisions

`Research-Refine-Audit.md` demanded five plan revisions; the implementation
adopted #2 (single episode stream with successes), #3 (one class per
refinement), and #4 (honest global re-proposal + manifest check), but silently
kept plan defaults against #1 (thresholds: implemented 2/compact 1, k=3,
native turn interval — audit demanded 1/1/1) and dropped #5 (thin wiring into
research-kit/moves/loop: `policy_residuals()` in the anchor, a refine move
card, ⚠ priority). The experimental `refinement_packet` was removed (good — no
dual design), but the replacement was never added, so the loop is currently
**invisible to the model**: pure Prime-autocorrect, not the dual-path
(model-active + reviewer-backstop) structure the Fable analysis argued for.
Neither deviation is recorded anywhere (EVAL-PLAN §7.2 additions don't mention
them). Either is defensible; undocumented, they are secret decisions by the
project's own RULINGS discipline. Record both rulings; if the dual path is
still wanted, the three-skill wiring is small and was already specified.

### F6 · LOW — second writer to `harness_state.json`

`seedManagedResearchSubagents` writes Prime's global harness file directly
(atomic write, digest-guarded upgrade, user edits preserved). Deterministic and
well-disciplined — but it is a second writer beside Prime's refine: last-writer
-wins can drop a concurrent refinement edit (low probability: seeding happens at
startup), and seeded entries bypass `refinements.jsonl`, so they carry no native
rollback history. Accept with a note, or serialize seeding through Prime's API
when one exists.

### F7 · LOW — no drain of in-flight refine settlement before dispose/promotion

`onRefineComplete` is invoked fire-and-forget (`void …catch`). A lint rollback
in flight while `beforeDispose`/promotion runs could act on stale state.
`serializedRefine` makes this window small but not zero (the prior audit's
`firewallPending` point). When F2 is fixed, `beforeDispose` should await any
pending settlement first.

### F8 · LOW — declared-but-silent residual sources

`'gate' | 'reconcile' | 'user'` are defined and never emitted. Fine as staging,
but EVAL-PLAN hole #4 (attack_record vs actual subagent spawn reconciliation —
the t7max ARFT-E.2 sample) is exactly a `reconcile` residual; wiring it would
close an open eval hole and exercise the loop on its most valuable signal.

## 3 · Subsystem-by-subsystem usage assessment (Q3)

- **MCP** — exemplary. Journal-as-only-truth with replay shared between tools
  and gates; structural rejections for every measured failure mode (subset
  predicts, zero-width bands, decorative probes, terminal-without-probe,
  out-of-band transitions, graveyard conflicts, revive-without-evidence);
  crash≠landed; tamper poisoning; run pinning against the measured subagent
  bypass; bwrap sandbox fail-closed with attestation in provenance; metric
  recompute that never executes model code. Ceilings are documented where they
  exist (tamper baseline resets on server restart).
- **Research Skills** — correct per the Prime report's expressivity doctrine:
  skills carry content, control flow derives from state (phase from MCP,
  dispatch from counters), and the landing rule is the anti-F.4 edge. No
  workflow engine has crept back in.
- **Workflow/state transitions** — CLAIM/PROBE machines enforced server-side;
  order (prereg→run→land→transition) is structural, not disciplinary.
- **Orchestration/subagents** — typed roles (analyst/researcher/coder/reviewer)
  with proposal-only outputs, parent as sole state writer, no grandchildren,
  uniform STATUS contract, file-based handoff with absolute report paths.
  Consistent with "subagents are instruments of research moves." The honest
  caveat that `agent_message` isn't guaranteed for children is routed around
  correctly (report files as fan-in).
- **RLM** — handle semantics respected ("rlm returns an admission handle, not
  an answer" — matching the report's appendix B verbatim); kernel anchor as the
  compaction-surviving L2 state; isolation extension reaches RLM children via
  the shared ResourceLoader.
- **TypeScript integration** — every Prime surface used is public and verified
  (`autoRefineReviewer`, `serializedRefine`, `RefineOptions`,
  `refine_complete`/`rollbackOf`, `afterToolCall` chaining follows the
  adapter's own established pattern); residency key includes the refine mode so
  arm switches rebuild sessions.
- **Memory/Harness state** — two registers cleanly separated; refine evidence
  lives in `session-artifacts/<id>/research-refine`, never `.proma-research/`.
- **Refinement loop** — design correct (deterministic trigger, procedural-only
  digest, one class per refinement, local-first, lint firewall, recurrence
  validation, manifest promotion, event-sourced audit trail); operation wedged
  by F1–F3.
- **Validation/promotion/rollback** — state machine right; manifest equivalence
  is structural (count + lint) with the ponytail ceiling honestly declared in
  the code (upgrade path: per-entry content hashes).
- **Boundaries** — three enforcement layers (digest preamble, lint+rollback,
  manifest lint) plus dispose-quarantine; the one semantic gap is F4.

## 4 · Consistency with the two papers and the Prime report (Q4)

- **ARFT**: the stack operationalizes all three of the paper's own proposed
  repairs, and the E1 campaign already caught a live ARFT-E.2 instance (t7max
  self-written attack.record) — evidence the counters see what the taxonomy
  predicts. Running the released judge over our trajectories (E2) remains the
  right way to report in the field's vocabulary.
- **Prime report**: the refine loop matches the Factorio remedy triple (least
  privilege / independent validation / auditable rollback). One caution from
  the report's core doctrine — "a model should fail because the task exceeds
  its capability, not because the harness dropped state": **F1–F3 are exactly
  harness failures that would masquerade as model failures** (learning silently
  stops; an arm comparison would measure the wedge, not the model). Fix before
  running E-refine arms.
- **Continual Harness framing**: "refinement supplements the immutable base
  prompt without rewriting foundational policy" — enforced here by the lint
  target ban; consistent.

## 5 · Prime primitives not yet (fully) used (Q5)

1. **Persistent goals** (`initialGoal` / goal state): campaign objectives are
   carried in prompt text; Prime's goal survives compaction and ends by agentic
   completion — a better carrier for the campaign GOAL. Cheap adoption.
2. **Heartbeats**: "probe in flight, no transition in N turns → forced D-S-R"
   was proposed in our own PrimeAgent.md reading and is natively supported;
   anchor counters only fire when the anchor is consulted — a heartbeat is the
   push-side complement.
3. **Retained children + direct agent-to-agent messages**: the grill adversary
   is one-shot today; the report's retained-handle + follow-up pattern would
   give the adversary its own persistent memory (with the known drift caveat —
   reseed at phase boundaries).
4. **Session branching/forking** for counterfactual arms from a shared prefix.
5. **Harness `skill`/`prompt` entry kinds**: only `subagent` entries are seeded;
   E-refine distillation explicitly wants prompt/skill/subagent — the manual
   path exists, the seeder covers one kind.
6. **Autonomous mode / gates / `agent_observe`**: deliberately out of scope by
   standing constraint — record as scoped-out, not overlooked.

## 6 · Improve / simplify / remove (Q6)

Do now, in order: **F1** (success instrumentation for guarded tools),
**F2** (wire C5 + archive into scripts and residency disposal), **F3**
(refineNow policy per arm + fix the false comment), **F4** (ruleId from
normalized error prefix + non-learnable rejection list). Then **F5** (record
the two rulings; decide on the three-skill thin wiring as its own decision),
**F8** (emit `reconcile` residuals from attack/spawn accounting — closes
EVAL-PLAN hole #4 and feeds the loop its best signal).

Simplify/remove: nothing significant. The dual parent-authorizer + extension
isolation is belt-and-suspenders, documented, cheap — keep. The episode
stream's O(n²) re-read per append is irrelevant at observed scale — keep.
Lint's deliberately tight patterns are correct per the Factorio lesson (a false
positive costs one local lesson; a false negative poisons the harness) — keep.

Sequencing note: E-refine (§7.2) manual arm can proceed today and is unaffected
by F1–F3. The automated learning arm is blocked on F1+F2; do not run the
three-arm comparison before both land, or the result measures harness wedging.
