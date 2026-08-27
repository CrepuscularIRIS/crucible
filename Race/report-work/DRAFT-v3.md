# 调研与定位素材库(供技术报告 P2/P3/P18/P19 蒸馏用,2026-08-26)

> **角色澄清**:本文件不是报告本体——比赛交付是 ≤20 页 **P1–P20 填报式
> 技术报告**,15/20 节要真实运行证据,论证只占 5 节。报告主体仍是
> `DRAFT-v2.md` 的 P 骨架;本文件是深度调研(5 份 deep research)产出的
> **定位弹药库**,按下表蒸馏进报告后归档。
>
> **页预算**:定位类内容在终稿合计 ≤2.5 页——P2 不足论证一段、P3 科学逻辑
> 一小节、P18/P19 边界几行、附一张邻接对照表(半页)。其余篇幅全部给
> P13–P17 两轮案例与 P20 复现——那是分数的大头。
>
> 三态纪律:**【证据】/【推断】/【待验】**;不利先例正面引用,不回避。

---

## 蒸馏映射(本库 → 报告正文)

| 素材(本文件) | 蒸馏进 | 终稿用量 |
|---|---|---|
| §1 定位句 + §2.3 K1–K4 | P1 核心主张 + P2 完成内容 | 各 3–5 行 |
| §2.2 邻接对照表(**裁剪至 6 行:最危险邻居 4 + 反衬 2**) | P2「现有方式不足」或 P18 边界 | 半页表 |
| §2.1 四级谱系(压成一句话+一行表) | P3 科学逻辑 | 3 行 |
| §2.4 预登记谱系(压成一句) | P5 评价方法 | 2 行 |
| §2.5 引文弹药(self-grading 三引 + ARFT 原话) | P3「为何不是提示词」 | 4 行 |
| §0 修订表(闭合论证/Prime 措辞/ECT 并行) | P6/P19 对应段落逐条替换 | 已列明 |
| 其余细节(Hypothesis Graph/MemTX/MDA 全表等) | **不进正文**;答辩备查(DEFENSE-QA) | 0 |

---

## 0|关键修订表(相对 v2 正文,逐条替换进 P 节)


| 修订 | v2 的说法 | v3 的说法(经核验) |
|---|---|---|
| 新颖性 | "外部语法+类型检查器未见先例" | **收窄**:外部 gate/交易化状态/终局证书在安全与软件 agent 已成熟(AgentSpec、PatchBoard、MemTX、Hypothesis Graph、Goal-Autopilot、ECT);我们的贡献是**把它们编译成科研认识论的承诺语法,并直接检验 ARFT 缺口** |
| 闭合论证 | "RLM 模型发代码即闭合" | **重写**:代码本身不闭合;闭合来自模型不能绕过的 owner/类型迁移/oracle/提交边界。RLM 提供的是程序化状态操纵的** substrate**,闭合由独立 MCP 进程达成(λ-RLM 的 typed-control 优于自由 REPL 佐证此点) |
| Prime 选型 | ARC 95.5% 为论据 | "Prime Intellect **报告** 95.5%;选型另由程序化状态操纵、可恢复性与我们自己的 parity/压力测试支撑"(独立复现尚缺,不作单点论据) |
| 邻接系统 | "严谨性大多在模型内" | **撤回**。Curie/XScientist/ScientistOne/MDA 已有实质模型外组件;改用三级裁量分类逐系统对照(§2.2) |

---

## 1|叙事主线(不变)+ 定位句(新版)

S1/S2/S3 同 v2。**定位句(≤120 字,三份报告共同收敛)**:

> **我们并非首创外部 gate,而是把已知 runtime enforcement 推进到科研认识论:
> 以可重放证据约束假设迁移、预登记预测与终局声明,并直接检验 ARFT 的
> 元认知缺口。**

---

## 2|调研与定位(新章,踩分:创新与自洽 20 分)

