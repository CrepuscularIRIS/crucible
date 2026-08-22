# 科研流程设计 —— 六个阶段，每阶段一次实验、一次审查、一个闸门

**结论先写：这份文档不新建机制。**ccf 的治理规矩和 paperjury 的台账，我们**已经写过了，而且写了两遍** ——
`gates/accept.py`（A/B 双轨闸门 + `done→provisional→accepted` 状态机）、
`gates/claims.py`（THE GATE，exit 1 拦住；FROZEN FALSIFIER / OBSERVABILITY / KILL CONTRACT）、
`mcp__sci__cross_review`（跨家族评审，findings 自带原文引文与**关闭判据**，凭 `open_findings` 开闸**不看分数**，
评审跑不起来时 fail-closed 回 `REVIEW_UNAVAILABLE`）、
`run_falsifier`（裁决只认沙箱打印的 JSON，`INCONCLUSIVE` 也写库）、
`research_state`（**跨轮坟场**，带上杀它的那次测量）、
`record_hypothesis`（`kill_condition` = 预注册）、
`declare_design`（计划字段与实际拆开，照搬 ReplicatorBench 的 pre-registration）。

**缺的只有一样：顺序。**

```
backend/clawui/*.py 里 "phase" / "stage" 出现次数：   0
三条基线 workspace 里 claims.json：                  0
三条基线 workspace 里 .grill/：                      0
```

`plugin/skills/grill-loop/references/claim-ledger.md` 把 `claims.py` 的七条命令全写清楚了，
指向 `<plugin>/scripts/claims.py` —— **这个路径不存在**（文件在 `crucible/gates/claims.py`）。
这是第 9 个悬空引用，也是最贵的一个：整套判据写完了，路径是错的，于是一次都没被执行。

所以设计题目不是「做一套科研流程」，是：**给已有的零件一条流水线，和一个「现在轮到哪一步」的指针。**

---

## 零 · 一个反直觉的前提：阶段不是开销

| run | 停在第几轮 | 预算 | 分 |
|---|---|---|---|
| Astronomy_003 | 26 | 200 | 46.9 |
| Neuroscience_000 | 23 | 200 | 7.0 |
| Math_000 | **16** | 200 | 无产出 |

**三条全部在 200 轮的预算里主动停下。**轮数从来不是稀缺资源 ——
没有任何东西告诉它「还没完」才是。所以多切几个阶段**不会**挤掉干活的时间，
每个阶段闸门恰恰是一条**「还不能停」的理由**。这条前提如果反了（真撞上轮数上限），整份设计要重排。

---

## 一 · 一个阶段长什么样

沿用 paperjury 的步骤标记 —— 它区分的是**谁来执行、能不能被信任**：

| 标 | 含义 | 谁跑 | 能否自判 |
|---|---|---|---|
| `[WF]` | 语义步：模型或子智能体干活 | Qwen | 否 |
| `[det]` | 确定性护栏：脚本，在两个语义步**之间**跑 | `gates/*.py` / 沙箱 | **是**（Type-A） |
| `[REV]` | 审查步：**另一个模型家族** | `cross_review` | **是**（Type-B） |
| `[LED]` | 写台账 | 编排层，**模型不许直接写** | — |

每个阶段固定这个形状：

```
N.1 … N.k   [WF]   干活
N.x         [WF]   ← 实验：这一阶段唯一一件「可以被指控」的产物
N.y         [REV]  ← 审查：谁来指控它，三态裁决
N.z         [det]  ← 闸门 GN：一个 exit code。0 才能进下一阶段
Exit / 死支 / Next
```

**「实验 + 审查」是每个阶段的内部结构，不是两个阶段。**
另外 P3 整个阶段的产物**就是**一次审查 —— 那是 RGBD 那条弧里「再审查」的位置：
把最贵的正式实验押上去之前，先让人把切入点打一遍。两个尺度都在，不冲突。

**三态裁决**（照抄 paperjury，措辞对齐我们的物件）：

| 裁决 | 含义 | 下一步 |
|---|---|---|
| `invalid-drop` | 指控不成立 | 丢弃，**但 MUST 记原因**，绝不静默 |
| `valid-fixable` | 成立且能自己修 | **MUST 带一句 `close_criterion`** —— 一句话，说清什么样的修改算修好了 |
| `author-required` | 成立但要人/要数据 | 入队，**不阻塞本阶段**，累积到交付时点名 |

`escalate` 是过渡态，不是终态。

---

## 二 · 六个阶段

弧线按你说的来：**诊断 → 切入点 → 反常点 → 审查 → 正式实验 → 交付**。

### P0 · 诊断 DIAGNOSE

