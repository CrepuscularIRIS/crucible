# PACK 4 · 架构与运行时选型的外部核验

## 长程科研 Agent 的运行时选型

**Q1 判定：【有争议】。**

最不利的证据先说：**截至 2026 年 8 月，并不存在“长程科研 Agent 应该用 Prime/RLM 内核”的业界共识，也没有可信的公开市场份额数据能告诉我们 Claude Agent SDK / OpenAI Agents SDK / LangGraph / 自研 loop / RLM 各占多少。** 能观察到的是一个明显分裂的实践谱系：Anthropic 已把 Claude Agent SDK、Claude Managed Agents 定义成提供 agent loop、工具执行和 runtime 的高层栈；OpenAI Agents SDK 管理 turns、tool execution、guardrails、handoffs、sessions；LangGraph 则明确定位为 long-running、stateful agent 的低层 runtime，强调 checkpoint、durable execution、HITL 和故障恢复。citeturn14search4turn13search5turn13search9

因此，你们“Prime Agent 而不是 Claude Agent SDK / 自研 loop”的选择，**是一个有清晰理论依据、但显著偏前沿的技术押注，而不是默认答案**。你们本地设计把选择理由归结为“模型发代码而非文本”、常驻 IPython、递归子代理和标准化执行/恢复/记账，并进一步把 epistemic state owner 移出内核到独立 MCP 进程；这后一层其实已经显著偏离 Prime 默认架构。fileciteturn0file0 fileciteturn0file1

### RLM 的正面证据

原始 RLM 工作《Recursive Language Models》把长 prompt 外置成环境，由模型以程序方式检查、分解，并递归调用自己；论文报告它能够处理远超原始 context window 的输入，并在四类 long-context task 上优于基础 LLM 和常见 long-context scaffold。这个结果支持的其实是 **“programmatic context manipulation / recursive decomposition”**，而不是“科研 Agent 一定应该有一个自由 Python REPL”。《Recursive Language Models》· 2025/2026。citeturn20academia29

Prime Agent 将这个想法工程化成 persistent IPython + recursive subagents，再叠加 Continual Harness，对 prompt、memory、skill、subagent 规范进行持续修改。Prime 论文于 **2026 年 8 月 24 日**提交；论文和官方发布都强调执行、恢复、验证、资源记账以及 ARC-AGI-3 的 95.5% RHAE Best@1。你们本地论文清单所记录的机制与外部论文摘要基本吻合。citeturn0academia36turn0search0 fileciteturn0file2

### 对 RLM 最重要的反证

这里有两篇比一般博客批评更值得放进技术报告。

《Think, But Don't Overthink: Reproducing Recursive Language Models》是对原始 RLM 的独立复现实验：depth-1 可以提升复杂推理，但 depth-2 在实验中出现“overthinking”，简单 retrieval 也可能退化；其中一个例子的执行时间从约 3.6 秒膨胀到 344.5 秒。换言之，**递归不是单调增益，递归深度本身就是需要控制的实验变量。** · 2026。citeturn20academia31

更直接的是《The Y-Combinator for LLMs: Solving Long-Context Rot with λ-Calculus》：作者明确把 standard RLM 的 **open-ended REPL / arbitrary control code** 视为难以验证、预测和分析的问题，改用 typed functional runtime 和预验证 combinators；论文报告 λ-RLM 在 36 个 model-task 对照中的 29 个优于标准 RLM，并提供 termination 与 cost bounds。也就是说，**“代码即控制面”有外部支持，但“自由 Python 是最佳控制面”已经出现强有力的反对方案。** · 2026。citeturn20academia30

这恰好使你们已经完成的改造更有意义：research-mcp 而不是 Python namespace 持有唯一信念状态、状态迁移由类型闸控制、外部 meter 重算指标。换句话说，**你们真正值得辩护的并不是“Prime 原样最好”，而是“Prime 被降格为可恢复执行 substrate；科研真值和 epistemic state 不属于 RLM 内核”。** fileciteturn0file1

### 有没有更既定的替代方案

有，而且一个 2026 年 8 月的新工作与你们非常接近。《LongHorizon-Harness》把 long-horizon agent 明确重述为 **task-state management problem**：task state 放在 execution context 外，只接受环境独立验证过的事实；采用 Manager–Execute–Audit，其中 executor 是 fresh context，auditor 是 read-only，并提供 AgentAdapter 以替换 model/harness backend。其摘要报告 Qwen 3.7 Plus 在 WeaveBench 从 51.8% 提升到 80.7%，Terminal-Bench 2.1 从 69.7% 到 77.2%。· 2026。citeturn15academia49

