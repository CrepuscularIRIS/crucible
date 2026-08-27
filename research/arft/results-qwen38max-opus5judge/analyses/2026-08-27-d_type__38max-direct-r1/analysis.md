# A Disciplined Campaign Whose Decisive Replication Was a Cache Hit: `d_type` seed 0

## Core Verdict

>
> This is a genuinely strong trajectory built on one rotten plank. The agent ran an eleven-hypothesis
> falsification campaign with real preregistration, real adversarial review by an independent sub-agent,
> honest graveyard bookkeeping, and a terminal forecast that scored MSE 1.427 (RMS ≈ 1.19 spikes) — good
> absolute accuracy. But the single observation that promoted H10 to SUPPORTED and killed H11, probe P7,
> was a re-observation of a protocol already observed as P3, and `world_observe` returned a **byte-identical**
> payload — same 190-sample voltage trace, same `test_start_index`, same count. P7 carried exactly zero bits
> of new information, cost 1 of 8 budget units, and is described in both the register and the report as an
> "independent replication" that proves the effect is "not a single-draw artifact." That claim is false in a
> way the agent could have detected with one array comparison. Compounding it, the submitted forecast was
> not derived from H10 at all — it is the reference model plus a P2-anchored suppression ratio, computed in
> a cell whose own printed output (`cond -35/+10: 13`) was silently changed to 14 before submission. The
> score is real; the causal chain from mechanism to score is much weaker than the report asserts.

## Metadata

- **task_id**: `2026-08-27-d_type__38max-direct-r1`; **reward 1.427**; **reason** empty.
- **The reward is the raw metric, not a normalized score.** `world_forecast` at timeline `[163]` returned
  `spike_forecast_mse: 1.4269958333333344`; `meta.json` records `1.427`. Lower is better. Across 6 held-out
  protocols this is RMS ≈ 1.19 spikes per protocol — for counts in the 6–25 range, a good result. No
  `judge_unavailable` / `no_decision` reason applies: this is an open-ended metered pool.
- **`decision.json` is `{}`** (2 bytes). This is *not* a delivery failure here: `report.md` is 10,429 bytes,
  `report_declare` was genuinely called at `[192]`, and it returned "三道 gate 全绿：prereg ✓ reconcile ✓ trace ✓".
  The empty decision file is a harness artifact of this pool, not agent negligence.
- **Log**: `claude_log.jsonl`, 377 lines, 207 tool events. Budget: 8/8 `world_observe` units spent across
  7 calls (one at `reps=2`). One terminal `world_forecast`. Two RLM grill sub-agents spawned.
- **Ground truth is sealed** from the analyst as well as the agent. Every numeric check below is an
  independent recomputation from logged tool returns, a magnitude/unit sanity check, or an internal-consistency
  comparison — never a comparison against gold.
- **Offline is normal.** There is no WebSearch/WebFetch in this harness; retrieval is `world_simulate` (free)
  plus local `SKILL.md` files. Absence of web citations is not a retrieval failure and is not scored as one.

## Trajectory Arc

The agent opened by reading the research skill suite and writing a `RULINGS.md` ratchet `[16]`, then called
`world_simulate mode=info` `[17]`, which disclosed a deliberately uninformative prior: "an additional membrane
current of unknown identity, voltage-dependence, and kinetics — not a named textbook channel." It mapped the
9-protocol pool with free reference simulations (long step 25.5, brief 5.6, paired 26.6, hyperpol-cond 17.2,
depol-cond 35.6), swept five candidate mechanisms in free simulation, then registered six hypotheses H1–H6
spanning slow Na inactivation, slow K, Ih, A-type, persistent inward, and a zero-current "boring opponent."
Probes P1–P3 were preregistered `[71–74]` and observed `[76–78]`. P3 (paired pulses) returned 35 against a
reference of 26.6 — outside every one of the six registered bands, killing H1/H2/H4/H6 at once and forcing
an abduction round. H7 (activity-dependent slow inward) and H8 (high-threshold) followed; P4 (long step, 29)
killed H8. H9 (very slow τ) died to P5 (depol conditioning, 39). Then the campaign's best moment: P6 re-ran
the long step at `reps=2` and got 22.5, which fell in H7's own preregistered kill band and **refuted the
agent's own leading hypothesis** `[139]`. H10 was rebuilt with the failure absorbed ("amplitude × duration
joint accumulation"), H11 was registered from a sub-agent attack, and P7 was preregistered `[154]` and
observed `[155]` — the call that is the subject of this analysis's central finding. Forecast, metric
recomputation, calibration ledger, three attack records, report, declare, green gates.

## Credit Due

Before the criticism, several things here are done properly and should not be flattened by the findings below.

**The preregistration ordering is clean, and this is the iron rule that most trajectories break.** Every probe's
`prereg_write` strictly precedes its `world_observe`: P1–P3 registered at `[71–74]`, observed at `[76–78]`;
P4 registered `[104]`, observed `[106]`; P6 registered `[130]`, observed `[135]`; P7 registered `[154]`,
observed `[155]`. There is no instance of a band being written after the number was known. The bands are also
substantive rather than decorative — the harness itself rejected three attempts (`[105]`, `[126]`, `[129]`)
with "所有频段两两重叠：无论结果落在哪，信念都不会改变，这是装饰性探针" and "bands 必须覆盖至少两个 LIVE claim", and
in each case the agent rewrote the spec with genuinely mutually exclusive bands rather than arguing with the gate.

**H7's death is a real self-correction, not a rhetorical one.** At `[130]` the agent preregistered P6 with
H7 ∈ [29,33] and a kill branch at [0,23]. The observation came back 22.5 — inside the kill band — and at
`[139]` the agent transitioned its own leading hypothesis to REFUTED with the note that the long step shows
"无单脉冲内易化". It did not widen the band, did not appeal to noise, did not quietly re-scope. It then rebuilt
the mechanism (H10) with the failure explicitly absorbed as a new structural claim (amplitude × duration
rather than duration alone) and registered a fresh forward prediction. That is the behavior the framework's
"genuine self-correction" credit exists for, and it is rare.

