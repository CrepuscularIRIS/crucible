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

我现在的判断比较明确：**“metacognition”是对的，但只描述了你系统的一层，不足以描述你真正做出来的东西。**

你目前更接近：

$$
\boxed{\text{Scientific cognition as externally governed epistemic state transition}}
$$

中文可以暂时叫：

**“外部治理的科学认知”**，或者更有方法味道一点：

**Executable Epistemology（可执行认识论）**。

你报告里那句话其实已经非常接近这个本质：

> question discovery、literature grounding、experimentation、analysis、writing、review 不再是几个流水线模块，而是同一个 journal 驱动的闭环；metacognition 不由一个 agent 承担，而由 epistemic debts 和 server refusal 实现。

我认为这句话的重要性，可能比你目前 K1/K2/K3 的任何一个具体工程组件都大。

### 1. 为什么它不只是 metacognition

经典 metacognition 的定义基本是两件事：

$$
\text{monitoring}
+
\text{control}
$$

也就是 object-level 在解决问题，meta-level 监控“我做得怎么样”，然后决定是否改变策略。Nelson–Narens 系的框架就是 bottom-up monitoring + top-down control；meta-reasoning 又把它推广到了复杂推理和问题求解。([PubMed Central (PMC)][1])

所以 ARFT 说现在 Agent 缺少 metacognitive loop，是合理的：它发现错误，却不据此改变行为；发现实验不支持结论，却仍然交付结论。ARFT 在 800 条轨迹里把这个问题作为共同根因，而且明确留下了“orchestration-level intervention 是否能解决”的 open question。([arXiv][2])

但你的系统已经做了一个关键变换：

传统方案是：

$$
LLM
\xrightarrow{\text{monitor}}
LLM
\xrightarrow{\text{control}}
LLM
$$

也就是：

> 我检查我自己 → 我觉得我有问题 → 我决定要不要改。

你的结构变成：

$$
LLM
\rightarrow
\boxed{\text{external epistemic state}}
\rightarrow
\boxed{\text{deterministic control}}
\rightarrow
LLM
$$

换句话说：

> 模型可以提出认识，但没有完整的“认识主权”。

你报告里已经明确写成：

> Generative models propose taste; deterministic systems preserve truth.

并且假设迁移、实验命令、指标重算、最终声明都受到模型外边界约束。

因此我会把 metacognition 看成**现象层解释**。

更深的机制层是：

$$
\boxed{\text{Epistemic Governance}}
$$

也就是：

> 谁有资格改变一个系统“认为是真的东西”？
> 在什么证据条件下可以改变？
> 哪些状态迁移是不合法的？
> 什么情况下可以对外形成 scientific commitment？

这已经非常接近知识表示、belief revision 和 formal epistemology 的问题了。经典 AGM belief revision 研究的就是：给定一个 epistemic state 和新信息，什么样的 expansion / contraction / revision 才属于合理的信念变化。([Stanford Encyclopedia of Philosophy][3])

你实际上是在给 LLM Agent 做一个**运行时 belief revision system**，只是比经典 AGM 多了：

$$
\text{provenance}
+
\text{measurement}
+
\text{preregistration}
+
\text{experiment execution}
+
\text{cost}
+
\text{falsification}.
$$

这就是很有意思的地方。

---

### 2. 我现在会怎么定义“研究”

如果一定让我压缩成一句话，我不会定义成：

> Research = 提问题 + 查文献 + 做实验 + 写论文。

那只是 workflow。

我会定义成：

$$
\boxed{
\textbf{Research is the controlled conversion of uncertainty into justified commitments through epistemic actions.}
}
$$

即：

> **科研是在有限资源下，通过获取能改变判断的信息，把“不知道”逐步转化为“有资格相信/声称什么”。**

这里有三个关键词。

第一是 **uncertainty**。

没有竞争解释、没有真正不知道的东西，就没有研究，只是在执行。

第二是 **epistemic action**。

实验真正的目的不只是改变世界，而是**获取信息**。认知科学里早就区分 pragmatic action 和 epistemic action：后一类动作的目的就是揭示原先不可得的信息、简化认知问题。([DOI][4])