> 任务到底要什么，数据到底有什么。**这两件事对不上的地方，就是分数掉的地方。**

| # | 标 | 做什么 |
|---|---|---|
| 0.1 | `[WF]` | 把 `INSTRUCTIONS.md` 拆成**逐条可核对的需求**，每条一个 id |
| 0.2 | `[WF]` | **实验**：真加载 `data/` 下每个文件，打印 shape / dtype / 缺失率 / 类别取值。**不许读 README 猜** |
| 0.3 | `[REV]` | **审查**：需求逐条对数据核对。每条落一个归属：`planned` \| `unshippable(<一句话理由>)` |
| 0.4 | `[LED]` | 写 `.grill/REQUIREMENTS.md`，**此后只读**（paperjury 的 `original` 同一条规矩） |
| 0.5 | `[det]` | **闸门 G0**：无归属的需求条数 == 0 |

**这就是 H7。**`Neuroscience_000` 拿 7.0 分，是因为 rubric 要六个实验条件（Lab1/Lab2/Male/Female/RI/CSDS），
任务只发了 `Together_1_*`，60% 的权重在给定数据下**根本拿不到** —— 而报告**一个字都没提这件事**，
读上去像一份完整答卷。G0 拦不住数据没发，但它保证这件事**在第一步就被写下来**，
到 P5 会被逐条念出来。**说不出口的缺口，评审会当成你没发现。**

**死支**：如果 `unshippable` 覆盖了主要权重 —— 不改任务，改交付形态：
报告的主张降级为「在可得数据下的部分结论」，并在 P5 点名列出拿不到的部分。

**Next** → P1

---

### P1 · 切入点 ENTRY

> 不问「答案是什么」，问「**哪一次最便宜的测量，能区分开两种可能的答案**」。

| # | 标 | 做什么 |
|---|---|---|
| 1.1 | `[WF]` | 提 **≥2 个**候选切入点。每个候选到场时**自带它的测量和它的对照** —— 只有一个候选 = 没有候选 |
| 1.2 | `[WF]` | **实验**：每个候选跑一次 ≤2 分钟的探针，只答一个问题：**这条路测得动吗** |
| 1.3 | `[REV]` | **审查**：候选之间互为对照。选一个，**输的那个记状态、不删除**（ccf：state, not deletion） |
| 1.4 | `[LED]` | `claims.py init` → thesis + roles + 每条 primary claim 一个 **frozen falsifier** |
| 1.5 | `[det]` | **闸门 G1**：`python3 gates/claims.py check .grill/claims.json`，exit 1 拦住 |

FROZEN FALSIFIER 这条机制在这里第一次生效：判伪条件在设置时**对 claim 文本做哈希**。
之后改了 claim，它的 falsifier 自动 VOID —— 否则一个测试会安静地继续回答一个没人在问的问题。

**死支**：两个候选都测不动 → 回 1.1，**但 MUST 先读 `research_state` 的坟场**，
不许把刚死的那条换个措辞再提一遍。

**Next** → P2

---

### P2 · 反常点 ANOMALY

> 找**不该在那儿的东西**。一个符合预期的测量不是发现，是确认。

| # | 标 | 做什么 |
|---|---|---|
| 2.1 | `[WF]` | 冻结预处理。**在出第一个数之前**冻 —— 之后再改就是在挑一个好看的数 |
| 2.2 | `[WF]` | **实验**：第一张关键图，**对照叠在同一副坐标轴上**，不许挪去附录 |
| 2.3 | `[REV]` | **审查 —— 惊讶分诊阶梯**，从上往下逐级排除：`指标假象 → bug → 噪声 → 已知结论 → 真的` |
| 2.4 | `[det]` | **闸门 G2**：适用的对照全部跑过，且结果落盘 |
| 2.5 | `[LED]` | 过不了对照的候选记 **`ARTIFACT`，不记 `REFUTED`** —— 那是两件事 |

对照按任务取适用的（不是四条全上）：随机初始化 · 同秩随机 · 预处理敏感性 · 相关还是因果。
**没跑对照之前，现象一律算假象。**

**死支**：现象死在这里 → **这不是失败，是省下了 P4 的钱。**
带着「这个广为报告的效应在对照下不成立」进 P5，它本身就是一份可交付的结论。

**Next** → P3

---

### P3 · 审查 REVIEW

> 整个阶段的产物就是一次审查。**这是押上正式实验之前的最后一道便宜关卡。**