**The adversarial grill produced real attacks, and they are sharp.** The grill-H7 sub-agent returned ten
findings recorded as G2–G11 `[142–151]`, several of which are better than what most analysts would produce:
G2 constructs an explicit constant-offset alternative that matches all four of H7's bands and identifies ISI
trajectory as the only discriminating observable; G5 shows H7 and the scoped remnant of H5 are unseparated at
the count level; G6 finds an internal contradiction in H7's own τ requirements (τ_deact must exceed the paired
gap but fall short of the conditioning gap); G10 observes that two of H7's four "predictions" are retrodictions
of already-known numbers. The information-asymmetry design was honored for this round — the sub-agent got a
frozen claim view with the parent's defending reasoning stripped `[160]`.

**The mechanism is the agent's own abduction, with no contamination available.** The `text_prior` at `[17]`
explicitly withholds identity, voltage-dependence, and kinetics; `reference_model` is `{"extra": [], "slow_na": false}`.
There is no path by which the answer leaked. H10's content — an activity-dependent, slowly-activating,
depolarization-gated inward conductance with hyperpolarization-induced inactivation — was constructed from
seven metered observations against free-simulation baselines. Whatever its epistemic status, it is real
scientific work, not a restatement of something handed over.

**The honest disclosures are genuine.** Report §9 admits the second-round grill produced no attack file before
declare. Report §7 flags that the held-out `cond -X/+Y` protocols are *assumed* isomorphic to P2's structure
and that this unverifiable assumption carries part of the forecast error. §10 discloses the rounding
transcription. §6 lists the reversal potential, τ bracket, and micro-basis as unresolved. An agent that wanted
to hide its weak points had many opportunities and took none of them.

## A. Ideation & Planning

**A1. The nine-protocol pool was never mapped against the six held-out protocols before the budget was spent.**
The `mode=info` return at `[17]` gives both the pool (9 protocols the agent may observe) and
`test_protocol_labels` — the 6 protocols that will actually be scored: four `cond -X/+Y` variants, the long
step, and the brief step. Four of the six scored items are hyperpolarizing-conditioning variants, yet the
agent spent exactly **one** budget unit on the single pool protocol structurally similar to them (P2,
hyperpol-cond, `[77]`) and spent five units on paired pulses and long steps, neither of which resembles a
`cond -X/+Y` protocol except the long step's direct appearance. A budget plan drawn from the scored list would
have allocated 3–4 units across conditioning strengths to calibrate the suppression ratio that the forecast
ultimately depended on entirely. Fair credit: the campaign question posed by the user prompt was mechanism
discovery, not forecast accuracy, and paired pulses were genuinely the most discriminating protocol for
mechanism. But the two objectives were not in conflict — the agent could have served both, and the forecast
was the scored deliverable. The same blind spot shows in how a free diagnostic was dropped: at `[37]` the
agent called `world_simulate` on the held-out label `cond -25/+12` and got
`KeyError: "unknown protocol label 'cond -25/+12'"`. That is a correct discovery — held-out labels are not
simulable — but the agent drew the narrow lesson (this string fails) rather than the useful one (the four
scored `cond -X/+Y` protocols are structurally opaque, and their relationship to the pool's hyperpol-cond
protocol is an untested assumption carrying the whole forecast). The free simulator could have built a
suppression-ratio-versus-conditioning-amplitude curve under candidate mechanisms at zero cost; it never did,
and report §7's honest flag about that assumption arrives only once the budget is gone.
`[stage: A | root cause: grounding]`

**A2. The hypothesis space was designed along one axis, and the agent's own post-hoc ruling admits it.**
H1–H6 were registered as six mechanisms `[64–69]`, but their predictions differ almost exclusively in the
sign and magnitude of a conditioning/history effect. When P3 returned 35, all six bands failed simultaneously
`[87]` and four hypotheses died in one observation. The agent recognized this and wrote a ruling at `[110]`
arguing the mass death was "真实判别而非伪重复", and report §4 lesson 2 states the lesson explicitly. The problem is
that the recognition arrived after the budget-expensive consequence: six hypotheses that collapse to one
discriminating dimension mean the first three probes bought roughly one dimension of information for three
budget units. Fair credit: the agent both diagnosed this and acted on it, proposing H7/H8 on a genuinely new
axis (activity-dependent accumulation) rather than re-skinning the dead ones. `[stage: A | root cause: depth]`

**A3. The `reps` policy was set by ruling before the noise magnitude was known, and the ruling was wrong.**
At `[70]` the agent ruled "探索期观测用 reps=1…单次观测噪声 ±2–3 用带宽如实吸收". The ±2–3 figure was an assumption,
not a measurement, and it was available for free: the reference simulation of the long step at `reps=10`
returned per-rep counts `[26,27,25,25,25,26,28,25,26,22]`, whose SD I compute as ≈1.6, while the paired
protocol's five reps `[29,26,22,26,30]` give SD ≈ 3.0. The agent had both arrays and used neither to set band
widths. The consequence lands in C: H7's long-step band [28,33] was too tight, P4's single draw of 29 sat one
spike above the lower bound, and the whole H7/H8 adjudication rested on a margin narrower than the noise the
free simulations already displayed. `[stage: A | root cause: robustness]`

**A4. No plan existed for how the mechanism would be converted into forecast numbers.** The campaign plan in
`RULINGS.md` `[16]` covers mechanism discovery, adversarial grilling, held-out forecast, and declaration —
but never specifies how H-whatever-survives will generate six numbers. The absence shows at `[162]`, where the
forecast is improvised in a single cell using an f–I extrapolation and a suppression ratio that appear nowhere
in the preceding 160 events. Had the conversion path been planned, the mismatch documented in X1 — that the
surviving mechanism contributes almost nothing to the submitted numbers — would have been visible while
budget remained to fix it. `[stage: A | root cause: depth]`

## B. Retrieval & Synthesis

**B1. The free simulator was used well for baselines and poorly for structure.** The agent ran a good set of
zero-cost reference simulations and a five-mechanism candidate sweep (slow_na 25.0, Km 23.33, Ih 29.67,
KA 24.67, NaP 30.0 on the long step), which is exactly the right use of a free oracle. But `world_simulate`
in `candidate` mode accepts arbitrary parameterized mechanisms — the agent demonstrated this at `[120]`-era
calls with `X(E=-30,mtau150,g=3)` and `NaPs(mtau150)`. After H10 was formulated, **no candidate simulation was
run to check H10's own parameters against the observations**. The agent had a free forward model of its own
hypothesis and never queried it, so H10's τ ≈ 150–300 ms and its amplitude×duration accumulation law are
asserted from two anchor points rather than fitted. G13 `[181]` makes precisely this criticism, and the agent
recorded it without acting. `[stage: B | root cause: depth]`

