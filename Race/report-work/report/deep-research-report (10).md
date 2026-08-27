# PACK 2 · Adjacent Systems Deep Read: Where Rigor Lives and What Carries the Round-One → Round-Two Edge

## Executive verdict and classification rule

Your implementation sets a stronger bar than simply “having a verifier,” “keeping files,” or “running multiple rounds.” The decisive properties are that epistemic state is owned by an independent `research-mcp` process; probes are frozen before execution; terminal claim transitions must cite landed probes; kill/scope behavior is written before the result and mechanically applied afterward; raw measurements are recomputed by server-side code rather than trusted from the model; and the journal can be replayed to reject altered histories. The second-round edge is likewise normative: a new hypothesis must be connected to landed evidence and the graveyard, with an out-of-band attribution ladder preceding renewed scientific interpretation. fileciteturn0file1

I therefore use three levels when saying a mechanism is “outside the model”:

**Model-internal** means that an LLM critic, self-review, prompt instruction, ranking agent, or another LLM decides whether the scientific move is acceptable. **Harness-external** means fixed code, a scheduler, evaluator, database schema, statistical algorithm, or execution gate constrains what happens, but the model may still own the scientific semantics. **Authority-external** is the strongest form: the proposer cannot rewrite the relevant state transition, measurement, evidence history, or acceptance rule. Your implementation aims at this third form for the integrity-critical edges. fileciteturn0file1

The main conclusion is a correction to the initial positioning hypothesis in the supplied corpus. fileciteturn0file0 **It is no longer defensible to say that adjacent systems put rigor almost entirely inside LLM discretion.** Curie already externalizes substantial experimental control flow and execution validation; XScientist uses deterministic integrity forensics, hashes, DAG state and hard gates; ScientistOne externalizes evaluator records, evidence binding and independent re-execution; and the 2026 NeuronBench reference agent, MDA, moves Bayesian model-state update, predictive adequacy checking and experiment selection largely outside the LLM proposer. citeturn6view0turn19view0turn20academia28turn12academia28

The narrower claim survives much better: **within the systems reviewed, I found no whole system combining authority-external measurement, immutable prediction-before-result commitments, mechanically predeclared hypothesis transitions, evidence-addressed belief-state changes, replayable integrity history, mandatory result attribution before reinterpretation, and graveyard-aware next-hypothesis admission.** Several systems contain one or two close components, but none closes all of these edges together. citeturn6view0turn19view0turn14view0turn12academia28 fileciteturn0file1

A second major update is that **LLM-AutoSciLab and especially MDA are much stronger prior art for the round-one → round-two edge than ordinary “agent loops.”** LLM-AutoSciLab explicitly represents state as \(S_t=(D_t,E_t,H_t)\), selects experiments from candidate-hypothesis disagreement, incorporates the observation, and updates the hypothesis state before the next acquisition. MDA goes further in separating roles: the LLM proposes model structures, while Bayesian inference, value-of-information experiment design, state update, and predictive adequacy checks are algorithmic. citeturn14view0turn16view1turn12academia28turn16view3

## End-to-end systems

**Curie — 【部分同构 · 高度威胁“严谨性都在模型内”定位】**

**Q1 · Rigor mechanism.** Curie is explicitly designed around an Experimental Rigor Engine, with Intra-Agent and Inter-Agent Rigor Modules plus structured Experiment Knowledge. The Intra-Agent side validates experimental setup and execution; its execution validation includes clean-environment execution, repeated runs and result-quality checks. The Inter-Agent side controls procedural coordination, while Experiment Knowledge provides structured history and validated writes rather than leaving all memory management to free-form LLM context. citeturn6view0

**Q2 · Discretion ownership.** **Mixed, with meaningful model-out enforcement.** This is the most important correction to your initial Curie hypothesis. Curie still uses LLM agents for scientific planning, analysis and parts of verification, but the paper says that “**every agent action is intercepted by the Experimental Rigor Engine**,” and its control-flow enforcement derives permitted transitions from partition state for the scheduler to execute. citeturn6view0 The repository confirms that a completed Technician task is programmatically routed into `llm_verifier`; after LLM verification, fixed Python either sends failures to `patch_verifier` or invokes `exec_validator(...)` before allowing the analyzer to receive the result. fileciteturn6file0L2-L2 fileciteturn8file0L2-L2

**Q3 · Round edge.** **Hybrid structured-state transition + fixed routing + LLM semantic update.** Worker completion, verification, patching, execution validation and analyzer handoff are carried by scheduler state and fixed transitions rather than by “please reflect on this result” alone. But the scientific content of the next hypothesis or experimental plan is still produced by the Architect/analyzer side; Curie does not appear to require the next hypothesis to be a mechanically legal transition from a specific landed probe. citeturn6view0

**Q4 · Preregistration semantics.** Curie requires experimental planning and control structure before execution, which is stronger than post-hoc free-form analysis, but I found no equivalent of your immutable quantitative prediction bands plus predeclared kill/scope branch that is frozen before the result and mechanically executes the corresponding claim transition afterward. citeturn6view0 fileciteturn0file1

**Key distinction.** Curie is **mechanism-level isomorphic** to your design in one important place: *bad execution is structurally prevented from flowing directly into scientific analysis*. It is not whole-system isomorphic because its epistemic state transitions themselves remain substantially agent-semantic rather than an independently owned claim/probe state machine. fileciteturn8file0L2-L2

**co-scientist — 【不同构；内部迭代强，实验反馈边弱】**

