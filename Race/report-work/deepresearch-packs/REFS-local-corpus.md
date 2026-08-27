# REFS · 本地语料库盘点(开发期实际参考的仓库)

> 与任意 PACK 一起上传。格式:仓库 · 是什么 · 关键机制/论文 · 我们取了什么/拒了什么。
> 本地路径 `~/autoresearch/<name>` 或 `~/oss/<name>`。⭐ = 与我们的问题最近。

## A · 端到端科学发现系统

- ⭐**Curie**(autoresearch/Curie;论文 arXiv 2502.16069,另 EXP-Bench arXiv 2505.24785)
  「首个为自动**严谨**科学实验设计的 AI-agent 框架」,从假设到结果解释的
  端到端自动化。**待核验**:其严谨性模块(Reviewer/technician 等)是否与
  proposer 同属一个 LLM 的裁量——这是我们与它的主要分界。
- ⭐**co-scientist**(autoresearch/co-scientist;Gottweis et al., Nature 2026 开源复现)
  多智能体假设生成-批判-演化-排序;近重复门(save-time near-duplicate gate)、
  三阶段评审(novelty/correctness/testability/safety)、有界 DeepResearch
  证据银行。**评审者是 LLM agent**——假设质量在模型内裁决。
- **robin**(autoresearch/robin;arXiv 2505.13400,FutureHouse)
  端到端多智能体科学发现(文献 agent Crow/Falcon + 假设 + 实验设计 +
  数据分析);经 LiteLLM 多供应商。
- **AiScientist**(autoresearch/AiScientist;arXiv 2604.13018,非 Sakana 原版,
  为长程 ML 研究工程的重实现)**File-as-Bus** 运行时模型 + 分层研究团队编排;
  paper 工作流(复现闭环)与 mle 工作流(重复实现-实验循环提升指标)。
  长程状态经文件总线保持——与我们的 journal 相邻,但无类型闸。
- **XScientist / LLM-AutoSciLab / The-Agentic-Researcher / karpathy-autoresearch
  (=oss/autoresearch)/ IMO2026 / ResearchStudio / openevolve / science-codeevolve**:
  各类端到端/演化式变体,快速过。
- **MLEvolve**(autoresearch/MLEvolve;arXiv 2606.06473)MCGS+多智能体解
  Kaggle,MLE-bench #1(12h),65.3% 奖牌率。「上代结果→下代变异」由搜索
  算法固定——artifact 适应度优化,不维护可证伪假设状态。
- **Composite / Composite-writing**(autoresearch/):我们自建的实验/写作语料汇编
  (本地二手整理层)。

## B · 基准与诊断评估

- ⭐**AutoResearchEval / ARFT**(oss/AutoResearchEval;论文全文在
  docs/product/2608.14905v2.txt)100 任务/8 组合/800 轨迹/45 模式/
  agent-as-a-judge κ=0.75;三根因 R1 grounding/R2 depth/R3 integrity;
  原文:「编排层干预能否关闭它是本工作未检验的开放问题」。
- ⭐**neuronbench**(oss/neuronbench)——我们六 world 的来源。部分观测单神经元
  电生理:**预算内干预实验(电流钳协议/通道阻断剂,返回噪声部分记录)→
  预测未运行干预的反事实结果**。评分=held-out 协议的尖峰计数 MSE,由外部
  meter 记账。
- ⭐**DiscoverPhysics**(oss/DiscoverPhysics)物理仿真器(随机化场方程/耦合/
  对称性)+ agent 最多 n 轮实验 + 最终定律按轨迹 MSE 评分,另有 LLM-judge
  解释分。**两轮闭环最近邻**:迭代做实验-观察-提方程;「结果→下一轮」边
  的载体待核验。
- **ScienceAgentBench**(oss/;arXiv 2410.05080)102 实例容器化评测,30 分钟/
  8 线程;2026/04 发布 verified 版以减少假阴性。OpenHands 评测挂载。
- **ReplicatorBench**(oss/llm-benchmarking;COS 主导,arXiv 2602.11354,
  KDD 2026 AI4Science)——要求 agent **预登记复现计划**再执行社会/行为科学
  研究的复现分析。**预登记从人类协议进入 agent 流程的最近实例**;协议级
  还是结构级待核验。
- **frontier-automated-speedrun**(oss/;Prime Intellect)18 个前沿模型在
  modded-nanogpt speedrun 上无人值守数天——真实长程研究行为的原始素材。
- **verifiers**(oss/;PrimeIntellect)训练+评测环境库,Environments Hub 集成。
- **asta-bench**(2400 例/11 基准)· **discoverybench**(arXiv 2407.01725)·
  **airs-bench** · **ResearchClawBench**(再发现→新发现)· **liveideabench** ·
  **Scientific-Agent-Benchmarks**(67 基准汇编)· **One-Eval** ·
  **prometheus-eval** · **DiscoverPhysicsLeaderboard**。