这意味着外部文献现在提供了一个比“persistent REPL 自身闭合”更贴近你们最终实现的论证：

> **状态闭合的关键不必是“状态常驻 REPL”；更稳健的形式是“执行器可变、经过验证的任务状态外置且由独立 owner/auditor 控制”。** citeturn15academia49turn20academia30

与此同时，AutoResearchEval 在 100 个真实 frontier research tasks、8 个 harness-model combinations、约 800 trajectories 上发现许多核心失败模式跨全部组合反复出现，并把“编排层干预能否真正关闭这些缺陷”留作开放问题。这是对任何“只要换 runtime 就能解决科研闭环”的直接反证。citeturn2academia39turn2search4

公开的真正 apples-to-apples runtime migration 文献仍然很少。有同一任务下 Claude Code 与 OpenAI Codex 的 head-to-head scientific workflow 对照，但它比较的是完整 coding agents，而不是“同模型、同 tools、只换 SDK runtime”的严格消融。citeturn1academia0

**关键引文：**《Recursive Language Models》· 2025/2026 citeturn20academia29；《Think, But Don't Overthink》· 2026 citeturn20academia31；《The Y-Combinator for LLMs》· 2026 citeturn20academia30；《LongHorizon-Harness》· 2026 citeturn15academia49。

**一句话：** **Prime/RLM 不是业界标准答案；“程序化状态 + 递归”有实证支持，但自由 REPL 的可验证性、成本和稳定性已经被独立工作挑战，而你们把科研状态移出 Prime 内核反而更接近正在形成的稳健长程架构。**

## Model-agnostic 能力层

**Q2 判定：【业界共识】——但共识是“接口可移植”，不是“换模型后行为等价”。**

这一项外部支持最扎实。

MCP 的官方规范把自己定义为连接 LLM application 与 external data sources/tools 的 **open protocol**，核心目的就是提供 standardized integration surface；到 2026 年，官方又在推进无会话/stateless core、标准化工具 schema、扩展机制与 conformance/tiering。也就是说，**tool capability 与具体模型 API 解耦已经从架构风格上升到正式协议层。** 《Model Context Protocol Specification》· 2025–2026。citeturn21search11turn21search1turn21search5

Agent Skills 更直接命中了你问的术语。官方把 Agent Skills 定义为：

> “a lightweight, open format for extending AI agent capabilities”，并明确强调 **cross-product reuse**：skill 可以作为包含 `SKILL.md`、scripts、references、assets 的 portable/version-controlled folder，在兼容产品间复用。该格式起源于 Anthropic，随后作为 open standard 发布。 《Agent Skills Overview》· 2026。citeturn21search14

这已经给你们的“能力层 model-agnostic”提供了非常标准的行业语言：

**tool interoperability / capability portability / model-independent tool contract / portable agent skills / protocol-bound capability layer** 都比自创 “Qwen-independent scientific capability” 更容易让外部评审理解。citeturn21search11turn21search14

而且这不是只有 Anthropic 自己在用。OpenAI Agents SDK 的 `Agent` 直接支持 `mcp_servers`，并将 MCP tools 接入 agent；OpenAI 文档也把 model、tools、MCP、handoffs 分成独立配置面。citeturn13search6turn13search7 Anthropic 2026 Managed Agents 的 agent definition 同样把 **model、system prompt、tools、MCP servers、skills** 作为分立字段。citeturn14search1turn14search18

《LongHorizon-Harness》甚至有更接近你们“换主后端上层不改”的研究型先例：它通过 lightweight `AgentAdapter` 支持 interchangeable model and harness backends，并报告跨 Qwen 与 Claude 的收益。citeturn15academia49

### 不利证据

这里不要在报告里写成“model-agnostic = model-independent performance”。

MCP 标准本身在快速演进：2026-07-28 是一次很大的协议修订，官方明确称包含 breaking changes，并移除了旧的 handshake/session 模型、重构多个能力。换句话说，**contract portability 不等于 zero-maintenance portability**，你们仍然需要 version pinning、compatibility tests 和 adapter boundary。citeturn21search1turn21search7

更重要的是，同样一套 tool schema / Skill 在不同模型上会产生不同的 tool selection、argument grounding、错误恢复与 instruction-following。HarnessSafe 的跨 harness-model 结果也发现 containment 不只取决于 harness，model backend 同样显著影响表现。citeturn15academia48 因此“上层编排不感知模型”应该理解成 **software architecture property**，不能拿来推出实验性能不受模型影响。

