# 45-pattern failure matrix — 5 classified analyses

Models: _batch=0, qwen37plus=0, qwen38max=5

Cells are `HIT/PARTIAL` counts. HIT = the analysis presents the failure as established; PARTIAL = raised but qualified.


## Pattern × model

| code | name | stage | pillar | _batch | qwen37plus | qwen38max | ΣHIT | ΣPART | HIT% |
|---|---|---|---|---|---|---|---|---|---|
| A.1 | Frame-Lock & Tunnel Vision | A | P2 | 0/0 | 0/0 | 3/1 | **3** | 1 | 60.0% |
| A.2 | Unfalsifiable Hypothesis | A | P3 | 0/0 | 0/0 | 3/0 | **3** | 0 | 60.0% |
| A.3 | Redundant Discovery | A | P2 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| A.4 | Feasibility Misjudgement | A | P4 | 0/0 | 0/0 | 0/1 | **0** | 1 | 0.0% |
| A.5 | Metric Misalignment | A | P3 | 0/0 | 0/0 | 2/0 | **2** | 0 | 40.0% |
| A.6 | Hypothesis-Experiment Mismatch | A | P1 | 0/0 | 0/0 | 3/1 | **3** | 1 | 60.0% |
| B.1 | Hallucinated Evidence & Unchecked Provenance | B | P1 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| B.2 | Retrieval-to-Action Gap | B | P1 | 0/0 | 0/0 | 2/1 | **2** | 1 | 40.0% |
| B.3 | Unvetted Data Quality & Units | B | P4 | 0/0 | 0/0 | 0/4 | **0** | 4 | 0.0% |
| B.4 | Shallow Search & Coverage Gaps | B | P2 | 0/0 | 0/0 | 1/0 | **1** | 0 | 20.0% |
| B.5 | Citation Decorrelation | B | P1 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| B.6 | Low Signal-to-Noise Prioritization | B | P2 | 0/0 | 0/0 | 1/0 | **1** | 0 | 20.0% |
| C.1 | Circular Validation & Shortcut Reliance | C | P3 | 0/0 | 0/0 | 3/2 | **3** | 2 | 60.0% |
| C.2 | Grader-Fitting & Data Leakage | C | P3 | 0/0 | 0/0 | 1/0 | **1** | 0 | 20.0% |
| C.3 | Implementation Discrepancy | C | P1 | 0/0 | 0/0 | 1/0 | **1** | 0 | 20.0% |
| C.4 | Execution Faults & Numerical Instability | C | P4 | 0/0 | 0/0 | 1/1 | **1** | 1 | 20.0% |
| C.5 | Infrastructure Error Misdiagnosis | C | P4 | 0/0 | 0/0 | 1/1 | **1** | 1 | 20.0% |
| C.6 | Search Space Local Optimization | C | P2 | 0/0 | 0/0 | 0/1 | **0** | 1 | 0.0% |
| C.7 | Premature Termination | C | P2 | 0/0 | 0/0 | 1/1 | **1** | 1 | 20.0% |
| C.8 | Environment Interaction Failure | C | P4 | 0/0 | 0/0 | 1/1 | **1** | 1 | 20.0% |
| D.1 | Artifacts as Insights | D | P1 | 0/0 | 0/0 | 2/2 | **2** | 2 | 40.0% |
| D.2 | Confirmation Bias | D | P3 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| D.3 | Statistical Misuse | D | P3 | 0/0 | 0/0 | 5/0 | **5** | 0 | 100.0% |
| D.4 | Method-Conclusion Disconnect | D | P1 | 0/0 | 0/0 | 5/0 | **5** | 0 | 100.0% |
| D.5 | Baseline & Ablation Deficit | D | P2 | 0/0 | 0/0 | 1/2 | **1** | 2 | 20.0% |
| D.6 | Result Hallucination | D | P1 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| D.7 | Unremediated Adversarial Evidence | D | P3 | 0/0 | 0/0 | 4/1 | **4** | 1 | 80.0% |
| E.1 | Report-Code Traceability Gap | E | P1 | 0/0 | 0/0 | 4/0 | **4** | 0 | 80.0% |
| E.2 | Overclaiming & Selective Narrative | E | P3 | 0/0 | 0/0 | 5/0 | **5** | 0 | 100.0% |
| E.3 | Omission of Critical Limitations | E | P3 | 0/0 | 0/0 | 2/1 | **2** | 1 | 40.0% |
| E.4 | Methodological & Citation Fabrication | E | P1 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| F.1 | Superficial Self-Review | F | P2 | 0/0 | 0/0 | 0/1 | **0** | 1 | 0.0% |
| F.2 | Failure to Gate Critical Flaws | F | P2 | 0/0 | 0/0 | 3/2 | **3** | 2 | 60.0% |
| F.3 | Lack of Adversarial Perspective | F | P2 | 0/0 | 0/0 | 2/3 | **2** | 3 | 40.0% |
| F.4 | Uncorrected Self-Awareness | F | P2 | 0/0 | 0/0 | 5/0 | **5** | 0 | 100.0% |
| F.5 | Review Score Hacking | F | P3 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| F.6 | Hallucinated Reviewing | F | P1 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| X.1 | Cascading Error Propagation | X | P4 | 0/0 | 0/0 | 5/0 | **5** | 0 | 100.0% |
| X.2 | Goal Drift | X | P3 | 0/0 | 0/0 | 4/0 | **4** | 0 | 80.0% |
| X.3 | Skeptical Reasoning Deficit | X | P2 | 0/0 | 0/0 | 1/1 | **1** | 1 | 20.0% |
| X.4 | "Honest-but-Hollow" Output | X | P3 | 0/0 | 0/0 | 0/0 | **0** | 0 | 0.0% |
| X.5 | Teleological Reasoning | X | P3 | 0/0 | 0/0 | 2/1 | **2** | 1 | 40.0% |
| X.6 | Right-for-the-Wrong-Reason | X | P1 | 0/0 | 0/0 | 2/2 | **2** | 2 | 40.0% |
| X.7 | Cognitive Anchoring & Re-planning Failure | X | P2 | 0/0 | 0/0 | 0/1 | **0** | 1 | 0.0% |
| X.8 | Engineering Delivery Failure | X | P4 | 0/0 | 0/0 | 2/2 | **2** | 2 | 40.0% |

