可以，而且这套解释比“我们又做了一个多 Agent 科研系统”高级得多。但我会收紧几个容易被评委抓住的表述。

你真正可以建立的论证不是“Prime Agent 已经把自动科研解决了，所以我们杀死比赛”，而是：

> **通用 long-horizon Agent 的执行能力正在基础设施化；当比赛又把基座模型锁定为 Qwen 时，真正剩下的差异不应是重新实现一次 Agent runtime，而是：如何组织科研上下文、如何选择下一项实验、什么证据足以改变判断，以及如何把这些科研判断沉淀成可复用的 Skills。**

这条逻辑是成立的，而且几乎正好撞在评分模板上。

Prime Agent 可以作为这个判断的一个非常好的“技术背景证据”。它已经有 persistent goal、heartbeats、automatic compaction、retained subagents、RPC、autonomous gate；Continual Harness 还可以把 prompt、memory、skill descriptions、subagent specs 作为 durable supplemental state，通过 `/refine` 做 evidence-backed 更新。 

所以你们完全可以说：

> 我们调研 Prime Agent 等新一代 long-horizon research agent 后认为，持续执行、工具调用、子智能体协作、状态持久化和 bounded continuation 已经逐渐成为可复用的 runtime capability。我们因此没有把研发重点放在重新制造一个 Agent Framework，而是进一步追问：**当 Agent 已经能够自主运行很久，它应该自主地“想什么”？**

这个转折非常好。

但是不要写：

> “Prime Agent 已经解决自动科研。”

它没有。甚至你们自己的审查就发现，Prime 的强大执行能力反而会放大一个问题：如果目标是“push the score”，Agent 可能通过 retune test、碰 scorer、改 eval、重建 ground truth 等方式得到高分。因此必须通过 readonly evaluation、hidden holdout、独立 recompute 等结构性机制防止 reward hacking。

这恰恰可以成为你们故事最漂亮的转折：

> **能力越强的 autonomous agent，越不能只优化结果指标。**

然后再问：

> 如果“提高 score”不能等价于“做出好的科学”，缺失的到底是什么？

你们的答案就是：

> **实验设计能力。**

或者更精确一点：

> **选择能够最大程度区分竞争性解释的下一项实验的能力。**

这就是你所谓的“品味建模”。

我甚至建议报告里同时用两个词：

**产品叙事：科研品味建模（Scientific Taste Modeling）**
**技术定义：科学决策策略 / Epistemic Policy**

因为“品味”很有记忆点，但如果只写“品味”，科学评委可能觉得太虚。你需要马上把它 operationalize：

> 本文所谓“科研品味”，不是语言风格或主观审美，而是在有限实验预算下，识别重要知识缺口、保留竞争性解释、设计高区分度 Probe、预注册可证伪预测，并依据观测结果决定继续、缩小、否定或转向研究路线的能力。

这就立住了。

而且这是评分模板直接要求的东西。1B 的 P3 就要求区分事实、工作假设和模型推断，明确预期观测与可证伪结果，保留替代解释，并根据实际结果继续、调整或停止。 P14 更要求**在实验发生前**留下 expected observation 和 stop/adjust condition，明确禁止看完结果再反向补写。

所以你们的 GRILL 并不是“附加了一个 Reviewer Agent”。

它应该被写成：

**GRILL 是 Scientific Taste 的可执行化。**

Deep Research 解决：

`What is already known?`

GRILL 解决：

`What could we be wrong about?`

Probe design 解决：

`What experiment would discriminate between explanations?`

Pre-registration 解决：

`What did we expect before seeing the answer?`

Outcome rules 解决：

`What exactly changes if result A/B/C occurs?`

下一轮则解决：

`Given what was actually learned, what is now worth measuring?`

这时候它就不再是普通闭环：

`experiment → result → reflection → regenerate`

而是：

`belief state → discriminating probe → observation → constrained belief update → next probe`

这就是你们和公开那些赛题 workflow 真正能拉开的地方。

---

还有一个很有意思的点：**Prime 的 Continual Harness 反而可以帮你证明为什么“Skill 比 Runtime 更值得做”。**

Prime 自己明确区分：