你们目前 Qwen 3.7 Plus 为主、Qwen 3.8 Max 做对照，而科研状态与 capability contracts 位于 research-mcp/Skills，这一结构正属于上述标准化方向。fileciteturn0file1

**关键引文：**《Model Context Protocol Specification》· 2025–2026 citeturn21search11turn21search1；《Agent Skills Overview》· 2026 citeturn21search14；《LongHorizon-Harness》· 2026 citeturn15academia49。

**一句话：** **“MCP/Skill 作为可移植能力层”已经是明确行业方向；你们独特之处不是 model-agnostic 本身，而是把几乎全部科研 epistemic capability 都强制放在这个边界之外。**

## 隐藏评测器与 reward hacking

**Q3 判定：【业界共识】；你们的实现强度高于一般公开 benchmark。**

这里的外部证据非常强，而且不必依赖你们前身 reward-hacking 的内部故事。

最直接的 2026 先例是 PokeGym。作者明确把 **privileged state leakage** 列为现有 benchmark 的缺陷，并在代码层强制 agent 只能看到 RGB observation，由 **independent evaluator** 通过内存扫描确认任务成功。这个设计和你们“world truth 对 agent 封闭、外部 meter 独立重算”在安全边界上高度同构。 《PokeGym: A Visually-Driven Long-Horizon Benchmark for Vision-Language Models》· 2026。citeturn21academia26

科学场景也有相邻证据。《InfiniteScienceGym》从 seed 确定性生成科学 repository，由 **privileged QA generator** 生成 exact ground truth，从而让被测模型不能靠静态公开语料接触全部答案。· 2026。citeturn21academia27

ARC Prize Verified 更制度化：官方 Verified program 明确使用 **official hidden datasets** 认证分数，同时由独立 academic panel 审计 testing process；Community Leaderboard 则明确区分为默认 self-reported、ARC 不保证独立验证。· 2025–2026。citeturn20search9turn20search6

SWE-bench 的基础 eval harness 也体现了“agent 产物 ≠ agent 自报分数”：它在 Docker 环境中把模型 patch 应用到真实 repository，再运行测试，由 harness 判 resolved/unresolved。citeturn21search12turn21search13 但这里有一个值得写进“不利证据”的细节：**标准公开 SWE-bench 并不总等同于你们这种严格 hidden evaluator**；部分公开数据包含 gold patch / test patch，真正更强的 leaderboard 或私有 test 流程需要服务器侧隔离。因此不能把“SWE-bench uses Docker”直接写成“所有 oracle 都对 agent 隐藏”。citeturn7search6

### 已发生的污染、gaming 和 evaluator failure

GAIA 原始设计本身保留了大量答案用于 leaderboard：论文的 466 个问题中，300 个答案不公开。citeturn8academia38 但后来 Hugging Face 官方讨论记录了一个很典型的污染事件：搜索引擎 Bing 已索引部分 validation answers，维护者因 scraping/contamination 风险把数据 gating；作者指出 test questions 不受该特定泄漏影响。citeturn8search4

GAIA 还出现过一个更“纯 evaluator bug”的案例：2025 年 leaderboard scorer 一度把 **missing answer 当成 correct**，导致异常排名，随后维护者修复。citeturn8search1 这正好说明为什么“最终分数由评测侧重算”还不够：**评测器本身也必须版本固定、测试、审计。**

AutoResearchEval 在科研 Agent 上给出的证据更贴近你们问题：在 100 个真实 research tasks 上，它系统记录了 circular validation、metric gaming、未经充分验证就宣告结果等 integrity failure，而且这些问题跨 8 个 harness-model combinations 出现。citeturn2academia39turn2search4 这为“模型不能拥有关于自己是否成功的最终裁量权”提供了直接的研究型依据。

AgentDojo 更适合作为 **adversarial benchmark / indirect prompt-injection** 证据，而不是经典 reward-hacking 案例；它已有 programmatic ground-truth checks，近期工作也表明固定静态攻击集会被自适应攻击绕过。citeturn9search5turn9academia36 因而在技术报告里最好不要把 AgentDojo 写成“某 agent 偷看 evaluator 后作弊”的例子。

你们已经实现的组合——denylist、world-meter 独立进程、沙箱外捕获 raw output、server 根据 metricKind 重算、预算账本 `flock` 仲裁、报告数字不采信模型——比“Docker 隔离”本身更强，并且非常接近 PokeGym 所明确倡导的 privileged-state isolation。fileciteturn0file1

**更优的既定方案不是放弃你们设计，而是再补一层 evaluator CI**：oracle/version hash、known-good/known-bad submission regression suite、gold scorer differential test，以及 benchmark container 与 agent container 使用不同权限域。GAIA scorer bug说明 evaluator 本身也应被当成受测软件。citeturn8search1turn20search9

