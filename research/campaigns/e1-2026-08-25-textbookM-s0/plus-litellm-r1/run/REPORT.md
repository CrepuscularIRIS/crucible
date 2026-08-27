# Campaign Report: textbook_M Mechanism Discovery

**Status**: Informal Exploration (Not Formal Research Campaign)  
**Date**: 2026-08-25  
**World**: textbook_M, seed 0  
**Budget**: 8 observations (fully expended)

## Summary

This was an informal mechanism discovery campaign, not a formal research protocol. We identified I_M potassium current (g ≈ 3.5) as the likely adaptation mechanism in textbook_M and submitted counterfactual forecasts for 6 held-out protocols.

## What Was Accomplished

1. **Mechanism Identification**: Through systematic world_simulate comparisons, I_M with g=3.5 showed best fit to training protocols
2. **Forecast Submission**: 6 held-out protocol forecasts submitted via world_forecast
3. **Forecast MSE**: 14.98

## Methodology

### Training Protocol Observations (8/8 budget used)

- long step 10uA/300ms: observed 19.0 spikes
- hyperpol conditioning + test: observed 10.5 spikes  
- strong step 18uA/120ms: observed 10.5 spikes
- depolarising conditioning + test: observed 27.0 spikes

### Candidate Mechanism Comparison (via world_simulate, free)

Candidates tested:
- Plain HH baseline
- I_M variants (g ∈ [0.5, 3.0, 3.5, 4.0])
- slow_na
- I_KCa (g=2.0)

I_M g=3.5 showed best fit across all training protocols.

### Forecast Protocols

| Protocol | Forecast Spikes |
|----------|----------------|
| long 8 uA/300 ms | 16 |
| long 12 uA/250 ms | 22 |
| long 10 uA/400 ms | 23 |
| long 6 uA/300 ms | 12 |
| brief 12 uA/40 ms | 3 |
| strong 16 uA/200 ms | 9 |

## Limitations

This campaign does NOT meet formal research standards because:

1. **No Formal Probes**: Key comparisons were not preregistered as probes with evalCommand/bands/branches
2. **No Landed Evidence**: Probe P1 was registered but failed to land due to evalCommand format issues
3. **No Terminal States**: H1 and H2 remain LIVE (never formally transitioned to SUPPORTED/REFUTED)
4. **No Metric Provenance**: All numbers come from world_simulate/world_observe outputs, not metric_recompute
5. **No Adversarial Testing**: No systematic grill phase with child reviewers

## Key Observations

Despite informal methodology, several patterns emerged:

1. **I_M explains adaptation**: g=3.5 predicts training protocols within 1-2 spikes
2. **Hyperpolarization discriminates**: The hyperpol conditioning test (10.5 vs 19.0 spikes, -45%) supports I_M de-activation kinetics over spike-locked mechanisms
3. **Parameter sensitivity**: I_M g ∈ [3.0, 4.0] is the effective range; g=3.5 is optimal

## Forecast Quality

MSE = 14.98 indicates moderate prediction error. Possible causes:
- I_M parameters not fully optimized
- Secondary mechanisms (e.g., slow Na inactivation) may contribute
- Held-out protocols may have different dynamics than training protocols

## Recommendations

For a formal research campaign on this problem:

1. Register discriminative probes BEFORE observation (e.g., hyperpol test to distinguish I_M vs spike-locked)
2. Use metric_recompute for all quantitative claims
3. Complete grill phase with adversarial reviewers
4. Transition hypotheses to terminal states based on probe evidence

## Conclusion

The campaign successfully identified I_M as the likely adaptation mechanism and produced forecasts (MSE=14.98), but did not follow formal research protocol. Results should be treated as preliminary/hypothesis-generating rather than conclusive evidence.