**Q1.** Rigor comes from a multi-agent ecology: Reflection simulates peer review; Ranking performs pairwise tournament-style comparisons; Evolution refines selected hypotheses; Proximity checks similarity; Meta-review aggregates feedback; and persistent context memory carries state. citeturn24view4

**Q2.** **Predominantly model-internal.** Different agents create role separation, but scientific criticism and selection are still produced by LLM agents in the same overarching generative system. The paper itself describes the accumulated context as an emergent internal model while noting that it is “**not an explicit symbolic model**.” citeturn24view2 External laboratory validation appears in the scientific studies around the system, but experimentally grounded closed-loop automation is discussed as an avenue beyond the current architecture rather than a hard online integrity layer. citeturn24view3

**Q3.** For the built-in generate–criticize–evolve loop, the carrier is principally **prompt/context memory**. The most revealing implementation description says Meta-review feedback is “**simply appended to their prompts in the next iteration**.” citeturn24view4 That is almost the canonical contrast to your mechanical transition edge.

**Q4.** No immutable prediction-before-result registration, quantitative outcome bands, or fixed kill/scope branch was identified. Hypotheses are evaluated for novelty, correctness, testability and related criteria, but that is quality judgment, not preregistered falsification semantics. citeturn24view4

**Robin — 【部分同构；真实两轮实验因果存在，但边是软的】**

**Q1.** Robin combines literature/search agents, hypothesis generation, experimental design and Finch-based analysis. Finch performs multiple analysis trajectories and meta-analysis, after which actionable findings are fed back into a new hypothesis cycle; wet-lab work is performed by human scientists. citeturn24view5turn24view6

**Q2.** **Mixed operationally, but not an authority-external epistemic gate.** Physical measurements are genuinely outside the model, and humans review experimental protocols/results, while result interpretation, report ranking and hypothesis generation remain LLM-mediated. The system therefore obtains trustworthy external observations without making the *belief transition itself* non-discretionary. citeturn24view6turn24view7

**Q3.** Robin provides one of the clearest real examples that round two was substantively motivated by round one: the paper explicitly says, “**Drawing from the insights from the first round of experimental analysis**,” before describing the next proposed intervention. The carrier, however, is an LLM-generated structured result/JSON artifact plus human/agent handoff, not a fixed claim-state transition. citeturn24view1

**Q4.** The biological hypothesis naturally precedes wet-lab measurement, but I found no frozen expected interval, predeclared falsification branch or immutable preregistration object. Human protocols also fill in execution details that Robin does not itself specify precisely. citeturn24view7

Robin is therefore **strong evidence that “real experimental round two” is not novel by itself**, but weak prior art against your claim that *the edge itself is structurally enforced*.

**AI Scientist, File-as-Bus version — 【部分同构；状态总线近，信念闸远】**

**Q1.** The central reliability mechanism is durable workspace state rather than long-context memory. Plans, experiment records, failures and result summaries become files under a schema governing purpose, update behavior, permitted writers and readers; final evaluation can be performed by fresh execution in a clean environment. citeturn15view0turn16view0

**Q2.** **Mixed.** Persistence, schema and clean execution are model-out mechanisms; the Orchestrator nevertheless decides what evidence means and which next intervention is worth performing. There is no independent epistemic owner analogous to your MCP process that alone can authorize claim-state transitions. citeturn15view0turn16view0

**Q3.** This is a genuine structured carrier. The paper's design can be summarized by its phrase “**thin control over thick state**”: specialists emit workspace deltas, the runtime updates persistent workspace state, and subsequent specialists read the updated state. Recorded failures, metric gaps and bottlenecks explicitly influence subsequent interventions. citeturn15view0turn16view0 But the transition is primarily **artifact/workspace state**, not typed falsifiable-hypothesis state.

**Q4.** Experiment plans precede executions and experiment records are durable, but there is no equivalent of immutable predicted frequency bands plus a frozen post-result claim transition. citeturn15view0

This is the closest neighbor to your **journal/file substrate**, but not to your **legal grammar of belief change**. fileciteturn0file1

**ScientistOne / “Science One” and Chain-of-Evidence — 【部分同构 · 高度威胁外部诚信定位】**

**Q1.** Chain-of-Evidence binds paper claims to concrete evidence artifacts. The discovery engine evaluates candidate branches with task-specific evaluators; raw evaluator outputs are retained in a “**strict, read-only record**”; writing is followed by claim verification; and the audit procedure can independently rerun computations, inspect specification violations, validate references through external APIs and check method–code alignment. citeturn20search1turn20academia28

**Q2.** **Strongly mixed, with several real model-out components.** Claim verification contains model-mediated judgment, but evaluator outputs, source/API grounding and independent reruns do not depend merely on the proposer saying that its work is correct. This directly falsifies any broad claim that contemporary scientific agents rely only on LLM self-critique for integrity. citeturn20search0turn20search1turn20academia28

**Q3.** Evaluator results influence which high-performing discovery branches are refined, so the carrier is **fixed search/control logic plus durable evidence artifacts**. But this is mainly an artifact-quality/search edge; it does not model a scientific claim as LIVE→REFUTED/SCOPED/SUPPORTED with transitions legally tied to particular experiments. citeturn20search1

**Q4.** Chain-of-Evidence is exceptionally strong on *post-result provenance*, but I found no equivalent immutable prediction-before-result commitment with predeclared kill/scope semantics. citeturn20academia28

This is a serious threat to the **“external verification”** half of the positioning, but not to the combined **preregistration → landed probe → mechanical belief transition** claim.

