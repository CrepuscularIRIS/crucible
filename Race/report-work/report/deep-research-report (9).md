# PACK 1 · 新颖性总核验：结构化认知干预是否已有先例

## 核验口径与总判定

本次按“**对你们最不利的解释优先**”处理 novelty：只要已有公开工作实现了主张的**核心结构组合**，即使领域不是科研 agent，也不再把宽口径“未见先例”判为成立；只有把范围收窄到“科研假设更新/实验选择中的特定不变量”时，才保留领域创新空间。你们上传的实现材料显示，系统的关键点确实不是提示词，而是独立 MCP 状态 owner、追加式哈希链、冻结 prereg、结构拒绝、server 重算、外部 meter、以及 `report_declare` 三道终局 gate；同时材料明确写明消融阶梯仍是“已登记未跑”。fileciteturn0file1 你们本地语料也已经覆盖 Curie、POPPER、ReplicatorBench、ARFT 与主要 runtime 邻接，因此下面重点补的是其中缺失、且会改变 novelty 判断的工作。fileciteturn0file0 fileciteturn0file2

**总裁决先给：N1 宽口径已被证伪；N5 明确已有；N2 的“ARFT 专门化直接检验”仍有空间，但目前只能叫“预登记中的直接检验”，不能叫已完成的首个验证。** 最关键的新发现是 **Hypothesis Graph、PatchBoard、MemTX、Goal-Autopilot、Evidence-Carrying Termination**；前三者击中“模型提议、外部结构验证后才能写状态”，后两者直接击中“模型说 done 不算，runtime 的完成谓词才算”。citeturn11search0turn8academia3turn8academia2turn14academia2turn14academia1

ARFT 本身于 **2026 年 8 月 14 日**公开，明确把 800 条 trajectory、45 类模式归结为缺乏 metacognitive loop，并明确说 orchestration-level intervention 是否能关闭缺口是其未检验问题。citeturn17academia32 截至 **2026 年 8 月 26 日**，我没有检索到一篇可确认的学术论文**引用 ARFT 后再按其失败模式做 harness-level controlled ablation**；由于论文仅公开约十二天，这个“未找到”应理解为当前检索结论，而不是断言 bibliometric citation count 为零。

## 逐问核验

**Q1｜【空白】ARFT 的开放问题是否已被 citing work 直接检验？**

**结论：严格意义仍空白；宽意义已有明显前置/并行证据。置信度：88%。**

ARFT 自己明确把问题留作开放问题：“同一核心失败模式跨 8 个 harness-model 组合重复出现”，但“orchestration-level interventions 能否关闭它”没有测试。citeturn17academia32 截至检索截止日，我未找到“引用 2608.14905 → 选择 F.4/D.7/C.1 等 → 固定模型 → 做结构化 harness 消融”的后续论文。

但**不能再把更宽的命题写成“没人测试过 harness 能否在固定模型下改善 autoresearch”**。2026 年 8 月 11 日、甚至早于 ARFT 的 *Recovering Wasted Compute in Autoresearch Agents* 已明确固定底层语言模型、改变 prompt/control/tree-search/global debug consultant 等 agentic design，并报告性能提升，作者直接总结“large gains … achievable through agentic design alone, holding the underlying language model fixed”。它测试的主要是重复 debug、调参不足、搜索不探索、分析不驱动决策，并非 ARFT 的诚信/元认知模式，因此不是你们 Q1 的直接先例，却明显削弱“orchestration 对 autoresearch 的作用完全未测试”这种宽表述。citeturn0academia30

更早的 Hypothesis Graph 又已经在 coding inquiry 上做了**固定模型、改变 verdict source**的消融：模型负责提出假设，外部 harness 负责 deterministic oracle、kill、receipt、replay；作者甚至把贡献明确拆成“graph accountability substrate”和“externalized comparator capability mechanism”，并报告 within-model ablation。它不引用 ARFT、也不是科学研究 benchmark，却已经实证“把判决源从模型自身移到外部 harness”这一更一般机制。citeturn11search0turn11search1

