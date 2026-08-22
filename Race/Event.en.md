Yes — and this line of argument is far more sophisticated than “we built yet another multi-agent research system.” I would, however, tighten several formulations that reviewers are likely to seize on.

The case you can actually make is not “Prime Agent has already solved automated science, so we kill the competition,” but:

> **The execution capability of general long-horizon agents is becoming infrastructure. When a competition also locks the base model to Qwen, the remaining difference should not be re-implementing an agent runtime. It should be: how scientific context is organized, how the next experiment is chosen, what evidence is sufficient to change a judgment, and how those scientific judgments are crystallized into reusable Skills.**

That logic holds, and it lands almost exactly on the scoring rubric.

Prime Agent can serve as very strong *technical-background evidence* for this judgment. It already has a persistent goal, heartbeats, automatic compaction, retained subagents, RPC, and an autonomous gate. Continual Harness can also treat prompts, memory, skill descriptions, and subagent specs as durable supplemental state, and update them in an evidence-backed way via `/refine`.

So you can say, without overclaiming:

> After surveying Prime Agent and other next-generation long-horizon research agents, we conclude that persistent execution, tool use, subagent collaboration, state persistence, and bounded continuation are becoming reusable runtime capabilities. We therefore did not put our R&D effort into building yet another agent framework. We asked a further question: **once an agent can already run autonomously for a long time, what should it autonomously be *thinking about*?**

That turn is excellent.

Do **not** write:

> “Prime Agent has already solved automated science.”

It has not. Your own review already found the opposite risk: Prime’s strong execution can *amplify* a problem. If the goal is “push the score,” an agent may retune the test, poke the scorer, change the eval, or rebuild the ground truth. That is why structural mechanisms — readonly evaluation, a hidden holdout, independent recomputation — are needed to prevent reward hacking.

That can become the cleanest turn in your story:

> **The more capable an autonomous agent is, the less it can be allowed to optimize outcome metrics alone.**

Then ask:

> If “raising the score” is not equivalent to “doing good science,” what is actually missing?

Your answer is:

> **Experimental design.**

Or, more precisely:

> **The ability to choose the next experiment that most strongly discriminates among competing explanations.**

That is what you have been calling “taste modeling.”

I would even use two names in the report at once:

**Product narrative: Scientific Taste Modeling**
**Technical definition: scientific decision policy / Epistemic Policy**

“Taste” is memorable. If you write only “taste,” scientific reviewers may find it vaporous. You need to operationalize it immediately:

> By “scientific taste” we do not mean linguistic style or subjective aesthetics. We mean the ability, under a finite experimental budget, to identify important knowledge gaps, retain competing explanations, design high-discrimination probes, preregister falsifiable predictions, and — given the observations — decide whether to continue, narrow, reject, or redirect a research line.

That lands the claim.

And it is exactly what the scoring template asks for. Track 1B’s P3 requires distinguishing facts, working hypotheses, and model inferences; stating expected observations and falsifying outcomes; retaining alternative explanations; and continuing, adjusting, or stopping in light of actual results. P14 further requires leaving the expected observation and the stop/adjust condition **before the experiment runs**, and explicitly forbids reverse-writing them after seeing the results.

So GRILL is not “we added a Reviewer Agent.”

It should be written as:

**GRILL is Scientific Taste made executable.**

Deep Research answers:

`What is already known?`

GRILL answers:

`What could we be wrong about?`

Probe design answers:

`What experiment would discriminate between explanations?`

Preregistration answers:

`What did we expect before seeing the answer?`

Outcome rules answer:

`What exactly changes if result A/B/C occurs?`

The next round answers:

`Given what was actually learned, what is now worth measuring?`

At that point the loop is no longer the ordinary closed cycle:

`experiment → result → reflection → regenerate`

It is:

`belief state → discriminating probe → observation → constrained belief update → next probe`

That is where you can actually pull away from the public contest workflows.

---

There is another useful point: **Prime’s Continual Harness can help you show why Skills are more worth building than a Runtime.**