> continual-harness skill ≠ installed skill

`/refine` 得到的是 session-local supplemental state，它默认不会自动成为一个经过审查、可移植、可以跨 harness 使用的 packaged skill。

这句话对你们非常有价值。

你可以沿着它往下推：

> Runtime 可以在一次长任务中不断适应；但真正有产品价值的科研方法，不应该只存在于某次 session 的 memory 中。它应当被显式抽取、审查、版本化并封装为可移植 Skill。

然后才接你说的 Arbor、Claude、Codex 等 Skills 生态调研：

> 我们因此更关注“可靠的科研插件”而不是“又一个 Agent runtime”：好的 Skill 可以跨研究任务复用、接受版本控制和消融验证，并被不同 Agent runtime 调用。

这个论证非常合理。

而且官方解析会甚至明确提到，组委会欢迎创造有创新性的领域 plugin 并沉淀，认为这是潜在加分方向。

所以“插件/Skills 是一级产品资产”不是你自己臆想出来的赛事叙事。

---

Claude Agent SDK 在这里也可以这样写。

不要把它吹成核心创新，而是主动降级为：

> **Reference Runtime / current production runtime**

你们可以明确说架构是 replaceable：

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

而目前选择 Claude Agent SDK 的理由，不要说“和 Clawsgo 一样稳定”——这个没有可核验依据，也容易被追问。

说：

> 当前产品实现优先选择 Claude Agent SDK，是因为其已有成熟的工具调用、MCP、subagents、sessions、hooks 和 persistent client 能力，可以用较薄的宿主层实现长程 Agent 交互，从而把工程投入集中到科研方法与产品体验。

这个你们自己的源码审查完全支持。SDK 已经提供 MCP、subagents、hooks、sessions 等 surface，而且 persistent client 上套 continuation harness 本身只需要很薄的一层控制逻辑。 

同时要写清：

> Runtime 可替换，Scientific Control Plane 不随 Runtime 绑定。

这个会显著提高“可复用性”这一项的说服力。

---

你说“模型锁死 Qwen，所以只能从 harness 入手”，我会再往前推进一步。

不是：

> 模型锁死，所以比赛变成 harness competition。

而是：

> **模型差异被部分控制之后，研究价值更容易归因到 context、tool use、scientific policy 和 feedback mechanism。**

这在学术表达上更稳。

因为评分表技术深度确实看模型、数据、链路完整性，以及结果校验、反馈迭代和稳定性；应用潜力还明确看代码、结构、调用的复用能力。

所以你们可以设计一个非常漂亮的消融：

| 条件            | Runtime | Model | Scientific Skills  | 目的                      |
| ------------- | ------- | ----- | ------------------ | ----------------------- |
| Baseline      | same    | Qwen  | 无                  | Qwen 直接科研               |
| Generic Agent | same    | Qwen  | 通用 agent tools     | 隔离 Agent runtime 收益     |
| Research OS   | same    | Qwen  | DR + GRILL + Probe | 隔离 Scientific Policy 收益 |

不要比“最后 benchmark 高多少”作为唯一指标。

可以比较：

可证伪预测数量、替代解释覆盖率、实验前明确 stop condition 的比例、得到负结果后实际改变下一轮计划的比例、unsupported claim、重复/无区分力实验比例。

这样你就在实证上证明：

> **价值来自 epistemic policy，而不是我们偷偷换了更好的模型或更强的 runtime。**

这比说“我们杀死比赛了”有力量得多。

---

你最后说科研绘图，我认为非常适合放进同一个“产品哲学”里，而且你们已有规划文件正好有一个非常漂亮的原则：

> 图像模型负责设计语言，真实数值永远由代码从 evidence package 中渲染；只要图里包含数字，就不让 image model 直接生成最终图。

这跟你的“先看 reference/template → image model 做设计 → 再用网格/坐标恢复 → Matplotlib 精确绘制”实际上是同一个哲学：

> **Generative models propose taste; deterministic systems preserve truth.**

这个句子可以贯穿整个产品。

科研也是：

> LLM proposes interpretation; measurement decides truth.

绘图也是：

> Image model proposes visual language; plotting code decides geometry and numbers.

