It does hang together — and I would now **slightly rename the main line**. After reading the GRILL loop you uploaded, Prime Agent’s latest implementation, DeepSeek Harness, and ResearchStudio, I no longer think the object worth studying is “yet another AutoResearch,” or even “Continual Agent” by itself.

The more accurate object of study is:

> **Scientific Context / Procedural Knowledge Control: on top of a mature agent harness, how to activate the right scientific knowledge, cognitive rules, and verification constraints at each research decision point — and how to let those rules keep improving with research experience.**

This is essentially the same thing as what you said: **“think one extra step before every step — and that extra step is not free thought; it is inserting a context aimed at the current decision.”**

And external progress is now helping you stand this thesis up.

---

## 1. An important new fact: do not treat “Continual Harness” itself as the innovation

On **2026-08-19**, a paper just appeared: *Harness Continual Learning: Continual Adaptation Beyond Model Parameters*.

It already states clearly:

> Continual learning need not happen in model parameters. It can happen in a harness composed of prompts, memory, tools, skills, and routing rules.

It even defines **harness-level forgetting**, and designs a Continual Optimizer + Continual Evaluator to decide whether a harness update should be committed. ([arXiv][1])

Add Prime’s Continual Harness:

\[
H=(\rho,G,K,M)
\]

that is:

* prompt
* subagents
* skills
* memory

continuously CRUD / refined from trajectories. ([arXiv][2])

DeepSeek Harness goes further and writes the design philosophy as:

> **Everything is a plugin.**

Models, tools, skills, sessions, storage, loops, scheduling, and UI are all pluginized, and every context injection enters a traceable session log. ([DeepSeek][3])

So the moment is actually very clear:

> **The harness is becoming infrastructure.**

Therefore you cannot write the paper as:

> “We propose a research agent that can keep modifying Skills and Memory.”

That novelty will not last long.

---

## 2. That, however, is exactly what forces your real innovation into the open

Prime answers:

> **How does context become programmable state?**

DeepSeek Harness answers:

> **How are capabilities pluginized and dynamically composed?**

Continual Harness / HCL answers:

> **How does a harness keep modifying itself from trajectories?**

ResearchStudio answers:

> **Can a research workflow be split into reusable skills?**

Its current IdeaSpark is, in essence, Paper Search → bottleneck → ideation pattern → prior-art check → audit/revision, hung as Skills on Claude Code / Codex rather than as a new agent runtime. ([GitHub][4])

You can ask a question none of them has really answered:

> **When, exactly, should a research agent invoke which piece of “scientific cognition”?**

That question is interesting.

---

## 3. Your current GRILL is already not an ordinary prompt

I read the loop you uploaded carefully.

It already fits this research direction naturally.

You currently have:

```text
ORIENT
↓
CANDIDATE
↓
MEASURE
↓
MECHANISM
↓
METHOD
↓
VERIFY
```

But the valuable part is not these six workflow nodes.

It is the **procedural scientific knowledge** behind each node.

For example, in MEASURE:

> Until controls have been run, a phenomenon is treated as an artifact candidate.

In MECHANISM:

> A probe is a correlation; a mechanistic conclusion requires an intervention.

Across the whole loop:

> Reasoning can demote a hypothesis; only measurement can kill.

And:

> Predictions and decision rules must be written before experimental results appear.

This is not:

> “What should the agent do next?”

It is:

> **“In this scientific decision state, what cognitive frame should a good researcher think with?”**

Those two things are very different.

---

## 4. This lines up exactly with DeepSeek’s Skill architecture

DeepSeek Harness’s recent Skill implementation has a design I think is very important for you.

It does not stuff every Skill into the system prompt.

It does **progressive disclosure**:

At the start the agent only sees:

```text
Skill name
Skill description
```

When the model judges that the current task needs a Skill, it then loads the full Skill body.

The official write-up even says explicitly that permanently stuffing every skill body into the system prompt would make every step pay the context cost of irrelevant instructions — so they rejected that implementation.

That already lines up closely with your current GRILL:

```text
STATE
  ↓
current Phase
  ↓
LOAD only the corresponding phase Skill
  ↓
execute
```

rather than:

```text
stuff a book titled *How to Do Science* into the system prompt
```

So I think you have, almost without noticing, produced a research-worthy question:

> **Scientific knowledge should be progressively activated at decision boundaries rather than globally prompted.**

In other words:

> **Scientific knowledge should not live in the context all the time. It should be activated at the appropriate scientific decision boundary.**

That, to me, already has the flavor of a paper.

---

## 5. RLM is especially well suited here

Prime Agent’s RLM is not as simple as “a Python agent.”