Prime itself draws a clean distinction:

> continual-harness skill ≠ installed skill

What `/refine` produces is session-local supplemental state. It does not, by default, become a reviewed, portable, cross-harness packaged skill.

That sentence is very valuable for you.

You can push it one step further:

> A runtime can keep adapting inside a single long task. A scientifically valuable method, however, should not live only in one session’s memory. It should be explicitly extracted, reviewed, versioned, and packaged as a portable Skill.

Only then do you attach the survey of Arbor, Claude, Codex, and other Skills ecosystems:

> We therefore care more about “reliable scientific plugins” than “yet another agent runtime”: a good Skill can be reused across research tasks, version-controlled and ablated, and invoked by different agent runtimes.

That argument is sound.

The official briefing even said the organizers welcome innovative domain plugins that are crystallized and kept — a potential source of extra credit.

So “plugins / Skills are first-class product assets” is not a contest narrative you invented.

---

Claude Agent SDK can be written the same way.

Do not inflate it into a core innovation. Actively demote it to:

> **Reference Runtime / current production runtime**

You can state that the architecture is replaceable:

```text
Product / Scientific Control Plane
        │
        ├── Scientific Context
        ├── GRILL / Deep Research
        ├── Probe Contracts
        ├── Evidence / Gates
        └── Scientific Skills
                │
        Runtime Adapter
          ├─ Claude Agent SDK   ← current
          ├─ Prime Agent       ← studied / optional
          └─ other runtime     ← future
                │
              Qwen
```

And the reason for currently choosing Claude Agent SDK should not be “as stable as Clawsgo” — that is not publicly verifiable, and it invites follow-up questions.

Say:

> The current product implementation prefers Claude Agent SDK because it already has mature tool calling, MCP, subagents, sessions, hooks, and a persistent client. A thin host layer is enough for long-horizon agent interaction, so engineering effort can be concentrated on scientific method and product experience.

Your own source review fully supports this. The SDK already exposes MCP, subagents, hooks, sessions, and related surfaces, and wrapping a continuation harness around the persistent client needs only a thin control layer.

Also write this clearly:

> The runtime is replaceable; the Scientific Control Plane is not bound to a runtime.

That will substantially strengthen the “reusability” scoring item.

---

You said “the model is locked to Qwen, so we can only work on the harness.” I would push that one step further.

Not:

> The model is locked, so the contest becomes a harness competition.

But:

> **Once model differences are partly controlled, research value is easier to attribute to context, tool use, scientific policy, and the feedback mechanism.**

That is more stable as academic language.

The technical-depth rubric does look at the model, the data, and end-to-end completeness, as well as result validation, feedback iteration, and stability. Application potential also explicitly looks at reuse of code, structure, and invocation.

So you can design a very clean ablation:

| Condition     | Runtime | Model | Scientific Skills    | Purpose                              |
| ------------- | ------- | ----- | -------------------- | ------------------------------------ |
| Baseline      | same    | Qwen  | none                 | Qwen doing science directly          |
| Generic Agent | same    | Qwen  | generic agent tools  | isolate the agent-runtime gain       |
| Research OS   | same    | Qwen  | DR + GRILL + Probe   | isolate the scientific-policy gain   |

Do not use “how much higher the final benchmark is” as the only metric.

Compare:

the number of falsifiable predictions; coverage of alternative explanations; the fraction of experiments with an explicit stop condition written beforehand; the fraction of cases in which a negative result actually changed the next-round plan; unsupported claims; the fraction of repeated or non-discriminating experiments.

Then you have empirical support for:

> **The value comes from epistemic policy, not from quietly swapping in a better model or a stronger runtime.**

That is much stronger than “we killed the competition.”

---

You ended on scientific figure-making. I think it belongs in the same product philosophy, and your existing planning documents already have a very clean principle:

> The image model owns the design language; real numbers are always rendered from the evidence package by code. If a figure contains numbers, the image model is not allowed to generate the final figure.

