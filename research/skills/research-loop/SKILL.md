---
name: research-loop
description: 研究工作的第一动作。Use when 接到研究问题、想执行评测命令、开始或继续任何研究战役、会话刚启动、压缩刚发生、或不确定当前该做什么时。
version: 0.5.2
---

# research-loop —— 研究战役主路由

## 你在做什么

从 MCP 信念状态推导当前阶段，一次只装一个阶段 skill。战役状态**不在对话里**：
对话会被压缩截断，journal 不会；kernel 变量跨压缩存活（kernel 重启才重置）。

## 铁律

```
信念只经 MCP 工具改变 · 预登记之前不观测 · 用户喊停即停
```

**违反字面就是违反精神。** 手改 server 拥有的状态文件（journal/register/
prereg/probes）= 造假，trace gate 逐字重放当场抓——run 目录里你只写
`REPORT.md` 这一个文件；预登记前用 Bash/kernel"看一眼"将被登记的命令 =
把预测变成回忆，且这条违规发生在 journal 之外，三道 gate 一道都拦不住；
gate 是裁决不是续命。

## 程序

**开场输出契约（你的第一段文字输出必须是这个形状，供人纠正、供夹具判定）：**

```
[战役] run=<名> · 等级=<遭遇战|会战>（一句话理由） · LIVE=<n> 坟场=<n> ⚠=<n>
[阶段] 正在用 research-<阶段>：<目的>
```

第一行在开场仪式完成后立即给出，先于一切实质动作；第二行在加载阶段技能的
同一条消息里给出（⚠ 处理期间显示对应的移动卡名）。P5.1 实测：没有这个
契约时，宣告与锚从未发生——模型凭 `<available_skills>` 描述自行动手。

1. **开场仪式**（每个会话第一件事）：
   a. run 名 = `PROMA_RESEARCH_RUN` 钉死值（无 pin 时才由用户给出）；
      新战役（还没有 journal）先 `research_init`，已有则直接 `research_state`；
   b. kernel 里 `research_kit.anchor(run)` 立锚——LIVE、坟场禁令、探针、攻击、
      元认知计数器一屏收齐，存进 `research_kit.LAST` 跨压缩存活。
      `research_state` 不替代锚：COUNTERS 与 ⚠ 只在锚里，没有它们调度层是死的。
   ✓ 成功条件：锚已打印，你能说出 LIVE 数、坟场数、有无 ⚠。
2. **宣告战役等级**（新战役时一次）："遭遇战" 或 "会战"，说出口让用户能纠正，
   **并同时落一行 `RULINGS.md`**（`Ruling: 战役等级=会战 — <理由> — <押错代价>`）
   ——宣告只在对话里会被压缩冲掉，棘轮状态必须在文件里：
   - **遭遇战**：单一问题、≤3 探针预期、仪式最小化——SELECT 可以只比 2 个
     设计、grill 只攻**进结论**的 claim；
   - **会战**：赛事级证据链（P13–P17）——grill 全量覆盖（LIVE+SUPPORTED）、
     完整报告。
   **单向棘轮**：中途发现复杂度 → 只许升级到会战并说明，绝不静默降级。
   "都快做完了不用升级" 是红旗。**gate 从不缩水**（见快速参考）。
3. **⚠ 优先**：锚里有 ⚠ 就先按提示文字路由（多数指向 `research-moves` 移动卡，
   攻击债与"无 LIVE"也可能直接指向 abduce/probe/report）。
   ✓ 成功条件：处理 = 落一次账（propose/prereg/attack）或明确一行 no change。
4. **阶段推导**（无 ⚠ 时），宣告 "正在用 research-<阶段>：<目的>" 再加载：

   | 状态 | 阶段 | 加载 |
   |---|---|---|
   | 没有 LIVE 假设 | ABDUCE | `research-abduce` |
   | 有 LIVE、存在可判别差异但无覆盖它的落地探针 | PROBE | `research-probe` |
   | 有新落地证据未消化，或 LIVE 假设从未被攻击 | GRILL | `research-grill` |
   | 用户要结论，或坟场/SUPPORTED 已足以回答战役问题 | REPORT | `research-report` |

   一个阶段做完回到本文件重新推导；阶段可以来回（grill 产新假设 → probe）。