## Ranked by HIT count

| rank | code | name | HIT | PARTIAL | HIT% |
|---|---|---|---|---|---|
| 1 | D.3 | Statistical Misuse | 5 | 0 | 100.0% |
| 2 | D.4 | Method-Conclusion Disconnect | 5 | 0 | 100.0% |
| 3 | E.2 | Overclaiming & Selective Narrative | 5 | 0 | 100.0% |
| 4 | F.4 | Uncorrected Self-Awareness | 5 | 0 | 100.0% |
| 5 | X.1 | Cascading Error Propagation | 5 | 0 | 100.0% |
| 6 | D.7 | Unremediated Adversarial Evidence | 4 | 1 | 80.0% |
| 7 | E.1 | Report-Code Traceability Gap | 4 | 0 | 80.0% |
| 8 | X.2 | Goal Drift | 4 | 0 | 80.0% |
| 9 | A.1 | Frame-Lock & Tunnel Vision | 3 | 1 | 60.0% |
| 10 | A.2 | Unfalsifiable Hypothesis | 3 | 0 | 60.0% |
| 11 | A.6 | Hypothesis-Experiment Mismatch | 3 | 1 | 60.0% |
| 12 | C.1 | Circular Validation & Shortcut Reliance | 3 | 2 | 60.0% |
| 13 | F.2 | Failure to Gate Critical Flaws | 3 | 2 | 60.0% |
| 14 | A.5 | Metric Misalignment | 2 | 0 | 40.0% |
| 15 | B.2 | Retrieval-to-Action Gap | 2 | 1 | 40.0% |
| 16 | D.1 | Artifacts as Insights | 2 | 2 | 40.0% |
| 17 | E.3 | Omission of Critical Limitations | 2 | 1 | 40.0% |
| 18 | F.3 | Lack of Adversarial Perspective | 2 | 3 | 40.0% |
| 19 | X.5 | Teleological Reasoning | 2 | 1 | 40.0% |
| 20 | X.6 | Right-for-the-Wrong-Reason | 2 | 2 | 40.0% |
| 21 | X.8 | Engineering Delivery Failure | 2 | 2 | 40.0% |
| 22 | B.4 | Shallow Search & Coverage Gaps | 1 | 0 | 20.0% |
| 23 | B.6 | Low Signal-to-Noise Prioritization | 1 | 0 | 20.0% |
| 24 | C.2 | Grader-Fitting & Data Leakage | 1 | 0 | 20.0% |
| 25 | C.3 | Implementation Discrepancy | 1 | 0 | 20.0% |
| 26 | C.4 | Execution Faults & Numerical Instability | 1 | 1 | 20.0% |
| 27 | C.5 | Infrastructure Error Misdiagnosis | 1 | 1 | 20.0% |
| 28 | C.7 | Premature Termination | 1 | 1 | 20.0% |
| 29 | C.8 | Environment Interaction Failure | 1 | 1 | 20.0% |
| 30 | D.5 | Baseline & Ablation Deficit | 1 | 2 | 20.0% |
| 31 | X.3 | Skeptical Reasoning Deficit | 1 | 1 | 20.0% |
| 32 | A.3 | Redundant Discovery | 0 | 0 | 0.0% |
| 33 | A.4 | Feasibility Misjudgement | 0 | 1 | 0.0% |
| 34 | B.1 | Hallucinated Evidence & Unchecked Provenance | 0 | 0 | 0.0% |
| 35 | B.3 | Unvetted Data Quality & Units | 0 | 4 | 0.0% |
| 36 | B.5 | Citation Decorrelation | 0 | 0 | 0.0% |
| 37 | C.6 | Search Space Local Optimization | 0 | 1 | 0.0% |
| 38 | D.2 | Confirmation Bias | 0 | 0 | 0.0% |
| 39 | D.6 | Result Hallucination | 0 | 0 | 0.0% |
| 40 | E.4 | Methodological & Citation Fabrication | 0 | 0 | 0.0% |
| 41 | F.1 | Superficial Self-Review | 0 | 1 | 0.0% |
| 42 | F.5 | Review Score Hacking | 0 | 0 | 0.0% |
| 43 | F.6 | Hallucinated Reviewing | 0 | 0 | 0.0% |
| 44 | X.4 | "Honest-but-Hollow" Output | 0 | 0 | 0.0% |
| 45 | X.7 | Cognitive Anchoring & Re-planning Failure | 0 | 1 | 0.0% |

## Per-model load

| model | n | ΣHIT | ΣPARTIAL | mean HIT/analysis | severity |
|---|---|---|---|---|---|
| _batch | 0 | 0 | 0 | 0.0 | {} |
| qwen37plus | 0 | 0 | 0 | 0.0 | {} |
| qwen38max | 5 | 78 | 34 | 15.6 | {'high': 4, 'medium': 1} |