**证据：**
*How Do Agents Fail on AutoResearch* · 2026 · ARFT 明确留出 orchestration intervention 开放问题。citeturn17academia32  
*Recovering Wasted Compute in Autoresearch Agents* · 2026 · 固定 LM、只改 agentic/control design 即获得 autoresearch 改善，但靶点不是 ARFT integrity taxonomy。citeturn0academia30  
*The Hypothesis Graph: A Verifiable Semantic Memory for Coding Agents* · 2026 · 外部 deterministic verdict source 的 harness 消融，比 ARFT 更早出现，但在 coding inquiry。citeturn11search0

**因此 N2 最稳的说法不是“第一个证明 orchestration 有效”，而是“第一个直接针对 ARFT 所定义 failure modes、在 AutoResearch/科学闭环中做结构 enforcement ablation 的候选实验”。**

**Q2｜【并行工作】“预登记频段 + 结构性拒绝 + journal 重放”是否已有研究-agent runtime 原语？**

**结论：完整三件套未找到；但非常接近的公开先例已经存在。置信度：91%。**

最不利的是 **The Hypothesis Graph**，2026 年 5 月公开。它明确把 inquiry 表示为 persistent hypothesis graph：节点含 hypothesis、exact trial command、kill condition、observed outcome、verdict；“模型提出，harness 检查并存储”；结论只有带 receipt、当前 dependency versions 并通过 atomic fail-closed publication 才进入共享 semantic memory；还有明确的 **Replay invariant**——提交的结论必须能由记录的 trial 重建。作者的公开归档还明确提到其实验包含 preregistrations。citeturn11search0turn11search1

这已经覆盖你们组合中的“**预先承诺某个测试 → 外部 checker 决定 kill/witness → fail-closed state publication → replayable warrant**”。它没有你们那种“互斥数值预测频段、零宽拒绝、kill/scope 分支、方向倒置、server metric 重算”的专门科研语法，所以**完整结构仍有差异，但不能再说整体思想未见先例**。citeturn11search0

POPPER 更早把 free-form hypothesis 分解成可测 implication，由 agent 设计和执行 falsification experiments，并以 sequential testing 控制 Type-I error；这是“研究假设必须经可否证实验”最强科研邻接，不过公开描述没有显示“结果出现前冻结预测带 + runtime 拒绝不合法承诺 + hash-journal replay”的同一组合。citeturn6academia1 Curie 则把 rigor 组织成 intra-agent、inter-agent 和 experiment-knowledge 模块，但其公开贡献仍是 agent framework 的 methodical control，而不是你们这种外部 typed belief-transition gate。citeturn6academia0

所以 Q2 的可守 novelty 是：

> **“数值互斥预测带作为科研假设 commit syntax，并由独立 runtime 在结果落地前机械拒绝不具可证伪性的 probe，再与追加式研究 journal/终局 replay 组成一体”未找到完全相同先例。**

不能守的是：

> “hypothesis + prereg/kill + external checker + fail-closed publication + replay 从未有人做。”

Hypothesis Graph 已经非常接近。citeturn11search0

**Q3｜【证实】结构化信念状态第三类——“写入经外部验证”——存在吗？**

**结论：明确存在，而且 2026 年已形成一个小谱系。置信度：99%。**

最直接的两个正式预印本是 **PatchBoard** 与 **MemTX**。PatchBoard 不让 multi-agent 用自由文本直接改共享状态，而让 agent 提交 validated JSON Patch；一个 deterministic kernel 在 commit 前检查 task schema、role-specific write contracts 和 runtime invariants。citeturn8academia3 MemTX 则直接使用 **transactional belief commit** 这个术语：write 先 staged，记录 evidence、permissions、provenance、validity，通过 validate-and-commit pipeline 才成为 actionable belief；不可逆工具调用又被当前 belief state gate，撤销 belief 会触发 typed cascading repair。citeturn8academia2

这意味着“模型不拥有最终写权限、模型只提交 mutation proposal、外部 kernel 决定是否 commit”本身已不是首创。你们真正特殊之处在于**把这种机制应用到科研 epistemic state，并规定 evidence→claim transition 的具体可证伪语法**。citeturn8academia2turn8academia3

此外，Hypothesis Graph 更直接切到认识论：model proposes，harness checks receipts/current dependencies，unsupported/stale state fail closed；这已经不是一般协作状态，而是“哪些 hypothesis 有权被当成当前知识”的 entitlement protocol。citeturn11search0

