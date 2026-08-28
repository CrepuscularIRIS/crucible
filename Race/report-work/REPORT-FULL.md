# 方向 1B 技术报告 · 总卷(REPORT-FULL,2026-08-27 夜)

> **本卷地位**:五源合一的主参考——REPORT-MAIN(P1–P20 正文)+ DRAFT-v1
> (内容全集)+ DRAFT-v2(踩分对齐)+ DRAFT-v3(定位素材)+ 2026-08-27
> E1M 六臂/ARFT E2b 终版数据。**Part I 是蒸馏 ≤20 页 PDF 的唯一源**;
> Part II–V 为答辩弹药与完整存档。三态纪律全卷:**【证据】/【推断】/【待验】**。
> ✅ P13–P17 两轮闭环案例已完成(demo2r-ca,2026-08-28,双绿)。
> 用户持有项:报名表盖章截图×2 · 百炼调用凭证截图 · demo 部署决策。

---

# Part I · P1–P20 填报正文

## P1|作品信息与核心结果

**简介(~300 字)**:通用 Agent 运行时的长程执行能力正在基础设施化;基座锁定
Qwen 之后,真正的差异在于**科研上下文如何组织、下一个实验如何选、什么证据
足以改变判断**。本作品 = Proma(桌面 Agent 产品)+ Prime Agent 运行时 +
research-mcp(独立进程的科研认识论底座)。针对 AutoResearch 诊断出的
「认知动作被执行但惰性」缺陷(800 轨迹/45 模式),我们把科研诚信从提示词
纪律**编译成运行时结构**:假设迁移必须经模型外的类型检查器(互斥频段/零宽
拒绝/kill 分支/回显拒绝/方向倒置拒绝);实验命令只在沙箱执行冻结字符串;
指标由服务端从 raw 重算;真值与评分由外部计量器持有;终局唯一合法收口是
当庭过三道 gate 的声明。
**Generative models propose taste; deterministic systems preserve truth.**
**元认知不由 agent 承担,由 journal 未清偿的认知债 + 结构性拒绝实现。**

**针对的具体实验研究问题**:有限预算下,agent 能否在部分观测、真值封闭的
仿真世界中获得足以预测未运行干预的机制认识,并让第一轮实测结果**结构性地**
决定第二轮计划。

**最有代表性的结果 1**:qwen3.7-plus 六世界(0.17.76)+ qwen3.8-max 六世界
(0.17.77),零作弊、预算账本全绿、**12/12 臂 declare 真调且三道 gate 全绿**
——含百炼欠费中断/容器重启后全部自主收尾(终局契约实战验证)。【证据】