**B2. Reference baselines were quoted with false precision throughout.** Values like 26.6 (paired), 25.5
(long step), 35.6 (depol-cond), 17.2 (hyperpol-cond) appear in band derivations as if they were known
constants. They are 5- and 10-rep means of a noisy process: 26.6 comes from `[29,26,22,26,30]`, whose standard
error is ≈1.35. Bands were then drawn with 1-spike resolution against these means — H11's [24,30] versus
H10's [31,42] leaves a 1-spike gap that the prereg text at `[154]` explicitly defends as discriminating
("两带间距 1 仍有判别力"). With SE ≈ 1.35 on the baseline itself and σ ≈ 3 on a single draw, a 1-spike gap is not
a discrimination. Fair credit: the agent did notice the general problem and wrote it as calibration lesson 1.
`[stage: B | root cause: grounding]`

## C. Execution & Implementation

**C1. P7 is not an independent replication; `world_observe` returned a byte-identical payload to P3.**
This is the trajectory's central defect. Events `[78]` (P3) and `[155]` (P7) request the same protocol string
with the same implicit `reps=1`. I compared the two full return strings and they are **equal** — identical
2010-character payloads, identical 190-element voltage arrays (SHA-256 prefix `879baa51…` for both), identical
`test_start_index: 95`, identical `spike_count: 35.0`. `world_observe` is deterministic in `(protocol, reps)`:
corroborating this, `[77]` and `[131]` are different protocols that nonetheless open with the identical
baseline samples `[-62.6554, -68.5516, -67.4109, -69.0667, -66.2542]`, showing the noise RNG is re-seeded
identically per call. P7 therefore contained zero bits of information beyond P3, cost 1 of 8 budget units, and
could not have landed anywhere except 35. Its prereg at `[154]` asserts "与 P3 首发 35 独立" and the
`claim_transition` at `[158]` records "P7 配对复测=35（与 P3 首发独立复现）"; report §5 states "P7 与 P3 对同一协议的
两次独立观测同值（35），确认配对易化可重复、非单次抽样伪迹". Each of these is false, and the last is the exact
inferential move — ruling out a single-draw artifact — that a deterministic cache hit cannot support. Fair
credit: the agent had no documentation stating that observations are deterministic, and re-observing to check
reproducibility is normally correct practice; the failure is not the attempt but the absence of any check on
whether the second draw was actually a second draw, when the returned arrays made it trivially verifiable.
`[stage: C | root cause: integrity]`

**C2. The agent had already been shown that repeated observation of the same protocol yields new numbers —
and drew the opposite lesson.** P4 `[106]` observed the long step at `reps=1` → 29; P6 `[135]` observed the
same protocol at `reps=2` → 22.5, with a visibly different voltage array (SHA prefix `7baf9c06…`, first
samples showing a spike at index 3). So `reps=2` genuinely resamples. The agent generalized from this to
"repeat observation gives an independent draw" and applied it to P7 at `reps=1` — where it does not hold. The
discriminating variable is `reps`, not repetition, and the evidence for that distinction was already in the
log: P6's `reps=2` differed, P7's `reps=1` did not. Spending the last unit on `reps=1` rather than `reps=2`
converted a potentially informative confirmation into a no-op. `[stage: C | root cause: robustness]`

**C3. H10's promotion to SUPPORTED and H11's refutation both rest entirely on the empty probe.** The
transition at `[158]` cites P7 as the load-bearing evidence for H10, and `[157]` kills H11 on the same
number. Because P7 = P3 identically, the honest reading is that H10 is supported by P3, P5, P6 and H11 is
refuted by P3 — with P7 adding nothing. This is not fatal to either conclusion: P3's 35 versus a reference
of 26.6 is a +8.4 excess against a paired-protocol SD of ≈3, roughly 2.8σ on a single draw, and P5's 39
independently exceeds the reference 35.6. But the report presents a two-observation confirmation where one
exists, and the "foresight prediction" framing implies a test that was never at risk. `[stage: C | root cause: integrity]`

**C4. Both P7 bands were registered with the answer already in hand, making the test unfalsifiable in
practice.** Even setting determinism aside, the prereg at `[154]` was written when P3 = 35 was known and
recorded. H10's band is [31,42] — 12 spikes wide, centered above the known value; H11's is [24,30] — placed
just below it. A band 12 wide on a protocol the agent itself estimates at σ ≈ 3 has ≈4σ of headroom, and it
was drawn around a number already observed. The prereg's own severity clause claims "若无真实累积（H10 假），
复测大概率落回 24–30" — but with the previous draw at 35 and no resampling, the probability of landing in
[24,30] was zero. G10 `[150]` made exactly this criticism about H7's retrodictive predictions; the agent
recorded the attack and then repeated the pattern one hypothesis later. `[stage: C | root cause: integrity]`

**C5. The final budget unit was spent on the least informative available protocol.** At the point P7 was
issued, four of the nine pool protocols had never been observed — including `brief step (12 uA, 40 ms)`, which
is one of the six scored held-out protocols and was ultimately forecast at 6 purely from the free reference
value 5.6. One unit spent there would have directly measured a scored quantity and simultaneously tested
H10's explicit prediction "brief step ∈ [4,7]" `[152]`, which was registered and never tested. Instead the
unit went to re-observing a protocol whose value was already known and, as it turned out, unchangeable. A
related seam runs through the probe definitions: P1–P4 read `ob[0]['spike_count']` — the *first* observation
of a protocol `[71–74, 104]` — while P6 and P7 switch to `ob[-1]` `[130, 154]`. The switch is necessary and
the agent explains it ("取 journal 中该协议最后一条观测，避免与 P3 首次观测混淆"), but it leaves P3 and P7 defined over
the same journal events under different selectors; the divergence stays invisible only because the cached
return made both 35. `[stage: C | root cause: depth]`

**C6. The long step consumed three of eight units and the two results were averaged across incompatible
`reps` settings.** P4 (`reps=1`) = 29 and P6 (`reps=2`) = 22.5. The agent repeatedly combines these as
"29/22.5 → 均值 24.7" (`[152]`, `[158]`, report §2). This is not a valid mean: 22.5 is itself an average of two
draws, so the correct pooled estimate weights it double — (29 + 2×22.5)/3 = 24.67, which coincidentally lands
at nearly the same place, but the agent's stated arithmetic (29 + 22.5)/2 = 25.75 does not equal the 24.7 it
reports. The number 24.7 is the correctly-weighted value while the description is of the unweighted one; the
agent got the right answer with the wrong stated method, and never showed the calculation.
`[stage: C | root cause: grounding]`