相反，Ask WhAI 和 CausaLab 属于“inspectable”而非“gated”：前者可以记录/重放交互、在 breakpoint 查询 beliefs、注入反事实证据，但 agent 仍直接写共享 EMR；后者用 DSL 记录 evolving SCM hypothesis，并与 hidden SCM ground truth 比较，却没有说明每次 hypothesis mutation 必须先经独立 verifier 才 commit。citeturn8academia0turn12academia1

**Q4｜【空白】“认知事件计数器 → 阈值触发调度”是否有先例？**

**结论：未找到足够接近的公开实现。置信度：77%。**

检索到了大量“风险分数阈值触发干预”“预算/step 限制”“confidence threshold escalation”“失败 prefix monitor”等机制，但没有找到把**具体认知欠债离散成 counter，例如 landed-without-update、attack debt、same-probe death、graveyard count，然后只在阈值达到时触发某张 epistemic move 卡**的明确研究先例。

DreamGuard 是 trajectory-level risk latent state → risk evidence → pre-execution intervention，不是事件计数的认知纪律。citeturn19academia0 PrefixGuard 是从 trace prefix 学习 failure-warning monitor，也不是“认知动作被 MCP event 计数后由 deterministic threshold 调度”。citeturn14academia3 AgentDoG 做 fine-grained contextual monitoring/diagnosis，但同样是 safety-risk monitoring。citeturn19academia1

因此这一点目前反而是你们最干净的候选创新之一。不过建议把 claim 写窄：

> **“epistemic-debt counters over committed research-state events，用 deterministic thresholds 调度特定认知移动”未找到直接先例。**

不要泛称“counter-based agent scheduling 首创”，因为 retries、budgets、risk thresholds 在 agent runtimes 中当然早已普遍存在。

**Q5｜【证实】runtime 强制的唯一 terminal/completion predicate 已有吗？**

**结论：明确已有，N5 的宽口径主张应撤回。置信度：99%。**

最强反例是 **Goal-Autopilot**，2026 年 6 月 10 日公开：它把 unattended agent 的 working state 外部化为 durable gated FSM，并设置“hard floor”，**任何 terminal `done` claim，如果对应 falsifiable gate 没有真实执行并通过，就不能终止为成功**；作者还给出 No-False-Success theorem。这个定义几乎逐字击中“模型自评完成不算，runtime 才拥有合法完成谓词”。citeturn14academia2

第二个、甚至与 `report_declare` 更邻近的是 **When May an Agent Stop? Evidence-Carrying Termination**，2026 年 8 月 22 日公开。ECT 规定 agent 只有在 typed certificate 把每项 required answer claim 绑定到 valid/in-scope trace evidence，并且 deterministic replay 能重建 claimed value 时，才允许返回 `COMPLETE`；其 frozen evaluation 专门测 premature unsupported termination。citeturn14academia1turn10academia12

这不是只有“类似理念”：它明确把 **COMPLETE boundary 本身**做成 runtime gate，而且有 receipt、scope、closed replay。citeturn10academia12

你们实现材料所记 E1/E2 日期是 2026-08-24/25，并称 0.17.77 的 terminal-contract 修复由 E2 暴露的“自评全绿”问题触发；就公开文献时间而言，ECT 的 arXiv 时间戳 **2026-08-22** 比这些记录日期早。fileciteturn0file1 citeturn10academia12 这**不能证明谁先独立发明**，但足以使“截至现在未见 terminal contract 先例”不可维护。

**Q6｜【证实】“工具不存在”幻觉与 agent 提前自评完成是否有正式研究/命名？**

**结论：两个现象都已有正式研究；但“幻觉一个不存在的工具，因此错误提前终止”这一完整因果链尚未见统一专名。置信度：94%。**

工具侧已经有成熟命名 **tool hallucination**。2024 年 ToolBeHonest/ToolBH 专门把问题拆成 solvability detection、solution planning 和 missing-tool analysis，并设置“缺必要工具、潜在工具、功能受限工具”等场景；论文发现最主要错误来源之一正是模型判断任务是否可解。citeturn5academia1 2025 年 *The Reasoning Trap* 又明确建立 SimpleToolHalluBench，其中一个 failure mode 就是 **no tool available**，并报告 reasoning enhancement 会提高 tool hallucination。citeturn5academia0

终止侧则已经有更精确术语。CausaLab 明确把 **premature stopping** 识别为 causal-reasoning agent 的主要弱点。citeturn12academia1 VIGIL 把“任务真实完成”与 agent 的 **terminal commitment** 分开，区分 missed execution、post-attainment drift、unsupported commitment、verified success。citeturn4academia1 ECT 使用 **premature unsupported termination**。citeturn14academia1