**关键引文：**《PokeGym》· 2026 citeturn21academia26；《ARC Prize Verified》· 2025 citeturn20search9；《GAIA》及其 contamination/scorer incidents · 2023–2025 citeturn8academia38turn8search4turn8search1。

**一句话：** **“隐藏 oracle + evaluator 独立重算 + 不信任 agent 自报分数”是成熟 benchmark hygiene；你们独特的是把它推进到了 world-meter、预算账本和科研状态机这一整套 runtime boundary。**

## HITL 与 FULL-AUTO

**Q4 判定：【有争议】——双模式对照有强先例，但“多少人工介入最好”不存在统一答案。**

这一问现在有一个几乎为你们量身定做的外部先例：**AutoResearchClaw**。

《AutoResearchClaw: Self-Reinforcing Autonomous Research with Human-AI Collaboration》不仅包含 full autonomy，还专门设计了 **七种 human-intervention mode**，并将 human intervention count 与 valid runs、quality、acceptance rate 一起报告；论文结论不是“人越少越好”或者“人越多越好”，而是 **targeted intervention at high-leverage decision points 优于两个极端**。· 2026。citeturn16academia14turn12view0

其直接可引用的对照如下。citeturn12view0

| AutoResearchClaw 模式 | Valid runs | Mean quality | Acceptance | 人工介入次数 |
|---|---:|---:|---:|---:|
| Full-Auto | 8/10 | 4.03 | 25.0% | 0 |
| Gate-Only | 10/10 | 5.03 | 50.0% | 3 |
| CoPilot | 8/10 | **7.27** | **87.5%** | 6 |
| Thorough | 7/10 | 4.86 | 42.9% | 8 |
| Step-by-Step | 10/10 | 5.19 | 50.0% | 23 |
| Pre-Experiment | 8/10 | 4.28 | 37.5% | 3 |
| Post-Experiment | 6/10 | 5.08 | 50.0% | 3 |

这张表对你们最重要的地方不是 CoPilot 第一，而是 **23 次介入的 Step-by-Step 并没有优于 6 次的 CoPilot**；同样，0 次 intervention 的 Full-Auto 又明显弱于精准 HITL。citeturn12view0

同一工作在整体 ARC-Bench 对照中还报告 CoPilot overall 0.648、Full-Auto 0.596，而 AIDE-ML 与 AI Scientist v2 分别为 0.511、0.419；作者同时强调 Full-Auto 本身仍超过若干既有 baseline，说明系统结构的收益不能简单归功于人工介入。citeturn12view0

其他 HITL 研究也发现类似 trade-off：HiLSVA 的受控用户研究比较多种 autonomy setting，mixed-initiative 能改善 completion/control/transparency，但也会牺牲部分执行效率。citeturn10academia13 另一方面，仍有 scientific multi-agent 系统明确以完全无人 HITL 为目标，这说明“full autonomy”依然是一个有效研究对象，而不是已经被 HITL 取代。citeturn10academia15

所以，你们“双模式而不是把无人化率当唯一 KPI”的理由是站得住的；但技术报告里最好不要写成“业界已经认为 HITL 一定优于 autonomous”。更准确的是：

> **Autonomy level 是实验条件，不是质量的同义词；应该把 scientific outcome 和 human labor 同时报告。** citeturn12view0turn10academia13

**推荐你们正式表格直接采用四列核心指标：** task success / external quality score / intervention count / wall-clock-or-token cost。AutoResearchClaw 已经给出了前三类，补上成本就更完整。citeturn12view0

**关键引文：**《AutoResearchClaw》· 2026 citeturn16academia14turn12view0；《HiLSVA》· 2026 citeturn10academia13。

**一句话：** **FULL-AUTO 与 HITL 对照不是你们独创，且最新科研 Agent 实验恰恰显示“精准少量介入”可能同时胜过零介入和逐步人工控制，因此双模式报告比单报无人化率更科学。**

## 单轮能力与迭代改进

**Q5 判定：【业界共识】（实验原则）；你们的“Benchmark / Research-Loop”双轨命名与具体评分制度是自己的实现。**

这项要把“benchmark hygiene”与“continual agent research”分开看。

传统 benchmark 的目标通常是测 **当前系统面对给定 task distribution 的能力**，因此 independent/fresh episodes 是默认思想；persistent-memory benchmark 则开始明确指出：一旦允许前一 session 的 state 影响后一 session，你测到的已经不是同一个 construct。