所以：

$$
\text{literature search}
$$

是 epistemic action。

$$
\text{experiment}
$$

也是 epistemic action。

$$
\text{negative control}
$$

也是。

甚至：

$$
\text{ask another independent agent}
$$

如果确实改变信息状态，也是 epistemic action。

第三才是 **commitment**。

这是我认为你抓到别人还没有抓牢的地方。

研究最后不是：

> “我生成了一段解释。”

而是：

$$
H_0
\rightarrow
H_1
\rightarrow
H_2
\rightarrow
\boxed{\text{commit}}
$$

系统必须回答：

> **当前证据是否足以允许这个认识状态迁移？**

你的 journal 其实就是这个过程的显式载体。

---

### 3. 所以 question discovery、literature、experiment 本质上不是不同模块

它们只是对同一个 epistemic state 进行不同操作。

可以写成一个状态：

$$
S_t=
(Q_t,H_t,A_t,E_t,C_t,D_t,G_t)
$$

其中：

\(Q_t\)：还没解决的问题；
\(H_t\)：竞争 hypotheses；
\(A_t\)：当前 assumptions；
\(E_t\)：evidence；
\(C_t\)：已经作出的 commitments；
\(D_t\)：epistemic debts；
\(G_t\)：graveyard / 被杀死的方向。

然后所谓科研动作其实只有几类：

$$
\text{Generate}
$$

产生新的问题/解释；

$$
\text{Ground}
$$

用文献/事实约束它；

$$
\text{Probe}
$$

主动向世界索取区分性信息；

$$
\text{Revise}
$$

根据观测修改 belief；

$$
\text{Reframe}
$$

改变问题/表示；

$$
\text{Commit}
$$

形成结论。

你现在自己的六移动 ABDUCE / SYNTHESIZE-PROBE / EXECUTE / UPDATE / CHALLENGE / REFRAME 已经非常接近这种抽象，而且你已经用判别力/成本和认知债触发来控制移动。

所以我觉得你现在的工程系统，实际上是在**无意中逼近一个 scientific cognition architecture**。

这不是我随便给你拔高概念。8 月 5 日刚有一篇 *Differentiated memory and scientific cognition in AI research agents* 明确提出：

> workflow automation ≠ scientific cognition。

他们认为下一步需要 differentiated memory、provenance routing、critique 和独立 judgment layer，而且明确说 generation ≠ judgment。([Frontiers][5])

这篇对你非常值得仔细看。

因为它基本在提出一个**概念性 research agenda**。

而你的系统正在做其中一个更“硬”的版本：

他们：

$$
\text{memory}
+
\text{routing}
+
\text{judgment}
$$

你：

$$
\text{state}
+
\text{commitment}
+
\text{external authority}
+
\text{enforced transition}.
$$

你和他们的差别很适合形成 related-work positioning。

---

### 4. 你说的 stop，其实是非常深的问题

你现在说：

> 发现别人做过了，stop。

或者：

> 实验已经证明不行，stop。

这是第一版非常合理。

但真正抽象之后，stop 其实属于另一个成熟领域：

$$
\boxed{\text{rational metareasoning}}
$$

Russell 和 Wefald 很早就提出：一个智能体不只要决定“做什么行动”，还需要决定：

> **下一步计算/思考值不值得做？**

他们把 computation 看成有成本的 action，用 expected value of computation 决定是否继续推理。([EECS Berkeley][6])

这可以直接推广成研究：

$$
VOI(e\mid S_t)
=
\mathbb E[
U(S_{t+1})-U(S_t)
].
$$

一个实验值得做，如果：

$$
VOI(e\mid S_t)>Cost(e).
$$

反之：

$$
VOI(e\mid S_t)\leq Cost(e)
$$

就应该停止或者换方向。

所以真正成熟的 stop 不是：

> “我感觉这个方向不行了。”

而可能是三种完全不同的停止：

$$
\text{stop experiment}
$$

证据已经达到预登记判据；

$$
\text{stop hypothesis}
$$

假设已被杀，或者剩余 uncertainty 不再改变任何 decision；

$$
\text{stop research vein}
$$