| # | 标 | 做什么 |
|---|---|---|
| 3.1 | `[WF]` | 把 P2 的反常点写成一段**能被指控的陈述**：主张 + 它禁止什么 + 支持它的那张图 |
| 3.2 | `[REV]` | **实验兼审查**：`mcp__sci__cross_review` —— **跨模型家族**，findings 自带原文引文与关闭判据 |
| 3.3 | `[WF]` | 逐条三态裁决。`valid-fixable` **MUST 带 `close_criterion`**；`invalid-drop` **MUST 带丢弃理由** |
| 3.4 | `[det]` | **闸门 G3**：`open_findings == 0` **且** `review_independence` 确实跨家族 |
| 3.5 | `[LED]` | 写回 `review-ledger.jsonl`（已有），claim 状态 → `provisional` 或 `accepted` |

三条规矩，都是现成代码里已经写着的：

- **停机看 `open_findings` 清没清空，不看分数。**`scoring_bias`(DASFAA 2026) 实测：绝对分既在重复间抖
  （同一样本 [1,3,2]），又随模型版本系统偏移（人类 4 分、两个模型稳定打 2 分）。分数只是诊断记录。
- **`dropped_unquotable`** —— 引不出原文的指控直接丢。**引不出来 = 没读过。**
- **评审跑不起来 ≠ 评审通过。**回 `REVIEW_UNAVAILABLE`，claim 封顶 `provisional`。
  一个外接家族都够不到时（断网、凭证没到位），正确反应是**把更多闸门压进 Type-A 确定性校验**,
  而不是让 Qwen 给 Qwen 发无罪判决。

**这是 46.9 分掉分的位置。**那次的结论没有任何人反驳过。

**死支**：审查把切入点打穿 → 回 P1，代价是几分钟；不回，代价是 P4 的全部预算。

**Next** → P4

---

### P4 · 正式实验 EXPERIMENT

> 预注册在前，裁决在后。**顺序反了，实验就只是在给已有的信念找配图。**

| # | 标 | 做什么 |
|---|---|---|
| 4.1 | `[WF]` | **先写判决规则，再测**：`{"if": …, "threshold": …, "kills": […], "cancels": […]}` |
| 4.2 | `[WF]` | **把结果空间先分支**：可能 / 最差 / 冷门 / 反直觉，**每个分支一条规则**。只写一条规则 = 只想过你期待的那个结果 |
| 4.3 | `[WF]` | 一句话写**严峻性**：这个测试在机制为假时会不会照样通过？会 → 它是仪式，**仪式比不测更糟**，全价买假信心 |
| 4.4 | `[WF]` | **实验**：`run_falsifier`。断网沙箱，最后一行 print `{"kill":…, "metric":…, "why":…}` |
| 4.5 | `[det]` | **闸门 G4**：`claims.py kill` 的 KILL CONTRACT + OBSERVABILITY 校验 |

两条否决权，都在 `claims.py` 里现成：

- **KILL CONTRACT**：杀死一条 claim 需要一份**磁盘上的结果件**（experiment id · metric · value · delta · seeds）。
  不满足的证据只把 claim 降级为 `challenged` / `inconclusive`。**散文杀不死 claim。**
- **OBSERVABILITY**：falsifier 声明它能观测哪些维度；结果的 metric 对不上声明的维度，**这次 kill 被拒绝**。
  一个测探针精度的实验，不能用来杀一条关于行为的主张。

**死支**：`INCONCLUSIVE`（测了、仪器分辨不出）**MUST 写库**。
它和「从没测过」在报告里长得一样，但它是花预算换来的信息 —— 丢掉它，下一轮会再花一次。

**Next** → P5

---

### P5 · 交付 REPORT

> 写证据**支持**的那一份，不是你希望的那一份。

| # | 标 | 做什么 |
|---|---|---|
| 5.1 | `[WF]` | **实验**：重跑报告里的每一个数。**还出得来吗？**每个数背后有文件吗？带 seed 数吗？ |
| 5.2 | `[WF]` | 写正文。脊柱按序：现象 · 为什么不是假象 · 机制 · 它做出的预测 · 预测落地 · **哪里不成立** |
| 5.3 | `[REV]` | **审查 —— 覆盖核对**：拿出 P0 的 `REQUIREMENTS.md`，**逐条走**，未覆盖项**点名写进 `report.md`** |
| 5.4 | `[WF]` | 自陈没能建立的事。**没说出口的缺口，是评审替你选的那个缺口。** |
| 5.5 | `[det]` | **闸门 G5**：`report/report.md` 非空 + 图 ≥ 1 + 覆盖核对那一节存在 |

对照必须进正文，不进附录 —— 它们是评审相信第一张图的**理由**。

**G5 MUST 是钩子，不是提示词。这一条已经被实测证否过一次了。**
RCB 自己的 `INSTRUCTIONS.md` 里白纸黑字写着