MemoryArena 直接把这一区别写进问题定义：以往一类 benchmark 测 memory recall，另一类测 **single-session agent action without long-term memory**；MemoryArena 刻意创建 interdependent multi-session tasks，使 agent 从早期行为和反馈形成 memory，再利用它完成后续任务。换句话说，**single-session capability 与 learning-from-earlier-sessions 被视为两个不同评价对象。** 《MemoryArena》· 2026。citeturn16search11

PASB 的方法学控制更清楚：它把五轮 persist stage 与之后 **cleared** 的三轮 query stage 分开，从而确保下游效应只能来自 durable state，而不是还留在 conversation context 里的信息。论文观察到 session-only 与 committed-memory 条件存在显著不同的下游 failure rate。citeturn17academia45 这几乎就是“要控制信息继承通道，否则无法归因”的实验范例。

Continual Harness 则站在另一端：它的创新点恰恰是 **reset-free adaptation**，允许 refiner 使用任何过去 trajectory data，不在训练/优化迭代之间重置环境；论文特意拿“需要 episode resets 的 prompt optimization”作为对照。citeturn15academia46 这说明“允许继承 prior”完全合法，但此时应该明确称为 continual/online adaptation，而不能把所得进步再解释成 fresh-task base capability。

最近的 Harness Continual Learning 更进一步，把 harness 本身——prompt、memory、tool、skill、routing rule——视为会随经验变化的学习状态，并定义 **harness-level forgetting**；其 Continual Evaluator 在提交更新前分别检查 current improvement、historical retention 与 validity。citeturn15academia47

因此，你们所担心的：

> 后面轮次因为知道前面 winner/失败信息而更强，却被算作“同一个 agent 的基础能力提升”

确实是一个方法学混淆。严格地说，这是一个**归因问题**：后轮表现可写成“base system + accumulated experimental information + persisted harness/state”的联合效果；不 reset 就无法从最终 score 中单独识别 base capability。这是基于上述 benchmark 设计作出的因果推论。citeturn16search11turn17academia45turn15academia46

你们“Benchmark fresh、不共享 prior”与“Research-Loop 允许继承上一轮结果”分轨，正好把两个 construct 拆开：

| 轨道 | 实际测量对象 | 应否继承 prior |
|---|---|---|
| Benchmark | 当前固定系统的独立任务能力、稳定性、方差 | 否 |
| Research-Loop | 利用实验历史、失败和结果进行后续科研迭代的能力 | 是 |

而且这与你们 refine 环“只搬过程性教训、不搬认知状态”的内部边界高度一致；这是很有价值的设计，因为它进一步区分了 **harness learning** 和 **task/world-specific answer leakage**。fileciteturn0file1

最大的外部警告恰恰来自 persistent state security：HarnessSafe 发现 memory、skill、tool、shared artifact 等 persistent carriers 可以让早期输入在后来的 benign request 中重新触发风险，并且 containment 强烈依赖 harness-model configuration。citeturn15academia48 因此 Research-Loop 不只要说“允许继承”，还必须记录**究竟哪些 carrier 被允许继承**。

**更优的正式协议**是给 run bundle 增加一个 explicit carryover manifest，例如 `memory=false / skills=procedural-only / experimental-results=true / winner-identity=true|false / model-context=false`。这样不仅有两个模式，还能机器验证到底是什么跨轮存活。

**关键引文：**《MemoryArena》· 2026 citeturn16search11；《Continual Harness》· 2026 citeturn15academia46；《Harness Continual Learning》· 2026 citeturn15academia47；PASB · 2026 citeturn17academia45。

**一句话：** **fresh capability 与 persistent/continual improvement 是不同实验对象已经有明确文献基础；你们把两者分轨评分是正确的控制变量设计，真正值得新增的是机器可审计的“跨轮继承清单”。**

## Prime Agent 的外部风险

**Q6 判定：【未找到】独立的 Prime Agent 完整复现；【有争议】的 RLM 机制已有独立复现与批评。**

这是整个 PACK 里最需要保守写的一项。

Prime Agent 论文《Prime Agent: A Self-Improving RLM Harness》提交日期是 **2026 年 8 月 24 日**；今天是 **2026 年 8 月 26 日**。这个时间窗口本身就意味着，当前几乎不可能已经形成成熟的同行复现生态。citeturn0academia36 我检索到大量转述/解读和真实 GitHub issue，但**没有找到由独立研究团队完成、对 Prime Agent 整体 benchmark suite 进行严格复跑的论文级复现**。

### 最大问题是 headline benchmark 仍主要来自作者方