**XScientist — 【部分同构 · strongest integrity-infrastructure neighbor】**

**Q1.** XScientist's Agentic Research Artifact layer records an exploration DAG, per-node code and outputs, provenance, content hashes, claim-to-evidence anchors and re-execution information. It adds sample gates, truth contracts and “**deterministic integrity forensics**”; hard integrity findings can block a submission-ready state. citeturn19view0

**Q2.** **Mixed, with unusually substantial model-out enforcement.** Self-review still involves agents, but content hashing, provenance consistency, gate preconditions and deterministic forensic checks are intentionally non-generative. The paper explicitly motivates determinism because a submission gate requires repeatable behavior. citeturn19view0

**Q3.** **Structured DAG/state transition.** Experiment, repair, failure, ablation and manuscript nodes are first-class; parent–child edges preserve evolutionary lineage; failed branches remain in history; feedback signals affect later scheduling. This is much closer to your journal and graveyard philosophy than ordinary prompt memory. citeturn19view0 It still does not appear to require that *every new scientific hypothesis* be admitted only through a particular landed probe plus prewritten branch rule.

**Q4.** Plans contain expected outputs and acceptance checks before execution, and sample gates require completion of a planned small task before proceeding. That is **partial preregistration semantics**, but not the stronger quantitative, immutable and outcome-branching preregistration you implement. citeturn19view0

**Threat assessment:** high. XScientist means your novelty should not be worded as “first to move integrity into deterministic infrastructure.” The stronger defensible distinction is *what the deterministic infrastructure is allowed to own*: your claim is about the **belief transition itself**, not just artifact integrity. fileciteturn0file1

**LLM-AutoSciLab — 【部分同构 · strongest requested round-edge prior】**

**Q1.** The system maintains hypotheses, evidence and data, generates candidate mechanisms, chooses experiments to discriminate between them, fits/evaluates mechanisms and uses bootstrap-style confidence gating before retaining/updating them. citeturn14view0turn16view1

**Q2.** **Mixed, importantly outside-model at the update/control layer.** LLMs generate or articulate candidate mechanisms, while acquisition rules, model fitting, bootstrap confidence tests and the experimental oracle provide algorithmic checks that do not reduce to an LLM critic agreeing with itself. citeturn16view1

**Q3.** **Explicit structured epistemic state transition.** The paper writes the state as \(S_t=(D_t,E_t,H_t)\): accumulated observations, evidence and current hypotheses. The next experiment is selected from this state, the resulting observation is incorporated, hypotheses are refined or eliminated, confidence is recomputed, and that updated state controls subsequent acquisition. citeturn14view0turn16view1 This is far closer to your “result causes next plan” edge than a normal chat-history loop.

**Q4.** **Partial equivalent.** Candidate mechanisms make differing predictions *before* the selected experiment is observed, and disagreement is itself used to choose the experiment. That establishes genuine prediction-before-observation temporality. What is absent is your immutable preregistration object: no frozen disjoint range pairs, predeclared kill/scope transition, hash/timestamp or later replay of whether the pre-result commitment was obeyed. citeturn14view0turn16view1 fileciteturn0file1

This system materially narrows the novelty of “structured two-round epistemic updating.” Your distinction has to be **commitment and admissibility**, not merely stateful updating.

**MLEvolve — 【不同构；结构很强，但结构对象是 artifact fitness】**

**Q1.** Correctness/quality is chiefly mediated through task evaluators and repeated candidate evaluation rather than scientific-integrity gates. Search memory records prior experience, and agents generate candidate pipeline changes. citeturn21academia0turn23view6

**Q2.** **Mixed:** fitness is externally computed, whereas mutations and higher-level search proposals remain agent-generated. This is genuinely outside-model measurement, but its semantics are optimization performance, not truth of a scientific hypothesis. citeturn23view2turn23view6

**Q3.** **Fixed, structured evolutionary edge.** MCGS maintains a directed graph whose nodes are candidate solutions and whose parent→child edges encode generated variants; selection, expansion, simulation and back-propagation use evaluator scores. A node is effectively a “**complete candidate pipeline solution**,” not an epistemic proposition. citeturn23view6

**Q4.** No scientific preregistration. The evaluator/objective is fixed before evaluation, but that is an optimization contract, not a prediction of an unknown result whose realization triggers a precommitted belief transition. citeturn21academia0

This is the cleanest literature-side support for your proposed distinction in Q6.

**OpenEvolve — 【不同构；fixed evolutionary feedback, not hypothesis-state update】**

**Q1.** The framework separates LLM-generated program modifications from evaluation, supports reproducible seeded runs, evaluator pipelines, quality-diversity populations and isolated candidate components. fileciteturn15file0L2-L2

**Q2.** **Mixed/outside for fitness, inside for invention.** External evaluators determine performance; the LLM produces candidate modifications.

**Q3.** **Structured evolutionary state.** MAP-Elites/islands select programs by fitness/diversity, and evaluator artifacts can be returned to later generations. The official documentation explicitly calls this an “**Artifact Side-Channel: Error feedback improves subsequent generations**.” fileciteturn15file0L2-L2 The parent→descendant relation is therefore real and algorithmically carried, but it is a program lineage rather than a falsifiable-hypothesis lifecycle.

**Q4.** No prediction-before-result scientific preregistration or predeclared claim transition. An evaluator being fixed in advance is not the same semantic object.

