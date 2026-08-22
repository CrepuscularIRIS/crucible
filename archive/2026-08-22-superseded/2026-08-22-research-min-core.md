# Research Minimal Core — Implementation Plan

**Date:** 2026-08-22 (rev 2 — merged the Proma↔Prime integration audit) ·
**Deadline anchor:** submission 2026-09-05, 初审 through ~09-20
(judge-facing service must stay up the whole window) · **Status:** approved shape

One sentence: **one containerized Prime Agent campaign, five skills, three exit gates,
one static viewer** — everything exists to make a single real research campaign
scientifically defensible, not to measure the system itself.

Positioning (already settled, do not relitigate): the runtime is infrastructure; the
contribution is epistemic control — *generative models propose; deterministic systems
preserve truth*. Our terminal condition is "the gates close," not "the score is high."

---

## 0 · Ground truth this plan is built on

Verified against `~/oss/prime-agent` @ v0.7.1 source (2026-08-22 audit, see memory
`prime-agent-verified-surface`):

| Fact | Consequence for this plan |
|---|---|
| Kernel persists across compaction (host tells the model, probes the namespace) | Belief state lives in the kernel + on disk; compaction is a non-event |
| `--autonomous-gate` is host-run, exit-0, fail-closed; failed gate not re-run until worktree changes; model cannot touch gate config | Gates are the enforcement layer; nothing else needs to be un-bypassable |
| Outer gate-completion loop exists in **print mode** (not RPC) | Evidence runs use `pi -p`; Proma/RPC never drives the campaign |
| Only built-in tool is `ipython`; Prime has **no permission system** | Never expose research mode through the product; the container is the boundary |
| `rlm()` children take only `(prompt, name, model)`; children can read disk | Grill child is **prompt-blinded**, and the report must say exactly that |
| Heartbeats are **wall-clock** (once/cron/interval, steer or follow_up); the only turn-count trigger is auto-refine (default 25 turns, hardwired to `/refine`) | Stale/REFRAME checks ride on wall-clock heartbeats + gate predicates, not on imaginary turn triggers |
| `/refine` scopes: session-local (default) or `--global`; auto-refine fires on turn interval and at compaction | Free continual improvement inside a campaign; keep it **session-local** so campaigns stay independent |
| Kernel venv: uv + Python 3.11; `prime-agent-runtime` not on PyPI | Bake everything into the image once |
| Qwen behavior on Prime's code-first surface: **never measured**; old harness measured Qwen at 16–26/200 turns with zero skill calls | Step 0 is a go/no-go, and the fallback is pre-decided (§6) |
| Autonomous mode + gates are **fully SDK-configurable and in-process** (continuations injected inside `AgentSession`; no daemon needed); `rlm()` children also run in-process via the inline runtime | Neither the daemon nor RPC is required anywhere in this plan |
| Auto-refine defaults **ON** (25 assistant turns / after-compaction / 20-min cooldown) and needs only a persistent session artifact dir | In the headless campaign the session is one long-lived process, so auto-refine fires **natively** — free continual improvement, no wiring |
| In Proma, auto-refine is **armed but inert** (verified: artifact dirs exist, empty): dispose-per-run resets the turn counter, short runs never compact | First long product run will fire it silently — Track B makes this deliberate |
| Proma's four structural constraints: dispose-per-run sessions · `noTools:'builtin'` (ipython registered-inactive; `/goal` would activate it → the shield) · `systemPromptOverride` (drops the base RLM prompt + `rlm()` contract + tool promptGuidelines) · `skillsOverride` (all 13 Prime bundled skills filtered out) | Product and campaign stay **separate trust postures**; any future in-product RLM must revisit all four together (see memory `proma-prime-integration-audit`) |

Old-repo red lines that still bind: model-generated code executes only inside the
container; eval/data mounted read-only; no gate the model can run for itself; no gate
that can never go red; secrets never echoed; human owns spend / public deploy / push.

---

## 1 · Architecture