### 2.1 信念状态的四级谱系(检索到 2026-08-26)

| 级 | 形态 | 代表 | 写入是否被外部验证 |
|---|---|---|---|
| L1 | 自由文本 memory | 通用 agent 记忆 | 否 |
| L2 | 结构化可检查(inspectable) | Ask WhAI、Belief Engine、CausaLab | 否(可查询/重放/显式更新规则) |
| L3 | 确定性/受闸状态变更(gated) | PatchBoard(JSON Patch+内核校验)、MemTX(transactional belief commit) | 是 |
| L4 | **证据授权+可重放的认知提交** | Hypothesis Graph(receipt/kill/回放不变量)、MemTX | 是 |
| **本作品** | L4 的科研特化 | research-mcp | 是,且是科研语法(下节) |

**裁决**:L3/L4 已有先例——「inspectable→gated」不能再作为首创主张。
我们落在 L4,与 Hypothesis Graph/MemTX 同层,**差异在 gate 的对象与语法**。

### 2.2 邻接系统三级裁量分类(model-internal / harness-external / authority-external)

| 系统 | 严谨机制 | 裁量归属 | 两轮边载体 | 预登记语义 | 对我们的威胁 |
|---|---|---|---|---|---|
| **Hypothesis Graph**(2026-05) | hypothesis+kill condition+精确 trial 命令;receipt;fail-closed 出版;回放不变量 | authority-external(coding 域) | 图迁移 | **有**(含 prereg) | **最危险**:「模型外认知 checker+可回放假设状态」不可再称首创 |
| **MemTX**(2026-07) | 「memory write ≠ belief commit」;staged transaction+validate-and-commit;撤销级联修复 | authority-external | 事务 | 部分 | 直接证明 gated belief state 已存在 |
| **PatchBoard**(2026-05) | agent 只提交 JSON Patch;确定性内核查 schema/写契约/不变量 | authority-external(协作状态) | 事务 | 无 | 架构同族 |
| **Goal-Autopilot**(2026-06) | 终局硬底:未过可证伪 gate 不得报 done;No-False-Success 定理 | 混合 | — | 无 | **N5 宽口径被它证伪** |
| **ECT**(2026-08-22) | COMPLETE=typed certificate+in-scope trace evidence+确定性重放 | authority-external | — | 无 | 与 report_declare 极近;**时间上先于我们终局契约两天,按并行工作正面引用** |
| **MDA**(NeuronBench 参考-agent) | 贝叶斯 SMC 维护模型不确定性;VoI 选实验;预测充分性检查算法化 | **强模型外** | 后验迁移+充分性检查程序化改变下一步合法操作 | 贝叶斯预测分布先于观测,但无冻结 artifact | **对两核心线组合的最大威胁**:不能再称「首个把假设更新移出 LLM 裁量」;可守的是「规范可采纳性与可审计性」 |
| **LLM-AutoSciLab** | S_t=(D,E,H);候选假设分歧选实验;bootstrap 置信门 | 更新/控制层模型外 | **显式结构化认知状态迁移** | 预测先于观测的时序性存在;无不可变预登记对象 | 结构化两轮更新的大先例;我们的差异=**承诺与准入** |
| **XScientist** | 探索 DAG+内容哈希+真值契约+确定性完整性取证;硬发现可阻断提交态 | 大量模型外 | 结构化 DAG 迁移(失败分支留史≈坟场) | 部分(计划含预期输出) | 不能再称「首个确定性完整性基础设施」;可守:确定层拥有的是**信念迁移本身** |
| **Curie** | Experimental Rigor Engine 拦截每个 agent 动作;执行验证/重复运行 | 混合(控制流模型外,科学语义模型内) | 调度器状态+固定路由 | 无频段/分支语义 | 「坏执行被结构性阻断进入分析」与我们机制级同构 |
| **ScientistOne** | Chain-of-Evidence;只读评测记录;独立重跑;引用核验 | 强混合 | 固定搜索控制+证据 artifact | 无 | 证伪「当代科学 agent 只靠自评」的宽表述 |
| **co-scientist** | 多 agent 生态(评审/锦标赛/演化) | **模型内为主**(反馈「simply appended to prompts」) | 提示词 | 无 | 良好反衬 |
| **robin** | 真实湿实验+人审 | 混合 | LLM 生成结构化产物+人机交接 | 无 | 证明「真实两轮」本身不新;边软 |
| **AiScientist(File-as-Bus)** | 厚状态薄控制;schema 治理工作区 | 混合 | **工件/工作区状态迁移**("thin control over thick state") | 无 | journal 底盘最近邻;无法治信念语法 |
| **POPPER** | 序贯证伪+e 值聚合;**Sequential information 假设**(本轮测试设计在未见该轮数据下产生) | 统计聚合模型外;设计/执行 agent 自由 | 序贯统计累积 | 预测时序隔离有;**无冻结可执行/哈希封存** | 科研域最近邻(见 §2.4 谱系) |
| **ReplicatorBench**(COS,KDD26) | 继承 SCORE 人工复现流程;Extract→Design→Execute→Interpret;数千 checkpoint | 流程级 | 管线检查点 | 「预登记判据」来自**人类**过程;agent 可反复 rerun 分析 | **proceduralizes preregistration;我们 operationalize and enforce** |