**Critical newly adjacent system: MDA in the 2026 NeuronBench work — 【部分同构 · highest threat to the two-core-line combination】**

This deserves inclusion even though the supplied pack lists NeuronBench primarily as a benchmark. The associated Model Discovery Agent changes the nearest-neighbor picture materially. citeturn12academia28turn16view3

**Q1.** The LLM is principally a **proposer of candidate model structures**. Bayesian sequential Monte Carlo/simulation-based inference maintains model uncertainty; value-of-information chooses interventions; observations are absorbed into posterior state; and a predictive adequacy check can decide that the current hypothesis class is inadequate. citeturn12academia28turn16view3

**Q2.** **Strong model-out epistemic update.** The proposer does not simply narrate its own confidence. Posterior updating, acquisition and predictive checks are algorithmic. The LLM is invoked again when the structured controller determines that hypothesis-space expansion is warranted. citeturn16view3

**Q3.** **Explicit structured state transition, stronger than almost every requested system.** The algorithm chooses a next experiment by value-of-information from current posterior state, acquires the actual datum, updates state, runs a predictive check, and then either refits within the present hypothesis class or calls the proposer to expand that class. citeturn16view3 In other words, the *fact that the observation violated predictive adequacy* programmatically changes what kind of planning operation is legal next.

**Q4.** Bayesian predictive distributions necessarily precede observations, but MDA does not appear to freeze a human-auditable preregistration artifact with hashed prediction intervals and explicit kill/scope transitions. Nor does it provide your journal replay, graveyard relation or artifact→bug→noise→known→real triage grammar. citeturn12academia28turn16view3 fileciteturn0file1

This is the single biggest threat to a claim such as **“we are the first to take hypothesis updating out of LLM discretion.”** A much safer claim is that you externalize the **normative admissibility and auditability of belief transitions**, not merely the numerical/statistical update.

**POPPER — 【部分同构；falsification rigor, but not your state-machine semantics】**

POPPER is worth retaining as an adjacent control even though it was outside the prompt's main A/B list. It formalizes “Agentic Sequential Falsifications,” generates null/alternative test specifications, executes statistical code and aggregates sequential statistical evidence using procedures such as e-values. citeturn17academia23 Its implementation includes structured null/alternative hypotheses and algorithmic e-value/Fisher-style aggregation rather than asking an LLM to verbally decide significance. fileciteturn10file0L2-L2

The rigor is therefore **mixed**; the statistical aggregation is outside model discretion, while test generation and interpretation are agentic. Its sequentiality is structured statistical accumulation, not an explicit LIVE→terminal hypothesis lifecycle in which each transition must cite a newly landed preregistered probe. It also does not establish your outcome-blind immutable preregistration semantics: tests can be generated against already available data. citeturn17academia23

## Benchmarks and evaluation suites

A benchmark can have a completely external scorer while doing nothing to constrain the agent *during* research. I therefore distinguish **evaluation rigor** from **runtime rigor** below. That distinction matters for NeuronBench, DiscoverPhysics, ScienceAgentBench and CORE-Bench in particular.

**DiscoverPhysics — 【部分同构 as environment; not as enforced epistemic protocol】**

**Q1.** The benchmark hides a physics environment and scores discovered laws against ground-truth trajectories; the evaluator is external to the agent. citeturn22view1turn23view7  
**Q2.** Evaluation is **model-out**, but the benchmark does not itself dictate how the agent must maintain beliefs between experiments.  
**Q3.** Agents conduct “**multiple rounds of experiments**,” receive observations and choose subsequent experiments, but the default carrier is the agent's interaction history/scaffold. There is no benchmark requirement that round two be a typed transition from round-one evidence. citeturn22view1  
**Q4.** An experiment is selected before its trajectory is returned, but the benchmark does not require a frozen quantitative prediction or branch commitment before observation. citeturn23view7

Its most useful methodological feature for you is the **guided-vs-randomized experiment-choice comparison**: it demonstrates that adaptive experiment selection has value. But it still does not isolate whether the *realized result* caused the next plan. citeturn23view7

**ReplicatorBench — 【部分同构 only at source-protocol preregistration】**

**Q1.** ReplicatorBench evaluates autonomous replication workflows against the materials and criteria of real social/behavioral-science replications, with stage/checkpoint evaluation rather than only a final prose answer. citeturn22view0  
**Q2.** The benchmark criteria are external to the candidate agent.  
**Q3.** It has structured workflow stages, but these are **replication-pipeline checkpoints**, not a two-round empirical state machine in which a newly obtained observation mechanically determines a new hypothesis or experimental plan. citeturn22view0  
**Q4.** The key nuance corrects the stronger reading in the supplied local notes. The primary paper clearly relies on **“preregistered criteria”** originating in the human replication process, but I could not verify from the primary materials that ReplicatorAgent itself must make an immutable, outcome-blind preregistration commit before gaining access to the analysis evidence. citeturn22view0

So ReplicatorBench is valuable precedent for bringing preregistered scientific criteria into an agent benchmark, but **not verified precedent for your agent-side frozen transition contract**.

**ARFT / AutoResearchEval — 【证实你的 diagnosis; not an implementation neighbor】**