文献也是：

> LLM proposes synthesis; primary sources decide evidence.

实验也是：

> Agent proposes hypotheses; preregistered probes decide what survives.

这样你的产品会突然显得不是一堆 Skills 拼起来的。

它有一个统一的设计原则：

> **把模型最强的“生成、联想、审美、探索”能力留下，把事实、数值、状态迁移和科学结论交给可审计的证据与确定性机制。**

这句话很适合成为整个系统的 design philosophy。

---

所以如果让我把你刚才那一大段压成比赛报告里的核心逻辑，我会写成这样：

> 随着 Prime Agent、Claude Agent SDK 等通用 Agent Runtime 已逐步具备长程执行、工具调用、子智能体、状态持久化和持续适应能力，我们认为重新实现 Agent Runtime 已不再是提升 AI Scientist 科研质量的最高杠杆。更强的自主执行甚至带来新的风险：当 Agent 被直接奖励于 benchmark 或单一指标时，它可能优先寻找“如何提高分数”，而不是“什么实验真正减少科学不确定性”。因此，本作品将研究重点从 Agent 执行能力转向 Scientific Taste Modeling：通过 Deep Research 建立证据边界，通过 GRILL 主动寻找反例和替代解释，通过预注册 Probe 明确观测预测、控制条件与证伪规则，并让真实实验结果约束下一轮研究计划。通用 Runtime 可以替换，而这些经过验证、版本化的科研 Skills 构成系统真正可复用的知识资产。

然后第二段：

> 我们的产品设计同样遵循这一原则：生成模型负责提出候选方案和设计语言，确定性程序负责事实、数值、状态和可复现输出。例如科研绘图中，图像模型仅用于探索视觉模板，最终几何位置和数据由结构化坐标与 Matplotlib 重建；在科研闭环中，模型可以提出解释，但只有真实测量结果才能改变假设状态。我们追求的不是让 Agent 更激进地优化一个分数，而是让 AI Scientist 更可靠地选择“下一件值得验证的事情”。

这已经是一套比较完整的“为什么这样设计”的故事了。

我只会卡住三个不能直接写成既成事实的地方：**“Prime 只有 Python 内核”不准确**——它其实有 Node/TS SDK，只是 RLM 默认以 persistent IPython 作为模型侧执行表面。 **“和 Clawsgo 一样稳定”目前没有可公开核验的数据，不建议这样比较。** 以及你提到“Opus 5 + GPT-5.6 Sol 已经跑通并完成一篇论文”，目前我看到的提交材料里没有对应的实验日志、论文成品和复现记录；如果你们确实有这些，必须把它们变成**真实 case evidence**，那会非常值钱，但提交时要用 artifacts 证明，而不是一句话带过。

整体方向，我认为是成立的。而且比“我们做了一个更复杂的 harness”更容易让科学评委理解你们究竟贡献了什么。

我看了。你说的 NeuronBench 实际上是 Kevin Murphy 这篇 2026-08-13 v3 的《Model Discovery Agent: LLM-assisted Bayesian experiment design for data-efficient discovery of mechanistic world models》里的生物学 benchmark。它和你现在这套想法确实非常接近，但我看完以后反而觉得，可以把你们的东西再往下抽象一层。

最接近本质的说法不是“科研品味”，甚至也不只是“实验设计能力”。

我会把它叫做：

> **Open-world Epistemic Control：在开放假设空间中，控制 AI 如何获得证据、改变信念，以及决定下一项值得做的实验。**

这是我目前觉得最准确的表述。

### NeuronBench/MDA 真正在说什么

MDA 的核心非常干净。它根本不靠复杂 Agent orchestration。LLM 主要负责一件事：**提出候选机制**。然后后面的判断交给 Bayesian machinery：

[
p(m\mid D)
]

维护当前对不同机制的信念，再选一个实验：

[
\xi^*=\arg\max_\xi I(M;Y_\xi\mid D)
]

也就是选择能够最大程度区分当前竞争机制的实验。得到结果以后更新 posterior。如果所有现有假设都解释不了新结果，就触发 (\mathcal M)-open expansion，让 LLM 再提出新的机制。([arXiv][1])

