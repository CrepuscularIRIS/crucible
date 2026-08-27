# DEEP RESEARCH 底稿 · 本地调研语料盘点与待核验主张(2026-08-26)

> **用途**:交给 deep research / 人工 web 补充检索的输入。三部分:
> ①我们要外部核验的主张(N1–N5);②本地语料的分类台账(110+ 仓库,取/拒痕迹);
> ③邻接工作线索与核验问题清单。核验产出将进入技术报告「调研与定位」一节
>(喂评分点:创新性与自洽 20 分;评委关注「知识增量」)。
> **边界**:本地语料为开发期实际参考盘(~/autoresearch 48 + ~/oss 90);
> 外部检索目前仅一次抽查,中文工作与非英文文献覆盖不全——这是 deep research 要补的。

---

## 一 · 需要外部核验的主张(N1–N5)

每条:我们的主张 → 现有支撑 → 核验什么才算数(以及什么会证伪我们)。

**N1 · 信念状态的外部语法 + 模型不拥有的类型检查器**
主张:研究 agent 的信念改变以追加式哈希链 journal 为唯一事实源,每次迁移经
独立进程的结构闸(互斥频段/零宽拒绝/kill 分支/落地探针依据),**验证器不在
被测模型的自由裁量之内**——此组合此前未见。
支撑:ARFT 原话「编排层干预能否关闭此缺陷是本工作未检验的开放问题」
(2608.14905v2, L43-44/L160)。
**核验**:是否存在 2024-2026 工作把 belief state 做成模型外部的类型化状态机
(而非可检查的 BDI/inspectable belief——那类已存在);证伪条件:找到同构的
「prereg 频段 + 结构闸 + journal 重放」系统即可。

**N2 · 对 ARFT 开放问题的直接检验**
主张:本作品是上述开放问题的直接实验回答(消融阶梯 a–e 已登记)。
**核验**:有没有别人已发表该检验(检索 ARFT 的引用者/citing works)。

**N3 · 两轮因果闭环的结构性保证**
主张:第二轮由第一轮实测结果**机械导致**(claim_transition 必须点名已落地
探针;带外强制分诊→ABDUCE),「重新生成」不构成合法迁移。
**核验**:DiscoverPhysics(仿真器+n 轮实验)、ReplicatorBench 类是否已含
「结构性」因果(而非提示词引导)的两轮;证伪条件:找到把 P11 类要求做成
结构约束的已有系统。

**N4 · 外部计量真值 + 预算账本**
主张:真值对 agent 经 denylist 封闭、MSE 由独立 meter 记账、并发预算经 flock
仲裁——计分不可作弊是设计属性。
**核验**:科学 agent 基准中「agent 可接触评测器」的普遍做法对照
(ARFT 表格已给部分:CORE-Bench 等为 endpoint 评分)。

**N5 · 终局存活契约**
主张:「写完报告≠终局;唯一合法收口是真实调用 declare 收到 gate 裁决」
作为每回合注入的硬契约——针对实测的自评全绿/工具幻觉提前终止。
**核验**:agent 运行时是否存在同类 terminal-liveness 契约;大概率空白,
但需确认无撞车。

---

## 二 · 本地语料台账(分类 + 我们取了什么/拒了什么)

### A · 端到端科学发现系统(先行者,提供「被诊断的对象」)
AiScientist(长程 ML 研究工程)· XScientist · co-scientist(微软,多智能体
假设生成/排序/实验设计)· **Curie**(自动严谨科学实验框架——精神上最近的
邻接:严谨性经 agent 内模块实现)· **robin**(FutureHouse 端到端多智能体
科学发现)· LLM-AutoSciLab · MLEvolve(MCGS 解 Kaggle)· openevolve/
science-codeevolve(演化编码)· karpathy-autoresearch/autoresearch ·
The-Agentic-Researcher · IMO2026 · ResearchStudio · Composite/
Composite-writing(自建的实验/写作语料汇编)。
**取**:失败模式实证(ARFT 的对象多为这类系统)、流程切分参照。
**拒**:其「严谨性放在模型内」的路线——正是被 800 轨迹证伪的位置。

