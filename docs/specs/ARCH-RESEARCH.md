# 架构分层 —— 外部调研结论（2026-08-20）

来源：ChatGPT web（`playwright-extension`，标签页 `chatgpt.com/c/6a86e86b-8b88-83ea-9867-57d82579c105`
"Architecture Layering Guidance"，25,089 字符）。**证据，不是判决** —— 引用核对结果在第八节，
有一条没对上。

**结论先写**：

> 编排决定 **WHAT is due**。skill 说 **HOW**。hook 说 **MAY NOT**。
> MCP 给 **CAN**。system prompt 说 **WHY** + 定义全局语义。

**立刻要做的那一个改动**：把 `due_skill` 和 `may_stop` 变成 **harness 事实**，
不是让 Qwen 去推断的东西。

---

## 零 · 判决 —— 抽象边界画错了

> "The main architectural issue in your measurements is not 'Qwen ignores skills.'
> It is that **a mandatory workflow dependency is currently represented as optional,
> model-discovered knowledge.** That is the wrong abstraction boundary."

我们那两个实测失败是**同一个错误**：

| 实测 | 我们以为的原因 | 实际类别 |
|---|---|---|
| 三条基线 `Skill` 工具**零调用** | 技能面不好看 / 加载坏了 | 强制依赖被表示成了可选知识 |
| 三条基线 16–26 轮**自愿退出**（200 可用） | 模型偷懒 | 确定性生命周期义务被委托给了随机的模型主动性 |

> "deterministic lifecycle obligations were delegated to stochastic model initiative."

判定规则（他的综合，非引用标准）：
**把一件事放进能正确决定它的、最不随机的那一层。不要让模型去重新发现 harness 已经知道的不变量。**

---

## 一 · 五层各管什么

| 关注点 | 层 | 判定测试 |
|---|---|---|
| 目标、竞赛约束、简短的全局不变量、`accepted` 的语义 | **system/context** | 模型几乎每一轮都得懂，但**知道就够了**。如果"违反必须不可能"，往下再复制一份 |
| 阶段内的科学流程、配方、清单、例子 | **渐进披露的 skill** | 有用的程序性知识，但**具体怎么做仍需判断** |
| 阶段转移、"现在该交什么"、强制评审调用、重试/重开、终止谓词、状态持久化 | **确定性编排** | **跳过它 = 这一轮无效 → 就不该是 agent 的选择** |
| "这个动作现在不许发生" | **能 deny 的 hook** | 不变量天然表达在事件边界上：停机、工具调用、完成、外部模型调用、破坏性动作 |
| 评审器/证伪器/搜索/容器/数据服务 | **MCP / 工具** | 它是**带输入输出的能力**，不是流程策略 |

推论两条：

1. `STATE.md` 应该写 `phase=ANOMALY; due_skill=anomaly; blockers=[...]`，
   **不该让模型从一张 18 条的技能菜单里推断"ANOMALY 大概相关"**。
2. 反过来，**不要把详细阶段方法论塞进常驻 system prompt** ——
   Anthropic 的 Skills 设计存在的理由就是避免这个：只预载 name/description，正文按需取。
   （Agent Skills，2025-10-16，2025-12-18 更新）

---

## 二 · Skill 零调用不是 bug，是机制本来如此

Anthropic 文档的机制：预载 name/description，**"if Claude thinks the skill is relevant"** 才读正文。
**默认机制是模型自选检索，不是有保证的依赖机制。**

**SkillsBench 1.1（2026-06-16）** —— 实验条件是**故意挂载专家写的 skill 但任务指令里不点名**：

- 调用率 **46%–99%**（随模型/harness 变）→ "可用且相关" ≠ "被调用"
- 整体有用：平均解决率 **33.9% → 50.5%**
- 但 87 条任务里 **13 条负增益**
- **按长度分档的提升**：Compact **+19.0** · Standard **+21.5** · Detailed **+14.5** ·
  **Comprehensive +0.7**
- 用到 **4 个以上** skill 的任务，提升低于用 1–3 个的

**SWE-Skills-Bench（2026-03-16）** —— 49 个公开 skill × ~565 个任务实例，确定性验收测试：

- **39/49 零提升**，平均 **+1.2%**，token 开销最高 **+451%**
- 7 个有实质提升；**3 个有害**（指导与项目实际版本冲突）
- 是 SWE 证据不是科研 agent 证据，但**足以否掉"程序性文字越多越好"**

