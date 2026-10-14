---
name: research-loop
description: 研究工作的第一动作。Use when 接到研究问题、想执行评测命令、开始或继续任何研究战役、会话刚启动、压缩刚发生、或不确定当前该做什么时。
version: 0.6.1
---

# research-loop —— 研究战役主路由

## 你在做什么

从 MCP 信念状态与锚的 `NEXT:` 行推进，一次只装一个阶段 skill。战役状态**不在对话里**：
对话会被压缩截断，journal 不会；kernel 变量跨压缩存活（kernel 重启才重置）。
草稿（ledger、recall、sim 记录、lessons、REPORT）一律写在 `research-work/<run>/`。

## 铁律

```
信念只经 MCP 工具改变 · 预登记之前不观测 · 只有落地测量能终结 claim · 用户喊停即停
```

**违反字面就是违反精神。** 手改 server 拥有的状态文件（journal/register/
prereg/probes）= 造假，trace gate 逐字重放当场抓——run 目录 `.proma-research/<run>/`
里你一个文件都不写：报告与教训写在 `research-work/<run>/REPORT.md`、`lessons.md`，
REPORT 由 `report_declare` 复制进 run 目录；预登记前用 Bash/kernel"看一眼"将被登记的命令 =
把预测变成回忆，且这条违规发生在 journal 之外，三道 gate 一道都拦不住；
gate 是裁决不是续命。推理、反问、审查只能 DEMOTE / SCOPE / REFRAME 一条已登记
claim——终结它的只有落地测量。问题的单位是决策分叉：答案不改变动作的问题不问。

## 完成定义（DoD）

**战役完成 = `mcp__research__report_declare` 收到三道 gate 裁决事件。** 写完 `research-work/<run>/REPORT.md`、
自评"全绿"、或声称"工具不可用"都不构成完成——journal 里没有 declare 事件，
战役永远是未完成态，会话不得停止。

预算纪律：确证阶段（最后一个 LIVE 假设的攻击 + 对账）预留 **≥2 reps**；
第一个假设出现前花光全部预算 = 确证阶段零预算，只会把你自己逼向回显探针
那条歪路（prereg 现已结构性拒绝常量输出命令）。

## 程序

**开场输出契约（你的第一段文字输出必须是这个形状，供人纠正、供夹具判定）：**

```
[战役] run=<名> · mode=<open|score|identify|legacy> · LIVE=<n> 坟场=<n> ⚠=<n>
[阶段] 正在做：<锚 NEXT 行的动作>
```

P5.1 实测：没有这个契约时，宣告与锚从未发生——模型凭 `<available_skills>` 描述自行动手。

1. **K0：开局唯一一次停顿**（新 run，还没有 journal）：run 名 = `PROMA_RESEARCH_RUN`
   钉死值（无 pin 时才由用户给出）。打开 `references/intake-check.md`，按它写好
   `<cwd>/.research-pending/K0-intake.md`（`status: pending_user`），在**一条消息**里
   请用户确认 mode、成功谓词、depth、世界与 seed、副作用信封、预算估计——然后停。
   确认后才 `research_init{mode, success_predicate, depth, recall}`；mode 在 init 时冻结，
   换 mode = 新 run。resume 时看到 pending 文件仍是 `pending_user` → 重新呈现同一次确认，
   不调 `research_init`。已有 journal 的 run 跳过 K0，直接 `research_state`。
   ✓ 成功条件：停顿前草稿已在 pending 路径上；确认后 RULINGS.md 有一行 `Ruling: intake: mode=… · predicate=… · depth=…`。
2. **立锚**：kernel 里 `research_kit.anchor(run)`——MODE 与谓词、LIVE、约束块（坟场禁令 ·
   LIVE (narrowed) · 等价类 · 本 run lessons）、探针、攻击、COUNTERS 与 ⚠、nugget、`NEXT:` 行
   一屏收齐，存进 `research_kit.LAST` 跨压缩存活。
   `research_state` 不替代锚：COUNTERS、⚠ 与 NEXT 只在锚里。
   ✓ 成功条件：锚已打印，你能说出 mode、LIVE 数、有无 ⚠、NEXT 是什么。
3. **⚠ 优先**：锚里有 ⚠ 就先按提示文字路由（多数指向 `research-moves` 移动卡，
   攻击债与"无 LIVE"也可能直接指向 abduce/probe/report）。
   ✓ 成功条件：处理 = 落一次账（propose/prereg/attack）或明确一行 no change。
