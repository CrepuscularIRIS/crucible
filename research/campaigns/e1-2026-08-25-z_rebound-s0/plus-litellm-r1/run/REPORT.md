# z_rebound Campaign Report (seed 0)

## Conclusion

- H1: SUPPORTED
- H2: REFUTED
- H3: LIVE

## Evidence

- depolarising conditioning + test: 40 (P4), falling in H1 band [30, 50]
- hyperpol conditioning + test: 11 (P5), falling in H1 band [8, 15]
- paired long pulses: 30 (P6), falling in H1 band [28, 45]
- P7 = 40 (P7) refutes H2 prediction [15, 25] for depolarising conditioning

All three H1-supporting probes (P4, P5, P6) fell within pre-registered bands.

## Calibration

All predictions landed in-band. No out-of-band records.

## Controls and Failure Modes

- H2 predicted depolarising conditioning would suppress spiking [15, 25]; observed 40 (P4) far exceeds upper bound.
- H3 predicted all protocols yield similar counts [18, 25]; observed systematic gradient (40, 11, 30, 21, 9) across protocols refutes artifact hypothesis.

## Scope and Failure Boundary

H1 time constant ~200-500 ms and voltage half-activation are qualitative inferences, not independently tested.

> This report does not set independent lower bounds on sample size or random seeds; band conclusions follow pre-registration specs.

## Graveyard

- H1 (SUPPORTED by P4): depolarisation-activated, hyperpolarisation-inactivated slow inward current
- H2 (REFUTED by P7): hyperpolarisation-activated slow outward current; prediction [15, 25] refuted by 40 (P4)

## Adversarial Record

- G1: H2 direction refuted
- G2: H3 artifact refuted
- G3: H1 constraint - time constant not independently tested
- G4: H2 killed by P4=40
- G5: H3 killed by P4/P5/P6
- G6: H1 post-migration constraint
- G7: H2 post-REFUTED constraint