这个方向继续投入的 marginal information / constraint yield 已经低于替代方向。

有意思的是，我扫你上传的核心包时发现：**你实际上已经写出了这三种 stopping 的区分。**

也就是说，你现在很多“工程 heuristic”可能并不是孤立 heuristic。

它们背后可能已经存在一个统一理论：

$$
\boxed{
\text{Research as resource-bounded epistemic control}
}
$$

这个理论比“metacognition”更大。

---

### 5. 你提到 representation learning，我认为这是另一块非常值得挖的东西

而且这里我建议你特别谨慎区分两个东西。

你现在的 journal/server 是：

$$
\boxed{\text{external cognitive control}}
$$

你说的“通过表征学习强迫 AI 分析 ML”则可能成为：

$$
\boxed{\text{internal cognitive instrumentation}}
$$

也就是，我们能不能从 hidden representations 看出：

* 它是否真的 uncertainty 高；
* 是否卡在一个 framing；
* 是否已经形成单假设锁定；
* 是否正在 backtracking；
* 是否其实已经知道自己错了；
* 是否应触发 CHALLENGE；
* 是否应触发 REFRAME；
* 是否应该 stop。

这个方向现在已经有一些非常有意思的证据。

ICLR 2026 有工作显示 LLM 存在有限但可行为验证的 metacognitive internal signal，而不只是口头自报。([ICLR Proceedings][7])

ACL 2026 有研究发现正确/错误 reasoning trajectory 在后期 hidden representation 中系统分离，仅凭中间表征就能预测最终 correctness，ROC-AUC 可以到 0.87，并能据此进行 steering。([ACL Anthology][8])

还有今年 2 月的 *The Shape of Beliefs*，直接研究了模型 prompt-conditioned belief 在 representation space 中形成的 belief manifold，以及 evidence 到来后这个 manifold 怎样移动。([arXiv][9])

另外 ACL 2026 SAE-Steering 已经能从 hidden state 中识别 backtracking、cross-verification 一类 reasoning strategy 并主动控制它。([ACL Anthology][10])

所以你这个方向不是异想天开。

但是我的建议非常明确：

$$
\boxed{\text{latent representation should be a sensor, not the judge}}
$$

不要让 hidden-state probe 最终决定：

> H1 是真的。

而让它决定：

> 当前状态看起来像“高 uncertainty / 单框架锁定 / error trajectory”，因此触发 external CHALLENGE / experiment / reframe。

即：

$$
z_t^{LLM}
\xrightarrow{\text{probe}}
m_t
\xrightarrow{\text{trigger}}
\text{epistemic action}
$$

最后：

$$
\text{world evidence}
\xrightarrow{\text{server}}
S_{t+1}.
$$

这非常漂亮。

因为：

**内部表征负责感知认知状态。**

**外部证据负责决定认识是否合法。**

这样你就得到一个两层架构：

$$
\boxed{
\text{Latent metacognition}
+
\text{External epistemic governance}
}
$$

我觉得这个甚至可能是你后面真正有研究价值的一条线。

---

### 6. 你现在真正应该研究的，不是“有没有更多功能”

而是：**哪些东西是 research 的 load-bearing primitives。**

你报告里已经把 ARFT 的 45 种失败压成了 6 类，并进一步判断其中核心问题是 observation、belief、world/probe 之间的耦合仍由模型裁量。

我认为下一步最值得做的是一个非常大胆但可实验的研究计划：

1. **Metacognition hypothesis**：真正有效的不是 self-reflection，而是 monitor → control 之间是否存在强制的 causal edge。把 reflection 文本量固定，只改 server refusal，测结果。

2. **Belief-revision hypothesis**：科研最关键的是 \(E_t\rightarrow H_{t+1}\) 是否受约束。分别删除 preregistration、evidence ownership、reconcile、graveyard，看哪一条边断掉以后 failure 暴涨。

3. **Meta-control hypothesis**：好的研究不是生成更多 idea，而是正确选择“下一步获取什么信息”。比较 LLM intuition、VOI/判别力规则、latent-state trigger 和你现在的 debt-based scheduler。