### B · 基准与诊断评估(评测方法论)
**AutoResearchEval(ARFT,论文一)** · **neuronbench(六 world 来源)** ·
asta-bench(2400 例 11 基准)· ScienceAgentBench · discoverybench ·
airs-bench · **DiscoverPhysics/Leaderboard**(物理仿真+n 轮实验——两轮闭环
的最近基准邻接)· ResearchClawBench(再发现→新发现)· liveideabench ·
Scientific-Agent-Benchmarks(67 基准汇编)· frontier-automated-speedrun
(18 次前沿模型研究实测)· llm-benchmarking(**COS** 中心,预登记血缘)·
One-Eval · verifiers · prometheus-eval。
**取**:ARFT taxonomy+判官;neuronbench 世界+meter 设计;endpoint-vs-process
评分的对照口径。**拒**:endpoint 唯一评分(我们加过程账本)。

### C · 声称验证/诚信/可复现性(问题最近的邻接带)
**ProClaim**(充分性感知的开放域声称验证)· AgentClaimGuard · CiteCheck ·
refchecker(引用错误/伪造文献)· **POPPER**(论文代码库,Popper 式可复现
工作流)· Graph-of-Trace(agent 无关监控可视化)· paperjury(有界劳动的
正当程序评审,arXiv 2606.16322)。
**取**:声称级检查的词汇与边界。**拒(关键区分)**:这些是**事后/文献侧**
的声称核查;我们做**进行中的实验内信念纪律**——时点不同、对象不同。

### D · 运行时/Harness/编排(地基)
**prime-agent(论文二)** · **Proma(产品基座)** · **GenericAgent**(92 行
极简自进化循环——loop 形态与锚的参照)· superpowers(技能方法论,
LOAD WHEN/失败先行的 TDD)· anthropics-skills(Agent Skills 标准)·
hermes-agent(自改进学习环)· **planning-with-files**(task_plan.md/
findings.md 持久计划——F6 的「文件化但不类型化」对照)· aris/
Auto-claude-code-research-in-sleep(ARIS 睡眠研究)· uditgoenka-autoresearch ·
research-environments(Prime Envs/HARBOR)· nanoclaw/openclaw/clay/
Claw-AI-Lab · deepseek-harness · flightdeck · agent-zero · open-code-review/
pr-agent · craft-agents-oss · qoder-agent-sdk-samples。
**取**:RLM 闭合论证、技能打包规范、持久化状态先例。**拒**:上下文压力式
子代理分派(改为信息不对称触发)。

### E · 写作/绘图/交付层(成品能力)
nature-skills · CCFA-Skills · figures4papers · scipilot-figure-skill ·
spark-to-paper-skills(ts-* 上游,SKILL-PACKAGING 已裁)· paper-qa(PaperQA2)·
paper-writing-skill/research-writing-skill/latex-arxiv-SKILL ·
agent-research-skills(31 技能)· academic-research-skills · scientific-
agent-skills/science-skills/ai4s-skills/Awesome-Scientific-Skills ·
latex-to-word-workflow。
**取**:已 vendor 进产品(127M,见 P20);nature 后端钉 matplotlib。

### F · 深度检索工具(执行 deep research 的候选)
DeepResearch(通义)· gpt-researcher · deer-flow · OpenResearcher ·
auto-deep-researcher-24x7 · claude-scholar · smartreader/newscope/horizon。

### G · 产品形态参照
open-webui 生态(extensions/pipes/plugins)· LibreChat · claudecodeui/
claude-code-webui/claudia · magentic-ui · **agent-gui**(观察/转向 agent
研究团队)· open-artifacts · OpenGenerativeUI · open-science(本地优先研究
工作台)· Qwen-Agent。

---

## 三 · 设计决策 → 语料谱系(报告「我们取了什么」的行文依据)