4. **按 NEXT 执行**（无 ⚠ 时）：`NEXT: <动作> · in: <路径…> · out: <路径> · why: <触发>`
   ——一步动作、它读什么、写到哪、为什么现在做。不照做也行，但写一行 RULING 说明理由。
   NEXT 点名的卡：`MODE: identify` 的 I0–I9 → `references/world-engine.md`；
   `NEXT: synthesize lessons` → `references/w5-lessons.md`（W5 把叶子证据综合成本 run 教训，
   父会话追加进 `research-work/<run>/lessons.md`，锚的约束块读它）。
   `MODE: legacy`（无 mode 的旧 run）照旧按阶段表推导，宣告 "正在用 research-<阶段>：<目的>" 再加载：

   | 状态 | 阶段 | 加载 |
   |---|---|---|
   | 没有 LIVE 假设 | ABDUCE | `research-abduce` |
   | 有 LIVE、存在可判别差异但无覆盖它的落地探针 | PROBE | `research-probe` |
   | 有新落地证据未消化，或 LIVE 假设从未被攻击 | GRILL | `research-grill` |
   | 用户要结论，或坟场/SUPPORTED 已足以回答战役问题 | REPORT | `research-report` |

   一个阶段做完回到本文件重新推导；阶段可以来回（grill 产新假设 → probe）。
5. **阶段问题（可选）**：卡在一个说不清的判断上时，`references/stage-questioning.md`
   的 S1–S6 给出问题类型；问出的东西清账为 MCP 状态、RULING 或 `no change, because`。
6. **压缩发生后**：运行时注入了 `<post_compaction_rlm_required>` 块时，第一个
   ipython cell 只 spawn 压缩核对 child——`name` 与输出文件名**逐字照抄该块**（每次压缩
   都带新 nonce，别自己起名），提示词照抄并填上 `<key claims>`；spawn 之前任何别的 cell
   （包括 print）都会被闸门拦下。等该块点名的文件写出后，再 `print(research_kit.LAST)` 找回锚
   （MODE、谓词与 NEXT 都在里面），再决定要不要重新 `anchor()`——不要凭对话
   记忆重建信念状态。
   **kernel 重启后**（`research_kit.LAST` 变量不在了）：重新 `research_kit.anchor(run)`。

## Child 调度（阶段内可选，不是第五阶段）

阶段仍由父会话推进；只有独立、较大、角色匹配的子任务才打开
`references/delegation.md`。父会话直接做 / Prime RLM child / Proma
Collaboration child 三选一，不强制调用，也不同时为同一子任务双开。

父会话始终是唯一 Research 状态写入者。analyst、researcher、coder、reviewer
只通过绝对路径 brief/report 交接；父会话核验后再调用 MCP 落账。默认省略模型
参数，让两种 child 都继承父会话当前模型。

## 裁决协议（Rulings, not stalls）

停下来问用户只有这几种：**K0**（开局一次，`references/intake-check.md`）；超出 K0
副作用信封、且属于 **① 不可逆/破坏性动作；② 密钥/花费/公开部署等安全敏感；③ 工作区
之外的副作用** 的动作；**⑤ `forks: wait` 生效时宿主拦下的 F-a 分叉**（单独一次
AskUserQuestion，按 `references/forks.md`）。**④ 方案欠定到任何选择都是纯猜**：K0 之内
写进那一次确认；K0 之后改为 RULING（写明押错代价与何时回看），不停。

其余全部自己裁决并继续，一行落进项目根（`PROMA_RESEARCH_CWD` 指向的目录）
的 `RULINGS.md`——**绝不放在 `.proma-research/` 内**：

```
Ruling: <决定> — <理由> — <押错的代价>
```

收到带 `[U#]` 的用户消息（画布干预、分叉回答）→ 先在 RULINGS.md 写一行
`U#: <决定> · affects <H#/P#>`，再继续。

裁错的代价是用户看得见、能撤销的返工；每个歧义都停下等回复，代价是整天
空转。**死在工作区里的决定等于秘密决定**：report_declare 前，把 RULINGS.md
汇总进报告（research-report 内容顺序第 9 项）。这是纪律——declare 不读
这个文件，缺了 gate 照样可能绿，所以只能靠你。

## 借口 | 现实