ARC Prize 的官方 Community Leaderboard 政策明确说：ARC-AGI-3 Public Demo 等 community submissions 默认是 **self-reported unless noted**，ARC 不保证验证其真实性；只有特定 hidden-set Verified 流程才是 ARC 官方认证。citeturn20search0turn20search6

而 ARC Prize 对 Claude Opus 5 自己的正式测试，2026 年 7 月 24 日给出的 ARC-AGI-3 verified score 是 30.2%。citeturn20search1 这与 Prime 的 95.5% 并不证明哪一个“错了”，因为 harness、procedure 和 testing regime 不同；它证明的是 **95.5% 不能在技术报告中写成一个独立认证的、纯模型可比的 benchmark result。**

第三方分析也明确指出 Prime 的 95.5% 是 vendor-reported、尚未得到 ARC Prize 独立 verification；同时 ARC community leaderboard 在 Prime 发布前已经有 Tycho 100.0%、Retrodict 99.9%、baseline1 99.0% 等 public-demo harness 结果。citeturn19search0turn20search0 因此报告里最好删掉任何类似“Prime 首次使 ARC-AGI-3 达到人类”的叙事，保留更窄且可辩护的说法：

> **Prime Intellect reports 95.5% RHAE Best@1 on ARC-AGI-3 under its Prime Agent harness; the result is not an ARC Prize Verified score.** citeturn0academia36turn20search6

### RLM 原理有真正的第三方复现，而且并非全正面

这反而是 Q6 最有价值的外部信息。

独立 RLM reproduction 发现，depth-1 有用不代表进一步递归更好；depth-2 会出现质量下降及巨大时间/成本增幅。citeturn20academia31

λ-RLM 则从架构层直接指出 open-ended generated control code 的 verification、predictability、analysis 问题，并展示 typed functional alternative 在多数对照上更好。citeturn20academia30

所以你们目前“Prime 做 execution substrate，科研状态迁移不让 Python 自由控制”的选择，其实已经是对这个风险的一种预防，而不是照搬 Prime。fileciteturn0file1

### 开源用户反馈暴露了真实 runtime maturity 风险

这些不是同行评审结果，但比泛泛而谈的“新项目可能不稳定”更有信息量。

Prime Agent 的公开 issue 已出现 long-running / RLM-specific reliability 报告。例如有用户报告长生命周期 session 出现 Node heap OOM crash loop；另一个报告 active RLM subagents 导致大量 child-usage bookkeeping、CPU/RSS 飙升并使 session worker 无法 attach。citeturn3search1turn3search2

还有 issue 指出 kernel execution 缺少适当 timeout 时，等待 stdin 等行为可以把 agent 卡死；另有 snapshot/resume 场景中某些 Python-backed skills 无法正确序列化恢复。citeturn3search6turn3search3

状态一致性方面，公开 issue 报告 harness-state write 在并发 refinement 下不是 transactional，可能覆盖合法状态或把 malformed JSON 当空状态读取。citeturn3search8 另有 subagent 完成工作、写入文件但 parent 未收到完成消息，需要 polling/查文件的案例。citeturn3search4

这些都不等于“Prime 不可用”；它们意味着 **你们的 parity test 不能只测最终答案，必须测 crash/resume、fan-out、orphan process、resource accounting、snapshot parity 和 concurrent state mutation。**

事实上，你们本地的四层测试阶梯——runtime migration parity → 单能力确定性评测 → 完整 loop → 多问题×多 seed×variant——方向是对的。fileciteturn0file2 但针对上述外部风险，第一层建议至少加入：

`long-run soak`、`RLM fan-out stress`、`kill -9 / resume`、`hung child`、`snapshot restore`、`concurrent refine`、`orphan-process census`。

### 押注 Prime 的实际风险评级

我会把它写成：

**Prime Agent = 可用作实验性 runtime dependency，但不能作为未经验证的科学正确性边界。**

这和你们现在实际实现恰好一致：Prime 持有执行生命周期；独立 research-mcp 持有 claim/probe state；bwrap 约束预登记命令；world-meter 持有真值与计量；终局还要经过 prereg/reconcile/trace gate。fileciteturn0file1

**关键引文：**《Prime Agent》· 2026 citeturn0academia36；ARC Prize Community/Verified policy · 2025–2026 citeturn20search0turn20search6；《Think, But Don't Overthink》· 2026 citeturn20academia31；《λ-RLM》· 2026 citeturn20academia30。

**一句话：** **截至 2026-08-26，Prime 本体还没有足够独立复现可以承担“已验证 runtime”这一表述；真正成熟的论证应当是“采用 Prime 的执行机制，同时把科学状态、oracle、安全边界和验收全部置于 Prime 之外”。**