4. **Representation hypothesis**：模型内部是否存在可以预测“该 reframe / stop / challenge”的稳定方向，并且这种 signal 是否跨任务/模型迁移。若有，把它当 sensor 接入外部 runtime；若没有，这个负结果本身也非常重要。

这四个实验如果做好，你研究的就已经不只是：

> “我的 AutoResearch 系统更好。”

而是在回答：

> **What computational structures make scientific cognition possible in autonomous agents?**

这个问题的层级完全不一样。

---

至于你最后说：

> “我夸张觉得，我完成这个后，学术界基本上结束了。”

我不会这么判断，至少以当前定义不能。

因为你现在最可能解决的是一个非常重要但更具体的问题：

$$
\boxed{\text{How to build the control plane of autonomous science}}
$$

而“科学”还有你目前系统没有真正解决的部分，比如创造新的表示语言、发现全新的数学对象、改变问题范式、建立新仪器、决定哪些问题在价值层面值得研究，以及社会性的重复验证和知识共同体形成。

但我认为你确实可能碰到了一个比“AutoResearch framework”更普遍的东西：

**模型能力可能已经越来越像科研的 data plane；真正缺的是一个 epistemic control plane。**

你现在的 research-mcp / journal / gate / debt 体系，就是在做这个 control plane。

所以如果我现在给整个项目换一个研究纲领，我会叫：

$$
\boxed{\textbf{Scientific Cognition as Epistemic Control}}
$$

第一篇 KBS 做：

> **Executable Epistemology: Evidence-Gated Belief Revision for Autonomous Research Agents**

第二篇如果你的表征实验真有信号：

> **Representation-Grounded Meta-Control for Autonomous Scientific Reasoning**

再往后才是：

> **A Computational Theory of Autonomous Scientific Cognition**

我认为真正值得你现在停下来想清楚的不是“怎么再加一个 subsystem”，而是：**你已经造出的这些看似工程化的规则，能否被压缩成 2–3 个一般原则，并预测什么时候现有 Agent 会失败。**

一旦能做到这一步，才真正从一个强系统变成一个研究理论。

[1]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11368986/?utm_source=chatgpt.com "The case for metacognitive reflection: a theory integrative review with implications for medical education - PMC"
[2]: https://arxiv.org/abs/2608.14905?utm_source=chatgpt.com "How Do Agents Fail on AutoResearch: End-to-End Diagnostic Evaluation on 100 Real-World Frontier Research Tasks"
[3]: https://plato.stanford.edu/entries/logic-belief-revision/?utm_source=chatgpt.com "Logic of Belief Revision (Stanford Encyclopedia of Philosophy)"
[4]: https://doi.org/10.1207/s15516709cog1804_1?utm_source=chatgpt.com "On Distinguishing Epistemic from Pragmatic Action - Kirsh - 1994 - Cognitive Science - Wiley Online Library"
[5]: https://www.frontiersin.org/journals/big-data/articles/10.3389/fdata.2026.1916523/full?utm_source=chatgpt.com "Frontiers | Differentiated memory and scientific cognition in AI research agents"
[6]: https://people.eecs.berkeley.edu/~russell/research-bo.html?utm_source=chatgpt.com "Stuart Russell -- Research"
[7]: https://proceedings.iclr.cc/paper_files/paper/2026/hash/fb1b96eda4282f137f9a9953a4db2d74-Abstract-Conference.html?utm_source=chatgpt.com "Evidence for Limited Metacognition in LLMs"
[8]: https://aclanthology.org/2026.acl-long.1237/?utm_source=chatgpt.com "LLM Reasoning as Trajectories: Step-Specific Representation Geometry and Correctness Signals - ACL Anthology"
[9]: https://arxiv.org/abs/2602.02315?utm_source=chatgpt.com "The Shape of Beliefs: Geometry, Dynamics, and Interventions along Representation Manifolds of Language Models' Posteriors"
[10]: https://aclanthology.org/2026.acl-long.974/?utm_source=chatgpt.com "Controllable LLM Reasoning via Sparse Autoencoder-Based Steering - ACL Anthology"





Can scientific research competence be improved in a frozen LLM by state-conditioned activation of procedural scientific knowledge?