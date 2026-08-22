I read `ARBOR.md` alongside the rest. Let me work from first principles, because the answer to "Prime + Arbor" depends on being precise about what each actually provides.

## 1. What science needs, and the six ways it fails

Strip research down to a belief state **B** (competing explanations), a world **W**, and four operations: *propose* (B gains an element), *probe* (query W, get observation **o**), *update* (B changes as a function of o and a rule), *report* (serialize B). Science works when two couplings hold: **B changes only through o**, and **o was produced by a probe that could have come out otherwise**. Every failure in ARFT's 45 patterns is one of six ways those couplings break:

| | Failure | What breaks | ARFT instances |
|---|---|---|---|
| F1 | Update without observation | B changed because of text — the model's argument, a reviewer's tone, "seems plausible" | E.2, D.4, X.5 |
| F2 | Observation without update | o arrived, the rule said B should change, B didn't | F.4, D.7, X.7 |
| F3 | Observation that couldn't disconfirm | o was circular, leaked, confounded, an artifact, a broken baseline, a substituted metric | C.1, C.2, D.1, A.5, A.2, X.6 |
| F4 | Singleton hypothesis space | \|B\| = 1, so nothing is discriminated; o confirms by default | A.1, X.3 |
| F5 | Budget on non-discriminating probes | probes chosen by ease rather than expected change in B | D.5 (Fig. 4c), C.6 |
| F6 | State amnesia | B, its predictions, and its graveyard live in context, not on disk; F1–F5 recur silently | X.1, X.2, re-proposing kills |

F1 and F2 are one thing: *the B↔o coupling is under the model's discretion*. F3 is: *the o↔W coupling is under the model's discretion* (it controls the eval). F4–F5 are generation and selection quality. F6 is persistence.

Now your guess about why GRILL + Deep Research "worked reasonably well." Map it: GRILL's challenger and debate attack F4 (a second hypothesis exists) and part of F3 (silent assumptions surface). Deep Research attacks F4 from the literature side. Prereg and the ledger attack F3 (prediction precedes result) and F6. The four controls attack F3 for representation geometry specifically. What the loop left untouched: F1/F2, because Opus is both author and judge; F5, because Opus selects; and F3 outside the control library. That residual is exactly the class ARFT reports at 60–82% across every harness. So your guess is right, and it's specific: you eliminated the generation-side failures and kept the discretion-side ones.

The discretion-side failures have one fix, and it isn't cognitive: **belief change must have a syntax, and the syntax must have a type-checker the model doesn't own.**

## 2. What Prime Agent gives natively — and the RLM exploit

Here is the feature that matters most for you, more than the autonomous gate, and it's implicit in RLM rather than advertised: **in a chat harness, everything the model emits is text, and the harness cannot tell a claim from a conclusion from a review. In RLM, the model emits code.** Code that calls `R.land(probe)` is a state transition; code that prints a paragraph is not. A Python object can refuse the former and ignore the latter. That is closure, and it's why the same epistemic prompts that failed in ARFT can work here — not because the model thinks better, but because its thoughts cannot change the state without passing through a checked call.

Mapping the rest of Prime's native surface onto the six failures:

| Prime feature | Failure it addresses | How to use it |
|---|---|---|
| Persistent IPython kernel, state survives compaction | **F6** — the whole thing | The belief state is a kernel variable *and* an append-only log on disk. Compaction compresses the conversation; `R` is untouched. Phase 0 ORIENT becomes `print(R)`. |
| Prompt-as-a-variable; `rlm(...)` with constructed context | **F4** | The adversary child gets `R.claim_view(h)` and nothing else. "Never reveal your hypothesis to the answerer" stops being a discipline and becomes a function argument. |
| One Python surface | **F1/F2/F5** | Moves are method calls with guards; the predicted-outcome table is a dict; selection is computed. The proposer writes proposals; it cannot write B. |
| `--autonomous-gate` (host-evaluated, fail-closed) | **F1/F2/F3**, terminal | The one non-bypassable check. Replays the log; recomputes; refuses a report whose headline cites a contested claim. |
| `--goal` + `--goal-token-budget` | **X.2 goal drift** | State the goal *epistemically* ("resolve H1–H3 on P; stop when every live claim has a landed discriminating probe"), not as a metric. |
| Heartbeat (`rlm_heartbeat`) | your "never idle while a run is in flight" | Fires `R.stale()`: if a job is in flight and no transition in N turns, force a D-S-R pass. Converts "fires on feeling confident" — which no harness can detect — into an event. |
| Retained subagents | F4 over a long campaign | A retained adversary keeps its own adversarial memory, so its attacks don't drift toward agreement with the proposer. |
| Container boundary (they're explicit: not a sandbox) | **F3** | Mount eval scripts and data read-only. This is the real wall; everything in-kernel is a fence. |
| `/refine` (session-local) | procedural only | Lessons about GPU routing and preprocessing, never epistemic state. The ledger is the epistemic memory. |
| Autonomous counters | honesty | Record *which* bound ended the run. Gate-satisfied and max-turns are different ledger entries. |

The trade-off you have to name: **an in-kernel guard is bypassable.** The model can write `R._h["H1"].status = "refuted"` — you cannot whitelist Python. Arbor's MCP server is non-bypassable precisely because it's a separate process with twelve tools. Two things resolve this without giving up the kernel. First, guards *recompute*: `R.land(pid)` doesn't accept a value; it reads the artifact from disk and recomputes the metric from raw output with the frozen eval command (this is exactly Arbor's merge guard re-running `eval_cmd_test` in a detached worktree). Bypass then requires forging a file, not lying in a call. Second, the log is hash-chained and the host gate replays it; a transition without a guard-valid artifact fails the run at exit. Bypassable mid-run, detectable at the exit — and the exit is Prime's gate, which the model doesn't control.

