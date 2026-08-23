All the source material is read — the six ccf loop files, all eleven references, the full ARFT taxonomy with its 45 pattern definitions, Fable5.md/PrimeAgent.md, the Superpowers→Pi adaptation, and the current six crucible skills. Assessment first, then the corrected plan.

Verdict

The direction is right — the cognitive content is genuinely missing — but two of your ten steps need correction, and the whole plan must be subordinated to one fact: the competition scores a two-round evidence chain, not our skill architecture. With 13 days to 09-05, the batches must be sized so P5.1 runs between them, because the campaign is the only real test a cognitive skill has.

The gap is real and measurable. The six crucible skills total 390 lines and teach the mechanics of the commitment layer — how to fill claim_propose, prereg_write, how to spawn the adversary. The ccf grill-loop is ~1,900 lines and carries the cognition: the six-question screen, severity ("would this test have passed even if the claim were false?"), explanation-ranking criteria (what does this explanation forbid?), the anomaly-triage ladder, problem-class classification, prediction-error-as-unit-of-work, the D-S-R re-grill at session start. Almost none of that survived the rebuild. Your instinct is correct.

The one design constraint that keeps this from backfiring

Fable5.md's own opening finding: ARFT is an 800-trajectory negative result for prompted cognition. The ARFT rollout prompt already asked every agent to name alternatives, falsifiers, and weakest points — the moves were performed and inert (F.4 at 82.5%). Crucible's answer was the commitment layer. If we now pour 1,900 lines of epistemic prose back into skills, we rebuild the thing that failed.

So the porting rule is: every ported line must either (a) shape an argument to an existing MCP call, or (b) name a judgment the structure provably cannot check, placed at its decision point with a one-line self-check. The existing "取反不是第二条假设" section in research-abduce is the template — it exists precisely because the type-checker can't detect negation.

The ARFT taxonomy tells us exactly which content qualifies. Crucible's structure already covers R1 (reconcile/trace kill D.4, D.6, E.1), R3 (sandbox + provenance + declare-refusal kill C.1, C.2, F.4, D.7), and the "judging results" half of R2. The paper says the remaining piece is model-level: "recognising limits cannot be repaired that way — when an agent never considers a second hypothesis, nothing can flag what was never written down." That's A.1 frame-lock, B.4 shallow search, X.3 skepticism deficit, D.5 baseline deficit, C.6/C.7/X.7 re-planning failure, A.5 metric misalignment. That list is the porting scope. Everything in ccf that mitigates those patterns comes over; everything else stays.

Step 1 of your plan is already done — and it shrinks

I read the Superpowers→Pi adaptation: references/pi-tools.md is a 30-line tool-mapping table, nothing deeper. There is no rich adaptation pattern to study. What Superpowers actually contributes:

1. Description = trigger only, never workflow ("Use when…" + symptoms). ccf's LOAD WHEN: lines are already a superior version of this — every reference opens with its own trigger.
2. TDD for skills: watch an agent fail without the skill before writing it. Our version already exists — the P4.3 friction list, and the P5.1 campaign as the next test bed.
3. Router loads one file — crucible's research-loop already does this.

So step 1–2 collapse into: adopt the LOAD WHEN: convention for any reference file we add, keep descriptions trigger-shaped, and treat each campaign's friction list as the RED phase.

Where rlm() triggers — the principled answer

Not context pressure. Compaction + the kernel anchor already handle context; spawning a child to "offload complexity" just loses state. rlm() fires when the value comes from what the child does not know — information asymmetry is the only trigger type:

┌──────────────────────────────────────────┬────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────┐
│              Trigger state               │                       Child sees                       │    Child must not see    │                               Port of                               │
├──────────────────────────────────────────┼────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Claim heading to SUPPORTED (existing)    │ claim_view (claim+evidence+graveyard)                  │ your defending reasoning │ grill                                                               │
├──────────────────────────────────────────┼────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Fresh hypothesis, before its first probe │ the setup with outcome removed → predict + confidence  │ your bands               │ screen Q2 blind prediction                                          │
├──────────────────────────────────────────┼────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Hypothesis statement just written        │ the bare sentence → "what experiment does this imply?" │ everything else          │ screen Q1 reconstruction check                                      │
├──────────────────────────────────────────┼────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Never                                    │ —                                                      │ —                        │ analysis/summarizing/double-checking your own work (ccf's own rule) │
└──────────────────────────────────────────┴────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────┘

Rows 2–3 are cheap and directly produce P16/P19 material — a wrong blind prediction, quoted, is the h was needed."

What does NOT come over

1. Browser/ChatGPT machinery (browser-patterns, debate-protocol's 4-role panel, iterative-questioningwas ccf's instrument; crucible's adversary is rlm children. Only the pressure moves table andinstrument panel transfer, as adversary-prompt vocabulary.
2. Missing-point method — representation-geometry-specific (activation patching, oracle grids). Wrong
3. GPU economics (tier ladder T0–T5, GPU-busy agenda) — crucible probes are sandboxed and cheap. Only the principle survives: cheapest-first, ranked by P(kill)/cost.
4. ResearchStudio's IdeaSpark — literature-corpus ideation is the wrong stage for 1B (experiment plant idea generation). Revisit only if the P5.1 campaign shows candidate generation is the weak link.
5. Phase files as control flow — crucible derives phase from belief state; keep it that way.

The batch plan

Batch 1 — before P5.1 (1–2 days). Hypothesis and probe quality. This is the content that determines whether the two-round evidence chain is non-trivial.
- research-abduce: add a compressed screen (Q1 one-sentence bar with the reconstruction test via rlm;lience, independent testability, what does it forbid; "an unanswered question is a NO").
- research-probe: add severity as a required line in the prereg question field (one sentence, no schema change), and the P(kill)/cost selection rule into SELECT.
- Test: existing 52 research-mcp tests + skill-CLI contract test + archived honest campaign still 3×P

Run P5.1. The campaign's friction list is the RED phase for Batch 2.

Batch 2 — after P5.1 (1 day). Adversary depth + orient.
- research-grill: pressure moves (MECHANIZE/QUANTIFY/COUNTERFACTUAL-OBSERVABLE/PROVENANCE) + the S1/S6 question types folded into the four lenses; blind-prediction child contract.
- research-loop: the D-S-R re-grill at session start ("the reconstruction differing from the anchor Itopping rules.
- Test: rerun or extend the campaign; gates green.

Batch 3 — only if time permits before 09-05. Calibration as taste.
- research-report: the negative-result bar (general + explained — directly P19's "无提升 needs cause coring in the calibration section.
- Optional: severity as a first-class prereg_write field with a non-empty check — the only MCP change in the whole plan, deferred because it's schema surface.

Each batch maps its additions to ARFT pattern IDs in the commit message — that mapping is itself submission material ("structure addresses R1/R3; skills address R2's recognizing-limits half; here is the paper that says why").

One flag: your memory says new prompts default to English, but all six current skills are Chinese. I'd keep the skill set internally consistent (Chinese) rather than split it — say the word if you want the opposite.

Next action: confirm Batch 1 scope and I'll write the two skill diffs.