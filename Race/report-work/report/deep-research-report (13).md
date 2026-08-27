# PACK 5 · 中文工作补盲：科研 Agent 诚信、预登记与竞赛反馈迭代

## 检索口径与对照基线

截至 **2026-08-26**，本轮把“中文工作”限定为：**中国高校/实验室/企业团队的论文与技术系统，以及中文官方页面、CNKI/知网页面和中文社区公开材料**；论文即使以英文发表于 arXiv/ACL，也计入用户指定的“arXiv 上的中文团队论文”。同赛方案则只承认能明确对应 **XH-202619** 的公开材料，不拿一般 AI Scientist 项目冒充参赛方案。

可信度分级统一为：**【论文·高】**＝论文原文/正式会议期刊/arXiv 一手稿；**【官方博客·中高】**＝赛事官网、研究机构、公司或项目官方页；**【社区帖·辅助】**＝知乎/CSDN/掘金/公众号转载，仅作线索，不用于支撑关键技术判断。

对比“是否真正邻接你们”，我采用的不是“有没有闭环/反思”这个宽松标准，而是四个更窄的结构条件：**结果出现前是否冻结可证伪承诺；结果是否由模型之外的执行/计量方裁定；证据能否机械约束 belief/claim 状态迁移；最终报告是否必须与不可篡改轨迹重新对账。** 这与现有实现里的 `journal → prereg → external meter → declare`、CLAIM/PROBE 状态机、冻结命令和 server 重算等机制一致。fileciteturn0file1 用户本地语料已经覆盖 POPPER、Curie、co-scientist 等国际近邻，因此下面不拿这些英文/非国内工作填补中文空缺。fileciteturn0file0 fileciteturn0file2

## Q1 · 科研 Agent 诚信、严谨性、可证伪性的结构性方案

**【找到，但只找到“部分结构化严谨”；未找到与你们四件套同构的公开中文方案。】**

**Dolphin: Moving Towards Closed-loop Auto-research through Thinking, Practice, and Feedback · 复旦/上海AI实验室相关团队 · ACL 2025 ·【论文·高】**  
来源/链接：ACL Anthology。Dolphin 把自动科研明确拆成 idea generation → experiment implementation → result analysis/feedback，并让**上一轮实验反馈直接进入下一轮 idea generation**；这是国内“结果→下一轮研究动作”最清楚的公开闭环之一。可是论文公开机制仍是“自动分析结果后反馈给生成器”，没有公布“结果出现前冻结预测区间”“结果只能触发预先登记的 claim transition”“模型无权改写判据”等诚信约束。换言之，它把**反馈边固定了**，但没有把**反馈的认识论含义**交给模型外状态机。citeturn23view1

**TianJi-Environ: An Autonomous AI Scientist for Atmospheric Environmental Research · TianJi-Environ 团队 · arXiv · 2026 ·【论文·高】**  
来源/链接：arXiv。它比一般“闭环 AI Scientist”更靠近本题：论文明确把大气化学的**机理假设变成可执行配置、测试实验和 evidence criteria**，并把模型输出组织成“traceable evidence”；案例中系统不仅给结论，还能指出某条机理链证据不充分、缺少哪些诊断量。作者将其定位为 **auditable、structured mechanism validation**。这是本轮中文工作里与“可审计假设验证”语义最接近的一项。citeturn15academia25turn16view0  
但公开摘要能够确认的是“结构化证据标准+可审计工作流”，**不能确认**有你们这种 prediction-before-result 冻结、不可修改 prereg、机械 kill/scope 迁移或独立 meter；因此不能把“auditable”直接等同于你们的“model-external epistemic owner”。citeturn16view0