> **There is no human on the other end.** … **do not ask for help, do not pause, and do not interrupt the task.**

这段话就在上下文里，`Math_000` 照样在第 16 轮问了「What would you like to do next?」—— 问给一个不存在的人。
**「再写一段更狠的提示词」是一条走过的死路。提示词是劝，钩子是拦。**

**Next** → 收工。`research_state` 的坟场跨轮保留，下一条任务开跑前先读它。

---

## 三 · 台账：三个文件，谁写谁不写

| 文件 | 谁写 | 何时冻 | 对应 paperjury |
|---|---|---|---|
| `.grill/STATE.md` | 编排层 | 每次换阶段就写，**不是收工才写** | — |
| `.grill/REQUIREMENTS.md` | P0 | **P0 之后只读** | `meta.original`（永久只读） |
| `.grill/claims.json` | `claims.py` | 逐步演进 | `LEDGER.json`（机器真相） |
| `review/review-ledger.jsonl` | `cross_review` | 追加 | 审查轨迹 |

**模型不直接写台账 —— 编排层写。**（paperjury 铁律：reviewers/jurors never touch the ledger。）
Markdown 视图一律由 JSON 渲染，**从不手改**。

claim 的状态机沿用 `accept.py` 已经实现的那条，**一格都不用新加**：

```
done         执行者自报，同家族 —— 安全，因为它不声称正确
provisional  同家族的肯定裁决 —— 默认不算终态
accepted     跨家族评审 或 确定性 verifier 判的，MUST 连 verdict id + reviewer 一起记
```

`set` 只能写 `pending/running/done/failed/skipped`；**只有 `accept` 能写 `accepted`。**
一句话：**一个循环可以驱动自己，但不能给自己判无罪。**

---

## 四 · 闸门语义（怎么强制，这轮不谈）

按你说的，闸门的**实现**先放着。这里只定**判据**，六条都是布尔，都不看分数：

| 闸 | 判据 | 类型 | 治哪条 |
|---|---|---|---|
| G0 | 无归属需求 == 0 | Type-A | H7 · 7.0 分 |
| G1 | `claims.py check` exit 0 | Type-A | 切入点不成立就往下跑 |
| G2 | 适用对照全部跑过且落盘 | Type-A | 假象当发现 |
| G3 | `open_findings == 0` 且跨家族 | **Type-B** | H1 · 46.9 分 |
| G4 | KILL CONTRACT + OBSERVABILITY | Type-A | 散文杀 claim |
| G5 | 报告非空 + 图≥1 + 覆盖节 | Type-A | H6 · 无产出 |

**六个里五个是 Type-A** —— 确定性脚本能判。这是刻意的：在 Qwen-only 合规基座下，
唯一稳的路是**把更多闸门压进 Type-A**。确定性 verifier 比跨家族评审**更强**，
因为一个真重跑实验的脚本，和任何模型都不共享失效模式。

---

## 五 · 不做什么

- **MUST NOT** 新写一套台账 / 状态机 / 闸门框架。`gates/accept.py` + `gates/claims.py` 已经是了，**接上就行**。
- **MUST NOT** 把 ccf 的 `loop/*.md` 拷过来。那边的闸门是**日历日期**（08-26 / 09-02 / 09-12 / 09-21），
  一个 6 周的战役；我们是 500 秒一条任务。骨架能要，日期不能要。
- **MUST NOT** 让阶段推进依赖模型自述「我做完了」。每一步进闸都是 exit code。
- **MUST NOT** 用分数开闸（`open_findings` 才开闸）。
- **MUST NOT** 改 NeuronBench / RCB 的评测代码。

---

## 六 · 验收

一条 `Astronomy_003` 跑完，`.grill/` 里 MUST 同时存在：

1. `STATE.md` 走过 **P0→P5 六个阶段**，每次换阶段有写入痕迹
2. `REQUIREMENTS.md` 非空，且 `report.md` 里有一节逐条对上它
3. `claims.json` 存在，`claims.py check` exit 0，且**至少一条 claim 带 frozen falsifier**
4. `review-ledger.jsonl` 至少一轮，`review_independence` 真是跨家族
5. 至少一次 `run_falsifier` 真调用（不是只出现在 `init` 的工具清单里）
6. 分数与基线 **46.9** 可比（同任务、同网关、串行）

**任何一条不满足 = 没做完。**
第 1 条是这轮的核心 —— 前三条基线里，这六个文件**一个都没生成过**。

**复测 MUST 用 `Astronomy_003`，不要用 `Neuroscience_000`** —— 后者 60% 的权重在给定数据下拿不到，
用它调 harness 是在调噪声。