**Q1.** ARFT's integrity mechanism is primarily *diagnostic*: a separate evaluator classifies failures in completed research trajectories. The rollout itself still relies heavily on instructions to consider alternatives, falsification conditions, weaknesses and revision. citeturn23view4turn23view5  
**Q2.** The evaluator is outside the candidate run, but the research agent's self-critique remains model-internal.  
**Q3.** This is exactly where the benchmark's central negative result matters. The paper observes, “**A self-review is just more text**” and that nothing structurally requires such review to change the report. citeturn23view5 That is a prompt/text edge rather than a typed transition.  
**Q4.** Falsification/alternative-explanation language can be requested before or during analysis, but it is not frozen preregistration. The supplied paper notes likewise emphasize that orchestration-level remedies remain an untested open question. fileciteturn0file2 citeturn23view4

ARFT therefore supports your motivation unusually well. It explicitly points toward “verification the agent does not control” as a remedy class rather than another self-review instruction. citeturn23view5

**NeuronBench — 【部分同构 benchmark; reference MDA is much closer】**

**Q1.** NeuronBench's ground-truth neuron dynamics, intervention outcomes, budget accounting and held-out forecasting score are outside the candidate agent; the agent receives noisy/partial experimental observations and is evaluated on counterfactual prediction of unobserved interventions. citeturn16view2turn12academia28  
**Q2.** **Model-out evaluator/world.** This is closely aligned with your external world-meter philosophy at the benchmark layer. Your implementation additionally prevents the research agent from owning the meter and mediates the budget through an external ledger. fileciteturn0file1  
**Q3.** The benchmark itself permits adaptive experimentation but does **not** prescribe the internal result→plan representation; an agent can use free-form history. The accompanying MDA reference agent, however, does use the structured posterior/predictive-check transition described above. citeturn16view3  
**Q4.** The benchmark's final held-out forecast is genuinely prospective, but it does not require each exploratory intervention to have a preregistered prediction and branch before its result is exposed. citeturn16view2

**ScienceAgentBench — 【不同构 on round edge; strong external endpoint evaluation】**

**Q1.** ScienceAgentBench is explicitly framed as “**rigorous assessment**” of agents on data-driven scientific-discovery tasks, using executable artifacts and task-specific result checks rather than judging only natural-language plausibility. citeturn3academia24  
**Q2.** Its scorer/execution environment is **outside the candidate model**.  
**Q3.** No required empirical round-one → round-two transition exists at the benchmark-contract level; the task is to solve the scientific computation/analysis correctly. citeturn3academia24  
**Q4.** No preregistration-style prediction-before-result contract is part of the core benchmark protocol. citeturn3academia24

Thus it tests whether research artifacts work, not whether an epistemic update was causally and legitimately produced.

**DiscoveryBench — 【不同构】**

**Q1.** DiscoveryBench externally evaluates “**data-driven discovery**” against benchmark answers/structured discovery tasks rather than trusting an agent's self-assessment. citeturn4academia36  
**Q2.** Evaluation is model-out.  
**Q3.** The core benchmark is not an intervention-feedback environment; the agent reasons over available data, so there is no standardized newly landed round-one experiment that must cause round-two planning. citeturn4academia36  
**Q4.** No prospective preregistration of an experiment outcome is required. citeturn4academia36

**ResearchClawBench — 【不同构 on structural feedback edge】**

**Q1.** ResearchClawBench evaluates agents across “**rediscovery to new discovery**” tasks with held-out targets/expert assessment rather than model self-certification. citeturn4academia37  
**Q2.** Benchmark judgment is external to the candidate research agent.  
**Q3.** The benchmark evaluates research outcomes from papers, data and literature but does not impose a standardized causal result→next-plan state transition. citeturn4academia37  
**Q4.** No frozen prospective prediction/kill-scope contract was identified. citeturn4academia37

Its significance for your positioning is breadth of “do research” evaluation, not epistemic-protocol enforcement.

**MLR-Bench — 【不同构; external review, open-ended optimization/research】**

**Q1.** MLR-Bench targets “**open-ended machine learning research**” and uses an external judging procedure to score resulting research quality. citeturn4academia38  
**Q2.** The judge is outside the candidate trajectory, although portions of quality judgment are themselves LLM-based rather than deterministic ground-truth checks.  
**Q3.** Agents may run and revise experiments, but the benchmark does not require a standardized structured dependency between an observed experiment and the next research plan. citeturn4academia38  
**Q4.** No immutable preregistration semantics are part of the benchmark contract. citeturn4academia38

A second implementation being generated or attaining a better metric is therefore evidence of iterative optimization, not evidence that a scientific belief transition was causally justified by the preceding measurement.

**CORE-Bench — 【不同构; reproducibility endpoint】**

**Q1.** CORE-Bench centers on **computational reproducibility**: an agent must recreate research results in an executable environment, and correctness is checked externally. citeturn4academia39  
**Q2.** This is strongly model-out at the scoring layer.  
**Q3.** There is no standardized round-one empirical result → round-two planning requirement; repeated debugging is a means to the reproducibility endpoint. citeturn4academia39  
**Q4.** No prospective experimental preregistration or hypothesis transition grammar is required. citeturn4academia39

## Cross-cutting answers

### Q5 · Does any benchmark directly measure that round two was *caused* by the realized round-one result?

**【空白；DiscoverPhysics / ActiveSciBench / ARFT are the closest parallels】**

I found **no reviewed benchmark that directly identifies the causal edge \(y_1 \rightarrow \text{plan}_2\)** by intervening on the round-one result while holding the rest of the trajectory fixed and then scoring whether the next plan changes as required.

DiscoverPhysics comes closest experimentally, but its randomized control changes **which experiment the agent chooses**. That establishes that adaptive experiment *selection* can improve final discovery relative to random selection; it does not establish that the realized outcome of a fixed first experiment caused a particular second-round plan. More rounds also improve performance, but again that does not distinguish feedback from repeated independent attempts. citeturn22view1turn23view7

