Yes — this lands, and it corrects a real bias in my plan. I scoped the port defensively ("what mitigates ARFT's R2"), which builds a better floor. Your point is that the floor is already built — gates, prereg, provenance — and what's missing is the ceiling: the generative repertoire that produces hypotheses and experiments worth gating in the first place. ccf itself recorded this exact principle when it removed MoA: "a quorum raises the floor and lowers the ceiling, and this campaign needs the ceiling."

So the architecture gets three layers with different owners, and ARFT moves down a layer:

┌───────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────┐
│           Layer           │                                                What it is                                                │                          Status                          │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
│ Commitment layer (floor)  │ MCP + gates + sandbox — keeps evidence honest                                                            │ built, done, don't grow it                               │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
│ Move repertoire (ceiling) │ the generative cognitive strategies, each triggerable by research state, each terminating in an MCP call │ the actual gap — this is the work                        │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
│ Evaluation vocabulary     │ ARFT + its released judge — for scoring our own trajectories and P19 material                            │ demoted: test instrumentation, never the design ontology │
└───────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────┘

One honest boundary I'll keep: the commitment layer stays load-bearing (your own P4.3 campaign is the proof — the [45,45] band happened to us), but it's finished. Everything new goes into the repertoire.

The move library

A seventh skill, research-moves — SKILL.md is a trigger index (~50 lines), one reference card per move (~60 lines each), ccf's LOAD WHEN: convention. Each card: trigger stated as a belief-state shape where possible, the general recipe, the caveat that keeps it honest, and — the part you called "using them in reverse" — how the move terminates in a claim_propose or prereg_write. Generative moves don't have ARFT's inertness problem precisely because their output is new state; a perspective shift that doesn't land as a claim didn't happen.

┌──────────────────────────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────┐
│                                             Move                                             │                           Fires when (state shape)                           │                    Terminates as                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ reframe — perspective / abstraction / problem-class shift, reformulation-beats-solution      │ all LIVE hypotheses share a hidden premise · candidates keep dying to the    │ a rewritten thesis or a new claim whose conflicts   │
│                                                                                              │ same control · N probes with no claim transition · after compaction          │ names what the old frame assumed                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ oracle — privileged intervention: inject ground truth, skyline baselines, capacity you       │ about to invest in improving component X without knowing X's contribution    │ a prereg'd oracle arm + matched-null arm, bands per │
│ shouldn't have                                                                               │ ceiling · claim of form "X carries the effect"                               │  arm                                                │
├──────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ derive — first-principles / mathematical modeling: 2–4 fitted quantities that predict,       │ writing a band whose width is arbitrary · before any expensive probe · a     │ the band itself — a derived prior with honest       │
│ reasoning from objective/optimization/inductive-bias structure                               │ landed result needs a why                                                    │ width, the model named in the prereg question       │
├──────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ bridge — root-vs-shadow, construct the missing intermediate observable                       │ a co for a mechanism claim                      │ an intervention probe + matched-rank control + the  │
│                                                                                              │                                                                              │ shadow test                                         │
├──────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ transfer — cross-domain structural analogy, schema mapping                                   │ graveyard growing, no live candidates · explore regime                       │ a claim whose statement imports another domain's    │
│                                                                                              │                                                 │ mechanism noun                                      │
├──────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ ladder / boundary — sweep a resource; "does X even need Y" naive questions                   │ a mo· a component's necessity is assumed, never │ a sweep probe whose bands encode where behavior     │
│                                                                                              │  tested                                                                      │ should change                                       │
└──────────────────────────────────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────┴─────────────────────────────────────────────────────┘

Your RGB-D example is the oracle card's worked example verbatim — with the caveat missing-point-methoresult licenses investment decisions (the value-per-bit ceiling), never mechanism claims directly; thebridge move is what converts a located bottleneck into a mechanism.

Note what derive does for the commitment layer: the zero-width-band guard rejects recall, but nothing currently tells the agent how to produce a band with honest width. A derived parametric prior is the answer — the two layers meet
exactly there.

The competition tie-in got stronger, not weaker

Template P11: regenerating a plan ≠ feedback iteration — round 2 must be caused by round 1's measuredto a landed result is precisely that causal connector. "P3 landed outside H1's band → triage → reframemove → H3 proposed with conflicts naming H1's hidden premise → round-2 probe" is a traceable chain the journal already records. The moves aren't decoration on the campaign; they're what makes the round-1→round-2 adjustment defensible
under P14/P16/P17.

Confirmed removals and keeps

- Not ported: every lane that leaves the Prime runtime — ChatGPT web grill, Scholar, Grok verifier, cary seat and the blind-prediction seat are rlm() children (the asymmetry-trigger table from my lastmessage stands). Only the pressure-move vocabulary survives, inside the adversary prompt.
- Kept from the previous plan (you didn't object, and they're small): screen distillate into abduce, s prereg question, LOAD WHEN: conventions.
- Reconsidered per your instruction: missing-point method is back in — generalized (oracle, bridge, ladder are its domain-free decomposition), not copied.

Revised batches

Batch 1 — before P5.1 (~2 days): research-moves skill with the three cards P5.1 needs — reframe, oracle, derive — plus pointers from abduce (reframe/transfer as hypothesis sources) and probe (oracle/derive/ladder as design sources;
severity line). Test: existing suites green, archived campaign 3×PASS, plus one scripted mini-campaigived through a move card.

Run P5.1 — its friction list is the test of whether the triggers fire at the right moments.

Batch 2: bridge, transfer, ladder cards + grill pressure-move upgrade + loop's session-start re-grill

Batch 3 (time permitting): report calibration/negative-result bar; optional severity as a first-class

If this matches your model, say go and I'll write Batch 1.