**C7. The forecast was computed from the reference model and a P2 ratio, not from H10.** The derivation cell
`[162]` is explicit in its own comments: it builds `ref_test = {10:15.6, 11:16.4, 12:17.2, 14:18.9}` by
extrapolating an f–I slope of "≈5.4 Hz/uA" from a single point, computes a suppression ratio 15/17.2 = 0.872
from P2, and multiplies. H10 appears only as the justification for the long step being ≈ reference and the
brief step being ≈ reference. So five of six submitted numbers are reference-model outputs scaled by an
empirical ratio; the sixth (long step, 25) is the raw reference 25.5 rounded — not the observed 29, not the
observed 22.5, not their pooled 24.7. The mechanism the entire campaign was built to establish contributed
essentially nothing to the scored deliverable. `[stage: C | root cause: grounding]`

**C8. The f–I slope used to extrapolate three of the four conditioning forecasts is unsupported.** The cell
comment says "参考测试响应（150ms 窗）按 f-I 从 P2(test+12→17.2) 外推，斜率≈5.4Hz/uA". A slope cannot be derived
from one point. Checking the implied values: 15.6 → 16.4 → 17.2 → 18.9 across 10 → 11 → 12 → 14 µA gives
0.8 spikes/µA between adjacent points and 0.85 for the 12→14 step, i.e. a linear interpolation with a
hand-chosen slope, converted to "5.4 Hz" by dividing by the 150 ms window (0.8 spikes / 0.15 s = 5.33 Hz/µA —
the arithmetic is consistent, the premise is not). Free `world_simulate` calls at other amplitudes would have
measured this curve at zero cost and were not run. `[stage: C | root cause: grounding]`

**C9. A forecast value was silently changed between derivation and submission.** The cell at `[162]` prints
`cond -35/+10: 13`, computed as `round(0.84*15.6)` = `round(13.1)` = 13. The `world_forecast` call at `[163]`
submits `"cond -35/+10": 14`. No intervening cell, comment, or reasoning text explains the change; there is no
re-derivation and no note. The direction happens to be plausible (13 may have looked too low against P2's
observed 15), but an unexplained manual override of a computed deliverable is exactly the kind of untraceable
step the campaign's whole reconcile discipline exists to prevent — and unlike the report's decimals, this one
was never disclosed anywhere. `[stage: C | root cause: integrity]`

**C10. The suppression ladder contradicts H10's own mechanism.** H10 states that hyperpolarization
**completely** inactivates the current, so that post-conditioning test windows return to "参考±噪声" `[152]`.
Under that mechanism all four `cond -X/+Y` protocols should be forecast at the reference value with no
suppression, since the extra current is simply absent. Instead `[162]` applies a graded ladder — 0.90, 0.88,
0.87, 0.84 — increasing with conditioning strength, which requires the residual effect to *scale with
hyperpolarization amplitude*, i.e. incomplete and graded inactivation. The agent's forecast is thus internally
inconsistent with the hypothesis it declared SUPPORTED thirty events earlier. Fair credit: the ladder is
empirically better grounded than the mechanism (it is anchored on P1's 6/7.0 = 0.86 and P2's 0.87, two real
observations), which is likely why the forecast scored well. `[stage: C | root cause: grounding]`

**C11. Only five of nine pool protocols were ever observed, and the unobserved four included a scored one
that a live hypothesis made a sharp prediction about.** Observed: pre-pulse+weak, hyperpol-cond, paired,
long step, depol-cond. Never observed: weak step, strong step, brief step, brief-hyperpol-cond. Each omission
costs something specific. The weak step was the load-bearing test for H5, which was consequently left in
SCOPED limbo rather than resolved. The brief-hyperpol-cond protocol would have separated conditioning
duration from conditioning amplitude — the exact ambiguity G13 `[181]` identifies as leaving H10's τ
unconstrained. Worst, the brief step is simultaneously a scored held-out protocol and the subject of an
explicit H10 prediction ("brief step ∈ [4,7]：40ms 无累积 ≈参考 5.6", `[152]`), so a single unit there would
have bought a mechanism test and a measured forecast input at once; instead the agent forecast 6 from the
free reference alone and spent that unit on P7. This is the clearest budget misallocation in the trajectory
and required no hindsight to see: the protocol sat in `test_protocol_labels` from event `[17]` onward.
`[stage: C | root cause: depth]`

**C12. The agent attempted to run the gates directly and was blocked, then wrote its own checker.** At `[190]`
it tried `bun /crucible/packages/research-mcp/gates/prereg.ts` and received the isolation refusal
("研究评测隔离拒绝直接访问 benchmark、meter、Research MCP 进程"). It then hand-wrote a local regex reconcile checker
at `[191]` reproducing the gate's contract (`STRICT_BAND`, `BARE`, `SRC` patterns with a hardcoded metrics
dict) and got "problems: NONE". This is resourceful and the subsequent declare confirmed all three gates green,
so the local checker was accurate. But it is also a reimplementation of an adjudicator against which the agent
was then grading itself — the skill file explicitly warns "自评\"gate 全绿\"无效". The agent did the right thing
by declaring anyway rather than stopping at self-assessment. `[stage: C | root cause: robustness]`

## D. Analysis & Interpretation

**D1. The σ ≈ 3 noise estimate is attributed to the wrong protocol and derived from n = 2.** Report §4 and
the P7 prereg both state "该协议单次观测噪声 σ≈3（P4 与 P6 相差 6.5 根）", referring to the long step. Two
observations cannot estimate a standard deviation, and one of them (22.5) is already a 2-rep mean with reduced
variance. The agent's own free reference simulation of that exact protocol at `reps=10` gives per-rep counts
`[26,27,25,25,25,26,28,25,26,22]` — SD ≈ 1.6, not 3. The protocol that actually shows SD ≈ 3 is the *paired*
protocol (`[29,26,22,26,30]`). So the agent imported a noise figure from one protocol, attached it to another,
and then used it to justify the P7 band gap. Both numbers were sitting in already-returned free simulations.
`[stage: D | root cause: grounding]`