**多智能体驱动的机器人 AI 化学家 ChemAgents · 中国科学技术大学 · JACS/中科院官方介绍 · 2025 ·【论文/官方博客·高/中高】**  
来源/链接：中国科学院网信工作网对论文的官方介绍。ChemAgents 有一个任务管理 agent，协调文献阅读、实验设计、机器操控和计算执行四类 agent，其中实验设计包含**实验流程生成与逻辑验证**，计算侧做模型预测与迭代优化；执行最终落到真实机器人化学实验系统。citeturn14search2  
它的重要性在于严谨性并非纯聊天提示词：真实设备、实验操作和执行环境已经成为外部约束。不过公开机制显示的是**工程可执行性/逻辑验证结构**，还没有看到“预登记可证伪预测→冻结→观测→机械 claim 迁移”的认识论协议。citeturn14search2

**Stress-testing large language model agents in a robotic chemistry laboratory · 中国科大相关机器人化学实验体系 · arXiv · 2026 ·【论文·高】**  
来源/链接：arXiv。这个工作更像“严谨性诊断基准”而不是解决方案：45 个机器可读工作站、4,608 次试验中，仅 **3.3%** 试验产生专家认定可执行的工作流，最佳系统也只有 **28.1%**；尤其关键的是，连续五轮真实实验反馈虽然导致局部调整，却**没有产生 workflow-level replanning 或 analytical-method redesign**。citeturn23view0  
这给你们的核心主张提供了很强的国内实证邻接：**“有反馈”并不自动意味着“证据真的改变了下一轮研究计划”。** citeturn23view0

**结论。** 中文团队已经公开了“闭环”“逻辑验证”“证据标准”“可审计工作流”“真实实验执行约束”，因此不宜宣称国内没人做“科研严谨性”。但本轮**未找到**公开工作同时具备：**预测先于观测的不可变承诺 + 模型外指标重算 + 类型化假设迁移 + 终局逐项对账**。你们真正可守的创新边界应放在这组组合性质上，而不是“闭环/可验证/反馈迭代”三个词本身。fileciteturn0file1

## Q2 · 国内大厂与实验室 Auto-Science 是否有假设验证结构约束

**【找到若干“架构级验证闭环”；对阿里、智谱、Kimi、DeepSeek、字节逐项看，未找到公开的大厂方案采用预登记式认识论强约束。】**

**阿里云公开生态：塔山 Automatic General Scientist（AGS） · 阿里云官方活动报道 · 2025 ·【官方博客·中高】**  
来源/链接：阿里云官方。公开架构里，**decision agent** 聚合知识库并提出假设，**model agent** 做模拟验证，**experiment agent** 连接真实物理环境，**data agent** 定量分析数据并把结果反馈给假设修正；AutoAstro 也被描述为从假设生成到验证的闭环。citeturn3search0  
这已经超出单一 prompt，是明确的 role-separated scientific loop；但官方材料没有公开“假设状态只能依据预先冻结的判据迁移”“实验前冻结预测”“独立 ledger/meter 拒绝 agent 自报指标”等规则，因此它与贵方最近的共同点是**职责隔离和外部实验环境**，不是“belief discipline owner 外置”。citeturn3search0

**上海AI实验室 InternAgent / 原 NovelSeek · 项目官方页/arXiv · 2025–2026 ·【论文/官方博客·高/中高】**  
来源/链接：InternAgent 官方项目材料与 NovelSeek 论文。公开定位就是从**科学假设到验证的 closed-loop system**，通过多 agent 完成研究题目、假设、实验实现、结果反馈等长链路流程；它可视作 Dolphin 往更完整科研工程栈的延伸。citeturn6search8turn6academia42  
但这里的“verification”主要是端到端实验验证和多 agent 协同意义上的 verification。本轮公开材料中**未看到**预登记不可变承诺、外置 metric authority、typed claim transition 这一级的诚信结构。citeturn6search8turn6academia42

**智谱 AutoGLM 沉思 · 智谱产品公开报道/科技媒体 · 2025 ·【官方生态/媒体·中】**  
公开信息把它描述为 Deep Research 与 Operator 结合，强调深度思考、环境感知和工具调用；其能力目标是通用复杂任务，不是科学实验中的 hypothesis state machine。citeturn3search3turn3search1  
因此对“智谱有没有公开科研假设的预登记/证伪结构约束”这一更窄问题，本轮结论是 **【未找到】**；不能把“沉思/自反思”当成科研诚信机制。citeturn3search3turn3search1