LLM-AutoSciLab/ActiveSciBench comes closest **formally**. It explicitly represents the next action as a policy of state and then updates that state after receiving new evidence; its benchmark therefore rewards agents that can exploit sequential information. But its principal outcome/sample-efficiency scores do not isolate a counterfactual question such as: “holding \(D_{<1}\) and the first experiment fixed, would a different plausible \(y_1\) have generated a correspondingly different round-two plan?” citeturn14view0turn16view1

NeuronBench likewise rewards the final forecast under a hard experimental budget, so adaptive policies can benefit, but the benchmark does not inspect whether each next experiment was causally linked to the immediately previous observation. citeturn16view2turn16view3

ARFT measures a related failure mode observationally: an agent can itself surface a serious contradiction or weakness and nevertheless fail to change the ensuing report/action. That is excellent evidence for a broken judgment→action edge, but not a controlled benchmark of counterfactual outcome→plan dependence. citeturn23view5

A benchmark that *did* directly measure your edge would need something stronger: freeze state before a landed probe; replay matched trajectories with two controlled result values; then test whether the round-two transition follows the branch that was committed before either result was revealed. Your current preregistered kill/scope machinery already supplies almost exactly the infrastructure needed to define that metric. fileciteturn0file1

### Q6 · Evolutionary search versus a falsifiable-hypothesis state machine

**【并行；the distinction is explicit in the mathematical objects, but I found no paper that names it as a methodological boundary in your exact terms】**

The literature gives unusually clean formal evidence for your distinction.

MLEvolve's state consists of **candidate solutions and evaluator fitness**. A parent node generates a child candidate; MCGS uses score feedback for selection and back-propagation; the optimization target is a best-scoring artifact. citeturn21academia0turn23view6turn23view2 OpenEvolve has the same basic ontology: program populations, evaluator metrics, MAP-Elites/islands, selection and error artifacts that condition future mutations. fileciteturn15file0L2-L2

By contrast, LLM-AutoSciLab makes **hypotheses themselves part of the state**, \(S_t=(D_t,E_t,H_t)\), and asks what experiment best distinguishes those hypotheses before updating \(H_t\) from the result. citeturn14view0turn16view1 MDA goes further: it maintains a posterior over candidate model structures, picks interventions by value-of-information and uses predictive inadequacy to decide whether the permitted next operation is refitting or hypothesis-space expansion. citeturn12academia28turn16view3

Your state machine is stricter still. It does not merely maintain \(H_t\); it defines an **admissibility relation on epistemic transitions**: a claim cannot become terminal without a landed probe; the relevant branch is prewritten; new claims must relate to graveyard state; and the evidence relation can be replayed independently of the LLM's narrative. fileciteturn0file1

So the strongest defensible methodological boundary is:

> **Evolutionary search asks which artifact to reproduce/mutate next under a fitness function. A hypothesis state machine additionally asks which belief transitions are legally warranted by already committed, subsequently observed evidence.**

I found strong formal support for this distinction, but not a prior paper explicitly presenting it as “evolutionary artifact search versus epistemic state-machine research.” Hence **【并行】**, not “literature already states our thesis.”

### Q7 · Any precedent for mandatory out-of-band attribution before scientific continuation?

**【空白 for the full ladder; strong component-level parallels】**

The closest structural precedent is **Curie**. Its repository hard-routes an execution judged incorrect to `patch_verifier`; only a non-failing path proceeds through `exec_validator(...)` and then to the analyzer. That realizes a weaker but genuinely structural principle: **execution validity is resolved before the result is admitted to scientific interpretation.** fileciteturn8file0L2-L2

XScientist is the next closest. Sample gates, truth contracts and deterministic integrity findings can block progression, and failure nodes remain explicit rather than being silently absorbed into a successful narrative. citeturn19view0

MDA supplies a different kind of attribution boundary: after an observation, a predictive check determines whether the current model class is adequate; only when inadequacy exceeds the criterion does control move to LLM-based hypothesis-space expansion. That prevents every surprising observation from immediately becoming an unconstrained new story. citeturn16view3

AI Scientist's file bus records failure diagnoses and metrics so the Orchestrator can choose a later intervention, but the classification is not a compulsory externally ordered diagnostic ladder. citeturn15view0turn16view0

I found **no reviewed system that requires every anomalous/out-of-band experimental result to traverse a fixed sequence equivalent to artifact → implementation bug → measurement/noise → known phenomenon → candidate-real-effect before a new hypothesis may be registered.** The components exist separately; the ordered admission rule appears to be the distinctive part of your design. fileciteturn0file1

### Q8 · What does “feedback iteration” mean in benchmark/competition scoring?

**【并行；external benchmarks mostly score endpoints, not the causal edge itself】**

The reviewed benchmarks fall into four regimes.

