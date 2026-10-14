# K3 —— 迁移前审计

**何时加载：** 即将 `claim_transition` → SUPPORTED；或即将 → REFUTED，而被否定的是一个
**机制家族**（statement 陈述的是族，不是一组具体参数）——家族级 REFUTED 与 SUPPORTED 同样审。
参数点级的 REFUTED、LIVE / CONTESTED 迁移不审（零成本）。

*why：SUPPORTED 的定量支柱账目不实，事后才被 gate 发现；家族级 REFUTED 是本系统最常见的误杀
——一组参数、reps < r*、频段没有仿真来源，三样都查不到。*

**封顶，不阻止**：审计不通过不拒绝你的迁移决定，只降结论强度到 `lead`，并在 RULING 里写明。
宿主能查的封顶由宿主执行：迁移照调，事件落成 `CONTESTED + lead{requested, caps}`——claim 仍是活对手
（锚的 `LEAD` 段，计入 NEXT 的存活数），补上 caps 指的东西后可重迁。

## 程序

1. 冻结输入：prereg（pid）+ raw + 你的 note 草稿 + prereg `sims` 引用的 `sim/<id>.json`。
2. 开一个 W2（`research_kit.new_job(run, "k3", "<H#>")`）；它看得到输入，**看不到**你为结论辩护的推理。
   W2 失败两次 → 你代做，写 `<job>-self/out.md`，审计是 self-reviewed → 结论封顶 `lead`。
3. W2 只查（语义判断，不用正则）：
   1. note 里每个数字都能在账本找到出处（`metric_recompute` 的值或一条 sim 记录）；
   2. support 与 kill 分支目标的 band 出处（prereg 的 `provenance`）：`sim:<记录 id>` / `measured:P#` /
      `asserted` / `invented`；`sim:` 指的记录确实在 `sims` 里；命中分支有 `headline`；
   3. 本探针的真细胞 reps ≥ `r*`（`research-loop` 的 `references/world-engine.md` I4）；
   4. 家族级 REFUTED：该族每个自由参数至少扫过 3 个点，全部落在观测 2 SE 之外；
   5. 被迁移的候选，其 mechanism JSON 的 m∞/h∞ 打印方向与 statement 一致（world-engine I1）；
   6. 对手集 = 全部活对手（LIVE / lead / narrowed / SUPPORTED，含 H0）+ PARK 族：support 带与每个对手的带都不重叠。
4. 迁移带 `claim_transition{audit}`（`audit: <job 路径>`）。没带 audit 的 SUPPORTED / 家族级 REFUTED，
   宿主落成 `CONTESTED + lead`（`no_audit`）。
5. RULINGS.md 写 `K3 <H#>: SUPPORTED|REFUTED|lead · audit=<job 路径> · <封顶原因>`。

## 封顶表（报告不得称其为定论；`宿主` 行由宿主落成 `CONTESTED + lead`，`你` 行宿主不查、你照表降格）

| 条件 | 谁封（lead 理由码） | 处置 |
|---|---|---|
| kill 或 support 分支只靠 `asserted` / `invented` 带（`provenance` 未标同此） | 宿主（`asserted_band`） | claim 落 `CONTESTED + lead`，仍在竞争；RULING 记 `lead · band=asserted`；下一个 prereg 用 `sim:<记录 id>` 带重测 |
| 命中分支缺 `headline`；support 的 prereg 缺 `discrimination` | 宿主（`no_headline` / `no_discrimination`） | 同上；下一个 prereg 补上 |
| 没带 audit / 审计 self-reviewed / 审计读不到或末行不是 `STATUS: ok` | 宿主（`no_audit` / `self_reviewed` / `audit_unverified`） | `CONTESTED + lead`；重开 W2 后带 audit 重迁 |
| support 带与某个活对手（含 H0、narrowed、lead）重叠 | 宿主（`rival_overlap`） | `CONTESTED + lead`；设计判别探针 |
| support 带与 PARK 族的仿真带重叠 | 你（PARK 族不在 register 里） | 不迁 SUPPORTED；RULING 记 `lead · rival=PARK` |
| reps < `r*` | 你 | 检出限写法（"在 r 次、该精度下未检出"），RULING 记 `lead` |
| 家族级 REFUTED 未扫够参数 | 你 | 只否定那个参数点（statement 改写成参数点重新登记），家族留在竞争里 |

## 驳回审计 finding 要第二意见

要驳回一条执行产生的 blocking（dry-run、W3 constraint、本审计），必须写出具体的建模或算术缺陷，
并再开一次 W2 复核；接受零成本。
