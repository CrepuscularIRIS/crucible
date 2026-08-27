# 45-pattern failure matrix — 6 classified analyses

Models: _batch=0, qwen37plus=0, qwen38max=6, qwen38max-opus5judge=0

Cells are `HIT/PARTIAL` counts. HIT = the analysis presents the failure as established; PARTIAL = raised but qualified.


## Pattern × model

| code | name | stage | pillar | _batch | qwen37plus | qwen38max | qwen38max-opus5judge | ΣHIT | ΣPART | HIT% |
|---|---|---|---|---|---|---|---|---|---|---|
| A.1 | Frame-Lock & Tunnel Vision | A | P2 | 0/0 | 0/0 | 3/1 | 0/0 | **3** | 1 | 50.0% |
| A.2 | Unfalsifiable Hypothesis | A | P3 | 0/0 | 0/0 | 0/2 | 0/0 | **0** | 2 | 0.0% |
| A.3 | Redundant Discovery | A | P2 | 0/0 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| A.4 | Feasibility Misjudgement | A | P4 | 0/0 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| A.5 | Metric Misalignment | A | P3 | 0/0 | 0/0 | 1/3 | 0/0 | **1** | 3 | 16.7% |
| A.6 | Hypothesis-Experiment Mismatch | A | P1 | 0/0 | 0/0 | 3/2 | 0/0 | **3** | 2 | 50.0% |
| B.1 | Hallucinated Evidence & Unchecked Provenance | B | P1 | 0/0 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| B.2 | Retrieval-to-Action Gap | B | P1 | 0/0 | 0/0 | 3/0 | 0/0 | **3** | 0 | 50.0% |
| B.3 | Unvetted Data Quality & Units | B | P4 | 0/0 | 0/0 | 2/1 | 0/0 | **2** | 1 | 33.3% |
| B.4 | Shallow Search & Coverage Gaps | B | P2 | 0/0 | 0/0 | 2/3 | 0/0 | **2** | 3 | 33.3% |
| B.5 | Citation Decorrelation | B | P1 | 0/0 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| B.6 | Low Signal-to-Noise Prioritization | B | P2 | 0/0 | 0/0 | 1/0 | 0/0 | **1** | 0 | 16.7% |
| C.1 | Circular Validation & Shortcut Reliance | C | P3 | 0/0 | 0/0 | 5/1 | 0/0 | **5** | 1 | 83.3% |
| C.2 | Grader-Fitting & Data Leakage | C | P3 | 0/0 | 0/0 | 0/2 | 0/0 | **0** | 2 | 0.0% |
| C.3 | Implementation Discrepancy | C | P1 | 0/0 | 0/0 | 0/3 | 0/0 | **0** | 3 | 0.0% |
| C.4 | Execution Faults & Numerical Instability | C | P4 | 0/0 | 0/0 | 0/3 | 0/0 | **0** | 3 | 0.0% |
| C.5 | Infrastructure Error Misdiagnosis | C | P4 | 0/0 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| C.6 | Search Space Local Optimization | C | P2 | 0/0 | 0/0 | 2/1 | 0/0 | **2** | 1 | 33.3% |
| C.7 | Premature Termination | C | P2 | 0/0 | 0/0 | 0/2 | 0/0 | **0** | 2 | 0.0% |
| C.8 | Environment Interaction Failure | C | P4 | 0/0 | 0/0 | 1/4 | 0/0 | **1** | 4 | 16.7% |
| D.1 | Artifacts as Insights | D | P1 | 0/0 | 0/0 | 2/0 | 0/0 | **2** | 0 | 33.3% |
| D.2 | Confirmation Bias | D | P3 | 0/0 | 0/0 | 1/2 | 0/0 | **1** | 2 | 16.7% |
| D.3 | Statistical Misuse | D | P3 | 0/0 | 0/0 | 5/1 | 0/0 | **5** | 1 | 83.3% |
| D.4 | Method-Conclusion Disconnect | D | P1 | 0/0 | 0/0 | 5/1 | 0/0 | **5** | 1 | 83.3% |
| D.5 | Baseline & Ablation Deficit | D | P2 | 0/0 | 0/0 | 1/2 | 0/0 | **1** | 2 | 16.7% |
| D.6 | Result Hallucination | D | P1 | 0/0 | 0/0 | 2/0 | 0/0 | **2** | 0 | 33.3% |
| D.7 | Unremediated Adversarial Evidence | D | P3 | 0/0 | 0/0 | 3/0 | 0/0 | **3** | 0 | 50.0% |
| E.1 | Report-Code Traceability Gap | E | P1 | 0/0 | 0/0 | 4/2 | 0/0 | **4** | 2 | 66.7% |
| E.2 | Overclaiming & Selective Narrative | E | P3 | 0/0 | 0/0 | 4/2 | 0/0 | **4** | 2 | 66.7% |
| E.3 | Omission of Critical Limitations | E | P3 | 0/0 | 0/0 | 0/2 | 0/0 | **0** | 2 | 0.0% |
| E.4 | Methodological & Citation Fabrication | E | P1 | 0/0 | 0/0 | 2/1 | 0/0 | **2** | 1 | 33.3% |
| F.1 | Superficial Self-Review | F | P2 | 0/0 | 0/0 | 1/3 | 0/0 | **1** | 3 | 16.7% |
| F.2 | Failure to Gate Critical Flaws | F | P2 | 0/0 | 0/0 | 3/2 | 0/0 | **3** | 2 | 50.0% |
| F.3 | Lack of Adversarial Perspective | F | P2 | 0/0 | 0/0 | 1/3 | 0/0 | **1** | 3 | 16.7% |
| F.4 | Uncorrected Self-Awareness | F | P2 | 0/0 | 0/0 | 6/0 | 0/0 | **6** | 0 | 100.0% |
| F.5 | Review Score Hacking | F | P3 | 0/0 | 0/0 | 0/1 | 0/0 | **0** | 1 | 0.0% |
| F.6 | Hallucinated Reviewing | F | P1 | 0/0 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| X.1 | Cascading Error Propagation | X | P4 | 0/0 | 0/0 | 4/1 | 0/0 | **4** | 1 | 66.7% |
| X.2 | Goal Drift | X | P3 | 0/0 | 0/0 | 2/0 | 0/0 | **2** | 0 | 33.3% |
| X.3 | Skeptical Reasoning Deficit | X | P2 | 0/0 | 0/0 | 3/2 | 0/0 | **3** | 2 | 50.0% |
| X.4 | "Honest-but-Hollow" Output | X | P3 | 0/0 | 0/0 | 1/1 | 0/0 | **1** | 1 | 16.7% |
| X.5 | Teleological Reasoning | X | P3 | 0/0 | 0/0 | 0/3 | 0/0 | **0** | 3 | 0.0% |
| X.6 | Right-for-the-Wrong-Reason | X | P1 | 0/0 | 0/0 | 3/1 | 0/0 | **3** | 1 | 50.0% |
| X.7 | Cognitive Anchoring & Re-planning Failure | X | P2 | 0/0 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| X.8 | Engineering Delivery Failure | X | P4 | 0/0 | 0/0 | 0/1 | 0/0 | **0** | 1 | 0.0% |