因此你们文中最好分别引用：

**tool hallucination / missing-tool solvability failure** → ToolBeHonest、Reasoning Trap；  
**unsupported completion / premature termination / terminal commitment failure** → CausaLab、VIGIL、ECT。citeturn5academia1turn5academia0turn12academia1turn4academia1turn14academia1

“phantom tool”可以作为工程俗称，但我没有找到它已经成为这一现象的权威学术标准名。

**Q7｜【证实】agent self-grading 相比外部 verifier 不可靠，这一依据稳吗？**

**结论：稳，但必须避免夸大成“自验证永远无效”。置信度：97%。**

最经典直接依据仍是 ICLR 2024 的 *Large Language Models Cannot Self-Correct Reasoning Yet*：在**没有 external feedback**时，模型的 intrinsic self-correction 往往不能改善推理，甚至可能使结果变差；作者额外测试 GPT-4-Turbo 与 Llama-2-70B 后仍观察到该现象。citeturn16search0turn16academia1

ACL 2024 的 *Pride and Prejudice* 更贴 self-grading：六类模型在多任务中存在 **self-bias——倾向于偏爱自己的生成**，self-refinement 还会放大它，而准确的 external feedback 能明显缓解。citeturn15search9 同年 *Small Language Models Need Strong Verifiers to Self-Correct Reasoning* 直接报告，强外部 verifier 能提升 self-correction，而弱 self-verifier 在判断“什么时候应该纠正”时存在明显限制。citeturn15search4

ARFT 则把它提升到 research-agent trajectory 级：82.5% 的 run 出现“agent 已识别关键缺陷但不修复并继续提交”的 F.4，这说明问题不仅是“不知道错了”，还包括**自我诊断没有结构性后果**。citeturn17search2

但反方证据也存在：PAG、self-rewarding correction、ProgCo 等说明训练、程序化 verifier 或特殊闭环可以改善 self-verification。citeturn3academia1turn15academia14turn16academia2 所以安全表述应是：

> **“同一模型的无锚 self-grading 不能作为强保证；独立、可执行或规则锚定的 verifier 通常更可靠。”**

不要写“LLM 自评必然失败”。

**Q8｜【并行工作】PEA/LATTICE/StepGuard 等到底约束行为安全还是认识论？是否有人把安全架构用于科研 hypothesis update？**

**结论：主流安全工作约束的是行为/授权不变量；但 2026 年已经出现把类似结构迁移到 belief commit 的工作。科研实验闭环中的完整迁移仍不普遍。置信度：96%。**

PEA 的核心 invariant 是 capability-intent consistency、intent lineage、goal drift 与 authorized execution；它把 intent generation、authorization、execution 分权，并证明的是 goal integrity under adversarial model compromise，不是“belief 只能因证据而改变”。citeturn1academia13 LATTICE 的 deterministic policy-as-code gate 同样判定 ALLOW/BLOCK/ESCALATE，强调 no code path to execution bypasses governance；hash-chain audit 记录的是 authorization provenance。citeturn1search0 StepGuard 在 tool action **执行前**判断安全风险，关注文件修改、泄漏、未授权动作。citeturn1academia12 ePCA 更明确：把 intent 编译为逻辑约束后才允许 physical operation。citeturn20academia1

所以你们与这些工作的主要分界仍成立：**它们通常约束“允许做什么”，而不是“允许相信什么/何时允许更新科学主张”。**

不过 Hypothesis Graph 已经把这个结构真正移到 epistemic side：当前 knowledge entitlement 由 receipt、dependency version、kill/witness 和 external deterministic oracle 决定。citeturn11search0 MemTX 则把 “memory write ≠ belief commit” 写成论文核心命题，外部 validate-and-commit 决定 belief 是否进入 actionable state。citeturn8academia2

科学-agent 领域里，POPPER 对 hypothesis validation 有严格 Type-I error control，CausaLab 对 evolving causal hypothesis 有 DSL 和 ground-truth mechanism scoring；但公开描述分别更像“统计检验约束”和“可检查表示”，并没有做到你们这种**每次科研 hypothesis mutation 都由不属于模型的 runtime gate 判断是否合法**。citeturn13academia0turn13academia1