**七边组合裁决(报告 10)**:审查范围内**没有任何整体系统同时具备**——
authority-external 计量 + 不可变的预测先于结果承诺 + 机械预声明的假设迁移 +
证据寻址的信念变更 + 可回放完整性历史 + 重解释前强制归因(分诊)+
坟场感知的新假设准入。若干系统各有一两条接近组件。**这是我们的主定位。**

### 2.3 收窄后的可守主张(替代 v2 的 C1–C6 宽口径)

- **K1 · 数值反事实承诺语法**:预测以**互斥数值频段**为 commit 语法;零宽/
  非互斥/无 kill 分支/方向倒置/常量回显由非 LLM 闸机械拒绝;执行字符串冻结;
  指标 server 从 raw 重算;终局逐数对账。检索未发现 Hypothesis Graph/MemTX/
  PatchBoard/Goal-Autopilot/ECT 中任一同时实现「科学预测语义+证据溯源+终局
  对账」完整链。**这是系统层最干净的新颖点。**【证据:实现+检索裁决】
- **K2 · 认知债计数器**:落地未迁移/攻击债/同探针死亡/坟场计数 → 确定性
  阈值 → 认知移动调度。检索未找到直接先例(已有 monitor 皆为学习型风险/
  置信度阈值)。【证据:实现;空白置信 77%,措辞保持「未找到直接先例」】
  **最佳表述(用户理念句,已进报告 P3 纲领框)**:「把 question discovery、
  literature grounding、experimentation、analysis、writing 和 review 全部
  改造成同一个 journal 驱动的闭环;metacognition 不再由一个 agent 承担,
  而由 journal 中未清偿的 epistemic debts + server refusal 实现。」——
  元认知是系统属性(债+拒绝),不是角色。
- **K3 · ARFT 缺口的定向编排消融**:固定模型/任务/预算,逐层加结构约束,
  按 ARFT 失败模式看选择性下降。检索:引用 ARFT 后做 harness 级受控消融者
  **未见**(论文公开仅 12 天);固定模型改 agentic design 已有
  (Recovering Wasted Compute)、外部裁决源消融已有(Hypothesis Graph,
  coding 域)——我们不发明该范式,而是**把它推进到 ARFT 定义的研究诚信/
  元认知模式**。【推断→**待验:任务#6 跑完前只能写「预登记的候选实验」**】
