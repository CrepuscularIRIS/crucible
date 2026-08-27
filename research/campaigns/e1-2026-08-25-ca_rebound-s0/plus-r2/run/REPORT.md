# Report: e1-ca_rebound-s0-plus-r2

## 1. Conclusion

H1 (T-type calcium current, I_CaT, g=0.5) remains LIVE but CONTESTED by strong evidence: it is the only hypothesis positing a specific biophysical mechanism, yet its parameterization fails to simultaneously fit rebound and sustained firing protocols. H2 (slow Na) and H3 (null/reference) are CONTESTED. No hypothesis reached SUPPORTED or REFUTED status due to the absence of formal pre-registered probes. The campaign identifies a clear need for additional mechanisms beyond those tested.

## 2. Evidence

### Observations (world_observe, budget=8, seed=0)

| Protocol | Observed | Reference | CaT (H1) | slow_na (H2) |
|---|---|---|---|---|
| Brief hyperpol + test (40ms) | 17.0 | 17.0 | 17.0 | 16.0 |
| Long hyperpol + test (250ms) | 13.5 | 15.0 | 21.0 | 16.0 |
| Long step (10uA, 300ms) | 32.0 | 27.0 | 29.0 | 27.0 |
| Depol conditioning + test | 40.0 | 37.0 | 36.0 | 36.0 |
| Strong step (18uA, 120ms) | 19.0 | 15.0 | 14.0 | 15.0 |
| Brief step (12uA, 40ms) | 7.0 | 5.0 | 6.0 | 6.0 |
| Hyperpol pre-pulse + weak test | 8.0 | 7.0 | 10.0 | — |

### Key patterns

- **Brief > long hyperpol rebound**: Brief hyperpolarization (40ms) produces 17 spikes, long (250ms) produces 13.5 — longer hyperpolarization produces LESS rebound, contradicting standard I_CaT de-inactivation expectations.
- **Sustained firing underestimation**: All models systematically underestimate firing during sustained depolarization (long step: 27 vs 32; strong step: 15 vs 19).
- **CaT partial improvement**: H1 improves long_step prediction (29 vs 27) but degrades fit on 4/7 protocols relative to reference.

## 3. Calibration Ledger

No formal pre-registered probes were registered. All comparisons derive from direct world observations and free candidate simulations. Calibration is therefore empty — a methodological limitation.

## 4. Forecast Results

Held-out forecast MSE = 6.50 (RMSE ≈ 2.55 spikes/protocol).

| Protocol | Forecast |
|---|---|
| hyperpol -25 then release | 10 |
| hyperpol -35 then release | 14 |
| hyperpol -30 then release | 12 |
| hyperpol -40 then release | 11 |
| brief step (12 uA, 40 ms) | 7 |
| long step (10 uA, 300 ms) | 32 |

## 5. Surviving Hypotheses

- **H1 (I_CaT)**: LIVE. Posits T-type calcium current. Captures brief hyperpol rebound but fails on long hyperpol (predicts 21, observes 13.5) and strong step (predicts 14, observes 19). Specific parameterization (g=0.5, hvh=-85, htau=30) is likely incorrect.
- **H2 (slow_na)**: CONTESTED. Empirically indistinguishable from H3. Provides zero improvement on any protocol.
- **H3 (null/reference)**: CONTESTED. Matches hyperpolarization protocols but systematically underestimates sustained firing.

> 本报告未对样本量/随机种子设置独立下限；频段结论以预登记规约为准，未达下限的情形应视为 CONTESTED 而非支持/否证。

## 6. Scope and Failure Boundaries

- **Single seed**: All observations from seed 0 with reps=2. Generalization untested.
- **Spike count degeneracy**: All protocols reduce excitability to a single scalar; many ionic parameter combinations produce identical counts. Without additional observables (spike timing, ISI distribution, pharmacological blockade), spike counts alone cannot discriminate specific mechanisms.
- **Brief > long hyperpol pattern**: No hypothesis captures this. Competing explanations include: (a) slow I_NaP inactivation during long hyperpol reducing rebound; (b) Na+/K+-ATPase pump accumulation suppressing excitability; (c) HCN deactivation removing inward drive; (d) T-type Ca slow-inactivation state reached during 250ms but not 40ms hyperpolarization.
- **Sustained firing gap**: Missing depolarizing drive (I_NaP, I_CAN, or M-current modulation) likely needed but identity unconstrained.
- **Depol conditioning excess**: 40 spikes vs reference 37 suggests depolarization-dependent facilitation (Kv inactivation or I_CAN activation) not captured by any candidate.

## 7. Graveyard Summary

Graveyard empty. H2 and H3 are CONTESTED (not dead). No hypothesis definitively refuted or supported.

## 8. Attack Records

22 attacks recorded (G1–G22):

**Against H1 (8 attacks):**
- G1 (constraint): CaT overshoots long hyperpol by 7.5 spikes; fails brief > long pattern
- G2 (constraint): CaT underestimates strong step by 5 spikes; cannot fit rebound and sustained firing simultaneously
- G3 (new_h): Alternative fast-activating current during hyperpolarization
- G14 (new_h): Hyperpolarization-duration paradox — slow I_NaP inactivation reduces rebound during long hyperpol
- G15 (constraint): CaT degrades fit on 4/7 protocols relative to reference
- G16 (new_h): Hyperpol pre-pulse contradicts rebound story (8 spikes vs CaT 10)
- G17 (constraint): Selective registration of only 3/7 protocols
- G18 (no_change): Spike count degeneracy prevents mechanism discrimination

**Against H2 (7 attacks):**
- G4 (constraint): slow_na provides zero improvement on sustained firing
- G5 (constraint): slow_na fails brief > long hyperpol pattern
- G6 (no_change): H2 and H3 empirically colinear
- G19 (new_h): Na+/K+-ATPase, HCN, or CaT slow-inactivation as alternatives
- G20 (new_h): M-current or I_NaP as sustained firing drivers
- G21 (constraint): Band design flaw — shared [14,18] band masks mechanism failure
- G22 (new_h): Binary slow_na too crude for continuous dynamics

**Against H3 (7 attacks):**
- G7 (constraint): Systematic underestimation of sustained firing
- G8 (new_h): Missing depolarizing current needed
- G9 (constraint): Reference fits some protocols but fails others inconsistently
- G10 (new_h): Hyperpolarization-activated slow K+ current explains brief > long
- G11 (new_h): I_NaP explains depol conditioning excess
- G12 (new_h): Directional residual pattern rejects symmetric noise
- G13 (constraint): Single seed, low reps — interval construction flawed

## 9. Rulings Summary

Ruling: 战役等级=遭遇战 — 单一世界 ca_rebound(seed 0)，机制发现 + held-out 预报，预算 8 — 押错代价：浪费预算需重跑，但世界固定可重复验证