Its core change is:

> **Context stops being a token stream and becomes external state the model can operate on.**

The original RLM puts a long prompt into an external environment and lets the model programmatically inspect, decompose, and recursively call, rather than requiring all information to reside in the context window at all times. ([arXiv][5])

Prime then turns it into persistent IPython:

```text
Model
  ↓
Persistent Python state
  ├── history
  ├── files
  ├── skills
  ├── memory
  ├── goals
  └── RLM subagents
```

The TypeScript host owns lifecycle, persistence, children, and policy; Python is the model-facing programming surface.

Placed in science, a very natural reading is:

> **Research itself is a context-management problem over an evolving epistemic state.**

Science is not:

\[
LLM(prompt)\rightarrow answer
\]

It is:

\[
S_t =
{
\text{claims},
\text{hypotheses},
\text{evidence},
\text{predictions},
\text{failures},
\text{open questions}
}
\]

Then at each step:

\[
k_t=\sigma(S_t)
\]

selects the Scientific Skill \(k_t\) that should currently be activated.

After that:

\[
a_t=\pi_\theta(S_t \oplus k_t)
\]

yields the next research action.

I think this formalization is very clean.

---

## 6. So this is what you can actually study

I would provisionally call it:

## **Epistemic Skill Harness**

Or, more academically:

## **Contextualized Scientific Procedural Knowledge for Autonomous Research Agents**

Core question:

> **Can a frozen foundation model become a better researcher by selectively activating and continually refining procedural scientific knowledge?**

Not training the model.

Not chasing a benchmark score.

But learning:

> **When should one think of what.**

That is a particularly important piece of what you just called “how humans learn.”

---

## 7. “Humans learning to do science” may indeed not be remembering more facts

I think this intuition is worth following.

The biggest difference between a first-year and a fifth-year PhD student is often not:

> the fifth-year “thinks more.”

It is that, in a given situation, the **right question surfaces automatically**.

Seeing a gain:

Novice:

> Great, +3%.

Mature researcher:

> Was compute matched?

Seeing a correlation:

> Where is the intervention?

Seeing a pretty representation:

> Where is the random-init control?

Seeing three models:

> Architecture invariant, or a scale effect?

Seeing a negative result:

> Was the hypothesis wrong, or did the measurement lack observable power?

So a large part of what we call “research experience” can be expressed as:

\[
\text{state pattern}
\rightarrow
\text{epistemic question / procedure}
\]

For example:

```text
Observed improvement
+
multiple changed variables
        ↓
ACTIVATE:
Matched-Control Skill
```

or:

```text
Mechanistic claim
+
only correlational evidence
        ↓
ACTIVATE:
Intervention Skill
```

That is **procedural knowledge retrieval**.

Not merely memory retrieval.

I think this distinction matters.

---

## 8. So GRILL should not remain a fixed loop forever

Your first version can keep:

```text
Phase → Skill
```

But what is more research-worthy in the end is:

```text
Epistemic State
      ↓
Decision Boundary Detector
      ↓
Scientific Skill Router
      ↓
Context Injection
      ↓
RLM action
```

For example, the agent is currently in the METHOD phase.

That does not mean it only loads `method.md`.

If it encounters:

> three experiments all went up, but compute is unmatched.

the system additionally activates:

**Confounder Control**

If it is about to explain:

> representation geometry caused the performance.

activate:

**Mechanism vs Shadow**

If results have just come in:

**Prediction Calibration**

If it is about to kill a hypothesis:

**Evidence Severity / Falsification**

GRILL then upgrades from:

> a workflow

to:

> **a scientific cognitive policy.**

That is the version I think is actually worth doing.

---

## 9. Continual finally sits here naturally as well

Then Prime’s `/refine` actually earns its place.

Suppose the agent makes the same mistake three times in a row:

```text
experience 1:
ignored matched-rank control
→ wrong mechanism

experience 2:
happens again

experience 3:
a reviewer points it out again
```

Then it is not:

> write one line of memory: “pay attention to matched-rank from now on.”

It is:

```text
trajectory
    ↓
failure pattern
    ↓
skill refinement
    ↓
add trigger:
"When a claim attributes effects to k selected directions..."
    ↓
thereafter automatically activate Matched-Rank Control Skill
```

That is genuine:

> **Continual Scientific Learning**

It does not learn task answers.

It learns:

> **when a scientific rule should be invoked.**

I think this is more landable than the “large-scale continual benchmark” we discussed earlier.

---

## 10. Verifier: I now recommend *not* making it the main battlefield

You said verifiers are hard. That judgment is entirely correct.