- **K4 · 六边界组合架构**:RLM 执行 substrate+model-agnostic MCP/Skill 能力层
  +独立持有的类型化认知状态+预登记探针+隐藏外部计量+fresh/continual 双评测。
  单项皆有先例(MCP/Agent Skills 标准;LongHorizon-Harness 的状态外置;
  PokeGym 的特权状态隔离;AutoResearchClaw 的七模式人机协作),**组合方式
  未见同构**。【证据+检索】

### 2.4 预登记谱系(修正版)

不是「preregistration → ReplicatorBench → 我们」,而是四支汇流:
**不可变承诺**(OSF frozen registration/Registered Reports 的 stage-1 闸)
+ **可复现工作流/provenance** + **POPPER 的信息隔离与机器统计控制**
+ **agent harness 控制流验证**(Curie)→ **我们把它编译成运行时认识论状态机**
(登记语义检查→冻结可执行探针→只执行冻结对象→证据约束迁移→报告逐数重算)。
LLM 预登记先例:*Preregistering for the Next LLM*(2606.27687)固定
prompt/参数/检验并预登记未来模型——但其对自主研究框架的建议是
**should commit**(未来方向),非已实现运行时强制。【证据】

### 2.5 引文弹药(写进正文的)

- ARFT:「A self-review is just more text」——自我评审无结构性后果的原话。
- self-grading 失效:ICLR24 *LLMs Cannot Self-Correct Reasoning Yet*(无外部
  反馈时内在自纠无效);ACL24 *Pride and Prejudice*(self-bias);*Small LMs
  Need Strong Verifiers*。安全表述:「同一模型的无锚自评不能作强保证」,
  不写「自评必然失败」。
- 工具幻觉/提前终止:ToolBeHonest、*The Reasoning Trap*(no-tool-available
  失败模式);premature stopping(CausaLab)、terminal commitment(VIGIL)、
  premature unsupported termination(ECT)。
- 中文侧:Dolphin(复旦/上海AI Lab,ACL25,闭环最直接竞品)、TianJi-Environ、
  ChemAgents/机器人实验室、InternAgent/NovelSeek;Q5 裁决:「训练侧反思已
  结构化(Agent-R/SELF);memory 侧已 typed(VerMem,但 verifier 仅训练期);
  仍缺:科研执行期模型外、在线、不可绕过的信念交易系统」——正好是我们的位置。

---

## 3|P2–P20 主体(沿用 v2 骨架,仅列修订点)

- **P2 立项逻辑**:两篇论文交叉点叙述不变;新增一段「三级裁量分类」作为
  全篇分析词汇。
- **P3 科学逻辑**:六失效归约不变;新增「为何不是提示词」引文组(self-grading
  三引)。
- **P6 架构**:§6.1 重写——闭合论证归于「独立 owner+类型迁移+oracle+提交
  边界」,RLM 是 substrate 不是闭合源(λ-RLM:typed 控制优于自由 REPL);
  Prime 选型措辞按 §0 修订表。§6.3 不变。**新增引用**:LongHorizon-Harness
  (状态外置+只读审计)、PokeGym(特权状态隔离)、MCP/Agent Skills 标准。
- **P12 失败台账**:新增报告 12 的建议——四层测试阶梯追加**故障注入层**
  (kill/resume、挂起工具、RLM 扇出、快照恢复、磁盘满/半写、meter 崩溃次序);
  Prime 公开 issue(OOM/attribution flood/无超时)如实列为运行时风险与
  我们的缓解。
- **P18 对照消融**:K3 的措辞升级为「预登记的候选实验」;跑完任务#6 前禁用
  「已检验」字样。消融预测照旧登记。
- **P19 边界**:新增三条诚实边界——①ECT(08-22)为并行工作,我们的特异点
  是 prereg/reconcile/trace 三联+与假设/探针状态机及外部计量的一体化;
  ②MDA 在数值更新层比我们更模型外,我们的差异在规范可采纳性与可审计性;
  ③Prime benchmark 独立复现尚缺。
- 其余各节沿用 v2。