## 3. Arbor, from first principles: right form, wrong predicate

What Arbor is, reduced: a durable tree of ideas, a scalar score per node on a dev split, and **one guarded transition** — merge into trunk — licensed only by a recomputed held-out score that beats trunk, with eval and data untouched. "Skills reason, MCP executes."

The form is exactly the closure device: a stateless deterministic owner of the state, no LLM, that refuses illegal transitions and recomputes rather than trusts. Keep every piece of that. Also keep four content items Arbor got right: load the graveyard before ideating (`tree_view(fmt="constraints")` as the mandatory first call of IDEATE); the *Conflicts* line in the four-line hypothesis ("pruned [id] said X; this counters via Y"); the iterate-signal/decide-signal split; and one worktree per experiment with the eval frozen on trunk.

The predicate is wrong for your science, and for the reason your Event note already states. Arbor's only positive transition is "the number went up." A mechanism campaign's transitions are kills, scopes, and supports whose evidence is often *that a number did not move* — matched-rank random didn't shift behavior; the random-init control didn't reproduce the phenomenon; the predicted F landed inside its band. None of those is a monotone merge. An Arbor guard cannot express "H1 died because the shadow test moved behavior equally," and a merge gate tuned to a score is the ChemBench failure (RMSLE 0.001, wrong mechanism) formalized. Your `stack.md` retirement note has the other half: a cross-campaign idea tree was the wrong memory shape — you need typed claims (phenomenon / mechanism / method) with typed deaths (ARTIFACT / REFUTED / CONTESTED), not depth-scored children.

And the reason Arbor was slow here — JSON-RPC round-trips — **vanishes under RLM.** The cost was never the local call; it was one LLM turn per tool call through the host harness. In the kernel, one cell does ten register operations in one turn. So you don't need `arbor mcp` at all. The register lives in the kernel, the gate lives in the host.

So: not Prime + Arbor. **Prime + an Arbor-shaped register whose guard is a preregistered rule instead of a monotone score.** Arbor's six-step cycle maps one-to-one:

| Arbor | Register |
|---|---|
| OBSERVE | `R.summary()`, then `R.constraints()` — graveyard first |
| IDEATE | `R.abduce(...)` — refused unless it predicts something distinct from every live H and states its relation to the graveyard |
| SELECT | `R.rank()` — discrimination ÷ cost, computed from the predicted-outcome table; empty when \|live\| < 2 |
| DISPATCH | `probe.run(pid)` — worktree, frozen eval hash, handle that survives compaction |
| BACKPROP | `R.land(pid)` — recompute, apply the rule written before launch; `cancels` propagates |
| DECIDE | already decided by the rule; the model's only move on an outside-band result is triage then ABDUCE |

## 4. The minimal architecture

Three components, two of which are Prime itself:

```
Prime Agent (-p --autonomous --goal <epistemic objective> --autonomous-gate "python gate.py $RUN")
  └─ kernel
       ├─ R : Register        ← the only thing that can change B; ~8 methods; guards inside; hash-chained log
       ├─ probe.run(pid)      ← the only path to the GPU; worktree + frozen eval
       └─ rlm(adversary, context=R.claim_view(h))   ← retained child; sees the claim, never the reasoning
  └─ host gate.py             ← replays the log; recomputes headline numbers; protected paths unchanged;
                                 prereg_time < result_time; no CONTESTED claim in the headline; exit 1 otherwise
```

No host controller, no RPC, no MCP, no phase files as control flow. The loop is `while not gate: observe → propose → guard → run → land`. This is a real reduction from my previous answer: the host controller collapses into Prime's autonomous policy, the transition validators collapse into methods on one object, the challenger collapses into `rlm()`, and only the terminal gate stays outside.

The formal model is two small state machines, and it is the compact representation of the reasoning constraints you asked for:

```
CLAIM
  PROPOSED ──abduce guard: distinct prediction ∧ conflicts line ∧ not in graveyard──► LIVE
  LIVE ──text (argument, review, retrieval)──► DEMOTED | SCOPED        reversible; prose may do this
  LIVE ──artifact ∧ rule ∧ recompute──► REFUTED | ARTIFACT | SUPPORTED  terminal; only a landed probe may do this
  LIVE ──artifact below floor (seeds, MDE, missing declared output)──► CONTESTED   blocks the headline, not terminal
  any terminal ──► graveyard entry with the killing control; re-proposal is refused

PROBE
  DRAFT ──prereg guard: ≥2 live H ∧ ≥1 pair of non-overlapping bands ∧ ≥1 branch that kills ∧ class controls ∧ severity──► PREREG (hash, time)
  PREREG ──probe.run: eval cmd hash matches freeze──► RUNNING
  RUNNING ──artifact with provenance──► LANDED ──rule applied mechanically──► claim transitions
  LANDED outside every band ──► TRIAGE (metric artifact → bug → noise → known → real) ──► ABDUCE forced
```

Eight predicates carry the entire "cognitive skill": distinctness, discrimination, lethality, precedence, provenance, recompute, floor, graveyard. Everything else the model does is proposal, and proposal is free. Your `SKILL.md` rules map onto them directly — "reasoning may demote, only measurement may kill" is the CLAIM machine; "if no outcome can kill, the experiment is decorative" is the lethality predicate; "a kill needs a result artifact on disk" is provenance; "seeds below the floor → CONTESTED not REFUTED" is floor; "absence is a candidate, not evidence" is why retrieval can only produce DEMOTE/SCOPE or a new PROPOSED, never a terminal transition.

The interface, as the model sees it in the kernel:

```python
R = Register(run)                                  # repr(R) is the ~1.5k-token anchor, re-printed each turn
R.constraints()                                    # graveyard + recorded constraints + ledger's systematic-error classes
R.abduce(claim, kind, predicts, conflicts)         # → LIVE  | raises NotDistinct, Retreads(id)
R.demote(h, why);  R.scope(h, to, why)             # text-licensed, reversible
R.prereg(tests, predictions, rule, controls, severity)   # → pid | raises Decorative, Underdetermined
R.rank()                                           # [] if fewer than two live hypotheses
probe.run(pid)                                     # worktree, frozen eval, handle
R.land(pid)                                        # reads raw, recomputes, applies rule; TRIAGE if outside all bands
R.attack(h)                                        # rlm child on claim_view(h); returns typed: H | constraint | no-change
R.record(pid, observed)                            # ledger: band vs value, lesson class
```

Where your existing content goes: the six phase files become the *acceptance predicates* per claim kind (data the register consults when asked "is this phenomenon claim SUPPORTED?"); the four controls become the class control library `R.prereg` checks; `iterative-questioning.md` and `debate-protocol.md` become the adversary child's prompt; `research-judgment.md` §4 becomes TRIAGE. Nothing is thrown away; it just stops being control flow.

Arbor's coordinator/executor split is not needed as two agents. It existed so the coordinator couldn't touch eval while "just implementing." Here that's filesystem permissions (read-only mounts) plus `gate.py`'s protected-path diff against the freeze commit. Same guarantee, one kernel.

## 5. What this does not cover

Say these in the report as model limits rather than pretend the architecture closes them:

- **H2 quality.** The register can require a second hypothesis with a distinct prediction; it cannot tell a real alternative from a strawman. The retained adversary raises the floor; it doesn't remove the limit.
- **Probe synthesis.** Discrimination is checkable against the *stated* predictions. Whether the measurement is the right measurement of the phenomenon is domain content — the control library — and it's the part of your work that is actually reusable across campaigns.
- **Severity and triage** are judgments the guard can require but not perform.
- **In-kernel guards are fences.** The wall is the container and the read-only mounts. The reading memo's "the enforcement problem is over" is true only at the exit gate.
- **A retained adversary drifts.** Over a five-week campaign it will start agreeing. Reseed it at phase boundaries or rotate the backbone.

## 6. What to do first

Build the register as a Python package (Prime's own skill format), load it into the kernel, and run the six trap worlds from last time under four conditions: Prime bare; Prime + epistemic prompts only (the ARFT condition); Prime + register + gate; Prime + register + gate + adversary. Add one Arbor-specific control: the same campaign with a monotone-score guard in place of the prereg-rule guard, on a world where the low-error answer has the wrong mechanism. That single comparison is the cleanest empirical statement of why the predicate had to be generalized. Score everything with the released ARFT judge so the numbers land in the field's vocabulary.

I can write the reference `Register` with its guards, the hash-chained log, and `gate.py` as a working package with tests, if that's the next artifact you want.