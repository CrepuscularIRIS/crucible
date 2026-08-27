# PACK 4 · 架构与运行时选型:architexture 设计的外部核验

> **配套上传(同一会话)**:`REFS-local-corpus.md` + `REFS-our-implementation.md` + `REFS-papers-docs.md` —— 本机参考语料/我们的实现基理/论文与设计文档清单,均在本目录。本包问题可引用它们作对照。

```
PROMPT(粘贴为提问):
我们为一个科研 Agent 竞赛系统(基座模型锁定 Qwen)做了架构决策(见背景)。
请检索外部证据回答 Q1-Q6:每个决策是业界共识、有争议、还是我们独有;
以及有没有更优的既定方案。严格按【输出格式】返回,不利证据优先。
```

## 背景:我们的架构决策(architexture 设计 → 已实现)

系统 = Proma(桌面 agent 产品,工作区/Skills/MCP/会话编排)
+ **Prime Agent 运行时**(常驻 IPython RLM 内核,递归子代理,自主门)
+ 基座 **Qwen**(qwen3.7-plus 主力),研究层全部 model-agnostic
(MCP 工具 + Skills,不绑任何模型)。

关键决策与我们当时的论证:

1. **运行时选 Prime Agent 而非 Claude Agent SDK / 自研 loop**:论据是
   RLM「模型发代码不发文本」给出状态闭合的可能性;执行/恢复/资源记账
   已标准化(其论文报告 ARC-AGI-3 RHAE 30%→95.5%)。
2. **能力层 model-agnostic**:所有科研能力做成 MCP/Skill contract,
   主后端可换(Qwen 百炼 ↔ 其他),上层编排不感知。
3. **隐藏评测器**:真值/评分代码/测试数据对 agent 封闭(denylist +
   外部 meter 进程 + 独立容器),分数由评测侧重算,不采信 agent 报告值。
   动机:我们的前身实验里 agent 曾系统性 reward-hack 暴露的评测代码。
4. **双模式(FULL-AUTO + HITL)**:比赛要求的是「AI 驱动科研闭环」
   而非「无人化率」;两模式对照报告。
5. **双评测模式**:Benchmark 模式(每次 fresh,不共享 prior)与
   Research-Loop 模式(允许继承上轮结果)分开评分——前者测能力,
   后者测迭代;避免「后面轮次吃到前面 winner 信息」的混淆。
6. **四层测试阶梯**:runtime 迁移 parity(同任务同 seed ≥5 次)→
   单能力插件(固定输入的确定性评测,不用 LLM judge)→ 完整 loop →
   正式多问题×多 seed×多 variant。

## 问题

- **Q1**:长程科研 agent 的运行时选型,2025-2026 的实践分布如何?
  (Claude Agent SDK / OpenAI Agents / LangGraph / 自研 / RLM 类)
  有没有公开的横向对照或迁移经验报告?选 RLM 类内核的风险与收益
  有没有人系统讨论?
- **Q2**:「能力层 model-agnostic(全部 MCP/Skill)+ 可换主后端」的
  架构先例与业界术语?(agent-agnostic tools / model-agnostic skill
  standard,如 Agent Skills 标准)
- **Q3**:agent benchmark 的「隐藏评测器」惯例:哪些基准明确做了
  evaluator isolation?有没有被 reward-hack 的著名案例汇编(除我们前身
  实验外,如 GAIA/AgentDojo/SWE-bench 作弊报道)?
- **Q4**:HITL vs FULL-AUTO 对照报告的科学 agent 先例(表格式:
  成功率/质量/迭代提升/人工介入次数)?
- **Q5**:「单轮能力 vs 迭代改进」分开评分的基准先例?有没有已知的方法论
  陷阱论述(继承信息的混淆)?
- **Q6**:Prime Agent(arXiv 2608.23552)本身的第三方评价/复现/批评?
  我们押注它作为运行时的外部风险。

## 输出格式

每问【业界共识/有争议/我们独有/未找到】+ 引文(标题·链接·年份)+
一句话;一张「决策×外部支持度」汇总表;最后:三个最值得在技术报告里
引用的外部依据,和三个最大外部风险(带出处)。