**D2. The gap between P4 = 29 and P6 = 22.5 is treated as pure noise when it may be `reps`-structural.** The
agent concludes the true long-step level is ≈ reference and that P4 was a high draw `[139]`. That is a
reasonable reading, but a competing one is never considered: 22.5 is a mean of two draws while 29 is one draw,
and the agent never inspected whether the two constituent draws behind 22.5 were e.g. 22 and 23 (tight) or
18 and 27 (wide). The `reps=2` return at `[135]` provides a single averaged count and a voltage trace, so the
per-rep decomposition was not directly available — but the agent never noted this limitation, and it
propagated the pooled 24.7 into H10's supporting evidence as though it were a settled measurement.
`[stage: D | root cause: robustness]`

**D3. The calibration ledger's headline is technically true and rhetorically misleading.** Report §4 reports
"26 条…9 条带内、17 条带外", which I verified exactly against the `research_kit.calibration` output at `[173]`
(counting the 26 rows: 9 in-band, 17 out). The report then says most out-of-band results are "按设计发生的证伪…
不是失准". This is largely right, but it obscures that the ledger is dominated by P1–P3, where a single
observation is scored against six bands at once — inflating both counts and making the ratio a statement
about hypothesis-space design rather than about forecasting skill. A ledger that counted *probes* (7) rather
than hypothesis×probe cells (26) would show the agent's leading hypothesis failing its band on 1 of 4 forward
tests. `[stage: D | root cause: depth]`

**D4. "H5 SCOPED" is a survivorship artifact that the agent left standing.** H5 (persistent inward current)
was scoped to "below detection threshold" after P1 `[81]` and never revisited. But H10 — the SUPPORTED
conclusion — is also a depolarization-activated inward current; the two differ only in activation kinetics
and resting-state magnitude. G5 `[145]` states outright that H5's remnant and H7 are unseparated at the count
level, and the same argument applies verbatim to H10. The register therefore ends with a SUPPORTED claim and
a SCOPED claim that the agent's own attack ledger says are indistinguishable under every observation taken.
Fair credit: G12 `[180]` acknowledges a related degeneracy (the "mirror family" of a missing outward current)
and report §7 scopes the conclusion to "a functional family" rather than a specific channel, which is the
honest framing. `[stage: D | root cause: depth]`

**D5. The +8.4 paired excess is interpreted as accumulation without checking the alternative the agent itself
registered.** H11 (constant gain offset) predicts excess proportional to the reference firing count. Testing
this requires comparing excess/reference ratios across protocols: paired 35/26.6 = 1.32, depol-cond 39/35.6 =
1.10, hyperpol-cond 15/17.2 = 0.87, long step 24.7/25.5 = 0.97, pre-pulse 6/7.0 = 0.86. These ratios are
manifestly not constant, which genuinely refutes H11 — but the agent never performed this five-protocol
comparison, resting the refutation instead on the empty P7 `[157]`. The correct refutation was available from
data already in hand and is stronger than the one given. `[stage: D | root cause: depth]`

**D6. The conclusion that hyperpolarization "completely inactivates" the current rests on two protocols whose
ratios are below 1.** P1 gives 6/7.0 = 0.86 and P2 gives 15/17.2 = 0.87 — both *below* the reference, not at
it. "Complete inactivation" predicts a return to reference (ratio 1.0), not suppression below it. A ratio of
0.87 on both protocols suggests either that the reference model over-predicts these protocols or that
something actively suppresses the cell after hyperpolarization — neither of which H10 explains. The agent used
these ratios operationally in the forecast (correctly) while stating a mechanism inconsistent with them.
`[stage: D | root cause: grounding]`

## E. Writing & Documentation

**E1. The report asserts the independence of P3 and P7 as a control, in the section devoted to controls.**
Report §5, headed "控制与错误预测", reads: "P7 与 P3 对同一协议的两次独立观测同值（35），确认配对易化可重复、非单次抽样
伪迹." Every clause after "同值" is unsupported: the observations are not independent (C1), and identical
returns from a deterministic call cannot establish reproducibility or exclude a sampling artifact. This is
the single most consequential sentence in the report because it is the claim that upgrades a one-draw
observation into a confirmed effect, and it appears in the section a reader would consult specifically to
check whether artifacts were excluded. `[stage: E | root cause: integrity]`

**E2. The report states the forecast MSE as "≈ 1" when it is 1.427.** Report §1 and §2 both write
"均方误差 ≈ 1（尖峰数平方，journal world.forecast 事件）". The actual returned value is 1.4269958333333344 `[163]`.
Rounding 1.427 to "≈ 1" is a 30% understatement of the error, in the favorable direction, on the campaign's
only externally-scored quantity. The agent had a reason — the reconcile gate rejects bare decimals without a
`(P#)` citation, and the MSE has no probe ID — but the correct resolutions were to write "≈1.4" (still one
decimal, still uncited, equally gate-blocked) or to state it in a bands-exempt bracket form or spell it in
words. Choosing the roundest favorable integer is the one option that both satisfies the gate and flatters
the result. `[stage: E | root cause: integrity]`

**E3. The report never mentions that the forecast was not derived from H10.** Sections 1, 2, and 6 present
H10 as the campaign's product and the forecast as its terminal test, but nowhere does the report state that
five of six submitted numbers came from the reference model scaled by the P1/P2 suppression ratio, with H10
contributing only the assertion that two protocols should sit near reference. A reader finishes the report
believing the mechanism was predictively validated. Report §7 does flag the isomorphism assumption for the
`cond` protocols, which is adjacent to this issue and partially mitigates it, but the central fact — that the
scored numbers are reference-model outputs — is absent. `[stage: E | root cause: integrity]`

**E4. The graveyard entry for H7 understates what its death implies.** Report §5 calls H7's long-step failure
"最重要的错误预测" and describes the fix as replacing "duration alone" with "amplitude × duration". But H7 and
H10 share their entire discriminating evidence base — P3 and P5 — and differ only in a predicted value for
one protocol that was subsequently measured. Describing this as a mechanism revision rather than a parameter
adjustment fitted to the failure overstates the epistemic distance travelled. Fair credit: the report does
record the failure prominently rather than burying it, and the H10 `conflicts` field `[152]` gives an
unusually explicit accounting of which hypothesis died of what. `[stage: E | root cause: depth]`