**Kimi Deep Research / Kimi-Researcher · Kimi 官方帮助文档 · 2025–2026 ·【官方博客·中高】**  
Kimi 的公开机制确实会依据中间研究结果**动态调整检索/研究路径**，并执行长程多步研究；官方还披露了典型任务中的多轮推理、关键词和网页筛选行为。citeturn4search10  
然而它解决的是 information-seeking research，而不是“实验前可证伪承诺→真实结果→合法 belief transition”。因此属于**动态反馈规划**，不属于本题所指科研假设诚信结构。citeturn4search10

**DeepSeek ·【未找到】DeepSeek 官方公开的 Auto-Science scaffold。**  
本轮没有找到 DeepSeek 公司公开一个与 Dolphin/InternAgent 同类、带科学假设验证状态机的系统。“DeepScientist”这个名称容易误认，但检索到的公开论文并非 DeepSeek 公司发布的科研 Agent；因此不应以名字相近将其算作“DeepSeek 科研 agent”。citeturn3academia48 DeepSeek 模型可以成为其他中国科研 agent 的基础模型或代码模型，但那与“DeepSeek 官方提供结构化科研诚信机制”是两回事。

**字节“ds?” ·【未确认对应某个公开 Auto-Science 项目】。**  
本轮精确检索没有确认“字节 ds”是一个公开科研智能体名称。可确认且与本包问题相关的是复旦大学与 **ByteDance Seed** 的 Agent-R，但 Agent-R 是通用交互式 agent 的反思训练方法，不是 auto-science 系统；其结构价值放在 Q5 讨论。citeturn23view2

**总判断。** 国内大厂/实验室已经明显从“一个 LLM 自己想”走向 **角色拆分、工具执行、真实环境、反馈闭环、自动调试**；但公开材料仍普遍让 LLM/agent 解释“这个结果意味着什么”。贵方的区别恰在于：模型可以提出解释，但**不能拥有证据落账、指标真值和合法状态迁移本身**。fileciteturn0file1

## Q3 · XH-202619 同赛公开方案与“反馈迭代”做法

**【同赛其他参赛方案：未找到。】**

这不是“检索不到所以推测没有”，而是目前时间点本身非常关键：阿里云官方赛题 **XH-202619《基于国产开源大模型的 AI Scientist 的研发与应用》**要求方向一覆盖科学假设生成、研究方案设计、实验任务规划、数据分析和反馈迭代；技术材料还需展示项目 workflow、context engineering、代表案例、结果展示与反馈迭代，评分中也单列“结果校验、反馈迭代与稳定性设计”。官方当前的作品提交截止日是 **2026-09-05**，而本次检索日是 **2026-08-26**，即现在甚至尚未到提交截止日。citeturn1search3turn1search0

针对 **“XH-202619 + 方案/技术报告/反馈迭代”** 以及知乎、CSDN、掘金、微信公众号等渠道做了组合检索，目前出现的主要是官方赛题、官方解读和转发性赛事信息，**没有检索到能核实为某一参赛队正式公开的完整技术方案或可复现代码报告**。因此这里应严格写 **【未找到】**，不能把其他 AI Scientist 项目冒充“同赛竞品”。citeturn2search0turn2search1turn2search2

不过，对“大家可能怎样解反馈迭代”有两个**非同赛、但中文工作非常值得对照**的公开证据：

**Dolphin · ACL 2025 ·【论文·高；非同赛】**  
它直接把上一轮实验结果分析后 feed 到下一轮 idea generation，因此已经实现了一条显式的：

`experiment_t → result_analysis_t → idea_generation_(t+1)`

这比“在 prompt 里说请反思上一轮”明显更结构化。citeturn23view1  
但公开论文没有把这条边进一步写成：