Someone has already defined this as the **verification gap** of the whole AI Scientist field: a 2026 systematic survey of 24 runnable systems found that code release is already common, but artifacts that would let an external reviewer verify scientific claims are clearly insufficient; by their strict criteria, almost none of the closed-loop systems has a mature, externally validated in-loop oracle. ([arXiv][6])

Google’s Science One, out at the end of July, also treats “verifiable autonomous research” as a problem in its own right. ([Google Research][7])

So:

> **Do not try to solve Scientific Cognition + Continual Learning + a General Scientific Verifier in the first paper.**

That is too large.

---

## 11. You already have a smarter kind of verifier

It is already inside GRILL.

Do not call it:

> a General Scientific Verifier.

Call it:

> **Evidence Contract / Epistemic Gate**

Before the experiment, the agent writes:

```text
CLAIM
H1

PROBE
P17

EXPECTED OUTCOMES

Outcome A
→ weaken H1

Outcome B
→ support H1

Outcome C
→ inconclusive

REQUIRED CONTROL
matched-rank random

SEVERITY
high
```

Then, after the experiment:

```text
artifact.json

experiment_id
metric
seed_count
value
control_value
```

The verifier does not have to judge:

> “Is this good science?”

It only judges very local things:

1. whether the artifact actually exists;
2. whether the measurement is the one that was preregistered;
3. whether the control was run;
4. which pre-defined bucket the result falls into;
5. whether the agent’s claim update matches its own decision rule.

That is much simpler.

Your GRILL already has:

> **prose cannot kill a claim; only a result artifact can.**

That is already a strong structural verifier.

---

## 12. The first paper can even avoid a “universal verifier” entirely

I would set the baselines as:

```text
A. Prime Native
   RLM + normal prompt

B. Prime + Monolithic Research Prompt
   a full set of research norms stuffed in permanently

C. Prime + Static GRILL Skills
   decision-boundary progressive disclosure

D. Prime + Adaptive GRILL
   skills + memory + /refine

E. Prime + Adaptive GRILL + Evidence Contracts
```

The model is identical.

The runtime is identical.

The tools are identical.

The only thing that changes is:

> **the scientific context policy.**

Then study four questions:

**RQ1**
Is progressive scientific skill activation better than one giant “how to do science” prompt?

**RQ2**
Is decision-boundary injection better than the agent reflecting whenever it happens to?

**RQ3**
Can the agent modify skill triggers / content from failure trajectories, and thereby reduce the same class of errors later?

**RQ4**
Does this improvement produce harness forgetting / negative transfer?

That is already a complete paper.

---

## 13. And KBS, I think, is a very natural fit

Even more so than AutoResearch alone.

In KBS language, you are actually studying:

> **dynamic knowledge representation + knowledge activation + adaptive decision support + autonomous agent reasoning**

not an agent UI.

KBS has recently been continuously taking:

* self-enhancing multi-agent systems; ([ScienceDirect][8])
* dual-loop self-learning LLM systems; ([ScienceDirect][9])
* agent memory / knowledge management; ([ScienceDirect][10])
* LLM agents for scientific discovery; ([ScienceDirect][11])
* and AGEE, which directly evaluates **information-gain rate / exploration efficiency / process trajectory**, not just final accuracy, as an agent metric. ([ScienceDirect][12])

So the KBS framing is better as:

> not “we built an AutoResearch SaaS.”

but:

> **We study how procedural scientific knowledge can be represented, selectively activated, and continually refined within an RLM-based autonomous research agent.**

That is very KBS.

---

## 14. ResearchStudio, AutoResearch, Prime, and DeepSeek can sit on the same figure

I would read the whole field as:

```text
                    AI Research Agent
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 Infrastructure       Research Skills    Scientific Cognition
        │                  │                  │
        │                  │                  │
 Prime Agent        ResearchStudio          GRILL
 DeepSeek Harness   IdeaSpark               ↓
 Claude/Codex       Search                  Epistemic Skills
        │            Scoop Check             ↓
        │                                   Probe / Control
        ↓                                   Falsification
  HOW TO RUN                              Belief Update
```

Karpathy-style AutoResearch / speedrun leans toward:

```text
proposal
→ run
→ score
→ retain if better
→ repeat
```

It is good at:

> **optimization-rich research**

ResearchStudio leans toward:

> **idea / literature knowledge organization**

Prime / DeepSeek lean toward:

> **a general execution substrate**

What you can actually occupy is the missing middle layer:

> **What should an autonomous researcher think about before taking the next action?**

That question is clean.

---

## 15. I even think “scientific taste” need not be the paper’s core term anymore