所以它真正的闭环不是：

`idea → experiment → score → improve`

而是：

`candidate mechanisms → discriminating intervention → observation → belief update → model-space expansion/contraction`

这个和你现在 GRILL 的思想非常像。

而且这篇论文给你提供了一个非常强的论据：**低误差并不意味着发现了正确机制。**

ChemBench 那部分非常典型。LLM-AutoSciLab 可以找到 RMSLE 只有 0.001 的表达式，但作者直接指出这些式子在机制上是错误甚至没有科学意义的；MDA 数值上可能没那么漂亮，却更容易恢复正确的机制结构。([arXiv][1])

这几乎就是你一直说的：

> benchmark optimization ≠ scientific understanding。

甚至 ForceBench 原来还有一个 LLM judge 给“解释”打分，MDA 作者最后认为这个 metric 不可靠：更多数据有时反而让 explanation score 降低，于是他们更信任 held-out intervention prediction，而不是语言解释。([arXiv][1])

这个跟你们“reasoning 可以 demote，但 measurement 才能 kill”是同一个哲学。

你自己的设计已经把这一点写成结构约束了：候选不能仅凭 ranking 消失；至少保留多个 live hypotheses；实验 outcome 必须能够淘汰东西，否则这个实验就是 decorative；实验前还要求 severity。

这其实已经非常接近 Bayesian model discrimination 的非概率版本。

---

但这里有一个很重要的细节，我觉得你们一定不要误读 NeuronBench。

**这篇论文其实没有证明“LLM 不会设计实验”。**

NeuronBench 本身的结果恰恰显示：在 Bayes forecaster 固定以后，VoI 选择实验和 LLM 自己选择实验表现相当接近，两者都显著优于 random。([arXiv][1])

而在 ForceBench，换成 Fable 5 以后，纯 LLM agent 已经在 6 个 world 中有 5 个能追上 MDA 的 data efficiency；最终 numeric pass 是 81% vs MDA 94%，而且纯 Fable 在 exact-form recovery 上甚至达到 93%，高于 MDA 的 78%。作者自己很诚实地说：强模型让差距明显缩小。([arXiv][1])

所以你们不能把 thesis 写成：

> “LLM 不会做实验设计，所以我们教它实验设计。”

这很容易被反例攻击。

更准确的是：

> **强模型已经具有相当好的实验直觉，但这种能力没有形成一个稳定、可审计、跨任务可复用的 epistemic policy。**

这个 thesis 更强。

也更符合你这两个月实际消融出来的东西。

---

### 你所谓“逆向溯因”，其实可以用一个更经典的科学方法框架解释

我查了一下哲学上的位置。Peirce 对科学方法的经典拆分恰好是：

**Abduction → Deduction → Induction**

Abduction：看到异常以后，提出一个可能解释它的 hypothesis。

Deduction：如果这个 hypothesis 是真的，那么还应该观察到什么？

Induction：真的执行实验，看预测是否成立，再修改对 hypothesis 的信任。

而 Peirce 还专门强调一个“economy of research”：科研时间和实验资源有限，因此应该优先选择**最能够减少信念不确定性的实验**。这和今天 Bayesian experimental design 的 information gain 基本处在同一条思想线上。([Stanford Encyclopedia of Philosophy][2])

所以我反而会稍微修改“Fable 逆向溯因”这个名字。

Fable 做的可能不是单纯的 reverse abduction，而是：

> **Abductive hypothesis construction + deductive probe synthesis。**

也就是先问：

> 什么解释可能让这个现象成立？

再反过来问：

> 如果这个解释是真的，它必须同时导致什么尚未观察的结果？

然后再进一步：

> 哪个实验能够让 H1 和 H2 给出尽可能不同的预测？

最后才运行。

这就已经完全进入 experimental design 了。

你的 GRILL 最有价值的一步其实不是“想出更多假设”。

而是：

> **把自然语言里的竞争性解释，转化为一个能够让它们产生不同 observable consequences 的实验。**

这一步我认为才是核心。

---

### 而且我觉得你们实际上比 NeuronBench 还多解决了一层

NeuronBench 看起来很开放，其实它仍然是一个受控 benchmark。