`precommitted prediction_t × observed metric_t → deterministic belief transition_t → allowable plan_(t+1)`

也就是说，**Dolphin 固定了信息流的边，但没有固定“证据对信念的权限规则”**。后半句是基于论文公开机制与你们实现进行的结构比较。citeturn23view1 fileciteturn0file1

**中国科大机器人化学实验室压力测试 · arXiv 2026 ·【论文·高；非同赛】**  
它恰好对“五轮反馈能否真正重规划”进行了实测：实验反馈促使 agent 做了 local adjustments，却没有出现 workflow-level replanning 或 analytical-method redesign。citeturn23view0  
这对 XH-202619 很有价值，因为它把评分项“反馈迭代”拆成了两个完全不同的层次：**参数/局部动作修补**与**由证据引起的研究方案级重构**。赛题官方本身要求的是结果校验、反馈迭代与稳定性，而国内最新真实实验结果显示，现有 agent 很容易只做到前一种。citeturn23view0turn1search3

所以，对用户特别问的“**有没有人把结果→下一轮计划做成结构因果？**”：

**同赛公开材料：截至 2026-08-26，【未找到】。**  
**中文公开研究：找到结构化反馈边（Dolphin），但【未找到】证据表明有人把它进一步做成你们这种“结果只有经过预登记判据才能机械改变 hypothesis state，再决定下一轮合法动作”的 model-external 因果闸。** citeturn23view1 fileciteturn0file1

这也意味着比赛文案里最好避免泛称“我们首创反馈迭代”；更稳的是强调：**“把反馈从上下文信息变成带权限的状态迁移事件”**。公开中文闭环系统已经占据前一种表述空间。citeturn23view1turn3search0

## Q4 · 中文团队关于 LLM 科研幻觉、伪造内容的实证证据

**【找到科研文本/一般幻觉实证；直接针对“科研 Agent 伪造实验数值”的中文实证，未找到。】**

**CHEAT: A Large-scale Dataset for Detecting ChatGPT-writtEn AbsTracts · 暨南大学团队 · arXiv 2023 / IEEE Transactions on Big Data 2025 ·【论文·高】**  
来源/链接：arXiv；作者页面显示初版团队来自 Jinan University。团队构建了 **35,304 个 ChatGPT 合成学术摘要**，覆盖从完整生成到润色/混合等情形，并实测多类检测算法；关键结果是 AI 生成学术摘要虽然可检测，但**随着更多人类参与，检测难度上升**。这非常适合支持“科研产物表面自然、格式正确，并不能证明其生成过程可信”的动机。citeturn19academia18turn19search0

**HaluEval: A Large-Scale Hallucination Evaluation Benchmark for Large Language Models · 人大高瓴/RUCAIBox 等团队 · arXiv 2023 ·【论文·高】**  
来源/链接：arXiv。HaluEval 使用大规模生成样本加人工标注评测 LLM 幻觉，报告 ChatGPT 在特定主题的回答中约 **19.5%** 会通过捏造不可验证信息产生幻觉，而且现有 LLM 自身识别这些幻觉仍然困难；引入外部知识或更多推理步骤能改善识别。citeturn20academia46  
它不是“科研 agent 实验造假”专项研究，所以引用时宜表述为**中文团队对模型“会生成、又未必能自识别不可验证内容”的基础实证**，不要扩大成“证明科研 agent 会伪造实验数据”。citeturn20academia46

**Stress-testing large language model agents in a robotic chemistry laboratory · 中国科大真实实验体系 · arXiv 2026 ·【论文·高；科研 Agent 失败实证近邻】**  
严格说它研究的不是“造假”，而是**真实科学行动与证据驱动重规划失效**：4,608 次真实机器人实验压力测试中，只有 3.3% 生成专家判定可执行的 workflow，且五轮反馈也没有造成方案级重规划。citeturn23view0  
作为你们的动机材料，它可能比泛泛的“LLM 会幻觉”更贴题：它实证说明**语言层计划看起来完整，并不代表物理上可执行；收到实验反馈，也不代表 agent 已经按证据更新研究策略。** citeturn23view0