→ **我们那个 69.5 KB 单体 `grill-loop/SKILL.md` 正落在 Comprehensive 那一档（+0.7）。**

→ 结论：**编排点名加载 skill 不是反模式，它是依赖注入，不是 skill discovery。**
自主发现留给真正可选的专长。

→ 证据空白（他明说）：**没有任何公开对照实验直接随机化"模型浏览技能面自选" vs "编排声明 due_skill=X"。**
这正是我们能做的那个消融。

---

## 三 · 停机：hook 是对的层，但有天花板

**"For a hard contract, the hook/orchestrator is the correct enforcement layer.
The prompt remains useful for explaining the contract, but not for enforcing it."**

两个必须知道的坑：

1. **超时方向是反的（已亲自核实，AUTHORITATIVE）**：
   > "A timed-out `command`, `http`, or `mcp_tool` hook doesn't block the tool call.
   > The call continues through the normal permission flow, **so don't count on a stalled
   > hook to act as a gate.**"
   > "An Agent SDK callback hook that exceeds its timeout **blocks** the tool call."

   → **竞赛规则闸门必须 fail-closed 的话，MUST NOT 走 command/http/mcp hook 的超时路径。**

2. **"Claude Code 连续 8 次 block 后覆盖 Stop hook" —— 我没能在官方文档里核实到（见第八节）。**
   但结论不变：Anthropic 自己的做法就是外层循环，不是无限阻塞的 Stop hook。

**Anthropic 自己怎么解决长任务停机：**

- Carlini 用并行 Claude 建 C 编译器（2026-02-05）：普通脚手架**解完一部分就停下来等输入**；
  他的 harness 就是**重新进入 Claude 的循环**——一个任务完成就开下一个 session。
- 长任务 harness（2025-11-26）：后续 agent 看到"已经干了不少活"就会**宣布任务完成**。
  解法不是更强的散文，是 **initializer + 持久化进度产物 + 反复重开 session 且要求增量推进**。

→ crucible 的真终止条件必须是**程序化的**：

```
terminal := accepted OR terminal_failure OR hard_resource_budget_exhausted
```

模型说 "done"、反问用户下一步、或者不带工具调用地返回，**都不是终止**。
harness 观察到未遂的停机，查状态，要么关掉这一轮，要么带一条紧凑的 delta 再开一轮：
`"Stop denied: REPORT.accepted=false; unresolved findings F13,F18; due action=close_or_rebut_findings."`

**命名**：叫 **premature voluntary termination（过早自愿终止）**。
**不要叫 "context anxiety"** —— 那是特指模型感到上下文快到上限而收尾的子类
（Sonnet 4.5 上观察到，Opus 4.5 上消失，Scaling Managed Agents，2026-04-08）。
我们 200 轮只用了 16–26，**轮次充裕，证据不支持是上下文焦虑**。

---

## 四 · 最强的反方意见（他自己给的，必须记下来）

> **确定性验证会悄悄把"科学正确性"变成"流程合规"。**

Anthropic 明确警告：**要求特定工具序列/路径的 grader 很脆**，因为 agent 会找到评估者没预料到的
有效路径；**能判产物就判产物，不要判路径**（Demystifying evals for AI agents，2026-01-09）。

ResearchClawBench 作者 2026-06-09 亲口说：**不要求复现原论文的确切方法论，评的是 outcome。**

→ **Type-A 的边界要画窄**：

| 判什么 | 结论 |
|---|---|
| "报告的 AUROC 与重算的 AUROC 在容差内相等" | ✅ 好 —— 这是**证据的必要不变量** |
| "agent 在实验 Y 之前跑了基线 X" | ⚠️ 危险 —— 除非**因果有效性真的要求它**，否则这是仪式 |

> "That is the strongest substantive objection to a large acceptance state machine:
> **it can make crucible optimize its own bureaucracy instead of the withheld outcome rubric.**"

顺带一条对 NeuronBench 直接相关的：**NeuronBench 评的是反事实预测，不是 agent 有没有正确说出
隐藏机制的名字**（Model Discovery Agent，2026-08-10）。

另外，跨家族评审有实证支撑（不只是审美）：EMNLP 2025 记录了 LLM 评审的 self-preference，
2025-08-08 的统计研究专门研究 LLM-as-a-judge 的自偏。跨家族不等于独立，但**切断了
"同一个生成器给自己开脱"这条最直接的通道**。