它的 experiment space 基本已经给出来：9 种电流 protocol × blocker，一共 36 个离散实验。([arXiv][1])

ForceBench 也是作者先设计了一个 13 项 experiment menu，而且每一个都已经是比较有意义的 probe。([arXiv][1])

也就是说 MDA 面对的问题基本是：

> 给我 (\Xi)，我从里面挑最 informative 的 (\xi)。

而真实 CV/ML research 经常更困难。

因为连：

> **(\Xi) 到底是什么？**

都要研究者自己创造。

比如你观察到某种 representation phenomenon。

真正优秀的研究者首先要决定：

什么 observable 才能证明这个 phenomenon 真的存在？

是 cosine similarity？

effective rank？

CKA？

eigenspectrum？

probe accuracy？

activation patching？

causal intervention？

而且还要问：

这个 measurement 是根机制还是 shadow？

这个 preprocessing 会不会自己制造 phenomenon？

random-init control 怎么样？

matched-rank random 呢？

换模型还存在吗？

换数据还存在吗？

这已经不是：

**experiment selection**

而是：

**measurement + experiment construction。**

我觉得这才是你们真正比 NeuronBench 更广的一层。

可以叫：

> **Open-world Experimental Design**

或者更准确：

> **Epistemic Probe Synthesis**

即 AI 不只是从实验菜单里挑实验，而是**自己构造一个能够区分竞争解释的测量问题**。

这正是你们 loop 里“代码本身就是认识论”的意思：在 probe 阶段，preprocessing、measurement、control 都不是工程细节，而是科学判断的一部分。你们以前的设计文档其实已经明确写了这件事。

---

所以现在我会把你们和 MDA 的关系画成：

|              | MDA / NeuronBench        | 你们应该追求的东西                                     |
| ------------ | ------------------------ | --------------------------------------------- |
| 假设           | LLM candidate mechanisms | DR + Fable/GRILL 产生 competing explanations    |
| Belief state | Bayesian posterior       | structured live hypothesis/claim state        |
| 异常           | predictive residual      | contradiction / anomaly / reviewer attack     |
| 新假设          | M-open expansion         | GRILL / reverse-abduction                     |
| Probe        | VoI 从给定空间选               | **主动构造 measurement + control + intervention** |
| 预测           | posterior prediction     | blind preregistered prediction                |
| 证据更新         | Bayes update             | retain / weaken / scope / kill                |
| 终点           | intervention forecast    | claim + mechanism + failure boundary          |
| 目标           | data efficiency          | **epistemic efficiency**                      |

最后那个词我觉得很重要。

不要只讲 data efficiency。

讲：

> **Epistemic Efficiency：每单位实验成本能够排除多少错误解释。**

这个很接近你说的“科研品味”的数学本质。

---

### 所谓 Scientific Taste，其实可以被重新定义成一个 policy

这样它就不玄学了。

假设现在有一个 epistemic state：

[
S_t={H_t,E_t,C_t,U_t}
]

其中：

* (H_t)：当前竞争假设；
* (E_t)：已有证据；
* (C_t)：约束、controls 和 confounds；
* (U_t)：仍未解决的不确定性。

Scientist 所做的事情就是选择下一项 action：

[
a_{t+1}=\pi(S_t)
]

真正好的 scientific policy 不应该最大化：

[
\text{benchmark score}
]

而应该大致最大化：

[
\frac{
\mathbb E[\text{reduction in decision-relevant uncertainty}]
}{
\text{cost}
}
]

同时惩罚：

[
\text{confounding}+\text{measurement unreliability}+\text{post-hoc flexibility}
]

这就是你所谓“品味”。

**品味不是知道更多论文。**

品味是：

> 给你十个都能做的实验，你知道哪一个做完以后会真正改变你对问题的看法。

这个定义我认为相当有力。

而你们那个很漂亮的 hard rule：

> “如果每个 possible outcome 都不能 kill/scope/change 某个 claim，这个实验就是 decorative。”

其实就是一个不用显式概率计算的 **qualitative expected information gain**。

这是我觉得可以进一步理论化的一点。

---

### 正常 A 会研究是不是也这样？