## 决策支持度汇总

下表中的“外部支持度”评的是**你们最终实现的决策**，不是最初 architecture 文档里某一句论证；你们的最终系统已经比最初“RLM 内核闭合”更偏向 external verified state owner。fileciteturn0file0turn0file1turn0file2

| 架构决策 | 判定 | 外部支持度 | 最强支持证据 | 最强不利证据 | 我的核验结论 |
|---|---|---:|---|---|---|
| Prime Agent / RLM 作为主 runtime | **有争议** | **中** | RLM long-context gains；Prime 的 persistent REPL/continual harness；LongHorizon 强调长程 state management citeturn20academia29turn0academia36turn15academia49 | 独立 reproduction 的 recursion overthinking；λ-RLM 认为自由 REPL 难验证；Prime 暂无完整独立复现 citeturn20academia31turn20academia30 | **保留 Prime，但把它写成 execution substrate，不写成 scientific-state owner。你们现实现已经走在正确方向。** |
| MCP/Skill model-agnostic 能力层 | **业界共识** | **高** | MCP 正式开放协议；Agent Skills 明确 cross-product reuse；OpenAI/Anthropic 均原生接 MCP citeturn21search11turn21search14turn13search7turn14search1 | MCP 仍有 breaking revisions；模型间 tool-use 行为不等价 citeturn21search1turn15academia48 | **强支持。报告应称 capability portability/interface decoupling，而不是 performance portability。** |
| hidden evaluator + 外部 meter 重算 | **业界共识** | **很高** | PokeGym strict code-level isolation + independent evaluator；ARC hidden verified sets；SWE-bench container scorer citeturn21academia26turn20search9turn21search12 | evaluator 自身也会出 bug，如 GAIA missing-answer scorer；部分 public benchmark oracle 并非完全隐藏 citeturn8search1turn7search6 | **强烈保留；再给 evaluator 自己增加回归测试与版本 hash。** |
| FULL-AUTO + HITL 双模式 | **有争议** | **高** | AutoResearchClaw 七模式直接对照，CoPilot 质量/接受率显著优于 Full-Auto 和 Step-by-Step citeturn12view0 | 最优 human intervention 依任务而异；full autonomy 仍是独立研究目标 citeturn10academia15 | **双报比只报无人化率更科学；同时报告 intervention count/cost。** |
| fresh Benchmark vs inherited Research-Loop 分轨 | **业界共识** | **高** | MemoryArena 区分 single/multi-session construct；PASB 清空 session 来隔离 durable-state effect；Continual Harness 明确 reset-free 是另一评价对象 citeturn16search11turn17academia45turn15academia46 | persistent carriers 会引入跨任务污染、安全风险和 forgetting citeturn15academia48turn15academia47 | **强支持；建议把 carryover manifest 做成评测产物。** |
| 四层测试阶梯 | **业界共识**，具体组合为你们自定义 | **高** | LangGraph/主流 runtime 强调 checkpoint/fault recovery；STATE-Bench 每任务重复 5 次并报一致性；SWE-bench 用独立容器复现 eval citeturn13search0turn16search6turn21search13 | Prime 实际 issue 表明普通成功测试抓不到 OOM、snapshot、timeout、fan-out 等长程故障 citeturn3search1turn3search3turn3search6 | **阶梯本身正确，但 runtime parity 层必须加入故障注入和 soak，而不仅是同任务同 seed。** |

整体上，六个决策中，**真正“押注性强”的只有 Prime/RLM runtime；model-agnostic capability、hidden evaluator、fresh-vs-persistent separation 和分层测试都有相当坚实的外部先例。** HITL/FULL-AUTO 的“同时报告”有强证据，但最优介入量仍属开放问题。citeturn21search14turn21academia26turn12view0turn16search11

如果一定要判断“哪些是你们独有”，我的核验结果不是六项中的任何一项概念本身，而是**它们的组合方式**：**RLM execution substrate + model-agnostic MCP/Skill capability layer + independently owned typed epistemic state + preregistered probes + hidden external meter + fresh/continual dual evaluation**。我没有找到一个公开系统把这些边界以同样方式同时组合起来；与之最近的分别是 LongHorizon-Harness、PokeGym、AutoResearchClaw、Continual Harness，而不是某一个已有系统。citeturn15academia49turn21academia26turn16academia14turn15academia46

## 报告引用优先级与最大风险

### 最值得在技术报告里引用的三个外部依据