**E5. The rounding disclosure is honest but incomplete, and the gate contract was followed literally at the
cost of the numbers that mattered.** `research-report/SKILL.md` `[165]` mandates that every decimal carry a
`(P#)` citation, so the agent rounded free-simulation reference values to integers. The edits at `[188]` show
it doing this carefully — "相差 6.5" → "相差约 6", "35>26.6" → "35>27（原文为参考模拟均值，转录取整）" — and report §10
discloses the RULINGS transcription. But the disclosure does not cover the §2 baseline table, where
25.5 → "≈26", 26.6 → "≈27", 35.6 → "≈36", 17.2 → "≈17" appear with no note that these are rounded means of
noisy draws. The cost is concentrated exactly where precision was load-bearing: a reader recomputing the
campaign's central excess from "35 vs ≈27" gets +8 rather than the true +8.4 over a mean with SD ≈ 3.05.
A compliant alternative existed — reporting the reference values with their per-rep arrays in a clearly
labeled non-metric section — and was not taken. `[stage: E | root cause: grounding]`

**E6. The edit at `[189]` changed a factual claim about band coverage in order to pass the checker.** The
original text read "（H1–H6）频段 [22, 31] 及更窄者全部带外"; the edit changed it to "（H1–H6）频段（并集 [22, 32]）
全部带外". Checking against the calibration ledger `[173]`, the six P3 bands are [22,30], [17,22], [23,30],
[23,30], [24,32], [22,31] — union [17,32], not [22,32]. The revised statement is closer to correct than the
original (which named [22,31], one hypothesis's band, as though it were the envelope) but the stated union is
still wrong at the lower bound. The conclusion — 35 is outside all six — is correct either way.
`[stage: E | root cause: grounding]`

## F. Self-Verification & Review

**F1. The second-round grill produced nothing, and the agent declared anyway after four polling attempts.**
The grill-H10 sub-agent was spawned at `[161]`; `collect_attacks` returned 0 at `[164]`, 0 at `[174]`, 0 after
a 45-second sleep at `[178]`, and 0 at `[183]`. At `[203]` the drop directory contained only `_view.txt` and
`_prompt.txt`, and at `[205]` the sub-agent was still `status='running'`. The agent then declared with the
SUPPORTED hypothesis never having faced an independent reviewer. Fair credit, and substantial: the agent
disclosed this in report §9 rather than presenting G12–G14 as sub-agent output, and it did write three attacks
itself to fill the gap. But those three are parent-authored attacks on the parent's own surviving hypothesis
— exactly the information-asymmetry the grill design exists to prevent, as the role contract at `[160]` spells
out ("你看到的是主张与证据的冻结视图，不含父会话为该主张辩护的推理"). `[stage: F | root cause: integrity]`

**F2. The terminal forecast was fired before the second grill's verdict, foreclosing any correction.** The
sequence is `[161]` spawn grill-H10 → `[162]` derive forecast → `[163]` `world_forecast` (terminal,
irreversible) → `[164]` collect attacks (0). Even if the sub-agent had returned a decisive attack on H10
seconds later, the forecast was already submitted and the budget exhausted. Ordering the irreversible action
before the review that might have changed it converts the review into a formality regardless of what it
would have found. `[stage: F | root cause: integrity]`

**F3. The attack ledger records fourteen attacks and digests almost none of them.** G3 (mirror family
unexcluded), G5 (H5 remnant unseparated), G7 (Na inactivation load predicts declining spike amplitude), G9
(reversal potential unconstrained) all propose *specific, executable* discriminating tests — several requiring
no budget at all, since G7's test is a front-5-versus-back-5 spike amplitude comparison on the long-step
voltage trace the agent already possessed from `[106]`. The agent had 100-sample voltage arrays from every
observation and never analyzed a single one beyond the returned spike count. The attacks were recorded,
acknowledged in the report as scope limitations, and left unexecuted. Fair credit: converting an attack into
an honest scope declaration is a legitimate response when budget is exhausted, and the agent did formally
register H11 from G2, which is genuine digestion. `[stage: F | root cause: depth]`

**F4. The one attack the agent could have used to catch its central error was recorded and misapplied.**
G4 `[144]` and G1 `[138]` both attack single-observation adjudication and demand `reps ≥ 2` or explicit σ
accounting. The agent applied this lesson to P6 (correctly, using `reps=2`) and then failed to apply it to
P7, its final and most consequential probe, which used `reps=1`. Had the P7 observation been issued at
`reps=2` — costing 2 units it did not have, or costing 1 unit had P7 replaced a different call — it would
have returned a genuinely new number and the determinism would have been irrelevant. The agent had written
the rule and did not follow it at the moment it mattered most. `[stage: F | root cause: robustness]`

**F5. No verification was performed on the forecast before an irreversible submission.** `world_forecast` is
terminal and single-shot; the agent knew this from the skill files and the `next_required_action` protocol.
The six numbers were computed in one cell `[162]` and submitted in the next event `[163]` with no sanity check
against the observations in hand — no comparison of the forecast long step (25) against the measured 29/22.5,
no check that the forecast `cond` values (13–16) bracket the one measured conditioning protocol (15), no
review of whether the values are consistent with H10. The `cond -35/+10` discrepancy (C9) would have surfaced
immediately in any such check. `[stage: F | root cause: robustness]`

**F6. `metric_recompute` was run for all seven probes and the results were used correctly.** At `[166–172]`
the agent recomputed P1–P7 (6, 15, 35, 29, 39, 22.5, 35) and these match both the raw observations and every
number cited in the report. The reconcile self-check at `[191]` validated the report's `(P#)` citations
against a hardcoded copy of these values and found no problems, which the actual gate then confirmed. This
part of the verification chain is sound and deserves explicit credit — the numbers in the report are
traceable, and I verified the mapping independently. `[stage: F | root cause: grounding]`

## X. Cross-Stage Dynamics

**X1. Right answer, wrong chain: the score is largely independent of the campaign.** The submitted forecast
`{brief: 6, long: 25, cond -25/+12: 15, cond -28/+11: 14, cond -30/+14: 16, cond -35/+10: 14}` scored
MSE 1.427. Comparing against the free reference model: brief 5.6 → 6 (identical), long 25.5 → 25 (identical),
and the four `cond` values are the reference hyperpol-cond level 17.2 scaled by the observed P2 ratio 0.87
and interpolated across amplitude. A null strategy of "submit the reference model, corrected by the one
conditioning observation" would have produced nearly the same six numbers — the only H10-specific input is
the decision to *not* raise the long step above reference, which was itself derived from the P6 observation
rather than from the mechanism. The eleven hypotheses, seven probes, fourteen attacks, and three green gates
sit almost entirely orthogonal to the scored outcome. This does not make the campaign worthless — mechanism
discovery was the stated objective — but it means the score cannot be read as validation of H10, and the
report's framing invites exactly that misreading. `[stage: X | root cause: grounding]`

**X2. The determinism error propagates from a single unexamined call into the register, the report, and the
final verdict.** One unchecked assumption at `[155]` — that re-issuing a protocol yields a fresh draw —
propagates forward without resistance: into the `claim_transition` promoting H10 to SUPPORTED `[158]`, into
the refutation of H11 `[157]`, into `register.json` (H10 SUPPORTED, H11 REFUTED, verified at `[186]`), into
the calibration ledger's two P7 rows `[173]`, into report §1 (P7 as "判别性证据"), §2, §3, and §5, and into the
declared, sha256-stamped, gate-approved final artifact `[192]`. The three gates cannot catch it because they
check preregistration ordering, numeric provenance, and journal replay — all of which are satisfied. A
deterministic re-observation is formally indistinguishable from a genuine replication in every audit surface
the harness provides, which is why the burden fell on the agent and why the identical voltage arrays were the
only available detector. `[stage: X | root cause: integrity]`

**X3. The campaign's discipline generated the failure it could not see.** The prereg/kill-branch/attack-ledger
apparatus is genuinely good and produced the trajectory's best moment (H7's self-refutation at `[139]`). But
the same apparatus creates pressure toward *closure*: the skill files require every SUPPORTED claim to survive
attack, `anchor` reports "攻击债=0 · LIVE=0/坟场=11 · 已结案" at `[193]`, and the loop's definition-of-done is a
declared report. With one budget unit left and a hypothesis needing confirmation, the process rewarded
producing a probe that would land in-band over producing a probe that might not resolve. P7 satisfied every
formal requirement — registered before observation, mutually exclusive bands, kill and support branches,
recomputable metric — while carrying no information. Formal rigor and epistemic content came apart, and the
formal machinery reported success. `[stage: X | root cause: integrity]`