---

## 五 · 方法论选择器 —— 确认是空白

他明确回答：**没找到任何开源系统干净地实现我们提的这个抽象**：

```
读 manifest/artifact 拓扑 → 分类实验情境 → 选方法论
（阳性对照优先 / 同划分基线 / 参考输出复现 / 仅推理验证）
```

> "That looks like a genuine gap."

九个 repo 逐条：

| repo | 有没有 manifest→方法论路由 | 值不值得抄 |
|---|---|---|
| **AIDE**（2025-02-18） | ❌ `data_preview` 喂进 planning prompt，但**外层搜索策略固定**（draft→debug→improve）→ 是 data-conditioned planning | ✅ **抄那个紧凑 data preview 喂 planning** |
| **AI4S Skills** | ❌ 但有**显式 input-form router**：宽方向→`research-explorer`；给了真实测量结果→`experiment-suite` 吃 `results.json`。并且**显式点名下游每一步跑哪个 skill** | ✅✅ **最接近我们"skill is due"概念的已发布代码**；但分支词汇比 RCB 需要的粗得多 |
| **AI Scientist-v2**（2025-04-10） | ❌ `agent_manager.py` **硬编码四阶段**：initial_implementation → baseline_tuning → creative_research → ablation_studies | ❌ **MUST NOT 整套抄这个固定四阶段** |
| **Agent Laboratory**（EMNLP 2025） | ❌ 固定流水线：综述→实验→写作 | ❌ 它是我们要超越的对照，不是要抄的 |
| **FreePhDLabor**（2025-10-17） | ❌ 论文明确批判 rigid pre-programmed workflow，工作流由实时 agent 推理决定；但**没有先分类 manifest 形状的证据** | ✅ **抄 manager/delegation 架构**（findings-adaptive orchestration） |
| **EvoScientist**（2026-03-09） | ❌ 持久化 ideation/experimentation 记忆 + Evolution Manager，无 manifest classifier | ✅ **抄"从累积发现调整后续策略"** |
| **ResearchAgent**（NAACL 2025） | ❌ 是**文献之上的 ideation** 系统，不是原始数据/复现的方法论选择器 | ❌ 不是这个 benchmark 的对的先例 |
| **Zochi** | ❓ 仓库明说 **"final code was cleaned and modified to remove traces of Zochi's intermediate research process"** | ❌ **无法审计 —— 不能下任何结论** |
| **Kosmos**（2025-11-04） | ❓ 概念上有能力（12 小时循环 + 结构化世界模型），但 Edison 官方 GitHub **只放了 `kosmos-figures`**，orchestration 没开源（`jimmc414/Kosmos` 是第三方改编，不是 Edison 源码） | ❌ 不是可用的开源先例 |

**本地核对（我自己测的）**：`/home/lingxufeng/autoresearch` 下 **35 个条目里没有 AI4S**；
对全目录 grep `data_preview` / `manifest` / `start-state`，**没有任何一个 repo 有 manifest 形状路由**。
→ **AI4S Skills 是唯一一个值得新抓下来的仓库。**

→ 拼三样：**AI4S 的显式 start-state router + AIDE 的紧凑 data preview 喂 planning +
FreePhDLabor/EvoScientist 的从累积发现调整策略。**

→ 我们的 `backend/clawui/method.py:select()` 就是那个缺的 `ManifestProfiler → MethodSelector`。
**RCB 作者自己的失败分析直接支持它**：主导失败是 agent **没搞懂/没规划好科学工作流，
因而检索或推理了错误的 artifact**。

---

## 六 · 该先砍什么（他的排序）

**砍模型可见的治理面，不砍底层仪器。**

| 动作 | 怎么做 |
|---|---|
| **保留** claims ledger | 但降级为**机器侧遥测**。别让模型在活动上下文里背整个墓地、历史治理弧、所有旧 falsifier |
| **只喂模型** | live claims · 当下的 falsifier · 未解决的 findings · 当前 phase · close criterion |
| **换掉** 69.5 KB 单体 skill | 换成 router + phase 分解（我们上游 fork 的 **7.2 KB router + phase 文件**比整块加载 ~17k token 更贴近文档里的渐进披露实践） |
| **收窄** cross-family review | 只在 Type-B 闸门**真的要裁决**、或异常需要时跑；**不要每阶段仪式性地跑** |
| **保留** Type-A 确定性验证器 | 便宜的 ground truth（但边界按第四节画窄） |
| **保留** 停机/续跑机制 | 三条基线证明：**没用完的轮次预算在模型自愿退出时毫无价值** |