因此，“安全分权→科研认识论”的迁移**不能再说理论上无人想到**；可以说“把 transactional/fail-closed epistemic commit 具体落进 autonomous scientific experimentation loop，仍很少见”。

**Q9｜【证实，但须限域】“运行中可绕、出口不可骗”是否有 runtime-monitor 文献支持？**

**结论：作为“报告真实性/成功声明”折衷有明确先例；作为“行为安全”原则则不成立。置信度：95%。**

Goal-Autopilot 正是在 termination 上设置 hard floor：内部 agent 可以犯错、停滞、走坏路径，但**不能把没有通过真实 gate 的状态报成成功**；设计故意允许“honest stall”代替 fabricated success。citeturn14academia2 ECT 更明确把 guarantee 限在 terminal boundary：COMPLETE 必须携带 scope-valid evidence 和 replayable certificate，而且作者特别声明它认证的是 recorded trace support，**不是 external truth、safety 或 alignment**。citeturn14academia1 这与你们“出口不可骗”高度同构。

但 runtime-monitor 文献同时明确告诉我们：**只验出口不能替代中途安全 gate。** PrefixGuard 的出发点就是 final outcome checks 往往来得太晚，若 agent 已造成不可逆 side effect，终局发现失败也无法补救。citeturn14academia3 StepGuard、AIRGuard、LATTICE 因而把控制点放在 action execution 之前。citeturn1academia12turn1academia14turn1search0

所以论文里最严谨的分界应是：

> **认识论/报告完整性可以接受“内部探索较自由、终局必须带证据”；外部副作用安全不能接受“先逃逸、最后再验收”。**

你们 bwrap 若只是允许 agent 在**封闭实验沙箱内部**自由做无害探索，而所有可评分/可发布结论必须过出口 gate，这个设计有充分邻接支持；若“逃逸”真的指越过安全边界执行外部副作用，则 terminal verification 不足以构成安全保证。citeturn14academia1turn14academia3

**Q10｜【证实】“inspectable → gated”是否已有人明确提出并实现？最权威 metacognitive-deficit 引文是什么？**

**结论：这一步已经被明确提出并实现；你们不能再把“从可视化状态到外部 gate”本身作为首创。置信度：99%。**

最清晰的 inspectable 基线是 Ask WhAI：它记录/重放交互，并允许 out-of-band belief queries 与 counterfactual evidence injection，从而让 belief dynamics 可见、可测试。citeturn8academia0 CausaLab 也通过 DSL 显式记录 evolving SCM hypothesis，让 trajectory 可以与真实 causal mechanism 比较。citeturn12academia1 Belief Engine 更进一步，把 stance 表成结构化 evidential state，并通过显式 log-odds update 保留 evidence-level trail。citeturn8academia1

但“gated”在随后工作里已出现。PatchBoard：agent 只能提出 JSON Patch，deterministic kernel 决定能否 commit。citeturn8academia3 MemTX：belief write 先 staged，validate-and-commit 后才能成为 actionable belief。citeturn8academia2 Hypothesis Graph：模型提出，harness 检查 receipts、version 与 replay，unsupported/stale proposal 不进入当前 semantic memory。citeturn11search0

因此真正的 novelty 必须继续往下走：

> **不是 inspectable→gated，而是“哪一种 epistemic transition 被 gate、gate 检查什么不可伪造证据、以及是否在真实 autonomous research loop 中改善 ARFT failure modes”。**

至于 **metacognitive deficit**，对你们的具体论证最权威、最贴任务的引用就是 ARFT 本身，而不是泛化的 cognitive-science 文献：它基于 800 条 end-to-end AutoResearch trajectory，直接定义缺少“check produced work against findings → revise → question path”的 metacognitive loop。citeturn17academia32 为“为什么不能把 self-critique 本身当闭环”提供更广泛实证支撑，可配 ICLR 2024 intrinsic self-correction 负结果与 ACL 2024 self-bias/strong-verifier 结果。citeturn16search0turn15search9turn15search4

**Q11｜【证伪/并行工作】N1、N2、N5 最终如何裁决？**