```
┌─ container  crucible-research  (THE trust boundary)
│    network: LLM gateway only (litellm :4004 → DashScope/Bailian, Qwen 3.7)
│    mounts:  /work (rw) · /data (ro) · /eval (ro, frozen)
│
│    pi -p --autonomous
│         --goal "resolve H* on P — every live claim has a landed discriminating
│                 probe; finish by producing report.md that passes the gates"
│         --goal-token-budget <n>
│         --autonomous-gate "python /gates/prereg.py    $RUN"
│         --autonomous-gate "python /gates/reconcile.py $RUN"
│         --autonomous-gate "python /gates/review.py    $RUN"
│         --autonomous-max-turns 200 --autonomous-max-continuations 8
│
│    kernel skills (Python, uv-installed, imported at bootstrap):
│      register   the belief state; sole writer of claim/probe status
│      probe      sole sanctioned execution path (worktree, frozen eval, provenance)
│      grill      one rlm() attack per round, prompt built from claim_view() only
│      figure     Qwen-VL: result plot → structured evidence entry   [multimodal]
│    markdown skill:
│      loop       router: ORIENT ritual + acceptance predicates per claim kind
│
│    automation (all native Prime, zero code):
│      auto-refine        session-local, turnInterval=25 + at-compaction (default)
│      heartbeat          interval 30m, steer delivery → "run register.stale()"
│
└─ artifacts/$RUN/
     register.json · journal.jsonl · prereg/P*.json (timestamped, written pre-launch)
     results/ (raw outputs + provenance) · figures/ · report.md

Proma (product shell: ipython stays blocked, session commands stay shielded;
       Track B §3b aligns its lifecycle with Prime — residency, refine surfacing,
       autonomous passthrough — without changing the trust posture)
  └─ later, optional: read-only Research Run panel rendering artifacts/

viewer.py → static HTML from artifacts/  →  judge-facing service (no execution path)
```

What each layer trusts: the model can lie inside the kernel (in-kernel validators are
fences); it cannot lie past the gates (host-run, replay `journal.jsonl`, recompute from
raw files). Bypassable mid-run, detectable at exit — and the exit is Prime's gate.

---

## 2 · Components

### 2.1 `register` — Python skill, ~400 lines + ~150 lines tests

State machines (six claim states, four probe states):

```
CLAIM  PROPOSED ─abduce ok→ LIVE ─text→ DEMOTED|SCOPED (reversible)
       LIVE ─landed probe + rule→ REFUTED | ARTIFACT | SUPPORTED   (terminal)
       LIVE ─artifact below floor→ CONTESTED (blocks headline, not terminal)
       terminal → graveyard (re-proposal refused)
PROBE  DRAFT ─prereg ok→ PREREG(hash,time) ─probe.run→ RUNNING ─artifact→ LANDED
       LANDED outside every band → TRIAGE, then forced ABDUCE
```

API (all state mutation goes through these; each appends to `journal.jsonl`):

```python
R = Register(run_dir)          # repr(R) = ~1.5k-token anchor, printed at ORIENT
R.constraints()                # graveyard + recorded constraints; REQUIRED before abduce
R.abduce(claim, kind, predicts, conflicts)   # Arbor 4-line: Mechanism/Hypothesis/Observable/Conflicts
R.demote(h, why); R.scope(h, to, why)        # text-licensed, reversible
R.prereg(tests, predictions, rule, controls, severity)  # → pid; writes prereg/P*.json BEFORE launch
R.land(pid)                    # reads raw artifact, RECOMPUTES metric, applies the rule mechanically
R.attack(h)                    # grill child on claim_view(h); result must land as typed entry
R.stale()                      # heartbeat target: in-flight? no transition recently? → owed action
```

Four validators (each refusal raises with the reason; one pytest per refusal):

1. **distinctness** — a new hypothesis must differ from every live H in ≥1 predicted
   observable, and its `conflicts` line must address the graveyard (Arbor discipline).
2. **lethality** — a prereg is refused unless ≥1 pair of non-overlapping predicted
   bands exists and ≥1 branch kills/scopes something ("decorative experiment" refusal).
3. **precedence** — `land()` refuses if the prereg file's mtime/hash isn't earlier
   than the result artifact.
4. **provenance/recompute** — `land()` refuses artifacts not produced via `probe.run`;
   it never accepts a reported number, it recomputes from the raw file.

Deliberately absent (cut): hash-chained log, discrimination ranking, calibration
ledger scoring, per-claim power analysis. `journal.jsonl` is one append-only file —
the gates need it; that is all the logging there is.

### 2.2 `probe` — ~150 lines

`probe.run(pid)`: git worktree per probe, frozen eval command (hash checked against
prereg), subprocess with timeout, writes `results/<pid>/` with
`{produced_by: probe.run, eval_cmd_hash, seeds, raw_path}`. If the chosen case has an
improvable artifact (a trained model / pipeline), import Arbor's `session_ops` as a
plain library for worktree+eval mechanics — no MCP server, no Arbor runtime, no tree.

### 2.3 `grill` — ~80 lines Python + prompt pack