5. **压缩发生后**：先 `print(research_kit.LAST)` 找回锚 + 读 `RULINGS.md` 尾部
   找回战役等级，再决定要不要重新 `anchor()`——不要凭对话记忆重建信念状态。
   **kernel 重启后**（`research_kit.LAST` 变量不在了）：重走开场仪式立锚。

## Child 调度（阶段内可选，不是第五阶段）

阶段仍由父会话推进；只有独立、较大、角色匹配的子任务才打开
`references/delegation.md`。父会话直接做 / Prime RLM child / Proma
Collaboration child 三选一，不强制调用，也不同时为同一子任务双开。

父会话始终是唯一 Research 状态写入者。analyst、researcher、coder、reviewer
只通过绝对路径 brief/report 交接；父会话核验后再调用 MCP 落账。默认省略模型
参数，让两种 child 都继承父会话当前模型。

## 裁决协议（Rulings, not stalls）

只有四类决定停下来问用户：**① 不可逆/破坏性动作；② 密钥/花费/公开部署等
安全敏感；③ 工作区之外的副作用；④ 方案欠定到任何选择都是纯猜**。

其余全部自己裁决并继续，一行落进项目根（`PROMA_RESEARCH_CWD` 指向的目录）
的 `RULINGS.md`——**绝不放在 `.proma-research/` 内**：

```
Ruling: <决定> — <理由> — <押错的代价>
```

裁错的代价是用户看得见、能撤销的返工；每个歧义都停下等回复，代价是整天
空转。**死在工作区里的决定等于秘密决定**：report_declare 前，把 RULINGS.md
汇总进报告（research-report 内容顺序第 8 项）。这是纪律——declare 不读
这个文件，缺了 gate 照样可能绿，所以只能靠你。

## 借口 | 现实

| 借口 | 现实 |
|---|---|
| "把所有阶段 skill 都读一遍，有全局观" | 上一代实现第一次决策前读了 96 KB。加载是状态的函数，不是判断的函数。 |
| "用户没回消息，先等着" | 只有四类决定值得等。其余：裁决、落账、继续。 |
| "这个决定太小，不用记 RULINGS" | 小决定不记就是秘密决定。一行的成本换可撤销性。 |
| "先跑一下命令看看格式，不算观测" | P4.3 的 [45,45] 就是这么来的。看过再写的频段是回忆；要试命令就先预登记，FAILED 很便宜。 |
| "grill 的攻击先放着，先开新探针" | 攻击债优先于新想法（锚会计数）。债未清开的新方向，多半正踩着未消化的约束。 |
| "战役问题好像问错了，换个 run 名重开" | 换战役是人的决定（`PROMA_RESEARCH_RUN` 钉死，子代理同样被拒）。判断问题问错 → 停下问用户。 |
| "research_state 拿到状态了，不用 anchor" | COUNTERS 与 ⚠ 只在锚里。state 是权威，锚是调度信号——P5.1 实测只调 state 的会话，⚠ 层全程未激活（FRICTION F3）。 |
| "先跑一遍各条件了解全景，不算观测" | 全景预览就是观测：P5.1 实测 14:26 预览 4 条件 → 14:29 写频段，两轮频段全是回忆（FRICTION F1，P14 违背）。读源码可以，执行评测不行——要动手就 init → prereg，FAILED 很便宜。 |

## 快速参考

| 永不缩水 | 执法 | 随等级伸缩的仪式（全是纪律） |
|---|---|---|
| 预登记先于执行（时间戳+sha256） | 【结构】 | SELECT 候选设计数（遭遇战 2 起步） |
| 频段有宽度、互斥对、kill/scope 分支 | 【结构】 | grill 覆盖度（遭遇战只攻进结论的 claim） |
| 终态迁移必须有落地探针依据 | 【结构】 | 报告篇幅 |
| SUPPORTED 需迁移后攻击 + run 级冻结后攻击 | 【结构：trace】 | —— |
| declare 即三道 gate 裁决 | 【结构】 | —— |
| 无聊对手准入 | 纪律（probe SELECT 自查兜底） | —— |

## 交接

- ⚠ 提示 → `research-moves`（调度表在其 SKILL.md）
- 阶段表 → `research-abduce` / `research-probe` / `research-grill` / `research-report`
- kernel 只读工具 → `research-kit`（Python skill，`import research_kit`）
- 阶段内需要 child → `references/delegation.md`

## 参考索引

- `references/delegation.md` —— 四角色边界、父会话/RLM/Collaboration 路由、
  brief/report 与状态回传契约