| 设计决策 | 谱系来源 | 我们的改动 |
|---|---|---|
| 六失效归约(C1) | ARFT 45 模式 + POPPER 波普尔式可证伪 | 45→6 机制归约,逐条可查(附录 A) |
| 承诺层架构(C2) | prime-agent RLM + Arbor 形态分析(ARBOR.md 已佚,存于 PrimeAgent.md §3) | 状态 owner 升格独立进程;RLM 降格锚层 |
| RLM 时机(C3) | prime-agent 默认分派 | 信息不对称触发表 + 「永不」行 |
| 选择即约简(C4) | GenericAgent 锚 + ARFT Fig.4c | 预测结果表,判别力/成本 |
| 结构闸家族(C5) | COS/llm-benchmarking 预登记 + neuronbench meter | 闸进 MCP,零宽/回显/稻草人/预算 flock |
| 技能打包纪律 | superpowers LOAD WHEN + anthropics 标准 | 触发式 description、friction-list 即 RED |
| 两环(C6) | hermes 学习环 + ARIS | refine 只搬过程教训,不搬认知状态 |
| 评测口径 | ARFT 判官 + ScienceAgentBench 过程指标 | 判官降级为诊断词汇;确定性指标为主 |

---

## 四 · 邻接工作线索(一次抽查所得,deep research 的起点而非结论)

⚠️ 2026 年确有活跃的邻接带——「没人做过」必须收敛为「此组合与检验未见」:

1. **分离式权力架构**:PEA([arXiv 2604.23646](https://arxiv.org/html/2604.23646v1),
   Policy-Execution-Authorization 分权+形式化定理+零绕过)、LATTICE
   ([Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1800407/full),
   policy-as-code+密码学审计)——**通用 agent 安全**,非科学方法层。
2. **步骤级守卫**:StepGuard([arXiv 2608.24777](https://arxiv.org/abs/2608.24777),
   执行前轨迹审计)。
3. **预登记协议**:LLM 实验预登记([arXiv 2606.27687](https://arxiv.org/abs/2606.27687)
   等)、ReplicatorBench(COS,KDD 2026——要求 agent 预登记复现计划再执行)。
4. **证据链框架**:Science One(Google,Chain-of-Evidence,
   [blog](https://research.google/blog/science-one-framework-a-verifiable-autonomous-research-framework-via-chain-of-evidence/))、
   Brain Researcher(工作流内嵌方法学规则)。
5. **实证报道**:AI agent 会做研究但不总诚实
   ([Science News](https://www.science.org/content/article/ai-agents-may-be-skilled-researchers-not-always-honest-ones));
   Argonne 科学安全多智能体
   ([OpenReview](https://openreview.net/pdf/14cc8d93acc45300e041a8918428df1587c09cb4.pdf))。
6. **信念状态可检查**:Ask WhAI([arXiv 2511.14780](https://arxiv.org/abs/2511.14780))、
   Belief Engine(对数几率信念更新)——inspectable 但非** gated**。

**我们的差异化句式(供 deep research 检验后定稿)**:邻接带分别做了
通用安全分权、事后证据链、预登记协议、信念可视化;未见
「journal 锚定的信念语法 + 逐迁移结构闸 + 外部计量真值 + 结构性两轮闭环」
四合一对 ARFT 开放问题的基准化检验。

---

## 五 · 给 deep research 的核验清单(按优先级)

1. **N1/N2(最高)**:检索 ARFT(2608.14905)的 citing works 与
   "commitment device / epistemic control / belief-state gate for research agents"
   变体;判定标准:存在同构即改写定位为「并行工作」,不存在则引用 ARFT
   open question 原句立位。
2. **N3**:DiscoverPhysics、ReplicatorBench、co-scientist v2 的两轮机制是
   提示词引导还是结构约束;列出各自「结果→计划」边的载体。
3. **Curie 精读**:其「严谨性模块」是否在模型裁量内(我们的关键区分);
   引用其论文原句。
4. **N5**:terminal/liveness contract for agents 检索;预期空白。
5. **中文工作补盲**:CNKI/知乎/公众号圈的「科研 Agent 诚信/预登记」工作。
6. 产出物:每条主张给出【证实/并行/证伪】+ 引文,直接可粘进报告
   「调研与定位」节;证伪任何一条即回报,我们改口径。