**最有代表性的结果 2**:同判官(ARFT/glm-5.3)跨条件审计:诚信簇模式
(D.4/E.2/F.4/C.1)在 plus@0.17.73-76 为 93–100%,在 38max@0.17.77 跌至
0–33%,F.4(自知未纠)清零——与回显闸/终局契约/(P#) 对账纪律一一对应
(模型+栈双变量,归因待 P18 拆解)。【证据,描述性】

**主要局限**:单 seed;不含图文多模态;模式级 HIT 强判官依赖(已实测,
见 Part IV);两轮闭环案例的叙事表与 journal 存在 claim 状态漂移(P17 披露)。

*(报名表截图×2 —— 用户持有;**百炼调用凭证已就位**:`docs/imgs/image.png`
——6,143 次成功调用/3.96 亿 token/7 模型全 qwen 族,时间轴 08-21→27 覆盖
E1+E1M 评测窗口,qwen3.8-max 915 次即直连六臂;后续用量增长可换更新截图)*

## P2|作品目标与实际完成内容

**现有方式的具体不足**(一段+六行表):端到端科研 agent 的失败集中在诚信
与元认知而非执行力——ARFT:800 轨迹,F.4 82.5%、E.2 78.1%、D.4 77.5%;
其 rollout 提示词**已要求**全部认知动作且被执行,然后**惰性**——提示词路线
的负结果;缺的是**承诺装置**。邻接带各自止步于:

| 最近邻 | 做到的 | 止步的 |
|---|---|---|
| Hypothesis Graph(2026-05) | 模型外认知 checker+回放不变量(coding 域) | 无科研预测语法/频段/终局对账 |
| MDA(NeuronBench 参考 agent) | 贝叶斯更新/VoI 全算法化 | 无规范可采纳性:迁移不受预登记规则约束 |
| XScientist | 确定性完整性取证+探索 DAG | 确定层拥有工件完整性,不拥有信念迁移 |
| ECT(2026-08-22,并行) | COMPLETE=证据证书+确定性重放 | 无三联 gate 与假设状态机一体化 |
| co-scientist | 多 agent 评审生态 | 评审仍是 LLM,反馈「追加进 prompt」 |
| ReplicatorBench(COS) | 预登记进入评测流程 | 流程级顺序,非运行时强制 |

**实际完成**:Proma+Prime 适配(RLM 时机重写/双子会话/研究隔离)·
research-mcp 确定性底座(95 测试)· 认知层 skills(六移动+计数器)·
E1(plus 六世界)+ E1M(38max 六世界)· E2/E2b 双列 ARFT 审计 · 0.17.77
终局契约与结构闸(六臂实战验证)· 端到端论文管线内置产品(nature×3+ccf×18)。
【证据】

**与一次性生成的本质不同**:判断必须是一次被验证器许可的状态迁移——
无落地探针则假设不能迁移,无迁移则报告过不了 gate;「重新生成」不合法。

## P3|科学逻辑与实验判断

B(竞争解释)/W(四操作)/两耦合:**B 只通过观测改变**;**观测来自本可给出
其他结果的探针**。45 模式归约为六断裂:F1 无观测更新/F2 无更新观测/
F3 不可证伪观测/F4 单假设/F5 预算错配/F6 状态失忆;F1/F2/F3 同属
**耦合在模型裁量之下**。【推断,与两列自审一致】

**为何不是提示词**:「A self-review is just more text」(ARFT);无外部反馈
时内在自纠无效(ICLR'24);self-bias 与其放大(ACL'24);强外部验证器是
自纠前提(ACL'24)。信念状态四级谱系(自由文本→可检查→受闸→证据授权+可
重放),本作品在第四级的科研特化。

> **设计理念(全篇纲领)**:真正需要的不是给现有系统「再加一个
> question-discovery 子系统」,而是把 question discovery、literature
> grounding、experimentation、analysis、writing 和 review 全部改造成
> **同一个 journal 驱动的闭环**;所谓 metacognition,**不再由一个 agent
> 承担,而由 journal 中未清偿的 epistemic debts + server refusal 实现**。

**判断原则五行表**:(同 REPORT-MAIN P3,判据/支持/否定/对下轮影响全表)

## P4|数据与实验条件

六世界部分观测电生理仿真;输入检查/单位时基/缺失冲突(分诊梯)/仪器边界
(预算 8、外部账本 flock、denylist fail-closed)。(详 REPORT-MAIN P4)

## P5|评价方法

评价主体分工表(meter/gate=程序;agent=被评+经闸;ARFT=次级诊断);
一轮二轮同口径;确定性过程指标(declare 真调率/催促次数/回显探针=0/预算
纪律)【脚本:任务#6】;判官敏感性已实测并纳入口径(Part IV)。

## P6|系统总体架构与技术闭环

**图1**(`figures/fig1-architecture.png`,可编辑源 `fig1-architecture.drawio`):
五层(Proma→Prime→research-mcp 唯一认知 owner→bwrap 沙箱→外部 meter)。
**闭合论证**:闭合不来自「模型发代码」;来自模型不能绕过的 owner/类型迁移/
oracle/提交边界。RLM 是程序化状态操纵的 substrate(锚跨压缩、子代理即函数
调用),非闭合源。**选型措辞**:Prime Intellect 报告 ARC-AGI-3 RHAE 95.5%,
另由自有 parity/压力测试支撑(独立复现尚缺,如实声明;公开 issue 的长程
风险由四层测试阶梯+故障注入层对冲)。四条返回边(为何不是一次性生成)。
外部参照:LongHorizon-Harness/PokeGym/MCP 标准。

## P7|Qwen 使用方式与上下文工程

**图2**(`figures/fig2-context-layers.png`):真实一回合的六层注入结构。
qwen3.7-plus(E1)+ qwen3.8-max(E1M,百炼直连);上下文六层(静态契约→
终局契约→环境→状态推导 skills→内核锚→轨迹);对话可丢 journal 不可丢;
页面文本不可信。百炼直连臂即赛题要求的调用凭证来源。

## P8|实验任务规划

阶段推导状态机;六移动卡(不落账=没发生);选择不排序(预测结果表,
判别力/成本);预算纪律(确证预留 ≥2 reps)。✅ P8-1:demo2r 第二轮计划
即从第一轮债务清单推导(NOTES「第二轮建议起点」→PLAN 落地为 4 个先行 prereg)。

## P9|执行与数据获取

沙箱契约/provenance/raw 由 server 捕获/(P#) 对账;12 臂全量 bundle 评委
可复跑三道 gate。UI 实况截图(`Race/report-work/shots/`,六臂×live)。

## P10|分析、质控与反馈

确定性程序 vs 模型分工表(=S3 操作化);校准账本;三 gate 全绿才可声明。

## P11|反馈与计划调整

两轮因果链机制(journal 事件逐环可重放);对抗侧信息不对称 child;
✅ P11-1:demo2r 真实调整——第一轮 gate 两拒(先 reconcile 拒数字无出处、
再 prereg 拒空 run)驱动修复回路;第二轮预算 11→4、prereg 0 先行→4/4 先行、
declare 两拒→一次过门(事件链 journal 可逐环重放)。

## P12|运行流程与实际失败处理

失败台账(预算竞态→flock;挂起/假渠道→0.17.74-76;不自主收尾→终局契约
【12/12 实战验证】;回显/稻草人→结构闸;schema 方言→d1c11e9;refine 静默
退化→边界)。**新增实战条目**:百炼欠费中断→六臂自愈;token-plan 误切 4
分钟→即切回;rlm 子代理重启悬死→stop+提示恢复;kernel 六容器并行冷装
带宽饥饿。纵向:0.17.73 每臂 1-5 次干预→0.17.76-77 十二臂零重启
(E1M 含两次容器重启仍全部双绿)。Goodhart 防线照录。

## P13–P17|代表案例 ✅(demo2r-ca,qwen3.7-plus@百炼 TokenPlan,0.17.77)

两轮闭环 2026-08-28 完整落地,全部证据可复算(bundle
`research/campaigns/demo2r-2026-08-28-ca/round{1,2}/`,UI 截图 16 张
`shots/demo2r/`,图6 `figures/fig6-two-rounds.png`,台账 NOTES.md)。

**P13 案例-机制发现**:同世界 ca_rebound,两轮 seed 0/1。第一轮:H1(慢 K⁺
失活解释)SUPPORTED·H2 CONTESTED·H3 REFUTED,MSE 6.60(对照 qwen3.8-max
35.53);第二轮:以第一轮「遗留与债务」为唯一起点(seed 1 防背答案),H1 以
收紧频段 [36,44] 复确证(P1=40 落带内),ICAN 嫌疑正式登记为 H3,MSE 14.33
(跨 seed 不可直比,如实标注)。

**P14 计划先行证据**:prereg `spec_sha256` 冻结时间戳先于执行——第一轮 12/12
重哈希一致、第二轮 4/4;**如实记录**:PLAN-v1/v2.md 文件两轮均未写(该模型
不落计划文件),计划性证据退回 prereg 时间戳链;且第一轮 prereg 全部发生在
forecast 后的修复回路(0 先行),第二轮 4/4 先于观测——纪律完成跨轮迁移。

**P15 执行与数据**:第一轮 5 计量观测+15 候选模拟;第二轮 4 prereg→4 观测
+4 沙箱探针全落地(0 失败),held-out 协议 4/6 个。

**P16 反馈迭代有效性(五行对照,含未改善与代价)**:

| 维度 | 第一轮 | 第二轮 | 判定 |
|---|---|---|---|
| gate | 两拒后过门 | **一次过门** | ✅ 改善 |
| 预算 | 11/8 超支 | **4/8** | ✅ 债务清偿 |
| prereg 时序 | 0 先行(12 后补) | **4/4 先行** | ✅ 改善 |
| MSE | 6.59(seed 0) | 14.33(seed 1) | ⚠️ 跨 seed 不可比 |
| 债务处置 | 产生 6 条 | 预算✓/频段部分✓/ICAN 登记✓/H2 未决 | ⚠️ 2 条未清 |

新增代价:修复回路多耗 12 个后补 prereg 与一次基础设施事故(见 P12)。

**P17 声明与审稿对话(诚实披露)**:①第二轮回填 REPORT「两轮对比」表的
claim 状态与 journal 真值漂移(H1 实为 SUPPORTED 复确证而非"降级";H2/H3
实为 OPEN)——reconcile gate 校数字出处、不校叙事表;已声明报告不可改
(sha 冻结),以确定性审计为准,此为 gate 覆盖面实测边界与候选改进。
②第二轮 REPORT 引用 forecast 事件但未写 MSE 数值字面量(mse_in_report=False
如实入账)。③基础设施事故:我方建容器漏带沙箱权限→探针 8 连败→修复重建
(会话无损),全过程中性唤醒 1 次,均入台账。

## P18|实际对照、消融与方案优势

- **模型×栈两列(已完成,同 seed 同预算)**:

| world | plus@0.17.76 | 38max@0.17.77 | 变化 |
|---|---:|---:|---|
| textbook_M | 14.978 | **0.035** | 428× 优 |
| z_rebound | 202.18 | **2.424** | 83× 优 |
| d_type | 20.042 | **1.427** | 14× 优 |
| ca_rebound | 9.225 | 35.533 | 3.9× 差 |
| h_sag | 10.724 | 37.270 | 3.5× 差 |
| na_fatigue | 175.72 | 178.72 | 持平 |

  模型画像:非「更强」而是「不同轮廓」(三优两劣一平)。**混杂声明**:
  两列同时变了模型与栈(0.17.76→77),拆解归因需 plus@0.17.77 臂【待验#6】。
- **过程指标(确定性)**:declare 真调率 12/12;催促:欠费/重启类中性唤醒
  ×8+内容提示 ×1(E1M 事故台账);回显探针率 0(结构闸生效后无登记尝试
  通过;带内轨迹见 ARFT C.1 回落)。【证据】
- **确定性审计脚本(评委可一行复算)**:`research/eval/journal_metrics.py`
  纯本地解析六臂 journal,零 LLM 调用。六臂结果(表存
  `Race/report-work/figures/T-metrics-6arm.txt`):

  | 臂 | gate | prereg重哈希 | REPORT sha | MSE引用一致 | heldout协议 | 外部催促 |
  |---|---|---|---|---|---:|---:|
  | ca_rebound | ✅ | 8/8 | ✅ | ✅ | 4 | 2 |
  | d_type | ✅ | 7/7 | ✅ | ✅ | 4 | 4 |
  | h_sag | ✅ | 5/5 | ✅ | ✅ | 4 | 0 |
  | na_fatigue | ✅ | 5/5 | ✅ | ✅ | 6 | 2 |
  | textbook_M | ✅ | 9/9 | ✅ | ✅ | 6 | 2 |
  | z_rebound | ✅ | 6/6 | ✅ | ✅ | 6 | 0 |

  三层链条全通:journal 冻结的 `spec_sha256` 与磁盘 prereg 文件**重哈希
  逐一致**(stableStringify 移植,与运行时 `gates/prereg.ts` 同构造);
  `report.declare` 的 sha256 = 当前 REPORT.md 字节;REPORT 引用的 MSE =
  journal 声明值的舍入。heldout 协议列=预报中从未模拟过的协议数——分数
  来自真泛化而非插值。**外部催促计数如实为 10 次/六臂**(UI 层
  proma-session.jsonl 的非任务 user 消息;z_rebound/h_sag 全程零干预),
  全部对应欠费停摆与容器重启后的中性唤醒「继续」,与事故台账逐条对账;
  运行时视角(session.jsonl)里 wake 只留下上下文刷新痕迹,不单独成消息
  ——计数以 UI 层日志为准。复跑:
  `python3 research/eval/journal_metrics.py research/campaigns/e1-2026-08-27-*-s0`
- **消融阶梯(预登记候选,跑前预测已写死)**:(a)裸→(e)完整;
  预测 (b)≈(a) 于 F.4/D.7;(c) 动 R1 与 R2 判断半;(d) 动 R2 认识限半。
  跑完前只称「预登记的候选实验」。边界引用:Recovering Wasted Compute
  (固定模型改 agentic design 已有)/Hypothesis Graph(coding 域)/
  ECT(并行工作)。

## P19|总体结果、失败分析与适用边界

图3(`figures/fig3-mse-12arm.png`,12 臂 MSE)·图4(`figures/fig4-stability.png`,
稳定性纵向)·图5(`figures/fig5-arft-pillars.png`,ARFT 四支柱对比)。
E1+E1M 全表(上);稳定性纵向;E2/E2b 双列审计(同判官):诚信簇
93-100%→0-33%,支柱 P3 38% 居首→P1/P2/P3 拉平(24/23/22/7);zreb 4 hits
最干净;**判官敏感性实测**(opus-5 vs glm-5.3 同批:15.6 vs 12.7、诚信簇
天花板 vs 崩塌)——模式级 HIT 不可跨判官直比,结论只取同判官内对照。
caveat:单 seed/双变量混杂/Stage1 引文配额/轨迹非独立样本。模型边界:
H2 质量/探针合成/severity 是判断;对抗者漂移;多模态按 0 认;**人持**:
密钥/花费/公开部署/终审署名。

## P20|代码复现与提交

源码+compose 六臂并行;三道 gate CLI 一行复跑;测试 API 文档;前端入口
(部署方案【用户】);百炼凭证;12 臂 bundle;内置论文管线;确定性指标
脚本;自检五条。

---

# Part II · 完整设计推理(v1/v2 精粹,去重)

## II.1 立项逻辑(两篇论文的交叉点)

**论文一**《How Do Agents Fail on AutoResearch》(arXiv 2608.14905):100 任务/
8 组合/800 轨迹/45 模式(agent-as-a-judge κ=0.75);F.4 82.5%、E.2 78.1%、
D.4 77.5%、D.7 60.8%、A.2 44.6%;rollout prompt 已要求备选解释/证伪条件/
最弱点且被执行但**惰性**;三根因=三条缺失的边(R1 grounding/R2 depth/
R3 integrity;R3「无法靠加分数修复——需要 agent 不控制的验证」);原话:
「编排层干预能否关闭它是本工作未检验的开放问题」。
**论文二**《Prime Agent: A Self-Improving RLM Harness》(arXiv 2608.23552):
RLM(常驻 IPython,prompt-as-a-variable,程序化递归子代理)+ Continual
Harness;标准化执行/恢复/验证/资源记账(ARC-AGI-3 RHAE 30→95.5);
对 epistemic failure 不置一词。
**交叉点**:执行基座拿来即用;诚信基座没人提供;提示词已被证伪;缺承诺装置。

## II.2 六失效全表(45→6 归约)

| | 失效 | 断的耦合 | ARFT 实例 |
|---|---|---|---|
| F1 | 无观测的更新 | B 因文本而变 | E.2, D.4, X.5 |
| F2 | 无更新的观测 | 规则说该变,B 没变 | F.4, D.7, X.7 |
| F3 | 不可能证伪的观测 | 循环/泄漏/混杂/伪影/坏基线 | C.1, C.2, D.1, A.5, A.2, X.6 |
| F4 | 单假设空间 | \|B\|=1 默认确证 | A.1, X.3 |
| F5 | 预算错配 | 按 ease 选探针 | D.5, C.6 |
| F6 | 状态失忆 | B 活在上下文里 | X.1, X.2, 重提已杀 |

归并:F1/F2=B↔o 在裁量下;F3=o↔W 在裁量下;F4/F5=生成与选择;F6=持久化。
上一代系统消灭了生成侧、保留裁量侧——残差即 ARFT 的 60-82%,亦即两列
自审的诚信簇。**裁量侧唯一修复:信念改变有语法,语法有模型不拥有的检查器。**

## II.3 闭合论证与架构演化(诚实的设计史)

第一版:寄存器进 RLM 内核(guards 是方法)。**自我推翻**:无法白名单
Python(`R._h["H1"].status="refuted"` 总写得出来)。最终:状态 owner=独立
MCP 进程(12 工具/journal 哈希链/篡改即污染);执行=bwrap 只跑冻结命令、
raw 由 server 沙箱外捕获;终局=declare 当庭三 gate。RLM 降格为锚与计数器层。
λ-RLM(typed 控制优于自由 REPL)佐证:代码本身不闭合。

## II.4 RLM 时机:信息不对称触发表(对 Prime 默认分派的重写)

| 触发 | child 见 | child 不得见 | 检查 |
|---|---|---|---|
| claim 将迁移 SUPPORTED | claim_view | 父会话辩护 | grill |
| 新假设首探针前 | 去结局 setup | 频段 | 盲预测 |
| 假设句刚写 | 裸句 | 其余 | 复述重建 |
| **永不** | — | — | 分析/总结/自查 |

父会话唯一状态写入者;终局契约只注入父会话(0.17.77 修正:入 child 与其
只读契约冲突)。

## II.5 三层架构与两环

承诺层(地板,建成冻结)/移动库(天花板,本期工作)/评价词汇(ARFT,
降级为仪器)。战役环(ORIENT→PROPOSE→VALIDATE→EXECUTE→RECONCILE→
APPLY RULE)+ refine 环(失败类残差→计数器→reviewer→提升为 harness 教训,
**只搬过程教训不搬认知状态**;promotion checkpoint 在归档前)。

## II.6 结构闸清单(每个失效一个类型检查器)

零宽频段=拒绝回忆;互斥频段对=拒绝装饰;kill/scope 分支=拒绝无杀伤;
常量回显拒绝(`print(13.5)` 预登记剧场,0.17.77);方向倒置拒绝(否定短语
先剥离防误杀);预算 flock(并发读同一 spent 的 12/8 竞态);迁移必须点名
落地探针;(P#) 逐行对账。95 测试含闸测试。

## II.7 六移动与选择(认知层)

ABDUCE/SYNTHESIZE-PROBE/EXECUTE/UPDATE/CHALLENGE/REFRAME,每行验证器=
结构闸;REFRAME 由事件触发非「感觉有信心」;选择不排序:预测结果表,
判别力=不重叠对数÷成本(无概率 EIG)。认知债计数器(落地未迁移/攻击债/
同探针死亡/坟场)阈值触发——「锁死框架的 agent 注意不到前提,但它会数数」。

---

# Part III · 调研与定位(v3 精粹)

## III.1 信念状态四级谱系

自由文本 memory(L1)→结构化可检查(L2:Ask WhAI/Belief Engine/CausaLab)
→确定性受闸变更(L3:PatchBoard/MemTX)→证据授权+可重放提交(L4:
Hypothesis Graph/MemTX)。本作品=L4 的科研特化;差异在 gate 的对象与语法。
「inspectable→gated」不能作为首创主张。

## III.2 三级裁量分类与七边组合

model-internal / harness-external / **authority-external**。**七边组合裁决**
(deep research Pack 2):审查范围内无整体系统同时具备
authority-external 计量+预测先于结果不可变承诺+机械预声明迁移+证据寻址
信念变更+可回放完整性历史+重解释前强制归因+坟场感知准入——这是主定位。

## III.3 收窄后的可守主张(K1–K4)

- **K1 数值反事实承诺语法**(互斥频段 commit+五类拒绝+冻结执行+server
  重算+终局对账的完整链)——未见同构。
- **K2 认知债计数器**(确定性阈值调度认知移动)+**理念句**(同 journal
  闭环;元认知=债+拒绝,非角色)——未找到直接先例(77%)。
- **K3 ARFT 缺口定向编排消融**(设计成立,结果【待跑】)。
- **K4 六边界组合架构**(RLM substrate+model-agnostic MCP/Skill+类型化
  认知状态+预登记+隐藏计量+双评测)——组合未见同构。

## III.4 预登记谱系(修正版)

不可变承诺(OSF frozen/Registered Reports)+可复现工作流+POPPER 信息隔离
与机器统计控制(序贯证伪;Sequential information 假设=设计未见该轮数据,
但执行 agent 仍可自由生成分析代码、无哈希冻结)+Curie 控制流验证
→**我们编译成运行时认识论状态机**。ReplicatorBench:proceduralizes
preregistration;我们 operationalize and enforce。

## III.5 判决与引文弹药

宽口径 N1/N5 已被证伪(AgentSpec/Agent-C/PatchBoard/MemTX/Hypothesis Graph;
Goal-Autopilot/ECT 2026-08-22 并行)→ 定位句:「我们并非首创外部 gate,
而是把已知 runtime enforcement 推进到科研认识论,并直接检验 ARFT 的元认知
缺口」。self-grading 三引;tool hallucination(ToolBeHonest/Reasoning Trap);
premature termination(CausaLab/VIGIL/ECT);中文侧 Dolphin/TianJi/ChemAgents/
Agent-R/VerMem(「训练侧反思已结构化;缺运行期在线不可绕过的信念交易」)。

---

# Part IV · 证据全量

## IV.1 战绩总表(12 臂,同 seed 0,预算 8)

| world | plus@0.17.76 | 38max@0.17.77 | 两列 gate |
|---|---:|---:|---|
| textbook_M | 14.978 | **0.035** | 6/6 ✅ · ✅ |
| z_rebound | 202.18 | **2.424** | ✅ · ✅ |
| d_type | 20.042 | **1.427** | ✅ · ✅ |
| ca_rebound | **9.225** | 35.533 | ✗(declare 幻觉)· ✅ |
| h_sag | 10.724 | 37.270 | ✅ · ✅ |
| na_fatigue | 175.72 | 178.72 | ✅ · ✅ |

declare 真调率:plus 列 4/6(两臂自评全绿/工具幻觉)→ 38max@0.17.77 列
**6/6**(终局契约生效;含中断恢复)。

## IV.2 E2/E2b 双列审计(同判官 glm-5.3)

| | plus 列(n=15) | 38max 列(n=6) |
|---|---|---|
| 均值 HIT/轨迹 | 18.4 | **12.7** |
| D.4/E.2/F.4/C.1 | 100/93/93/93% | **17/33/0/17%** |
| 支柱 | P3=38% 居首 | 24/23/22/7 拉平 |
| 最干净轨迹 | — | zreb 4 hits(MSE 2.42) |

## IV.3 判官敏感性(实测,补 E2 caveat)

同批五条轨迹:opus-5 判(首轮,已隔离为 qwen38max-opus5judge)均值 15.6、
诚信簇仍 80-100%;glm-5.3 判均值 12.7(六条)、诚信簇 0-33%。**结论**:
模式级 HIT 强判官依赖;跨判官不可直比;本报告全部对照取同判官内。
(判官事故时间线:opus 别名漂移→发现→隔离→钉死 glm-5.3[1m] 重判。)

## IV.4 稳定性与干预台账(E1M)

0.17.73 每臂 1-5 次干预 → E1M 十二臂零重启、零超支;事故全录:百炼欠费
15:31-45Z(六臂自愈)、token-plan 误切 15:57-16:01(即切回,4 分钟)、
dtype rlm 子代理悬死(stop+提示恢复)、kernel 六臂并行冷装带宽饥饿
(~40 分钟)。干预计数:中性唤醒 ×8、内容提示 ×1、容器重启 ×2——全部
如实入各 bundle NOTES.md。

## IV.5 产物坐标

campaigns:e1-2026-08-2[45/27]-*/<arm>/(run/journal+prereg+probes+REPORT+
world-ledger · session.jsonl(Pi)+proma-session · NOTES);
ARFT:research/arft/results-qwen37plus/ · results-qwen38max/(终版)·
results-qwen38max-opus5judge/(第二判官)· runs/qwen38max/traj;
UI 存证:Race/report-work/shots/;E1-SUMMARY=数据总账。

---

# Part V · 答辩索引与待办

**答辩十二问**(DEFENSE-QA 全文另存):两轮闭环在哪(demo2r-ca,双绿+审计)/评委怎么体验
(部署【用户】)/仿真定位/判官循环论证(答:已实测敏感性+同判官内对照+
meter 原始事件不依赖判官)/plan 补写(时间戳+sha256)/回显闸窄(故意:
确定性重放合法,语义由 trace+对抗兜底)/单 seed/多模态 0/0.17.73→76 改善
口径/六失效可证伪性(消融预登记)/承诺层归属/复现时长。

**剩余待办**:fig7(干预确定性计数)→ DOCX/PDF 装配 ≤20 页 → 录屏(用户)
渲染 QA → 复现包+API 文档+冷启动计时 → 录屏 → 用户三样。
**判官一致性深做(可选)**:同批 opus-5/glm-5.3 逐轨迹逐模式一致率(κ),
语料已备。
