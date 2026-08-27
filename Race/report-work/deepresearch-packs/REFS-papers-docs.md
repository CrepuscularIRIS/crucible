# REFS · 论文与文档清单(本机全文/精读材料)

> 与任意 PACK 一起上传。「我们的读法」= 我们从该文抽取并用于设计的内容。

## 论文(本机有全文)

1. **How Do Agents Fail on AutoResearch: End-to-End Diagnostic Evaluation
   on 100 Real-World Frontier Research Tasks**(arXiv 2608.14905v2,Prentis AI;
   本机 docs/product/2608.14905v2.txt)
   100 任务/8 harness-模型组合/约 800 轨迹;45 失败模式分类
   (agent-as-a-judge,人工校准 κ=0.75);高频 F.4 82.5%/E.2 78.1%/
   D.4 77.5%/D.7 60.8%/A.2 44.6%;三根因 R1(主张→证据边)/R2(判断→
   动作边)/R3(目标→正当路径边);其 rollout prompt 已要求备选解释/
   证伪条件/最弱点且被执行但**惰性**;基准对照表(CORE-Bench 等 endpoint
   评分);原话:「缺陷在模型层而非特定 scaffold;**编排层干预能否关闭它是
   本工作未检验的开放问题**」。
   **我们的读法**:45 模式→六种耦合断裂(F1 无观测更新/F2 无更新观测/
   F3 不可证伪观测/F4 单假设/F5 预算错配/F6 状态失忆);F1/F2/F3 同属
   「耦合在模型自由裁量下」→唯一修复是把信念改变的语法交给模型不拥有的
   类型检查器;其判官被我们复用于自审(E2)。
2. **Prime Agent: A Self-Improving RLM Harness**(arXiv 2608.23552v1,
   Prime Intellect;本机 docs/product/2608.23552v1.txt)
   RLM(常驻 IPython,prompt-as-a-variable,程序化递归子代理)+ Continual
   Harness(prompts/memories/skills/subagent 规约的持久可精炼状态);
   标准化执行/恢复/验证/资源记账;ARC-AGI-3 RHAE Best@1 30%→95.5%。
   **我们的读法**:决定性的是「模型发代码不发文本」的闭合可能性;
   执行基座拿来即用,epistemic 层它不管——我们对它的两处重写见
   REFS-our-implementation §1/§4。
3. **Automated Hypothesis Validation with Agentic Sequential Falsifications**
   (POPPER,arXiv 2502.09858;本机 oss/POPPER)——最近邻假设验证工作,待深读。
4. **Curie: Toward Rigorous and Automated Scientific Experimentation with
   AI Agents**(arXiv 2502.16069;本机 autoresearch/Curie)——「严谨」邻接。
5. **co-scientist**(Gottweis et al., Nature 2026;开源复现在
   autoresearch/co-scientist)。
6. **Robin**(arXiv 2505.13400)、**AiScientist 长程版**(arXiv 2604.13018,
   File-as-Bus)、**MLEvolve**(arXiv 2606.06473)、**ScienceAgentBench**
   (arXiv 2410.05080)、**DiscoveryBench**(arXiv 2407.01725)、
   **ReplicatorBench**(arXiv 2602.11354,KDD 2026)、**Continual Harness**
   (arXiv 2605.09998)、**PaperJury**(arXiv 2606.16322)、
   **spark-to-paper**(arXiv 2608.11924)。
7. Race/ 内参考:**s44172-025-00520-4.pdf**(StarWhisper Telescope,
   Nature Astron——天文观测自动规划闭环,竞赛引用)· 火星陨石产氧
   AI 化学家(Nature s44160)· AI Scientist v1/v2(Sakana)· XH-202619
   赛题两份 PDF(题目+解析会需求拆解)。

## 内部设计文档(推理链存档,按演化序)

1. **docs/product/PrimeAgent.md**——第一性原理:B/W/四操作/两耦合;
   六失效×ARFT 实例映射表;RLM 闭合论证;内核寄存器设计(后自我推翻:
   「无法白名单 Python」);Arbor 形态分析(对:无 LLM 的确定性 owner/
   重算而非采信;错:单调分数谓词);CLAIM/PROBE 状态机与八谓词;
   模型边界清单。
2. **docs/product/Fable5.md**——ARFT rollout prompt 的四类认知动作全部
   被执行且惰性的发现;三根因=三条缺失的边;「缺的不是认知是闭合」;
   一环六移动契约表;选择三问分解(对错问探针/值得问预测表/价值问外部
   预测误差);三终局 gate;六陷阱世界与指标;消融阶梯及预登记预测。
3. **docs/product/A.md / B.md**——移植规则(每行要么塑形 MCP 调用,要么
   命名结构判不了的判断并放决策点);三层架构(承诺地板已建成冻结/
   移动库=真正的工作/ARFT 降级为评价词汇);移动库六卡;rlm 触发表
   (信息不对称,含「永不」行)。
4. **docs/product/FableDesign.md**——refine 环的四条闭不上的边界+先手
   E-refine 实验设计。
5. **Race/architexture.md**——选型期架构论证(772 行):比赛要「科研闭环
   +可验证+可迭代」非无人化;基座锁 Qwen 的合规路线(研发用高能力
   harness、参赛用 Qwen 后端,能力层 model-agnostic);隐藏评测器
   (前身实验 reward-hack 的教训);FULL-AUTO/HITL 双模式对照;Benchmark
   模式 vs Research-Loop 模式分开评分;四层测试阶梯;收敛架构图与七步
   优先级。
6. **Race/Event.md**——叙事层(S1/S2/S3 的源头;belief state→probe→
   constrained update 的措辞)。**Race/FILLING-1B.md**——P1-P20 填写
   组织与七条红线。**Race/kbs.md**——认知层定位对话(Epistemic Skill
   Harness;Continual Harness 不是创新点本身)。
7. **docs/plans/PLAN.md**(P0-P5 工程实现史)· **docs/plans/EVAL-PLAN.md**
   (评测口径)· **docs/plans/PROMPT-ADAPTATION-TODO.md**(终局契约与
   结构闸的实施记录+架构复核表)· **docs/specs/SKILL-PACKAGING.md**
   (技能层审计:18 技能 83% 指向写论文而 benchmark 考做研究的诊断)。

## 关键评测产物(本机)

research/campaigns/e1-2026-08-2[45]-*/(六 world 全量 bundle:journal/prereg/
probes/REPORT/session)· research/campaigns/E1-SUMMARY-2026-08-25.md ·
research/arft/results-qwen37plus/(E2 判官产物:45 模式矩阵/根因统计)。
