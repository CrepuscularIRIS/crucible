# PACK 1 · 新颖性总核验:结构化认知干预是否已有人做(原 A+E+G 合并)

> **配套上传(同一会话)**:`REFS-local-corpus.md` + `REFS-our-implementation.md` + `REFS-papers-docs.md`

```
PROMPT(粘贴为提问):
研究 agent 的"诚信/严谨性缺陷"能否用编排层(harness/闸/状态机)结构性修复,
而非提示词或模型训练?请系统检索 2024-2026 文献,回答本文件【问题】三组
Q1-Q11,严格按【输出格式】返回。对我们不利的证据请优先列出;宁可返回
「未找到」也不要编造引文。
```

## 我们的系统(背景,30 秒)

Proma 桌面 agent + Prime Agent 运行时(常驻 IPython RLM 内核),基座 Qwen。
信念状态由**追加式哈希链 journal** 唯一持有;每次假设迁移必须经独立 MCP 进程的
结构闸:互斥预测频段对、零宽频段拒绝(点预测=回忆)、kill/scope 分支必填、
常量回显探针拒绝、稻草人方向倒置拒绝、并发预算 flock。实验命令只在 bwrap
沙箱执行预登记时的冻结字符串;指标由 server 从 raw 重算;真值与 MSE 由外部
meter 记账(denylist 封闭)。终局唯一合法收口 = 真实调用 `report_declare`
当庭过三道 gate(prereg 时序/reconcile 对账/trace 重放)。
认知纪律不靠提示词,靠「落地规则+可数计数器」:每个认知移动必须终止于一次
MCP 调用(不落账=没发生),计数器阈值触发调度。

**理论依据**:ARFT(arXiv 2608.14905,800 轨迹/45 模式)证明认知动作被提示词
要求且被执行但**惰性**(F.4 82.5% 等);原话:「编排层干预能否关闭它是本工作
未检验的开放问题」。

## 我们的主张(待核验)

- **N1**:「外部语法 + 模型不拥有的类型检查器」组合未见先例。
- **N2**:我们的消融阶梯是 ARFT 开放问题的直接检验。
- **N5**:终局契约(唯一合法完成谓词由运行时强制)未见先例。

## 已知邻接(不必重复发现,在此之上深挖)

- 通用安全分权:PEA(arXiv 2604.23646,Policy-Execution-Authorization+定理)、
  LATTICE(Frontiers 2026,policy-as-code+密码学审计)、StepGuard
  (arXiv 2608.24777,执行前守卫)、AgentDoG/DreamGuard/ContractGuard/ePCA
- 信念可检查(非 gated):Ask WhAI(arXiv 2511.14780)、Belief Engine、
  BDI 架构、agentic forecasting
- 元认知/self-knowledge 实证线、runtime monitoring 综述
  (Toward Safe LLM Agents: specification/verification/enforcement)

## 问题

**组 I · 先例检索**
- **Q1**:ARFT(2608.14905)的 citing works 与 "commitment device / epistemic
  control / belief-state gate / orchestration intervention for research
  agents" 变体:是否有人已检验该开放问题?
- **Q2**:有没有系统把「预登记频段+结构性拒绝+journal 重放」做成研究 agent
  运行时原语(任何年份)?
- **Q3**:LLM agent 里结构化信念状态的谱系:模型可写(memory/notebook)/
  只读渲染/**写入经外部验证**——第三类是否存在?
- **Q4**:「计数器调度」(认知纪律变成可数事件的阈值触发)有无先例?
- **Q5**:终局/停机契约:有没有系统把「任务完成的唯一定义」做成运行时强制
  (terminal contract / completion predicate / liveness gate)?
- **Q6**:「工具不存在」幻觉导致提前终止的现象有无正式研究与命名
  (tool-use hallucination / phantom tool)?agent 自评完成的提前终止呢?
- **Q7**:agent 自评 vs 外部验证器的已知结论(self-grading 失效实证),
  我们引作依据是否稳?

**组 II · 分界核验**
- **Q8**:PEA/LATTICE/StepGuard 等架构的不变量是行为安全(权限/越权/注入)
  还是认识论的(belief 只能经证据改变)?有没有安全架构已应用到科研 agent
  的假设更新/实验选择环节?
- **Q9**:「运行中可绕、出口不可骗」的折衷(沙箱内逃逸但出口验收)在
  runtime monitor 文献中的论述?
- **Q10**:「inspectable→gated」这一步有没有人明确提出并实现?
  元认知缺陷/metacognitive deficit 的最权威引文?

**组 III · 裁决**
- **Q11**:综合:N1/N2/N5 各应定位为「首创/并行工作/已有」?

## 输出格式

每问【证实/并行工作/证伪/空白】+ 证据(标题·链接·年份·一句话)+ 置信度;
「不变量类型×代表工作」表(行为安全/认识论/混合);「信念状态实现谱系」
四栏表(系统·存储·谁写·写入是否被验证);最后:≤120 字中文定位句 +
单列「对我们最不利的发现」。