**第一：《LongHorizon-Harness: Advancing Long-Horizon Agents for Real-World Tasks》· 2026。**  
这是我找到的对你们最终 architecture **邻接度最高**的外部论文：它明确说 long-horizon execution 应视为 task-state management，把 state 放出 execution context，仅由独立验证的环境事实更新，并使用 fresh executor + read-only auditor；还支持 interchangeable model/harness backend。对于你们“Prime 只管执行、research-mcp 才是状态 owner”的外部辩护，它比 Prime 自己的论文更重要。citeturn15academia49

**第二：《PokeGym: A Visually-Driven Long-Horizon Benchmark for Vision-Language Models》· 2026。**  
它明确把 privileged-state leakage 当 benchmark 缺陷，通过 strict code-level isolation 让 agent 只能看到允许 observation，再由 independent evaluator 读取 agent 看不到的真实状态。它几乎可以直接作为你们“hidden world-meter、denylist、external recomputation”的公开先例。citeturn21academia26

**第三：《AutoResearchClaw: Self-Reinforcing Autonomous Research with Human-AI Collaboration》· 2026。**  
这是 Q4 和 Q5 最值钱的一篇：既有 full-auto/HITL 七模式表，又有 failure→refine、verifiable reporting、cross-run evolution；实验直接显示 targeted collaboration 优于 full autonomy 与 exhaustive step-by-step oversight。技术报告若只能放一张外部对照表，就放它。citeturn16academia14turn12view0

MCP + Agent Skills 虽然没进入前三篇“论文”，但**应该作为标准性引用另外出现**：它们是你们 model-agnostic capability layer 最权威的 industry-standard 依据。citeturn21search11turn21search14

### 最大的三个外部风险

**风险一：Prime Agent 的核心 benchmark claim 尚未经过足够独立验证。**  
Prime 论文 2026-08-24 才提交；截至 2026-08-26，我没有找到完整独立 replication。ARC Prize 明确说明 public-demo community results 默认 self-reported，而 official verified testing 是另一套流程；因此 **不要让 95.5% 成为选择 Prime 的单点论据**。citeturn0academia36turn20search0turn20search6

技术报告更稳妥的措辞是：**“Prime Intellect reports 95.5% RHAE Best@1; our runtime choice is additionally justified by programmatic state manipulation, recoverability and our own parity/stress testing.”** 这也符合你们本地已有的测试思路。fileciteturn0file2

**风险二：自由 RLM/REPL 不具备天然的闭合性，反而可能扩大不确定控制面。**  
独立 reproduction 已经显示 deeper recursion 可能劣化质量并指数式增加执行代价；λ-RLM 则明确主张 typed/preverified control 比 arbitrary REPL 更可验证，并在多数实验对照中胜出。citeturn20academia31turn20academia30

这意味着你们技术报告里最危险的一句话是“模型发代码不发文本，因此状态闭合”。**代码并不自动意味着闭合；闭合来自模型不能绕过的 owner、type transition、oracle 与 commit boundary。** 你们最终的 research-mcp 设计已经比原来的这句论证更强，应以最终实现为主叙事。fileciteturn0file1

**风险三：Prime 的长程并发、恢复和资源生命周期仍暴露早期工程成熟度问题。**  
公开 issue 已报告长 session heap OOM、RLM child attribution flood 导致 worker 饱和、kernel/tool 无 timeout、snapshot 恢复缺项、非 transactional harness-state write 等问题。citeturn3search1turn3search3turn3search6turn3search8 这些问题与“科研答案是否正确”无关，却会直接影响数小时无人运行的可靠性和 reproducibility。

因此你们四层测试阶梯最值得追加的不是更多 happy-path seed，而是 **故障注入层**：kill/resume、hung tool、RLM fan-out、snapshot restore、concurrent refine、disk-full/partial-write、orphan-process、meter/runtime crash ordering。LangGraph 等成熟 runtime 把 checkpoint/fault-tolerance 做成 first-class feature，本身就是一个提醒：长程 runtime 的竞争点首先是 failure semantics，而不是 agent loop 写得多聪明。citeturn13search0turn13search9

最终外部核验后的架构论点，可以压缩为一句最稳的版本：

> **不应把创新点写成“我们选了 Prime Agent”；应写成“我们采用可替换的长程 execution harness，但把科研能力做成开放 MCP/Skill contract，把 epistemic state、oracle、计量与验收迁出模型及 runtime 的自由裁量域，并分别评估 fresh capability 与 continual research improvement。”** 这一表述同时得到了 MCP/Agent Skills、LongHorizon-Harness、PokeGym、AutoResearchClaw 与 continual-agent literature 的外部支撑。citeturn21search11turn21search14turn15academia49turn21academia26turn16academia14