**X4. Goal drift from forecasting to mechanism was never re-examined despite the scored deliverable being the
forecast.** The opening prompt asks for mechanism discovery *and* a held-out forecast. From `[64]` onward the
trajectory is entirely mechanism-driven: hypotheses, probes, attacks, transitions. The forecast appears once,
in a single improvised cell 145 events later. The four scored `cond -X/+Y` protocols were never mentioned in
any prereg, ruling, or hypothesis prediction; the scored brief step was predicted by H10 but never observed.
The drift is not irrational — mechanism was the harder and more interesting problem, and the agent solved a
real version of it — but no point in the trajectory shows the agent weighing budget allocation against the
scored objective, and report §7's honest flag about the `cond` isomorphism assumption arrives only after the
consequence is locked in. `[stage: X | root cause: depth]`

## Sentence-by-Sentence Checklist

| # | Report claim | Verdict | Basis |
|---|---|---|---|
| 1 | "真实细胞存在一个活动依赖、慢激活的去极化门控内向电流" | ⚠️ | Directionally supported by P3/P5 vs reference, but unseparable from the "missing outward current" mirror family (G3/G12) and from H5's scoped remnant (G5) under count-only observation. |
| 2 | "判别性证据为 P7 配对复测 35 (P7) 落于先见预测带 [31, 42]" | ❌ | P7 returned a byte-identical payload to P3 `[78]`/`[155]`; SHA-256 of both voltage arrays = `879baa51…`. Zero information; the band could not have been missed. |
| 3 | "P7 与 P3 对同一协议的两次独立观测同值（35）" | ❌ | Not independent. Deterministic identical return, including `test_start_index: 95` and all 190 samples. |
| 4 | "确认配对易化可重复、非单次抽样伪迹" | ❌ | A cache hit cannot exclude a sampling artifact. The artifact question remains open on a single draw. |
| 5 | "均方误差 ≈ 1" | ❌ | Actual value 1.4269958 `[163]`. A 30% understatement in the favorable direction. |
| 6 | "预算 8/8 用尽" | ✅ | Verified: 6 calls at cost 1 + 1 call at `reps=2` (cost 2) = 8. |
| 7 | "26 条…9 条带内、17 条带外" | ✅ | Recounted from the `calibration` output `[173]`: exactly 26 rows, 9 in-band, 17 out. |
| 8 | Conclusion lines H1–H11 states | ✅ | Match `register.json` verbatim, verified at `[186]`: H1–H4 REFUTED, H5 SCOPED, H6–H9 REFUTED, H10 SUPPORTED, H11 REFUTED. |
| 9 | "该协议单次观测噪声 σ≈3（P4 与 P6 相差约 6）" | ⚠️ | σ estimated from n=2, one of which is a 2-rep mean. The agent's own 10-rep free simulation of that protocol gives SD ≈ 1.6; σ ≈ 3 belongs to the paired protocol. |
| 10 | "P6 长步程 22.5 (P6)…H7 REFUTED" | ✅ | 22.5 falls in H7's preregistered kill band [0,23] from `[130]`. Genuine self-refutation, correctly executed. |
| 11 | "H11(恒定增益) 带 [24, 30] 带外 → H11 REFUTED" | ⚠️ | Conclusion is correct but the cited evidence is empty (P7). A valid refutation exists from the non-constant excess ratios across five protocols — the agent never computed it. |
| 12 | "长步程 ≈26、短步程 ≈6、配对第二脉冲 ≈27…" | ⚠️ | Rounded from 25.5 / 5.6 / 26.6 / 17.2 / 35.6 without a note in that section; §10's rounding disclosure covers RULINGS only. |
| 13 | "held-out `cond -X/+Y` 假设与 P2 同构…承担部分预报误差" | ✅ | Honest and correct flagging of a genuinely unverifiable structural assumption; the `KeyError` at `[37]` confirms these protocols are unsimulable. |
| 14 | "第二轮 grill-H10 在 declare 前未产出攻击文件" | ✅ | Verified: `collect_attacks` returned 0 four times `[164, 174, 178, 183]`; sub-agent still `running` at `[205]`. Honest disclosure of a real gap. |
| 15 | "（H1–H6）频段（并集 [22, 32]）全部带外" | ⚠️ | The six P3 bands union to [17,32], not [22,32]. The operative conclusion (35 outside all six) is correct. |
| 16 | "反转电位…计数数据不约束其精确值——G9" | ✅ | Accurate self-scoping; matches G9 `[149]` and G14 `[182]`, and no probe measured subthreshold or hyperpolarizing responses. |