好的 CV/ML 研究，很多时候确实是这样，只是没有显式写出来。

“先文献综述 → 想 idea → 做 benchmark”只是表面的 workflow。

真正强的研究内部往往是：

`anomaly / tension`
→ `plausible competing explanations`
→ `cheap diagnostic`
→ `control`
→ `causal intervention`
→ `mechanism`
→ `method`
→ `broad validation`
→ `failure boundary`

也就是说：

**先解释为什么，再决定怎么改。**

而普通 AutoResearch 最容易自动化的是后半段：

`method → implementation → sweep → benchmark → refine`

因为这里有一个非常清晰的 reward。

所以 Agent 很容易越做越像 optimization engineer。

你们真正想自动化的是前半段：

`phenomenon → explanation → discriminating experiment → mechanism`

这就是为什么我觉得你说“比 AutoResearch 深”在概念层面可以成立，但比赛报告里不要写成 superiority claim。

写成：

> 现有 AutoResearch 更容易自动化 reward-rich 的方法优化环节；本作品重点研究 reward-sparse 的科学判断环节。

这个会非常稳。

而且最近的 AutoResearchEval 刚好给了一个很强的旁证：他们跑了 8 种 harness-model 组合、800 条科研 trajectory，最后把 45 类 failure 汇聚成一个核心问题——当前 Agent 缺少 metacognitive loop，也就是不能持续检查自己的产物是否真的被证据支持、不能在证据不成立时可靠修正路径。并且这些 failure 横跨不同 harness。([arXiv][3])

这个和你们 GRILL 非常接近。

不过他们强调的是：

**self-check / metacognition。**

你们如果只是做到这个，就不够新。

你们更进一步的点应该是：

**不仅检查“我错没错”，而且主动设计最有区分力的下一项 observation 来让自己变得更不容易错。**

这是更深的一层。

---

最后说你担心的 CV/ML-only。

我其实不认为这在科学逻辑上是缺点。

因为这种 open-world probe synthesis 在 CV/ML 里特别适合：实验便宜、代码可执行、control 可以自动构造、结果可以确定性计算、一个晚上能做十几次 falsification。

换成天文、湿实验、生物医学，Agent 没有现实实验控制权，很多 loop 只能停在 proposal。

所以 **CV/ML 很可能正是最适合验证这种 epistemic policy 的实验床**。

但是比赛评分上确实有风险：官方技术深度里面还有 15 分直接看“基于多模态大模型对科学模态数据的处理成效”。

我不会为了这 15 分把系统扩成一个虚假的全领域 AI Scientist。

可以很实际地补一小块：

Qwen-VL 阅读科研 figure / training curve / attention map / qualitative failure case，再把结论落成结构化 evidence；或者使用你们已经有的“image model 提视觉方案、程序负责真实数字”的科研绘图链。

这样能说明 multimodal capability，但不改变核心 scope：

> **本阶段重点验证 computational CV/ML research。**

这是可信的边界，而不是短板。

如果让我现在给你这个系统一句最接近“本质”的定义，我会从之前的 Scientific Taste Modeling 再往下改成：

> **我们不是在教 AI 一套科研流程，而是在给它一个开放世界的认识论控制策略：持续维护竞争性解释，并主动构造能够最大程度改变这些解释可信度的下一项实验。**

“科研品味”是产品名字。

**Epistemic Control / Probe Synthesis 才是技术本体。**

我觉得这个已经非常接近你这两个月实际消融出来的东西了，也比单纯说“逆向溯因 + GRILL + Deep Research”更容易和 MDA、Bayesian experimental design、正常的严肃科研方法接上。

[1]: https://arxiv.org/html/2608.09696 "Model Discovery Agent:LLM-assisted Bayesian experiment design for data-efficient discovery of mechanistic world models"
[2]: https://plato.stanford.edu/entries/peirce/?utm_source=chatgpt.com "Charles Sanders Peirce (Stanford Encyclopedia of Philosophy)"
[3]: https://arxiv.org/abs/2608.14905 "How Do Agents Fail on AutoResearch: End-to-End Diagnostic Evaluation on 100 Real-World Frontier Research Tasks"