## C · 假设验证/诚信/可复现(最近的邻接带)

- ⭐**POPPER**(oss/POPPER;论文《Automated Hypothesis Validation with Agentic
  Sequential Falsifications》arXiv 2502.09858,Huang/Jin/…/Candès/Leskovec)
  **agentic 序贯证伪做自动假设验证**——名字与目标都最近!必查:其证伪循环
  有没有「预测先于结果」的结构约束,还是 agent 自主裁量。
- **ProClaim**(autoresearch/ProClaim)充分性感知的开放域声称验证,从既有文献
  迭代构建证据判定共识立场(SIGNOR/ConnectomeDB 数据集)——**文献侧事后**,
  与我们「实验内进行中」不同时点。
- **AgentClaimGuard / CiteCheck / refchecker**(oss/)引用错误/伪造文献检查。
- **paperjury**(oss/;arXiv 2606.16322)有界劳动的正当程序论文评审。
- **Graph-of-Trace**(oss/)agent 无关的监控/可视化框架。

## D · 运行时/Harness/编排

- ⭐**prime-agent**(oss/prime-agent;论文 arXiv 2608.23552 + RLM 博文 +
  Continual Harness arXiv 2605.09998)RLM:prompt-as-a-variable、程序化子代理、
  常驻 IPython 为内置模型工具;Continual Harness 把 prompts/memories/skills/
  subagent 规约做成可精炼的持久状态。ARC-AGI-3 RHAE 30%→95.5%。
  **我们的运行时基座;我们对它的两处重写**:①状态 owner 移出内核到独立
  MCP 进程;②子代理触发从上下文压力改为信息不对称。
- **Proma**(oss/Proma;即本仓库产品)本地优先桌面 agent:多模型 Chat、
  工作区、Skills、MCP、会话编排、记忆。
- ⭐**GenericAgent**(oss/)~3K 行种子代码/9 原子工具/~100 行 loop;
  「不预载技能,演化技能」。我们借了它的**锚**形态(状态一屏渲染、每回合
  重注入)与「loop 固定、内容演化」哲学。
- **planning-with-files**(oss/)task_plan.md/findings.md/progress.md 落盘,
  UserPromptSubmit 钩子每回合重注入——**文件化但不类型化**的 F6 对照。
- **superpowers**(oss/)面向编码 agent 的完整软件开发方法论,可组合技能+
  触发式描述。我们借 LOAD WHEN 惯例与「先看 agent 失败再写技能」的 TDD 观。
- **anthropics-skills**(oss/)Agent Skills 官方标准实现。
- **hermes-agent**(oss/,Nous)自带学习环的自改进 agent——我们 refine 环的
  参照(但我们只搬过程性教训,不搬认知状态)。
- **research-environments**(oss/,Prime Envs;含 HARBOR.md)环境集。
- **aris / Auto-claude-code-research-in-sleep / uditgoenka-autoresearch**:
  Claude Code 睡眠研究工作流技能。
- **nanoclaw / openclaw / clay / Claw-AI-Lab / deepseek-harness / flightdeck /
  agent-zero / agent-browser / agent-gui / magentic-ui / craft-agents-oss /
  qoder-agent-sdk-samples / open-code-review / pr-agent**:harness 与产品形态参照。

## E · 写作/绘图/交付(已 vendor 进产品)

**nature-skills**(~/draw/nature-skills;Apache-2.0)· **CCFA-Skills**
(oss/CCFA-Skills;MIT,17 技能论文全家桶)· **figures4papers** ·
**scipilot-figure-skill** · **spark-to-paper-skills**(oss/;orchestrator+13
技能,arXiv 2608.11924,产出 SCI Q2 录用——我们早期 ts-* 技能的上游,
后经 SKILL-PACKAGING 审计裁撤)· **paper-qa**(PaperQA2)·
**paper-writing-skill / research-writing-skill / latex-arxiv-SKILL** ·
**agent-research-skills**(31 技能)· **academic-research-skills** ·
**scientific-agent-skills / science-skills / ai4s-skills /
Awesome-Scientific-Skills** · **latex-to-word-workflow**。

## F · 深度检索工具(执行方)

**DeepResearch**(oss/,通义)· **gpt-researcher** · **deer-flow** ·
**OpenResearcher** · **auto-deep-researcher-24x7** · **claude-scholar** ·
**smartreader / newscope / horizon / superbody**(信息雷达)。

## G · 产品形态参照

**open-webui 生态**(extensions/pipes/plugins)· **LibreChat** ·
**claudecodeui / claude-code-webui / claudia** · **open-artifacts** ·
**OpenGenerativeUI** · **open-science**(本地优先研究工作台)·
**Qwen-Agent** · **DOMPurify** · **ext-apps**(MCP UI)。