That is the same philosophy as “look at a reference/template first → let the image model do the design → recover it with a grid/coordinates → draw precisely in Matplotlib”:

> **Generative models propose taste; deterministic systems preserve truth.**

That sentence can run through the whole product.

Science:

> LLM proposes interpretation; measurement decides truth.

Figures:

> Image model proposes visual language; plotting code decides geometry and numbers.

Literature:

> LLM proposes synthesis; primary sources decide evidence.

Experiments:

> Agent proposes hypotheses; preregistered probes decide what survives.

The product then stops looking like a pile of Skills.

It has one design principle:

> **Keep the model’s strongest abilities — generation, association, taste, exploration — and hand facts, numbers, state transitions, and scientific conclusions to auditable evidence and deterministic mechanisms.**

That sentence is a good design philosophy for the whole system.

---

If I compress what you just said into the core logic of the contest report, I would write it like this:

> As general agent runtimes such as Prime Agent and the Claude Agent SDK have gradually acquired long-horizon execution, tool use, subagents, state persistence, and continual adaptation, we no longer treat re-implementing an agent runtime as the highest-leverage way to raise an AI Scientist’s research quality. Stronger autonomous execution even introduces a new risk: when an agent is rewarded directly on a benchmark or a single metric, it may preferentially search for “how to raise the score,” rather than “which experiment actually reduces scientific uncertainty.” This work therefore shifts the research focus from agent execution to Scientific Taste Modeling: Deep Research establishes the evidence boundary; GRILL actively seeks counterexamples and alternative explanations; preregistered probes specify observational predictions, control conditions, and falsification rules; and real experimental outcomes constrain the next research plan. The general runtime is replaceable. The reviewed, versioned scientific Skills are the system’s truly reusable knowledge assets.

Then a second paragraph:

> The product design follows the same principle: generative models propose candidate plans and a design language; deterministic programs own facts, numbers, state, and reproducible output. In scientific figure-making, for example, the image model is used only to explore visual templates; final geometry and data are reconstructed from structured coordinates and Matplotlib. In the research loop, the model may propose interpretations, but only real measurements may change the hypothesis state. We are not trying to make an agent more aggressively optimize a score. We are trying to make an AI Scientist more reliably choose “the next thing worth verifying.”

That is already a reasonably complete “why we designed it this way” story.

I would only block three things from being written as established fact: **“Prime has only a Python kernel” is inaccurate** — it does have a Node/TS SDK; RLM simply defaults to persistent IPython as the model-side execution surface. **“As stable as Clawsgo” currently has no publicly verifiable data; I would not make that comparison.** And you mentioned “Opus 5 + GPT-5.6 Sol already ran through and finished a paper”; in the submission materials I have seen, there is no corresponding experiment log, finished paper, or reproduction record. If you do have those, they must become **real case evidence** — that would be extremely valuable — but at submission they have to be proven by artifacts, not mentioned in a sentence.

Overall, I think the direction holds. It is also easier for scientific reviewers to understand what you actually contributed than “we built a more complicated harness.”

I looked. The NeuronBench you mentioned is the biology benchmark in Kevin Murphy’s 2026-08-13 v3 paper *Model Discovery Agent: LLM-assisted Bayesian experiment design for data-efficient discovery of mechanistic world models*. It is genuinely close to your current idea. After reading it, though, I think you can abstract one layer further.

The most essential formulation is not “scientific taste,” and not even “experimental design” alone.

I would call it:

> **Open-world Epistemic Control: in an open hypothesis space, controlling how an AI obtains evidence, changes its beliefs, and decides the next experiment worth doing.**

That is currently the most accurate phrasing I have.

### What NeuronBench / MDA is actually saying

MDA’s core is very clean. It does not rely on complex agent orchestration. The LLM is mainly responsible for one thing: **proposing candidate mechanisms**. Subsequent judgment is handed to Bayesian machinery:

\[
p(m\mid D)
\]

It maintains current beliefs over different mechanisms, then chooses an experiment:

\[
\xi^*=\arg\max_\xi I(M;Y_\xi\mid D)
\]

That is, it chooses the experiment that most strongly discriminates among the currently competing mechanisms. After the result arrives, it updates the posterior. If none of the existing hypotheses can explain the new result, it triggers \((\mathcal M)\)-open expansion and lets the LLM propose new mechanisms. ([arXiv][1])

So the real loop is not:

`idea → experiment → score → improve`

It is:

`candidate mechanisms → discriminating intervention → observation → belief update → model-space expansion/contraction`

That is very close to the current GRILL idea.

The paper also gives you a strong argument: **low error does not mean the correct mechanism was discovered.**

The ChemBench part is typical. LLM-AutoSciLab can find expressions with RMSLE of only 0.001, but the authors point out that those expressions are mechanistically wrong or even scientifically meaningless; MDA may look less pretty numerically, yet is more likely to recover the correct mechanistic structure. ([arXiv][1])

That is almost exactly what you have been saying:

> benchmark optimization ≠ scientific understanding.

ForceBench originally even had an LLM judge scoring “explanations.” The MDA authors eventually judged that metric unreliable: more data sometimes *lowered* the explanation score, so they trusted held-out intervention prediction more than linguistic explanation. ([arXiv][1])

That is the same philosophy as your “reasoning can be demoted; only measurement can kill.”

Your own design already encodes this as a structural constraint: a candidate cannot disappear on ranking alone; multiple live hypotheses must be retained; an experimental outcome must be able to eliminate something, otherwise the experiment is decorative; severity is required before the experiment.

That is already very close to a non-probabilistic version of Bayesian model discrimination.

---

There is an important detail here, and I think you must not misread NeuronBench.

**This paper does not prove that “LLMs cannot design experiments.”**

NeuronBench’s own results show the opposite: once the Bayes forecaster is held fixed, VoI experiment selection and LLM experiment selection perform quite closely, and both are substantially better than random. ([arXiv][1])

On ForceBench, after switching to Fable 5, a pure LLM agent already catches MDA’s data efficiency on 5 of 6 worlds; final numeric pass is 81% vs MDA’s 94%, and pure Fable even reaches 93% exact-form recovery, above MDA’s 78%. The authors themselves are honest: stronger models shrink the gap substantially. ([arXiv][1])

So you cannot write the thesis as:

> “LLMs cannot do experimental design, so we teach them experimental design.”

That is easy to attack with a counterexample.

More accurate:

> **Strong models already have quite good experimental intuition, but that capability has not been formed into a stable, auditable, cross-task reusable epistemic policy.**

That thesis is stronger.

It also better matches what your last two months of ablations actually produced.

---

### What you call “reverse abduction” can be explained with a more classical scientific-method frame

I checked the philosophical placement. Peirce’s classic split of scientific method is exactly:

**Abduction → Deduction → Induction**

Abduction: after seeing an anomaly, propose a hypothesis that might explain it.

Deduction: if this hypothesis is true, what else should be observed?

Induction: actually run the experiment, see whether the prediction holds, then revise trust in the hypothesis.

Peirce also emphasized an “economy of research”: scientific time and experimental resources are limited, so one should preferentially choose **the experiment that most reduces uncertainty in belief**. That sits on the same line of thought as today’s information-gain formulation of Bayesian experimental design. ([Stanford Encyclopedia of Philosophy][2])

So I would slightly revise the name “Fable reverse abduction.”

What Fable is doing may not be reverse abduction alone, but:

> **Abductive hypothesis construction + deductive probe synthesis.**

That is, first ask:

> What explanation could make this phenomenon hold?

Then ask the reverse:

> If this explanation is true, what as-yet-unobserved consequences must it also produce?

Then further:

> Which experiment would make H1 and H2 give as different predictions as possible?

Only then run it.

That is already fully experimental design.

The most valuable step in GRILL is not “think of more hypotheses.”

It is:

> **Turn competing explanations in natural language into an experiment that forces them to produce different observable consequences.**