The product can still be called Scientific Taste.

The paper’s technical definition can become:

### **Epistemic Skill Activation**

or:

### **Scientific Procedural Knowledge**

Then what you have been calling “scientific taste” is:

\[
\text{Taste}
\approx
\text{knowing which epistemic skill to activate when}
\]

A particularly intuitive example:

> A good researcher does not always “think five extra minutes.”

Rather, when a certain pattern appears:

> **they know which question must be asked now.**

That sentence is basically the essence of your current GRILL.

---

## 16. The first-paper scope I would recommend now

A working title I would write as:

> **Beyond Score-Driven AutoResearch: Epistemic Skill Activation for RLM-Based Autonomous Scientific Agents**

or, more KBS:

> **Adaptive Scientific Procedural Knowledge for Autonomous Research Agents: An RLM-Based Epistemic Skill Harness**

Tighten the core contributions to three:

1. **Scientific Skill Representation**
   Represent research experience explicitly as callable procedural skills, not as one global prompt.

2. **Decision-Conditioned Context Activation**
   Dynamically load the corresponding Skill according to the current epistemic state / decision boundary.

3. **Evidence-Grounded Continual Refinement**
   Only real experiment trajectories / evidence may change skills, memory, and triggers.

Do not make the verifier large.

Only do:

> **local evidence contracts.**

I think this scope is realistic.

---

And there is one further, crucial benefit:

**Your current GRILL does not need to be torn down and rebuilt.**

You already have a Router, Phase Skills, STATE, a Hypothesis Register, a Prediction Ledger, a control gate, and claim-state transitions.

What you actually need to do is push the current:

```text
phase → fixed instruction file
```

forward into:

```text
epistemic state
→ relevant scientific skills
→ dynamically constructed context
```

and then attach Prime’s:

```text
rlm.harness
+
persistent state
+
/refine
```

**That turns a useful research workflow into a scientific question you can run experiments on.**

I am now even more sure of this line than I was a moment ago: **do not grab the verifier sinkhole, and do not grab the general harness. Take “when scientific knowledge enters the context, and how it keeps changing from experience.”** That connects Prime / RLM, DeepSeek Plugin / Skills, and ResearchStudio, and sits very naturally on KBS’s knowledge-based adaptive agent direction.

[1]: https://arxiv.org/abs/2608.19013?utm_source=chatgpt.com "Harness Continual Learning: Continual Adaptation Beyond Model Parameters"
[2]: https://arxiv.org/abs/2605.09998 "[2605.09998] Continual Harness: Online Adaptation for Self-Improving Foundation Agents"
[3]: https://deepseek.com/harness/en/?utm_source=chatgpt.com "DeepSeek Harness developer preview: Everything is a plugin"
[4]: https://github.com/microsoft/researchstudio?utm_source=chatgpt.com "GitHub - microsoft/ResearchStudio: ResearchStudio: Our AI co-author, from research problem to final publication. · GitHub"
[5]: https://arxiv.org/abs/2512.24601 "[2512.24601] Recursive Language Models"
[6]: https://arxiv.org/abs/2608.05179?utm_source=chatgpt.com "Autonomous Research Agents: A Survey of AI Scientists and the Verification Gap"
[7]: https://research.google/blog/science-one-framework-a-verifiable-autonomous-research-framework-via-chain-of-evidence/?utm_source=chatgpt.com "Science One Framework: A verifiable autonomous research framework via Chain-of-Evidence"
[8]: https://www.sciencedirect.com/science/article/pii/S0950705126012785?utm_source=chatgpt.com "Research on self-enhancing multi-agent systems under multi-task objectives - ScienceDirect"
[9]: https://www.sciencedirect.com/science/article/abs/pii/S0950705126007288?utm_source=chatgpt.com "DuSA: Dual-loop self-learning framework for autonomous driving with LLM-guided reinforcement learning - ScienceDirect"
[10]: https://www.sciencedirect.com/science/article/pii/S0950705126002121?utm_source=chatgpt.com "Addressing hallucinations in generative AI agents using observability and dual memory knowledge graphs - ScienceDirect"
[11]: https://www.sciencedirect.com/science/article/abs/pii/S0950705126013936?utm_source=chatgpt.com "Mechanism-centric cross-domain retrieval for scientific discovery: LLM agents for structural isomorphism beyond semantic similarity - ScienceDirect"
[12]: https://www.sciencedirect.com/science/article/pii/S0950705126013407?utm_source=chatgpt.com "AGEE: A multi-dimensional process-level metric for evaluating agent exploration over knowledge graphs - ScienceDirect"