## Ranked by HIT count

| rank | code | name | HIT | PARTIAL | HIT% |
|---|---|---|---|---|---|
| 1 | F.4 | Uncorrected Self-Awareness | 6 | 0 | 100.0% |
| 2 | C.1 | Circular Validation & Shortcut Reliance | 5 | 1 | 83.3% |
| 3 | D.3 | Statistical Misuse | 5 | 1 | 83.3% |
| 4 | D.4 | Method-Conclusion Disconnect | 5 | 1 | 83.3% |
| 5 | E.1 | Report-Code Traceability Gap | 4 | 2 | 66.7% |
| 6 | E.2 | Overclaiming & Selective Narrative | 4 | 2 | 66.7% |
| 7 | X.1 | Cascading Error Propagation | 4 | 1 | 66.7% |
| 8 | A.1 | Frame-Lock & Tunnel Vision | 3 | 1 | 50.0% |
| 9 | A.6 | Hypothesis-Experiment Mismatch | 3 | 2 | 50.0% |
| 10 | B.2 | Retrieval-to-Action Gap | 3 | 0 | 50.0% |
| 11 | D.7 | Unremediated Adversarial Evidence | 3 | 0 | 50.0% |
| 12 | F.2 | Failure to Gate Critical Flaws | 3 | 2 | 50.0% |
| 13 | X.3 | Skeptical Reasoning Deficit | 3 | 2 | 50.0% |
| 14 | X.6 | Right-for-the-Wrong-Reason | 3 | 1 | 50.0% |
| 15 | B.3 | Unvetted Data Quality & Units | 2 | 1 | 33.3% |
| 16 | B.4 | Shallow Search & Coverage Gaps | 2 | 3 | 33.3% |
| 17 | C.6 | Search Space Local Optimization | 2 | 1 | 33.3% |
| 18 | D.1 | Artifacts as Insights | 2 | 0 | 33.3% |
| 19 | D.6 | Result Hallucination | 2 | 0 | 33.3% |
| 20 | E.4 | Methodological & Citation Fabrication | 2 | 1 | 33.3% |
| 21 | X.2 | Goal Drift | 2 | 0 | 33.3% |
| 22 | A.5 | Metric Misalignment | 1 | 3 | 16.7% |
| 23 | B.6 | Low Signal-to-Noise Prioritization | 1 | 0 | 16.7% |
| 24 | C.8 | Environment Interaction Failure | 1 | 4 | 16.7% |
| 25 | D.2 | Confirmation Bias | 1 | 2 | 16.7% |
| 26 | D.5 | Baseline & Ablation Deficit | 1 | 2 | 16.7% |
| 27 | F.1 | Superficial Self-Review | 1 | 3 | 16.7% |
| 28 | F.3 | Lack of Adversarial Perspective | 1 | 3 | 16.7% |
| 29 | X.4 | "Honest-but-Hollow" Output | 1 | 1 | 16.7% |
| 30 | A.2 | Unfalsifiable Hypothesis | 0 | 2 | 0.0% |
| 31 | A.3 | Redundant Discovery | 0 | 0 | 0.0% |
| 32 | A.4 | Feasibility Misjudgement | 0 | 0 | 0.0% |
| 33 | B.1 | Hallucinated Evidence & Unchecked Provenance | 0 | 0 | 0.0% |
| 34 | B.5 | Citation Decorrelation | 0 | 0 | 0.0% |
| 35 | C.2 | Grader-Fitting & Data Leakage | 0 | 2 | 0.0% |
| 36 | C.3 | Implementation Discrepancy | 0 | 3 | 0.0% |
| 37 | C.4 | Execution Faults & Numerical Instability | 0 | 3 | 0.0% |
| 38 | C.5 | Infrastructure Error Misdiagnosis | 0 | 0 | 0.0% |
| 39 | C.7 | Premature Termination | 0 | 2 | 0.0% |
| 40 | E.3 | Omission of Critical Limitations | 0 | 2 | 0.0% |
| 41 | F.5 | Review Score Hacking | 0 | 1 | 0.0% |
| 42 | F.6 | Hallucinated Reviewing | 0 | 0 | 0.0% |
| 43 | X.5 | Teleological Reasoning | 0 | 3 | 0.0% |
| 44 | X.7 | Cognitive Anchoring & Re-planning Failure | 0 | 0 | 0.0% |
| 45 | X.8 | Engineering Delivery Failure | 0 | 1 | 0.0% |

## Per-model load

| model | n | ΣHIT | ΣPARTIAL | mean HIT/analysis | severity |
|---|---|---|---|---|---|
| _batch | 0 | 0 | 0 | 0.0 | {} |
| qwen37plus | 0 | 0 | 0 | 0.0 | {} |
| qwen38max | 6 | 76 | 59 | 12.7 | {'medium': 3, 'high': 2, 'low': 1} |
| qwen38max-opus5judge | 0 | 0 | 0 | 0.0 | {} |