One attack per round: `rlm(prompt, name=f"grill-{h}", model=<qwen>)` where the prompt
is built from `R.claim_view(h)` (claim + its evidence, never the proposer's reasoning)
plus the attack protocol distilled from `ccf` `debate-protocol.md` /
`iterative-questioning.md`. Its return must be typed — new H (routed through
`R.abduce`, same validators), a promoted constraint, or `no_change(reason)` — advisory
prose is rejected. **Honesty note carried into the PDF: prompt-blinded, not
structurally isolated** (an rlm child can read disk).

### 2.4 `loop` — markdown skill, ~4 KB

The router, ported from `ccf` grill-loop's shape: ORIENT at session start and after
compaction (`print(R)`, read constraints, one Decompose-Simplify-Reconstruct pass on
the thesis sentence), then the move menu. Phase is **derived** from which claim kinds
are live, never stored. The six ccf phase files and 11 references are copied under
`references/` and loaded on demand (`LOAD WHEN:` discipline stays); they are content,
not control flow.

### 2.5 `figure` — ~60 lines

`figure.read(path)` sends the plot to Qwen-VL via the gateway, returns a structured
evidence entry (`{observation, axes, values_read, caveats, simulated: bool}`) that the
model must attach via the register. This is the entire multimodal story; per the
rubric it is worth real points and per our principle the numbers in any *published*
figure are still rendered by code from the evidence package.

### 2.6 Gates — 3 scripts, ~150 lines each, ported predicates from archived `gates/`

| Gate | Refuses when | ARFT failure it closes |
|---|---|---|
| `prereg.py` | any landed probe whose prereg timestamp/hash does not predate its result; any prereg missing a kill branch | A.2 (44.6%), P14 red line |
| `reconcile.py` | any claim cited in `report.md` without an artifact; any headline number that fails recompute from raw | D.4 (77.5%), E.2 (78.1%) |
| `review.py` | review not structured claim→verdict; any CONTESTED/uninterpretable claim still in the headline | F.4 (82.5%), D.7 (60.8%) |

Wired as `--autonomous-gate` (terminal, host-run). Also callable by the model mid-run
for self-checks — that use is advisory; only the host invocation is enforcement.
Ledger rule: record **which bound ended every run** (gates-passed vs retry-exhausted
vs max-turns vs token-budget) — they are different outcomes, never merged.

### 2.7 Container — 1 Dockerfile + compose entry

Bakes: prime-agent (from `~/oss/prime-agent` checkout), kernel venv (uv, Python 3.11,
ipykernel, `prime-agent-runtime` from local path), our five skills, gates. Network:
gateway only. Mounts per §1. This is also the reproducibility story for P20 — the
judge instruction is `docker compose run campaign`.

### 2.8 `viewer.py` — ~150 lines

Renders `artifacts/$RUN/` into one static HTML page: register table with state
history, per-probe prereg-vs-result panels (timestamps visible — this is the
"headline deliverable": a gate red→green timeline), figures, report. Output is inert
HTML → safe to host anywhere for judges. A Proma read-only panel can embed the same
render later; it is explicitly **not** on the critical path.

---

## 3 · Automation wiring (the "we have time" lever)

### 3a · Campaign side — all native Prime, configuration only

- **Auto-refine** stays on (session-local, turn-interval 25 + at-compaction — both
  fire natively because the headless session is one long-lived process). It
  accumulates *procedural* lessons (GPU routing, preprocessing quirks) inside the
  campaign for free. Epistemic state never goes through refine — that is the
  register's job. `--global` refine stays off so campaigns remain independent
  (global writes also land in process-global `~/.prime/agent`, not our config dir —
  one more reason to keep it off).
- **Heartbeat** `every 30m`, steer delivery: `"Run R.stale(); if an owed action
  exists, do it before anything else."` This replaces the (nonexistent) turn-count
  trigger for REFRAME/stale checks and implements "never idle while a run is in
  flight" without any custom code.
- **Goal** carries the epistemic objective; `/goal`'s force-activation of ipython is
  fine here — the container is the boundary.
- **Conditional skill loading** is native (skills withheld when their controller is
  absent); our five load always; references load by `LOAD WHEN:`.

### 3b · Track B — product shell alignment (parallel, never blocks the campaign)

The integration audit's conclusion in one line: *Proma is already a faithful shell
for Prime's conversational core; everything long-horizon is blocked by one decision —
the per-run session lifecycle.* Four items, in leverage order:

1. **Session residency**: keep one `AgentSession` per conversation, dispose on idle
   timeout instead of per run. Unlocks in one change: the auto-refine turn counter
   accumulating across user messages, goal/autonomous state continuity, and a sane
   path to kernel snapshots later.
2. **Surface auto-refine, don't schedule it**: Prime's own condition-based triggers
   stay the policy. Proma stats `<artifact-dir>/harness/harness_state.json` after
   each run and shows a "lesson recorded" chip with the diff; `autoRefine.{enabled,
   turnInterval}` map into Proma settings. Without this, the first long product run
   fires refine silently (review-gate model call, invisible writes).
3. **Manual "Refine now" UI action** calling `session.refine()` (native snapshots +
   rollback). The `/refine` slash command stays shielded — UI action, not text parse.
4. **Autonomous passthrough**: expose Prime's `autonomous: {enabled, gates…}` config
   on research-mode sessions. In-process, no daemon; pairs with §2.6's gates if we
   later want gated runs launched from the product.

Explicitly NOT in Track B: enabling ipython in the product. That requires revisiting
all four structural constraints together (tools, shield, system prompt, skills) and
stays out of scope until after the competition.

---

## 4 · Schedule

| Dates | Step | Deliverable | Acceptance |
|---|---|---|---|
| 08-22 → 08-24 | **0 · Go/no-go probe** | container + toy campaign (2 planted hypotheses, stub register, 1 trivial gate) on qwen3.7-plus | model **calls the Python skill** unprompted ≥1×; survives host continuations past turn 30; gate loop closes red→green; kernel state survives one forced compaction |
| 08-24 → 08-27 | **1 · Spine** | register + probe + grill + figure + loop + 3 gates + image | each validator has a failing test that trips it; end-to-end smoke: one fake probe lands, `reconcile.py` catches one planted hallucinated number (positive control) |
| 08-27 → 09-01 | **2 · The campaign** (this IS the submission evidence) | round 1: constraints → abduce ≥2 → prereg on disk → run → land → attack; round 2 driven by round 1's rule | P13–P17 chain complete with pre-execution timestamps; ≥1 real gate red→green event in `journal.jsonl`; ≥2 live hypotheses at all times; which-bound-ended recorded |
| 09-01 → 09-04 | **3 · Surface** | viewer HTML + judge deployment (human) + 20-page PDF + ≤10-min video | service reachable & inert; PDF written *from* artifacts (no claim without an artifact — our own reconcile gate applied to ourselves); Bailian credentials/screenshots included |
| 09-04 → 09-05 | buffer | submission package (夸克网盘 + form) | checklist in Race/FILLING-1B §4 red lines all green |
| anytime, parallel | **Track B** (§3b) | residency → refine surfacing → refine action → autonomous passthrough, in that order | pure product work; never blocks Steps 0–3; stop wherever the deadline says stop |

Parallelism note: Step 2's GPU/waiting time overlaps Step 3 writing; heartbeats keep
the campaign moving unattended, which is what buys the slack. Track B fills the gaps
— its items are independent of the campaign and individually shippable.

---

## 5 · Cut list (explicit, so nothing creeps back)

Ablation arm tables · trap worlds · ARFT-judge scoring of our own trajectories ·
hash-chained journal · challenger-drift machinery / retained-adversary rotation ·
discrimination ranking & calibration scoring · Arbor MCP server or idea tree ·
GenericAgent code (we keep two *ideas*: the always-on anchor → `repr(R)`; SOP
crystallization → auto-refine) · any Prime fork modification · any Proma backend
capability beyond Track B (§3b) — in particular **no in-product ipython** · any
benchmark matrix. If the PDF needs a comparison, it cites the gate
red→green timeline and the hallucinated-number positive control — evidence of
*mechanism*, not a leaderboard.

---

## 6 · Risks and pre-decided fallbacks

1. **Qwen won't drive the code-first surface** (Step 0 fails on skill-calling).
   Fallback, decided now: keep the identical register/gates, but the `loop` skill
   ORIENT text ends every turn with the explicit next `R.*` call to make
   ("harness states the obligation; the model fills the arguments") — the
   ARCH-RESEARCH lesson applied. Autonomous continuations already cover the
   voluntary-exit failure regardless.
2. **Kernel/venv friction in the container** (uv, unpublished runtime). Contained by
   baking at image build; if bootstrap fights us, pin `PRIME_AGENT_KERNEL_PYTHON` to
   the image's venv and skip uv at runtime.
3. **Campaign overruns** (science refuses to cooperate by 09-01). The register's
   states make the honest fallback cheap: a CONTESTED/ARTIFACT outcome with a clean
   prereg trail is *still a complete P13–P17 chain* — the template explicitly scores
   preserved failures. We submit the loop working, whatever the result says.
4. **Concurrency collapse** (measured: 9 Prime instances kill the box). One campaign
   container at a time; grill children are sequential; cap any parallelism at 3.
5. **Gate never fires red** (violates "no gate that can't go red"). Step 1's positive
   control (planted hallucinated number) is mandatory, not optional.

---

## 7 · Decisions owed (blocking Step 2, not Step 0/1)

1. **The research case (P13)** — owner: you. Needed by 08-26. The register is
   case-agnostic; the prereg bands and control library are not.
2. **Judge service placement** — owner: you (public deploy is human-owned). The
   artifact (inert HTML) will be ready by 09-02; where it lives is your call.

Grill child: **in** for v1 (approved shape). Everything else in this plan is
implementable without further input.