I think that step is the core.

---

### I also think you are actually solving one layer more than NeuronBench

NeuronBench looks open. In fact it is still a controlled benchmark.

Its experiment space is essentially given: 9 current protocols × blockers, 36 discrete experiments in total. ([arXiv][1])

ForceBench likewise starts from an author-designed 13-item experiment menu, and each item is already a fairly meaningful probe. ([arXiv][1])

That is, MDA’s problem is essentially:

> Give me \((\Xi)\); I pick the most informative \((\xi)\) from it.

Real CV/ML research is often harder.

Because even:

> **What is \((\Xi)\) in the first place?**

has to be invented by the researcher.

Suppose you observe some representation phenomenon.

A genuinely strong researcher first has to decide:

What observable would even prove that this phenomenon exists?

Cosine similarity?

Effective rank?

CKA?

Eigenspectrum?

Probe accuracy?

Activation patching?

Causal intervention?

And then ask:

Is this measurement the root mechanism, or a shadow?

Could this preprocessing itself manufacture the phenomenon?

What about a random-init control?

Matched-rank random?

Does it survive a model swap?

A data swap?

That is no longer:

**experiment selection**

It is:

**measurement + experiment construction.**

I think that is the layer on which you are genuinely broader than NeuronBench.

It can be called:

> **Open-world Experimental Design**

Or, more accurately:

> **Epistemic Probe Synthesis**

That is: the AI does not merely pick an experiment from a menu; it **constructs a measurement problem that can discriminate competing explanations**.

That is what “the code itself is epistemology” means in your loop: at the probe stage, preprocessing, measurement, and controls are not engineering details; they are part of the scientific judgment. Your earlier design documents already state this explicitly.

---

So I would now draw the relationship to MDA as:

|              | MDA / NeuronBench                                | What you should be aiming for                                      |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| Hypothesis   | LLM candidate mechanisms                         | DR + Fable/GRILL produce competing explanations                    |
| Belief state | Bayesian posterior                               | structured live hypothesis/claim state                             |
| Anomaly      | predictive residual                              | contradiction / anomaly / reviewer attack                          |
| New hypothesis | M-open expansion                               | GRILL / reverse-abduction                                          |
| Probe        | VoI selection from a given space                 | **actively construct measurement + control + intervention**        |
| Prediction   | posterior prediction                             | blind preregistered prediction                                     |
| Evidence update | Bayes update                                  | retain / weaken / scope / kill                                     |
| Endpoint     | intervention forecast                            | claim + mechanism + failure boundary                               |
| Objective    | data efficiency                                  | **epistemic efficiency**                                           |

That last term matters.

Do not talk only about data efficiency.

Talk about:

> **Epistemic Efficiency: how many wrong explanations can be eliminated per unit experimental cost.**

That is very close to the mathematical essence of what you call “scientific taste.”

---

### Scientific Taste can be redefined as a policy

Then it is no longer mysticism.

Suppose there is an epistemic state:

\[
S_t=\{H_t,E_t,C_t,U_t\}
\]

where:

* \(H_t\): currently competing hypotheses;
* \(E_t\): existing evidence;
* \(C_t\): constraints, controls, and confounds;
* \(U_t\): still-unresolved uncertainty.

What a scientist does is choose the next action:

\[
a_{t+1}=\pi(S_t)
\]

A genuinely good scientific policy should not maximize:

\[
\text{benchmark score}
\]

It should roughly maximize:

\[
\frac{
\mathbb E[\text{reduction in decision-relevant uncertainty}]
}{
\text{cost}
}
\]

while penalizing:

\[
\text{confounding}+\text{measurement unreliability}+\text{post-hoc flexibility}
\]

That is what you mean by “taste.”

**Taste is not knowing more papers.**

Taste is:

> Given ten experiments you could run, you know which one, once done, would actually change how you see the problem.

I think that definition is quite strong.

And your very clean hard rule:

> “If no possible outcome can kill/scope/change a claim, the experiment is decorative.”