**《生成式人工智能技术对科研诚信建设的挑战及应对策略分析》 · 国内科研诚信/医学信息团队 · 中文期刊 · 2025 ·【论文·中高；非实证】**  
本轮 CNKI/中文期刊检索能找到不少把生成式 AI 的虚构内容、错误引用、责任归属等纳入“科研诚信”讨论的文章，但主要是规范分析/治理研究，而不是对科研 agent 轨迹进行定量实验；因此这类来源只能用于说明**国内科研诚信共同体已经把 GAI 真实性当作治理问题**，不能承担你们“结构闸有必要”的核心实证论据。citeturn8search3

**《第五科研范式下 AI 幻觉的生成逻辑、进阶样态与治理路径》 · 《重庆高教研究》/CNKI · 2026 ·【论文·中高；理论性】**  
文章直接把 AI4S 作为“第五科研范式”语境来讨论幻觉对科研可靠性的威胁，并提出结构性治理视角；但其方法属于理论建构而非 agent rollout 实验。citeturn18search4 因此它适合作为**中文语境问题定义**，不适合冒充实证。

**本题最重要的“未找到”也值得写进材料：**本轮没有找到中国团队已经发表的大规模实验，专门测量“科研 Agent 在执行数值实验时主动改写/伪造测量值、事后改变预测、把失败结果包装成支持”的发生率。中文工作目前更集中于 **一般 LLM 幻觉、学术文本合成、科研诚信治理、以及真实实验执行失败**。这恰好让你们已有的外部 meter、报告数字不采信模型、prereg-before-result 和 trace/reconcile gate 拥有比较清楚的实证研究空位。fileciteturn0file1

## Q5 · 中文“元认知 / 自纠 / 自我批判”Agent 是否超出提示词层

**【找到，而且这一题答案很明确：有。】**

**Agent-R: Training Language Model Agents to Reflect via Iterative Self-Training · 复旦大学 + ByteDance Seed · 2025/2026 ·【论文·高】**  
来源/链接：arXiv。Agent-R 不是简单在 system prompt 里写“反思一下”：它用 **MCTS** 从错误轨迹中构造“恢复到正确路径”的训练数据，由 actor 识别失败轨迹中的**第一个错误步骤**，再与树中相邻正确路径拼接形成 critique/correction 样本，进行迭代 self-training；三类交互环境中相对基线提升 **5.59%**。论文明确列出 Fudan University 与 ByteDance Seed。citeturn23view2  
因此这是非常干净的“**超提示词自纠**”证据：反思已经进入数据生成和训练算法。不过它解决的是“模型怎样学会从错误动作恢复”，不是“模型是否有权宣告一条科学假设已被证据支持”；认识论裁决权仍没有像你们那样独立出去。citeturn23view2 fileciteturn0file1

**SELF: Language-Driven Self-Evolution for Large Language Model · 华为诺亚方舟实验室/HKU 相关团队 · 2023–2024 ·【论文·高】**  
来源/链接：arXiv。SELF 把 self-feedback、self-refinement 变成可学习的 meta-skill：初期借助外部反馈形成训练信号，之后通过迭代生成、反馈、修订数据继续自演化，因此“自我批判”不仅存在于一次推理的 prompt 里，而进入了参数更新/数据闭环。citeturn11academia49turn12search4  
与贵方差异同样明确：它提高的是**生成策略自身的自纠能力**，而不是建立一个模型无法绕过的 scientific-belief transaction protocol。citeturn11academia49