| Evaluation regime | Examples | What “iteration” actually earns credit for |
|---|---|---|
| **Endpoint reproducibility / correctness** | CORE-Bench, ScienceAgentBench, DiscoveryBench | Final executable/result correctness. A second attempt has no special status as “feedback”; only the outcome matters. citeturn4academia39turn3academia24turn4academia36 |
| **Open-ended repeated research/optimization** | MLR-Bench, MLEvolve/OpenEvolve-style settings | Better research/artifact fitness after repeated work. Improvement is evidence of optimization, but it does not prove that a particular observed result caused the next hypothesis. citeturn4academia38turn21academia0 |
| **Budgeted active experimentation** | NeuronBench, DiscoverPhysics | Agents obtain observations under an experiment budget, then final held-out prediction/law quality is scored. Adaptation can help, but process causality is not itself the scoring target. citeturn16view2turn22view1 |
| **Explicit sequential-state policy** | ActiveSciBench / LLM-AutoSciLab | The formal protocol explicitly updates state after observation and selects the next experiment from that state. This is the closest external semantic match to “feedback iteration,” although the benchmark still primarily scores scientific recovery/sample efficiency rather than transition compliance. citeturn14view0turn16view1 |

DiscoverPhysics adds an especially useful control by comparing agent-selected and randomized experimental choices; this is stronger evidence for meaningful active experimentation than simply granting two turns. citeturn23view7 ARFT adds the complementary diagnostic: merely producing self-critical text does not count as meaningful correction when nothing forces the criticism to change subsequent action. citeturn23view5

The competition criterion in your supplied design materials—regenerating another solution is not, by itself, feedback iteration—is therefore **stricter than most endpoint benchmarks but well aligned with the direction of ActiveSciBench and ARFT**. Your cleanest scoring definition would be: *round two counts as feedback iteration only when its registered state transition names landed round-one evidence and would have taken a different precommitted branch under a materially different round-one result.* fileciteturn0file2 fileciteturn0file1

## Result → plan carrier matrix

“Structured?” here means that the system/benchmark has a machine-readable state/control structure carrying the edge; it does **not** automatically mean the scientific belief transition is mechanically constrained.

| Object | Result → next-plan carrier | Structured? | Where rigor/integrity lives |
|---|---|---:|---|
| **Curie** citeturn6view0 | Scheduler partition state → LLM verifier → fixed patch/exec-validator route → analyzer/Architect | **Yes operationally; partial epistemically** | **Mixed; substantial harness-external enforcement** |
| **co-scientist** citeturn24view2turn24view4 | Context memory + critic/meta-review text appended to later prompts | No explicit symbolic transition | **Mostly model-internal** |
| **Robin** citeturn24view1turn24view6 | Human wet-lab result → Finch analyses/meta-analysis → LLM-generated structured insight → new hypothesis | Semi-structured artifact | **Mixed observation layer; epistemic update LLM/human** |
| **AI Scientist File-as-Bus** citeturn15view0turn16view0 | Workspace files / specialist delta → runtime workspace update → Orchestrator intervention | **Yes, artifact state** | **Mixed; schema/execution out, interpretation in** |
| **ScientistOne / CoE** citeturn20search1turn20academia28 | Evaluator outputs/read-only evidence → branch refinement | **Yes, search/evidence state** | **Mixed; strong external evaluator/audit components** |
| **XScientist** citeturn19view0 | ARA DAG + quality gates + failures/repair nodes + scheduling feedback | **Yes** | **Mixed; deterministic integrity layer outside LLM** |
| **LLM-AutoSciLab** citeturn14view0turn16view1 | \(S_t=(D,E,H)\) → acquisition → observation → RefineHyp/ConfGate → \(S_{t+1}\) | **Yes, epistemic** | **Mixed; fitting/confidence/acquisition partly external** |
| **MDA** citeturn12academia28turn16view3 | Posterior → VoI experiment → datum → posterior/predictive check → refit or expand hypothesis space | **Yes, epistemic** | **Strongly mixed; LLM primarily proposer** |
| **POPPER** citeturn17academia23 | Sequential statistical-test evidence → aggregated falsification decision | Structured statistical state | **Mixed; statistical aggregation external, test generation agentic** |
| **MLEvolve** citeturn21academia0turn23view6 | MCGS candidate graph + evaluator score/back-propagation → child mutation | **Yes, artifact fitness** | **External fitness; LLM mutation** |
| **OpenEvolve** fileciteturn15file0L2-L2 | MAP-Elites/island population + evaluator artifacts → later program generation | **Yes, artifact fitness** | **External evaluator; LLM mutation** |
| **DiscoverPhysics** citeturn22view1 | Observation transcript/history → agent chooses next experiment | Benchmark does not require structured belief state | **External benchmark evaluator; runtime up to agent** |
| **ReplicatorBench** citeturn22view0 | Replication workflow/checkpoints | Workflow-structured, not epistemic | **External benchmark criteria** |
| **ARFT** citeturn23view5 | Review/revision text in rollout | **No hard transition** | **Post-hoc evaluator external; self-correction model-internal** |
| **NeuronBench** citeturn16view2 | Benchmark leaves adaptive policy to agent; MDA reference uses structured posterior state | Benchmark: no; MDA: yes | **External world/evaluator** |
| **ScienceAgentBench** citeturn3academia24 | No standardized result→plan edge | No | **External execution/result scoring** |
| **DiscoveryBench** citeturn4academia36 | Static data/reasoning workflow | No empirical round edge | **External scorer** |
| **ResearchClawBench** citeturn4academia37 | Agent-defined research process | No mandatory edge | **External hidden target/expert evaluation** |
| **MLR-Bench** citeturn4academia38 | Agent/harness-specific iterative research | Not required by benchmark | **External, partly LLM-based judging** |
| **CORE-Bench** citeturn4academia39 | Debug/reproduction process, no standardized scientific feedback edge | No | **External executable reproducibility scoring** |
| **Your implementation** fileciteturn0file1 | Frozen prereg → landed probe → predeclared mechanical claim transition → mandatory attribution → graveyard-aware next registration | **Yes, epistemic + authority-external** | **Independent process owner + raw recomputation + replay gates + external meter** |