**MUST NOT 先砍方法论选择** —— 那是唯一一个直接对着 RCB 已公布主导失败模式的层。

---

## 七 · 怎么定分：边际架构消融，不是架构选美

固定：Qwen 模型 · 采样 · 算力额度 · 检索语料 · benchmark 任务。逐层加：

```
continuation-only 基线
  → + due-skill router
    → + 方法论选择器
      → + Type-A 闸门
        → + Type-B 跨家族评审
          → + 完整 ledger/治理
```

配对任务 + 多次随机试验。

**主端点：benchmark weighted score / 单位成本**（原始加权分也一并报）。
**次要**：premature-stop rate · startup-token share · due-skill compliance ·
成功实验数 · protocol/evidence 不匹配频率 · **真正改变了 accepted 结果的跨家族 findings 数** ·
我们的 **wrong-claim survival latency**。

**判据（严）**：一个治理层活下来的条件是 —— 配对边际 **Δ分 / Δ成本 为正且跨任务稳定**，
**或者**它强制的是一条不可交易的竞赛规则。
**只改善内部可观测性但零分数提升的层 → 降级为 off-context 遥测，不做模型可见流程。**

三条竞争假说的裁决：

- **"多给轮次"** ❌ 我们自己的测量就否了：200 可用，只用 16–26。
  **可用轮次在续跑语义强制继续之前一文不值。**
- **"多花算力"** ⚠️ 更可信（AIDE 证明树搜索能拿算力换性能，RCB 也在做 Pass@k）。
  但 **更多轨迹会把已有的系统性流程错误乘上去 —— 跑五遍错的方法论是很贵的方式去把同一条
  checklist 项做错。**
- **"改进检索"** ✅ 可信，且与我们**互补不竞争**（RCB 作者说很多失败源于没检索/推理对 artifact）。
- **"改进图"** ⚠️ 证据较弱作为**首个**最高杠杆干预：rubric 确实是多模态的，
  但已公布的失败刻画把**流程/证据/科学核心**的失败放在呈现质量的**上游**。

---

## 八 · 引用核对（CLAUDE.md 要求：证据不是判决）

| 论断 | 核对结果 |
|---|---|
| PreToolUse 上 command/http/mcp hook **超时 fail-open**；Agent SDK callback hook 超时**阻塞** | ✅ **AUTHORITATIVE** —— 官方 hooks 文档逐字确认，含 "don't count on a stalled hook to act as a gate" |
| 可 block 的事件包含 Stop / SubagentStop / TaskCompleted / PreToolUse | ✅ **AUTHORITATIVE** —— 文档 "Exit code 2 behavior per event" 表 14 项，含 `Stop` = "Prevents Claude from stopping, continues the conversation" |
| **"Claude Code 连续 8 次 block 后覆盖 Stop hook"** | ❌ **未核实** —— 抓了官方 hooks 页两次，**没有任何 "8 consecutive" 或 `stop_hook_active` 的文字**（该页对 WebFetch 有截断，不能断言"不存在"）。**当作未验证处理**；外层续跑循环的结论**不依赖它**（Anthropic 自己的长任务做法就是外层循环） |
| AI4S Skills 在本地 autoresearch 收藏里 | ❌ **实测不在** —— 35 个条目逐条看过 |
| 本地任一 repo 有 manifest 形状路由 | ❌ **实测没有** —— 全目录 grep `data_preview`/`manifest`/`start-state` |
| SkillsBench 1.1 / SWE-Skills-Bench 各项数字 | ⚠️ **REPORTED** —— 给了出处和日期，我没独立核 |
| 九个 autoresearch repo 的代码级论断 | ⚠️ **REPORTED** —— 都给了 "accessed Aug. 20, 2026" 的代码路径，**AI4S 和 AIDE 这两条动手前须自己核** |
| "五桶分层"有已发布标准 | ❌ 他明说**没有** —— "that mapping will be a synthesis, not a quoted standard" |
| "hook vs 同样措辞的 prompt" 的对照实验 | ❌ 他明说**没找到** —— 这里的证据是机制级文档 + 长任务经验 + 我们自己的负面结果，**不是随机对照** |