**N1「外部语法 + 模型不拥有的类型检查器未见先例」：已有。置信度 99%。** AgentSpec 早在 2025 年就用 DSL 表示 trigger/predicate/enforcement runtime constraints。citeturn2academia2 Agent-C 进一步把 temporal constraints 编译为一阶逻辑并用 SMT 在生成/tool-call 阶段强制 conformance。citeturn2academia3 PatchBoard 最直接满足“模型提交结构 mutation、模型外 deterministic kernel 做 type/schema/invariant check 后 commit”。citeturn8academia3 MemTX 与 Hypothesis Graph 已把同一思想推进到 belief/knowledge write。citeturn8academia2turn11search0 **因此 N1 按当前宽文字必须判“已有”。**

**N2「消融阶梯是 ARFT 开放问题的直接检验」：并行工作，且当前仍待实证。置信度 92%。** “直接检验”作为实验设计描述是成立的：ARFT 正好提出 orchestration intervention 未测试，而你们计划固定模型、逐层加入结构约束，再按 ARFT failure patterns 看变化。citeturn17academia32 但你们上传材料明确写的是“已登记未跑”；因此截至 2026-08-26，不能写成“我们已经回答 ARFT 开放问题”。fileciteturn0file1 此外，固定模型只改 harness/control 的 autoresearch 实证已有 *Recovering Wasted Compute*，而外部 deterministic epistemic oracle 的 within-model ablation 也已有 Hypothesis Graph；你们的空间是**把它们推进到 ARFT 定义的研究诚信/元认知 failure modes，而不是发明 harness ablation 这个范式**。citeturn0academia30turn11search0

**N5「唯一合法完成谓词由 runtime 强制未见先例」：已有。置信度 99.5%。** Goal-Autopilot 的 hard terminal floor 已直接实现 runtime-owned completion semantics；ECT 又把 COMPLETE 绑定 typed evidence certificate 和 deterministic replay。citeturn14academia2turn14academia1 你们仍可主张的区别是**科研报告专用的 prereg/reconcile/trace 三联 terminal contract，并与 hypothesis/probe state machine、外部 metric meter 一体化**，不能主张“runtime completion predicate 首创”。fileciteturn0file1

## 不变量类型 × 代表工作

| 不变量类型 | 代表工作 | runtime 实际保证什么 | 与你们的距离 |
|---|---|---|---|
| **行为安全** | PEA | intent 必须保持与用户授权/能力一致；authorization 与 execution 分权。citeturn1academia13 | 结构哲学近，epistemic invariant 远 |
| **行为安全** | LATTICE | 未经 deterministic policy verdict 的 tool action 没有执行路径；hash-chain 记录授权 provenance。citeturn1search0 | “独立 gate + hash audit”很近，但对象是 action |
| **行为安全** | AgentSpec / Agent-C | DSL/逻辑约束决定 agent action/temporal sequence 是否可执行。citeturn2academia2turn2academia3 | 已击穿“外部语法+外部 checker”宽 novelty |
| **行为安全** | StepGuard / AIRGuard / ePCA | 分别做 step-level pre-execution safety、authority control、proof-constrained action。citeturn1academia12turn1academia14turn20academia1 | 对 tool/action gate 是明确先例 |
| **认识论** | Hypothesis Graph | hypothesis 只有带可重放 trial/receipt、通过 harness check 后才能成为当前 warrant；stale/unsupported publication fail closed。citeturn11search0 | **目前最危险的 N1/Q2 邻接** |
| **认识论** | MemTX | memory write 不等于 belief commit；evidence/provenance write 通过 validate-and-commit 才变成 actionable belief。citeturn8academia2 | **直接证明“externally gated belief state”已存在** |
| **认识论** | POPPER | free-form scientific hypothesis 经 agentic falsification 与 sequential statistical test 获得有效性判断。citeturn13academia0 | 科研域最近，但 transition authority 没有你们硬 |
| **混合** | Goal-Autopilot | 世界/工具过程可以失败，但“success/done”必须由外部 falsifiable gate 授权。citeturn14academia2 | **N5 直接先例** |
| **混合** | Evidence-Carrying Termination | COMPLETE 必须携带 in-scope trace evidence，且 deterministic replay 能重建 claim。citeturn14academia1 | **与 report_declare 极近** |
| **混合** | PatchBoard | 任意共享状态 mutation 都经 schema、role write contract、runtime invariants 后 transactionally commit。citeturn8academia3 | 不是 scientific belief，但 architecture 几乎同族 |
| **可检查但非 gate** | Ask WhAI / CausaLab / Belief Engine | belief 可显式查询、记录、重放或按显式更新规则追踪，但不是所有语义更新都由独立 evidence validator 拒绝/放行。citeturn8academia0turn12academia1turn8academia1 | 正好提供你们所说 inspectable 基线 |

