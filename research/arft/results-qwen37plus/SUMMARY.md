# 45-pattern failure matrix — 15 classified analyses

Models: _batch=0, qwen37plus=15

Cells are `HIT/PARTIAL` counts. HIT = the analysis presents the failure as established; PARTIAL = raised but qualified.


## Pattern × model

| code | name | stage | pillar | _batch | qwen37plus | ΣHIT | ΣPART | HIT% |
|---|---|---|---|---|---|---|---|---|
| A.1 | Frame-Lock & Tunnel Vision | A | P2 | 0/0 | 5/7 | **5** | 7 | 33.3% |
| A.2 | Unfalsifiable Hypothesis | A | P3 | 0/0 | 7/2 | **7** | 2 | 46.7% |
| A.3 | Redundant Discovery | A | P2 | 0/0 | 0/1 | **0** | 1 | 0.0% |
| A.4 | Feasibility Misjudgement | A | P4 | 0/0 | 2/3 | **2** | 3 | 13.3% |
| A.5 | Metric Misalignment | A | P3 | 0/0 | 5/3 | **5** | 3 | 33.3% |
| A.6 | Hypothesis-Experiment Mismatch | A | P1 | 0/0 | 12/3 | **12** | 3 | 80.0% |
| B.1 | Hallucinated Evidence & Unchecked Provenance | B | P1 | 0/0 | 0/2 | **0** | 2 | 0.0% |
| B.2 | Retrieval-to-Action Gap | B | P1 | 0/0 | 7/4 | **7** | 4 | 46.7% |
| B.3 | Unvetted Data Quality & Units | B | P4 | 0/0 | 2/2 | **2** | 2 | 13.3% |
| B.4 | Shallow Search & Coverage Gaps | B | P2 | 0/0 | 3/4 | **3** | 4 | 20.0% |
| B.5 | Citation Decorrelation | B | P1 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| B.6 | Low Signal-to-Noise Prioritization | B | P2 | 0/0 | 0/1 | **0** | 1 | 0.0% |
| C.1 | Circular Validation & Shortcut Reliance | C | P3 | 0/0 | 14/0 | **14** | 0 | 93.3% |
| C.2 | Grader-Fitting & Data Leakage | C | P3 | 0/0 | 3/5 | **3** | 5 | 20.0% |
| C.3 | Implementation Discrepancy | C | P1 | 0/0 | 7/3 | **7** | 3 | 46.7% |
| C.4 | Execution Faults & Numerical Instability | C | P4 | 0/0 | 1/4 | **1** | 4 | 6.7% |
| C.5 | Infrastructure Error Misdiagnosis | C | P4 | 0/0 | 1/2 | **1** | 2 | 6.7% |
| C.6 | Search Space Local Optimization | C | P2 | 0/0 | 2/0 | **2** | 0 | 13.3% |
| C.7 | Premature Termination | C | P2 | 0/0 | 8/4 | **8** | 4 | 53.3% |
| C.8 | Environment Interaction Failure | C | P4 | 0/0 | 11/4 | **11** | 4 | 73.3% |
| D.1 | Artifacts as Insights | D | P1 | 0/0 | 2/4 | **2** | 4 | 13.3% |
| D.2 | Confirmation Bias | D | P3 | 0/0 | 7/4 | **7** | 4 | 46.7% |
| D.3 | Statistical Misuse | D | P3 | 0/0 | 12/1 | **12** | 1 | 80.0% |
| D.4 | Method-Conclusion Disconnect | D | P1 | 0/0 | 15/0 | **15** | 0 | 100.0% |
| D.5 | Baseline & Ablation Deficit | D | P2 | 0/0 | 4/5 | **4** | 5 | 26.7% |
| D.6 | Result Hallucination | D | P1 | 0/0 | 5/2 | **5** | 2 | 33.3% |
| D.7 | Unremediated Adversarial Evidence | D | P3 | 0/0 | 12/2 | **12** | 2 | 80.0% |
| E.1 | Report-Code Traceability Gap | E | P1 | 0/0 | 9/5 | **9** | 5 | 60.0% |
| E.2 | Overclaiming & Selective Narrative | E | P3 | 0/0 | 14/0 | **14** | 0 | 93.3% |
| E.3 | Omission of Critical Limitations | E | P3 | 0/0 | 2/6 | **2** | 6 | 13.3% |
| E.4 | Methodological & Citation Fabrication | E | P1 | 0/0 | 4/5 | **4** | 5 | 26.7% |
| F.1 | Superficial Self-Review | F | P2 | 0/0 | 7/4 | **7** | 4 | 46.7% |
| F.2 | Failure to Gate Critical Flaws | F | P2 | 0/0 | 8/2 | **8** | 2 | 53.3% |
| F.3 | Lack of Adversarial Perspective | F | P2 | 0/0 | 7/6 | **7** | 6 | 46.7% |
| F.4 | Uncorrected Self-Awareness | F | P2 | 0/0 | 14/1 | **14** | 1 | 93.3% |
| F.5 | Review Score Hacking | F | P3 | 0/0 | 1/2 | **1** | 2 | 6.7% |
| F.6 | Hallucinated Reviewing | F | P1 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| X.1 | Cascading Error Propagation | X | P4 | 0/0 | 14/1 | **14** | 1 | 93.3% |
| X.2 | Goal Drift | X | P3 | 0/0 | 14/1 | **14** | 1 | 93.3% |
| X.3 | Skeptical Reasoning Deficit | X | P2 | 0/0 | 2/5 | **2** | 5 | 13.3% |
| X.4 | "Honest-but-Hollow" Output | X | P3 | 0/0 | 3/3 | **3** | 3 | 20.0% |
| X.5 | Teleological Reasoning | X | P3 | 0/0 | 11/0 | **11** | 0 | 73.3% |
| X.6 | Right-for-the-Wrong-Reason | X | P1 | 0/0 | 8/3 | **8** | 3 | 53.3% |
| X.7 | Cognitive Anchoring & Re-planning Failure | X | P2 | 0/0 | 2/3 | **2** | 3 | 13.3% |
| X.8 | Engineering Delivery Failure | X | P4 | 0/0 | 9/4 | **9** | 4 | 60.0% |