The table exposes the important split. **Curie/XScientist/ScientistOne beat a pure “LLM critic” architecture on rigor. MDA/LLM-AutoSciLab beat a pure “prompt feedback loop” on stateful scientific updating. MLEvolve/OpenEvolve beat it on algorithmically carried inter-generation feedback.** Your remaining distinction is that these properties are joined into an externally enforceable *epistemic commitment protocol*, not simply a robust research workflow. citeturn6view0turn19view0turn12academia28turn14view0turn21academia0 fileciteturn0file1

## Nearest-neighbor ranking and positioning

**Closest overall: MDA — 【部分同构；最高优先级对照】.** It most directly attacks both core lines simultaneously: the LLM is not sovereign over posterior updating, the next experiment is selected algorithmically from current uncertainty, and an unexpected observation can mechanically switch the next permitted operation from refitting to hypothesis-space expansion. The remaining gap is large but precise: no immutable preregistered branch contract, no probe-addressed claim lifecycle, no replayable epistemic journal, no graveyard admission rule and no mandatory anomaly-attribution ladder. citeturn12academia28turn16view3 fileciteturn0file1

**Second: XScientist — 【部分同构；integrity architecture closest】.** DAG history, content hashes, explicit failed branches, claim–evidence anchors, truth contracts, sample gates and deterministic integrity forensics strongly overlap your “state should survive and constrain the model” philosophy. Gap: its structured object is a general research artifact/branch graph, not a preregistered falsifiable-claim state machine with mechanically determined result-dependent transitions. citeturn19view0

**Third: Curie — 【部分同构；strongest requested threat to model-out rigor claim】.** Its rigor engine, fixed scheduler transitions, verifier/patch pipeline and deterministic execution validator mean “Curie's rigor is just another LLM critic” is incorrect. Gap: the experimental-control graph is more strongly typed than the epistemic update itself; the Architect remains responsible for semantic hypothesis revision. citeturn6view0 fileciteturn8file0L2-L2

**Fourth: LLM-AutoSciLab — 【部分同构；strongest requested hypothesis-state neighbor】.** Explicit \(D/E/H\) state, prospective hypothesis disagreement, active experiment selection, observation-conditioned refinement and confidence gating are already a structural feedback loop. Gap: it lacks the adversarial commitment semantics that make a particular belief change *legally auditable* after the fact. citeturn14view0turn16view1

**Fifth: ScientistOne / Chain-of-Evidence — 【部分同构】.** This is the strongest warning against claiming novelty for “external evidence checking”: read-only evaluator records, claim–artifact binding, external source grounding and independent reruns already externalize important integrity functions. Gap: the center of gravity is evidence-backed output and discovery-branch quality, not hypothesis lifecycle governance. citeturn20search1turn20academia28

**Sixth: AI Scientist File-as-Bus — 【部分同构】.** It is very close to your durable state/journal substrate and explicitly treats the workspace as long-horizon state. Gap: its schema says *where state lives and who reads/writes it*, not what evidence makes a scientific belief transition admissible. citeturn15view0turn16view0

**Seventh: POPPER — 【部分同构】.** It moves sequential statistical falsification and evidence aggregation outside pure prose reasoning. Gap: its main object is a statistical hypothesis-testing sequence over accessible data, not an externally owned research-world belief state with preregistered physical probes and graveyard-aware evolution. citeturn17academia23

**Eighth: Robin — 【部分同构 only in empirical causation】.** It is unusually valuable as proof that a real wet-lab result can genuinely motivate a later hypothesis and experiment. Gap: the causal connection is recorded in scientific narrative/structured LLM output and human handoff rather than guaranteed by a machine-enforced transition relation. citeturn24view1turn24view6

co-scientist sits farther away because its internal evolutionary feedback is explicitly prompt/context-mediated; MLEvolve and OpenEvolve sit farther away because their fixed feedback edges operate over artifact fitness rather than falsifiable belief state. citeturn24view4turn21academia0 fileciteturn15file0L2-L2

The positioning implication is therefore quite sharp. **Do not lead with “rigor outside the model” alone**: Curie, XScientist, ScientistOne, MDA, external benchmark meters and standard execution evaluators make that territory crowded. citeturn6view0turn19view0turn20academia28turn12academia28 **Do not lead with “results inform the next experiment” alone**: Robin demonstrates it empirically, LLM-AutoSciLab formalizes it as structured hypothesis/evidence state, MDA algorithmizes it, and evolutionary frameworks have long made result→mutation edges fixed code. citeturn24view1turn14view0turn16view3turn21academia0

The more defensible center is the **closure of multiple formerly separable edges**: prediction is committed before outcome; measurement authority is external; results cannot be narrated into different numbers; belief transitions have a typed admissibility grammar; the selected transition was fixed before the observation; anomalies must be dispositioned before reinterpretation; rejected hypotheses remain addressable state; and the entire epistemic history is replayable at declaration time. That full conjunction is substantially narrower than “rigorous agent” or “closed-loop scientist,” and within the primary systems reviewed here I found no whole-system match. fileciteturn0file1 citeturn6view0turn19view0turn14view0turn12academia28

**≤120字中文定位句：**  
**现有系统已分别外置验证、状态与适应控制；我们的差异不在“有闭环”，而在把可证伪承诺、结果归因与信念迁移做成模型无权改写、可重放的统一外部协议。**