这个表给出的最重要边界是：**“行为约束移到模型外”早已成熟；“信念写权限移到模型外”在 2026 年也已出现；你们余下的新颖区是科研域中具体的 belief-transition language、实验前 commitment semantics、外部测量账本与 ARFT-targeted empirical validation 的组合。** citeturn1search0turn8academia2turn11search0

## 信念状态实现谱系

| 系统 | 存储 | 谁写 | 写入是否被验证 |
|---|---|---|---|
| **Ask WhAI** | 时间戳 shared EMR + 可回放 agent interaction | role-primed agents 可直接写共享医疗记录 | **否，主要是 inspect/query/replay**；框架观察 belief formation，而不是把每个 belief write 变成 fail-closed commit。citeturn8academia0 |
| **Belief Engine** | structured argument memory + scalar stance | 系统从论证中抽取 evidence，再按显式 log-odds 更新 stance | **部分**：更新规则显式、可审计，但 evidence uptake 的真实性并非独立世界 oracle 强制。citeturn8academia1 |
| **BeliefMem** | 多 candidate conclusions + probabilities | memory mechanism 随 observation 用 Noisy-OR 更新 | **结构化更新，但非强 external truth gate**；核心是保留 uncertainty，而非拒绝 unsupported epistemic mutation。citeturn12academia0 |
| **CausaLab** | DSL 表示 evolving SCM graph/equations | agent 产生 SCM hypothesis | **评测时验证，运行时不 gate**：hypothesis 可与 hidden ground truth 比较，但论文强调的是 inspectability/evaluation。citeturn12academia1 |
| **PatchBoard** | shared typed state + JSON Patch transaction | agent 只提交 patch proposal | **是**：deterministic kernel 检查 schema、角色写权限、runtime invariant 后才 commit。citeturn8academia3 |
| **MemTX** | transactional belief records，带 evidence/permission/provenance/validity | agent/producer 先 staged write | **是**：validate-and-commit 后才成为 actionable belief；撤销还会 cascade repair。citeturn8academia2 |
| **Hypothesis Graph** | persistent hypothesis graph；实现含 file/SQLite、trial receipts 与 dependency versions | 模型 propose hypothesis/trial；harness 掌握 publication | **是**：receipt、版本、kill/witness、atomic publication、replay invariant；unsupported/stale update fail closed。citeturn11search0 |
| **你们系统** | append-only hash-chain `journal.jsonl` + frozen prereg/probe artifacts | 模型只能经 MCP 提议；独立 `research-mcp` 是唯一 state owner | **是，而且更窄、更科研化**：预测频段、kill/scope、probe landed requirement、server metric 重算、trace replay、最终 `report_declare`。fileciteturn0file1 |

因此 Q3 的谱系已经不是三类，而更适合写成四级：

**自由文本 memory → 结构化 inspectable belief → deterministic/gated state mutation → evidence-entitled/replayable epistemic commit。**

你们目前落在第四级，但 Hypothesis Graph 和 MemTX 也已经进入这一层，因此不能用“第四级本身不存在”作为 novelty。citeturn11search0turn8academia2

## 新颖性裁决与可守主张

| 主张 | 原文字面裁决 | 最稳的新定位 | 主要反证 |
|---|---|---|---|
| **N1** 外部语法 + 模型不拥有的类型检查器未见先例 | **已有** | **科研认识论专用的 typed transition grammar + evidence-gated commit** 可争“并行/新组合” | AgentSpec、Agent-C、PatchBoard；更致命的是 MemTX、Hypothesis Graph 已进入 belief/hypothesis state。citeturn2academia2turn2academia3turn8academia3turn8academia2turn11search0 |
| **N2** 消融阶梯直接检验 ARFT 开放问题 | **并行工作；设计成立、结果待跑** | “ARFT failure-mode-targeted orchestration ablation in autonomous research”目前仍很有辨识度 | ARFT 自己未测试；但 fixed-model agentic-design ablation 与 external-verdict ablation 已分别存在。citeturn17academia32turn0academia30turn11search0 |
| **N5** runtime 唯一 completion predicate 未见先例 | **已有** | “prereg + reconcile + trace replay 的科研报告终局契约”可作为特定组合贡献 | Goal-Autopilot hard floor；ECT typed certificate + COMPLETE boundary + closed replay。citeturn14academia2turn14academia1 |