is in fact a **qualitative expected information gain** that does not require an explicit probability calculation.

That is a point I think can be theorized further.

---

### Do ordinary Track A researchers also work this way?

Good CV/ML research often does, it just is not written down explicitly.

“Literature review → idea → benchmark” is only the surface workflow.

Internally, strong research is often:

`anomaly / tension`
→ `plausible competing explanations`
→ `cheap diagnostic`
→ `control`
→ `causal intervention`
→ `mechanism`
→ `method`
→ `broad validation`
→ `failure boundary`

That is:

**Explain why first, then decide how to change it.**

Ordinary AutoResearch most easily automates the second half:

`method → implementation → sweep → benchmark → refine`

because there is a very clear reward.

So the agent increasingly behaves like an optimization engineer.

What you actually want to automate is the first half:

`phenomenon → explanation → discriminating experiment → mechanism`

That is why I think “deeper than AutoResearch” can hold at the conceptual level — but do not write it as a superiority claim in the contest report.

Write:

> Existing AutoResearch more easily automates the reward-rich method-optimization stage; this work focuses on the reward-sparse scientific-judgment stage.

That is very stable.

And the recent AutoResearchEval paper happens to give strong supporting evidence: they ran 8 harness–model combinations and 800 research trajectories, then aggregated 45 failure types into one core problem — current agents lack a metacognitive loop, i.e. they cannot continuously check whether their own artifacts are actually supported by evidence, and cannot reliably correct course when the evidence does not hold. These failures cut across harnesses. ([arXiv][3])

That is very close to GRILL.

They emphasize, however:

**self-check / metacognition.**

If you only do that, it is not new enough.

Your further point should be:

**Not only check “am I wrong,” but actively design the most discriminating next observation so that you become harder to be wrong.**

That is a deeper layer.

---

Finally, your worry about being CV/ML-only.

I do not actually think that is a scientific-logical weakness.

Open-world probe synthesis is especially well suited to CV/ML: experiments are cheap, code is executable, controls can be constructed automatically, results can be computed deterministically, and a night can hold a dozen falsifications.

Swap in astronomy, wet lab, or biomedicine, and the agent has no real experimental control; many loops can only stop at a proposal.

So **CV/ML is likely the most suitable testbed for validating this epistemic policy.**

There is, however, a scoring risk: official technical depth still has 15 points directly on “effectiveness of processing scientific multimodal data with a multimodal large model.”

I would not expand the system into a fake all-domain AI Scientist for those 15 points.

You can add a small, practical piece:

Have Qwen-VL read scientific figures / training curves / attention maps / qualitative failure cases, then drop the conclusions into structured evidence; or use the scientific figure pipeline you already have — “image model proposes the visual plan, programs own the real numbers.”

That can show multimodal capability without changing the core scope:

> **This stage focuses on validating computational CV/ML research.**

That is a credible boundary, not a shortcoming.

If I had to give the system one definition closest to its “essence,” I would revise Scientific Taste Modeling one layer down:

> **We are not teaching an AI a research workflow. We are giving it an open-world epistemic control policy: continually maintain competing explanations, and actively construct the next experiment that most strongly changes how credible those explanations are.**

“Scientific taste” is the product name.

**Epistemic Control / Probe Synthesis is the technical object.**

I think this is already very close to what your last two months of ablations actually produced, and it is easier to connect to MDA, Bayesian experimental design, and ordinary serious scientific method than simply saying “reverse abduction + GRILL + Deep Research.”

[1]: https://arxiv.org/html/2608.09696 "Model Discovery Agent: LLM-assisted Bayesian experiment design for data-efficient discovery of mechanistic world models"
[2]: https://plato.stanford.edu/entries/peirce/?utm_source=chatgpt.com "Charles Sanders Peirce (Stanford Encyclopedia of Philosophy)"
[3]: https://arxiv.org/abs/2608.14905 "How Do Agents Fail on AutoResearch: End-to-End Diagnostic Evaluation on 100 Real-World Frontier Research Tasks"