## Ranked by HIT count

| rank | code | name | HIT | PARTIAL | HIT% |
|---|---|---|---|---|---|
| 1 | D.4 | Method-Conclusion Disconnect | 15 | 0 | 100.0% |
| 2 | C.1 | Circular Validation & Shortcut Reliance | 14 | 0 | 93.3% |
| 3 | E.2 | Overclaiming & Selective Narrative | 14 | 0 | 93.3% |
| 4 | F.4 | Uncorrected Self-Awareness | 14 | 1 | 93.3% |
| 5 | X.1 | Cascading Error Propagation | 14 | 1 | 93.3% |
| 6 | X.2 | Goal Drift | 14 | 1 | 93.3% |
| 7 | A.6 | Hypothesis-Experiment Mismatch | 12 | 3 | 80.0% |
| 8 | D.3 | Statistical Misuse | 12 | 1 | 80.0% |
| 9 | D.7 | Unremediated Adversarial Evidence | 12 | 2 | 80.0% |
| 10 | C.8 | Environment Interaction Failure | 11 | 4 | 73.3% |
| 11 | X.5 | Teleological Reasoning | 11 | 0 | 73.3% |
| 12 | E.1 | Report-Code Traceability Gap | 9 | 5 | 60.0% |
| 13 | X.8 | Engineering Delivery Failure | 9 | 4 | 60.0% |
| 14 | C.7 | Premature Termination | 8 | 4 | 53.3% |
| 15 | F.2 | Failure to Gate Critical Flaws | 8 | 2 | 53.3% |
| 16 | X.6 | Right-for-the-Wrong-Reason | 8 | 3 | 53.3% |
| 17 | A.2 | Unfalsifiable Hypothesis | 7 | 2 | 46.7% |
| 18 | B.2 | Retrieval-to-Action Gap | 7 | 4 | 46.7% |
| 19 | C.3 | Implementation Discrepancy | 7 | 3 | 46.7% |
| 20 | D.2 | Confirmation Bias | 7 | 4 | 46.7% |
| 21 | F.1 | Superficial Self-Review | 7 | 4 | 46.7% |
| 22 | F.3 | Lack of Adversarial Perspective | 7 | 6 | 46.7% |
| 23 | A.1 | Frame-Lock & Tunnel Vision | 5 | 7 | 33.3% |
| 24 | A.5 | Metric Misalignment | 5 | 3 | 33.3% |
| 25 | D.6 | Result Hallucination | 5 | 2 | 33.3% |
| 26 | D.5 | Baseline & Ablation Deficit | 4 | 5 | 26.7% |
| 27 | E.4 | Methodological & Citation Fabrication | 4 | 5 | 26.7% |
| 28 | B.4 | Shallow Search & Coverage Gaps | 3 | 4 | 20.0% |
| 29 | C.2 | Grader-Fitting & Data Leakage | 3 | 5 | 20.0% |
| 30 | X.4 | "Honest-but-Hollow" Output | 3 | 3 | 20.0% |
| 31 | A.4 | Feasibility Misjudgement | 2 | 3 | 13.3% |
| 32 | B.3 | Unvetted Data Quality & Units | 2 | 2 | 13.3% |
| 33 | C.6 | Search Space Local Optimization | 2 | 0 | 13.3% |
| 34 | D.1 | Artifacts as Insights | 2 | 4 | 13.3% |
| 35 | E.3 | Omission of Critical Limitations | 2 | 6 | 13.3% |
| 36 | X.3 | Skeptical Reasoning Deficit | 2 | 5 | 13.3% |
| 37 | X.7 | Cognitive Anchoring & Re-planning Failure | 2 | 3 | 13.3% |
| 38 | C.4 | Execution Faults & Numerical Instability | 1 | 4 | 6.7% |
| 39 | C.5 | Infrastructure Error Misdiagnosis | 1 | 2 | 6.7% |
| 40 | F.5 | Review Score Hacking | 1 | 2 | 6.7% |
| 41 | A.3 | Redundant Discovery | 0 | 1 | 0.0% |
| 42 | B.1 | Hallucinated Evidence & Unchecked Provenance | 0 | 2 | 0.0% |
| 43 | B.5 | Citation Decorrelation | 0 | 0 | 0.0% |
| 44 | B.6 | Low Signal-to-Noise Prioritization | 0 | 1 | 0.0% |
| 45 | F.6 | Hallucinated Reviewing | 0 | 0 | 0.0% |

## Per-model load

| model | n | ΣHIT | ΣPARTIAL | mean HIT/analysis | severity |
|---|---|---|---|---|---|
| _batch | 0 | 0 | 0 | 0.0 | {} |
| qwen37plus | 15 | 276 | 123 | 18.4 | {'high': 15} |