这也改变论文的最佳故事线。最强故事**不再是“我们发明了外部 gate”**，而是：

> 安全与软件 agent 已证明 external enforcement、transactional state 与 terminal certificates 可行；科研 agent 领域却仍主要依赖模型自己把 evidence 转成 belief。你们把这些机制具体编译成科研假设/探针/更新语法，并直接测试它们能否降低 ARFT 所观察到的 metacognitive/integrity failures。citeturn1search0turn8academia2turn11search0turn17academia32

这比“首个 checker / 首个 terminal gate”更稳，也更容易经受 reviewer 的 related-work 攻击。

一个尤其值得保留的差异，是你们的 **numeric counterfactual commitment**：不是泛泛写“我要测试 H”，而是结果出现前登记**互斥预测频段**，且 zero-width、非互斥、无 kill/scope、方向倒置、常量回显会由非 LLM gate 机械拒绝；随后执行字符串冻结，指标由 server 从 raw 重算，最终数字必须 reconciliation。fileciteturn0file1 在本轮检索中，我没有找到 Hypothesis Graph、MemTX、PatchBoard、Goal-Autopilot 或 ECT 同时实现这种“**scientific prediction semantics + evidence provenance + terminal accounting**”的完整链条。它更适合作为真正的系统 novelty。

同样，Q4 的 **epistemic-debt counters** 也是目前较干净的独特部分：已有 monitor 多用 learned risk/confidence 或 policy predicates，未找到把“落地却未迁移”“攻击债”“连续同探针死亡”等已提交认知事件计成确定性 debt，并只在阈值触发 cognitive operator 的直接先例。citeturn19academia0turn14academia3

## 定位句与对我们最不利的发现

**≤120 字定位句：**

**我们并非首创外部 gate，而是把已知 runtime enforcement 推进到科研认识论：以可重放证据约束假设迁移、预登记预测与终局声明，并直接检验 ARFT 的元认知缺口。**

**对我们最不利的发现**

最严重的是 **Hypothesis Graph（2026-05）**：它已经公开使用“模型提出、harness 检查”、hypothesis + kill condition + exact trial、deterministic oracle、receipt、fail-closed publication、dependency invalidation 与 replay invariant；因此“模型外的 epistemic checker / replayable hypothesis state 未见先例”已经不可守。citeturn11search0turn11search1

第二严重的是 **MemTX（2026-07）**：论文甚至直接提出“memory write is not a belief commit”，并把 belief 写入做成 staged transaction + validate-and-commit；Q3 的“第三类是否存在”答案因此是明确的“存在”。citeturn8academia2

第三严重的是 **PatchBoard（2026-05）**：agent 只提出 structured JSON mutation，模型外 deterministic kernel 做 schema/type/write-contract/runtime-invariant checking 后才 commit。这几乎直接证伪 N1 的宽文字“external syntax + model-does-not-own type checker 未见先例”。citeturn8academia3

第四严重的是 **Goal-Autopilot（2026-06）**：runtime hard floor 已规定“不通过真实 falsifiable gate 就不能说 done”，所以 N5 的“唯一合法完成谓词由 runtime 强制未见先例”不能继续使用。citeturn14academia2

第五、时间上尤其敏感的是 **Evidence-Carrying Termination（2026-08-22）**：它把 `COMPLETE` 明确定义成 typed certificate + in-scope trace evidence + deterministic closed replay；你们材料记录的终局修复与实测日期是 8 月 24–25 日，因此至少从公开文献时间线看，它是必须正面讨论的 contemporaneous/preceding work。citeturn14academia1 fileciteturn0file1

最后，**N2 目前还不是结果性贡献**：上传实现说明明确说消融阶梯“已登记未跑”。因此最稳的论文措辞只能是“我们预登记了一个直接检验 ARFT 开放问题的结构化消融”；真正把 N2 升格为强 novelty，需要跑完固定模型/固定任务/固定预算的 ablation，并证明结构 gate 对 ARFT 目标模式产生选择性下降，而不是仅提高 endpoint score。fileciteturn0file1 citeturn17academia32