| 借口 | 现实 |
|---|---|
| "把所有阶段 skill 都读一遍，有全局观" | 上一代实现第一次决策前读了 96 KB。加载是状态的函数，不是判断的函数。 |
| "用户没回消息，先等着" | 只有 K0、信封外的 ①–③ 值得等。其余：裁决、落账、继续。例外：`forks: wait` 时宿主拦下的 F-a 分叉必须等回答（`references/forks.md`）。 |
| "这个决定太小，不用记 RULINGS" | 小决定不记就是秘密决定。一行的成本换可撤销性。 |
| "先跑一下命令看看格式，不算观测" | P4.3 的 [45,45] 就是这么来的。看过再写的频段是回忆；要试命令就先预登记，FAILED 很便宜。 |
| "grill 的攻击先放着，先开新探针" | 攻击债优先于新想法（锚会计数）。债未清开的新方向，多半正踩着未消化的约束。 |
| "战役问题好像问错了，换个 run 名重开" | 换战役是人的决定（`PROMA_RESEARCH_RUN` 钉死，子代理同样被拒）。谓词要改 → 写 RULING "建议开新 run"，本 run 照原谓词收尾。 |
| "research_state 拿到状态了，不用 anchor" | COUNTERS、⚠ 与 NEXT 只在锚里。state 是权威，锚是调度信号——P5.1 实测只调 state 的会话，⚠ 层全程未激活（FRICTION F3）。 |
| "K0 太啰嗦，先 init 再说" | mode 在 init 时冻结，换 mode = 新 run。K0 那一次停顿就是让用户在冻结前纠正你的地方。 |
| "先跑一遍各条件了解全景，不算观测" | 全景预览就是观测：P5.1 实测 14:26 预览 4 条件 → 14:29 写频段，两轮频段全是回忆（FRICTION F1，P14 违背）。读源码可以，执行评测不行——要动手就 init → prereg，FAILED 很便宜。 |
| "问题都想过了，不必逐类清账" | 未落成 claim/prereg/attack/ruling 的思考无法影响下一阶段。问题债跨阶段滚动，最后只会变成报告期的昂贵补洞。 |
| "REPORT.md 写完了，战役结束" | 完成 = `mcp__research__report_declare` 的 gate 裁决事件（DoD）。写完未 declare = 未完成，会话不得停止。 |
| "report_declare 好像不可用/不存在" | 不得凭记忆判断。先按 Pi 完整工具名 `mcp__research__report_declare` 真实调用；只有运行时返回注册/连接错误才算不可用，并须原样报告。 |
| "预算还多，先把探索铺开" | 确证阶段预留 ≥2 reps。8/8 烧在第一个假设之前，确证就只剩常量回显一条歪路——而那条路已被结构性堵死。 |

## 快速参考

| 永不缩水 | 执法 |
|---|---|
| 预登记先于执行（时间戳+sha256） | 【结构】 |
| 频段有宽度、互斥对、kill/scope 分支 | 【结构】 |
| 终态迁移必须有落地探针依据 | 【结构】 |
| SUPPORTED 需迁移后攻击 + run 级冻结后攻击 | 【结构：trace】 |
| declare 即三道 gate 裁决 | 【结构】 |
| 无聊对手准入 | 纪律（probe SELECT 自查兜底） |

depth（K0 定）只减扇出：light = 每个判断位 1 个窗口、open 只带 1 个候选；full 加复评与面板。
gate、输入保真度从不随 depth 缩水。

## 交接

- ⚠ 提示 → `research-moves`（调度表在其 SKILL.md）
- 阶段表 → `research-abduce` / `research-probe` / `research-grill` / `research-report`
- kernel 只读工具 → `research-kit`（Python skill，`import research_kit`）
- 阶段内需要 child → `references/delegation.md`
- identify（世界任务）→ `references/world-engine.md`

## 参考索引

- `references/delegation.md` —— 四角色边界、父会话/RLM/Collaboration 路由、
  brief/report 与状态回传契约
- `references/stage-questioning.md` —— S1–S6 问题类型、逐阶段装配与清账条件
- `references/intake-check.md` —— K0：新战役 `research_init` 前的唯一一次停顿（mode、
  谓词、世界与 seed、副作用信封、预算公式、pending 持久化；同题旧 REPORT 与 OOD）
- `references/world-engine.md` —— identify 的 I0–I9：nbsim、Δ/σ 功效卡、机制 JSON、预报
- `references/w5-lessons.md` —— `NEXT: synthesize lessons` 的 W5 brief 与 lessons.md 追加格式
- `references/forks.md` —— `forks: wait` 时宿主拦下的 F-a 分叉：单独一次 AskUserQuestion