**Verifiable Memory: Learning Unified Memory Management with Local and Global Verifiers for Large Language Model Agents · Sun 等 · arXiv 2026 ·【论文·高】**  
来源/链接：arXiv。这篇对“结构化元认知”尤其值得注意：它不是让 LLM 自由写一段 memory reflection，而是把长期记忆、活动上下文、episodic history 分成不同状态，并定义 **7 种原子 memory operations**；非法命令可被拒绝并记录原因，local verifier 评价单步 memory transition，global verifier 评价证据一致性和终局 memory consistency，同时叠加程序化 task/evidence/efficiency/constraint signals。citeturn16view1  
这是本轮 Q5 里与“**把认知动作变成有 schema、有 transition check 的动作**”最接近的工作之一。特别值得注意的是，论文显式区分有效、拒绝和 identity transition，并为违反约束的操作记 cost。citeturn16view1  
但它的 verifier **只在训练期使用，推理期移除**；所约束的也是 memory management 而非科研 claim/probe。因此它证明“结构化认知状态+检查器”在国内/中文团队相关 agent 研究里已经不是空白，但仍没有覆盖你们“运行期独立 owner + 科学证据许可状态迁移”的主张。citeturn16view1

所以 Q5 不宜写成“现有中文 self-reflection 都只是 prompting”。更准确的定位是：

> **训练侧的反思已结构化；memory/tool 侧也出现 typed operations 与 verifier。仍相对缺的是：在科研执行时，把“信念更新的合法性”作为模型外、持续在线、不可绕过的 transaction system。**

这一表述与 Agent-R、VerMem 都不冲突，同时更准确地落在你们已实现的 research-MCP owner、CLAIM/PROBE 状态机和 declare gates 上。citeturn23view2turn16view1 fileciteturn0file1

## 最接近的中文竞品/并行工作与净影响

**最接近的中文竞品/并行工作：**

| 工作 | 最接近你们的部分 | 关键差距 | 邻接判断 |
|---|---|---|---|
| **Dolphin** | 实验结果固定进入下一轮 idea generation，完整 auto-research loop | 未见预登记预测、外部真值 owner、机械 belief transition | **赛题“反馈迭代”最直接竞品** citeturn23view1 |
| **TianJi-Environ** | hypothesis→executable experiment→evidence criteria；强调 structured/auditable mechanism validation | 未确认 prediction-before-result freeze 与不可绕过外部裁决 | **“科研严谨/可审计”语义最近邻** citeturn16view0 |
| **中国科大 ChemAgents / 机器人实验室** | 真实设备约束、逻辑验证、物理执行、定量反馈；实测 feedback replanning 缺陷 | 工程/物理约束强，但未形成显式 belief-state contract | **现实实验闭环最近邻** citeturn14search2turn23view0 |
| **InternAgent / NovelSeek** | 假设到验证的多 agent 全闭环 | “验证”仍主要是 agent workflow 意义，未见诚信交易协议 | **端到端国产 ASR 竞品** citeturn6search8turn6academia42 |
| **Agent-R** | 反思不是 prompt，而是 MCTS+迭代训练形成的纠错能力 | 纠错策略仍由模型学习；不是运行期科学真值裁决 | **Q5 自纠机制最近邻** citeturn23view2 |
| **VerMem** | typed state、atomic operations、transition rejection、local/global verifier | verifier 训练期使用；对象是 memory 而非 scientific belief | **结构哲学最近邻** citeturn16view1 |

若只能选一个“最接近的中文竞品”，**竞赛叙事上是 Dolphin**：因为它已经明确占住了“上一轮实验结果→下一轮研究 idea”的闭环表达。citeturn23view1 若按你们真正的技术创新点“**结构化、可审计地限制证据如何改变认知状态**”来选，则 **TianJi-Environ + VerMem** 更值得重点防重：前者占“structured/auditable evidence validation”，后者占“typed state + transition verification”。citeturn16view0turn16view1

**净影响（≤120字）：**  
中文工作已覆盖科研闭环、物理约束、可审计验证和训练式自纠，但未见把“预测先于结果—外部计量—机械信念迁移—终局对账”合成运行期模型外诚信协议；差异化仍成立，但不能再把“闭环/反馈”本身当创新。