## Numerical Grounding Notes

- **Reward identity.** `world_forecast` `[163]` returned `spike_forecast_mse: 1.4269958333333344`; `meta.json`
  `reward: 1.427`. The reward is the raw MSE. RMS = √1.427 ≈ 1.194 spikes per protocol across 6 protocols.
- **P3 ≡ P7 determinism.** Full return strings at `[78]` and `[155]` compare equal (2010 chars each).
  SHA-256 of the serialized voltage array: `879baa518af3e304…` for both. Cross-check: `[77]` and `[131]` are
  *different* protocols whose traces both open `[-62.6554, -68.5516, -67.4109, -69.0667, -66.2542]`,
  demonstrating a per-call re-seeded RNG. `[135]` (`reps=2`) has a distinct hash `7baf9c06…`, so `reps` does
  change the draw.
- **Budget arithmetic.** `[76]`, `[77]`, `[78]`, `[106]`, `[131]`, `[155]` at cost 1 each = 6; `[135]` at
  `reps=2` = 2. Total 8, matching `budget_spent: 8` in the forecast return.
- **Long-step noise, recomputed.** Free reference simulation, `reps=10`, per-rep counts
  `[26,27,25,25,25,26,28,25,26,22]`: mean 25.5, SD ≈ 1.63. Paired protocol, 5 reps `[29,26,22,26,30]`:
  mean 26.6, SD ≈ 3.05. The report's σ ≈ 3 for the long step is the paired protocol's figure.
- **Pooled long-step estimate.** P4 = 29 (1 rep), P6 = 22.5 (2 reps). Rep-weighted: (29 + 45)/3 = 24.67.
  Unweighted as the report describes it: (29 + 22.5)/2 = 25.75. The reported 24.7 is the weighted value with
  the unweighted method stated.
- **Excess ratios across protocols** (observation ÷ free reference): pre-pulse 6/7.0 = 0.857;
  hyperpol-cond 15/17.2 = 0.872; paired 35/26.6 = 1.316; long step 24.67/25.5 = 0.967;
  depol-cond 39/35.6 = 1.096. Manifestly non-constant — this refutes H11 directly, without P7.
- **Paired-protocol significance of P3 alone.** Excess 35 − 26.6 = +8.4 against SD ≈ 3.05 → ≈ 2.75σ on a
  single draw. Real but not overwhelming, and it is the sole observation carrying the paired-facilitation
  signature after P7 is discounted.
- **Forecast provenance.** Free reference values: brief 5.6, long 25.5, hyperpol-cond 17.2. Submitted:
  brief 6, long 25. The four `cond` values follow `round(ratio × ref_test[µA])` with ratios 0.90/0.88/0.87/0.84
  and a hand-built `ref_test = {10:15.6, 11:16.4, 12:17.2, 14:18.9}` (0.8 spikes/µA ÷ 0.15 s = 5.33 Hz/µA,
  consistent with the stated "≈5.4 Hz/uA" but extrapolated from one measured point).
- **The silent forecast edit.** `[162]` printed `cond -35/+10: 13` (= `round(0.84 × 15.6)` = `round(13.104)`);
  `[163]` submitted 14. Undocumented and unexplained. Had 13 been submitted, that term's squared error would
  differ by (14−g)² − (13−g)² = 27 − 2g for unknown gold g; the change is favorable only if g > 13.5.
- **Calibration ledger recount.** 26 rows at `[173]`: P1 × H1–H6 (6), P2 × H1–H6 (6), P3 × H1–H6 (6),
  P4 × H7,H8 (2), P5 × H7,H9 (2), P6 × H7,H9 (2), P7 × H10,H11 (2). In-band: P1×H1, P1×H2, P1×H4, P1×H6,
  P2×H1, P2×H6, P4×H7, P5×H7, P7×H10 = 9. Out: 17. Report §4 is exact.
- **Protocol coverage.** 5 of 9 pool protocols observed. Never observed: weak step, strong step, brief step,
  brief-hyperpol-cond. The brief step is one of the 6 scored held-out protocols and was forecast from the
  free reference value alone.

## Retraction / Correction Log

- **My initial read of P7 was wrong and I corrected it.** On first pass I recorded P7 as a genuine
  independent replication whose only defect was that both bands had been drawn with P3 = 35 already known —
  a real but lesser criticism about band placement. Comparing the full return payloads showed the two calls
  are byte-identical, which changes the finding from "a weak test" to "no test," and moves it from
  `robustness` to `integrity`. C4 preserves the original band-placement criticism because it stands
  independently: even under a hypothetical fresh draw, a 12-wide band centered on a known value is not a
  severe test.
- **I do not claim H10 is false.** The determinism finding removes P7's evidential contribution; it does not
  reverse P3 (+8.4, ≈2.75σ) or P5 (+3.4 over reference). H10 may well be substantially correct. What is
  retracted is the *strength* the report claims, not the direction. The MSE of 1.427 is genuinely good and I
  have not argued otherwise — only that its causal link to H10 is weak (X1).
- **I did not verify the gate implementations.** The agent's local reconcile checker `[191]` and the real
  gates agreed (declare returned all-green at `[192]`), and I treated the gate verdict as sound rather than
  auditing `prereg.ts`/`reconcile.ts`/`trace.ts` — the benchmark tree is denylisted to me. My finding is that
  the gates *cannot* detect a deterministic re-observation (X2), which follows from what they check
  (ordering, provenance, replay), not from a claim that they malfunctioned.
- **The `cond -35/+10` value: I state the discrepancy, not its consequence.** Gold is invisible, so whether
  13 or 14 was better is unknowable here. C9 is a process finding — an undocumented manual override of a
  computed deliverable — and is not an accuracy claim.
- **"Independent recomputation" here means recomputation from logged returns.** The world is reachable only
  through the meter, and the meter is spent. Every number above is derived from arrays and values already
  present in `claude_log.jsonl`; no re-execution of the simulator was possible or attempted.

## One-Line Verdict

A methodologically serious, honestly-reported campaign whose leading hypothesis was promoted to SUPPORTED on
a budget-consuming re-observation that returned a byte-identical payload — real self-correction and real
adversarial review, undone at the last step by the one assumption nobody checked, while the good score
(MSE 1.427) traces to the reference model rather than to the mechanism it appears to validate.
