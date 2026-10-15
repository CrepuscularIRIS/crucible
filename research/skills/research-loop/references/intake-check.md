# K0 intake —— 开局唯一一次停顿

**何时加载：** 新战役（还没有 journal），`research_init` 之前；或 resume 时
`<cwd>/.research-pending/K0-intake.md` 仍是 `status: pending_user`。已有 run 跳过本卡。

一次停顿里把 mode、成功谓词、depth、世界与 seed、副作用信封、预算估计一起交给用户
确认；之后只有信封外的 ①–③ 才再停（research-loop 裁决协议）。*why：K0 是用户在
mode 冻结之前唯一的纠正点；"K0 只停一次"是用户确认过的硬需求。*

Sources (line refs are to files in the upstream repos; provenance only, see `NOTICE.md`):
RS = ResearchStudio (github.com/microsoft/ResearchStudio),
`ResearchStudio-Idea/skills/idea_spark/references/intake-routing.md` and
`ResearchStudio-Idea/skills/idea_spark/SKILL.md:24-27,212`; RC = research-companion
(github.com/andrehuang/research-companion), `skills/research-companion/SKILL.md:54-58`.

## 1. 先做两件旧事

### 1a. 同题旧战役（RC :54-58）

**World task (`world_*` tools present / probes are `spec.observe`), or the world/seed
is pinned: do not read earlier REPORTs.** A rerun or a same-condition comparison must
form its own prereg without the earlier verdicts. 写进草稿：`prior_reports: not read (independent run)`。
score 模式同样不读（rerun 独立性）。

Otherwise (open) list the declared reports `.proma-research/*/REPORT.md` (read-only copies made by
`report_declare`) under the project root
(`PROMA_RESEARCH_CWD`) and read only those whose question overlaps this one. Reading an
old report is reading a source, not observing this run's commands. 旧报告只作软锚
（"run X 试过、结果 Y"），从不否决；本 run 的坟场才是禁令。

- An overlapping report exists → default: start from it, naming every old run
  you read; that knowledge is prior knowledge and REPORT says so. Its graveyard and
  SUPPORTED claims go into research-abduce's "read the graveyard first"; do not re-probe
  a dead direction without naming what changed.
- None → say so in the draft.

### 1b. OOD 触发器（RS intake-routing.md:5-15,28-29; SKILL.md:27,212）

| Trigger | Fires when | 出口 |
|---|---|---|
| Too broad | no specific direction ("do some AI research") | 在 K0 那一次确认里问：one area + one specific limitation |
| No anchor | no domain, task, data, baseline, or runnable system/metric named | 在 K0 里问：domain, task, baseline, data — or the command and metric to study |
| < 5 truly related works | the question claims a literature gap, yet fewer than ~5 sources genuinely bear on it | 仍走 open；召回与 scoop 降级为"稀疏领域"注记（不当新颖性证据），K0 消息里点明 |
| Pure construction | the deliverable is building a benchmark / dataset / system | 仍走 open + 同一条注记；审计一个 benchmark 照常 |

Not OOD (RS intake-routing.md:17-24): engineering framing, no ready benchmark, tight
compute. Those surface later at candidate-screen Q3 and in prereg.

## 2. 分 mode（父会话，浅）

```
1. 交付物是新的想法 / 方法 / 问题？                 → open
2. 有 metric + 评测命令（或可发现），目标是数字？    → score
3. 有给定的系统 / 世界，问"哪个机制为真 / 会怎样"？  → identify
混合：机制辨识 benchmark = identify（forecast 是读数不是目标）
拿不准 → 写进这一次确认，不另开停顿
```

默认成功谓词（用户可改；改了照写）：

| mode | success_predicate |
|---|---|
| open | claim X 被判别探针支持，且 scoop delta 句已写（Level≠1） |
| score | admit(best) − admit(H0) ≥ δ，跨 seed（每个 seed 是配额 K 内一次独立 admit；K=1 时去掉"跨 seed"） |
| identify | LIVE 收缩到 1 个或一个写明的等价类（RULING `equiv{H#…}`），且 `world_forecast` 已提交 |

open 的 H0′ 是候选专属的朴素基线，K1 时用 `claim_propose{parent: H#}` 逐候选登记；
identify 的 null、score 的 incumbent 由 `research_init` 内置登记为 H0。

## 3. 预算公式（depth 两档的 spawn 估计 + 墙钟）

```
N_identify = r + 1(W1-rival) + m·n_S(K3) + n_A(W3) + n_L(W5) + 1(报告审计)
N_open     = r + 1(O2) + g(O3) + s(K1-select) + c·(1 + 3m)(O4 + O5) + m·n_S + n_A + n_L
N_score    = [recall 开] 1(S1) + n_admit(S7) + m·n_S + n_L
另加：每个失败 job 至多重派 1 次。
```

| 符号 | light | full |
|---|---|---|
| r = 召回 W1 数 | 1（顺序跑三镜头） | 3 |
| g = 生成 W1g 数 | 1–2 | 2–4 |
| s = K1-select 席数 | 1 | 3 |
| c = 进 O4/O5 的候选数 | 1 | ≤3 |
| m = 每个判断位的 W2 复评数 | 1 | 2 |
| n_S / n_A / n_L | 预计 SUPPORTED 迁移数 / 被攻击 claim 数 / W5 次数 | 同左 |

典型值（未实测，按此量级报）：identify light ≈ 10、open light ≈ 15；墙钟 light 1.5–3 h、
full 3–5 h。一句话提示词默认 `light`；原话含"深入 / 全面 / 认真"或 mode=open 时推荐 `full`。
实际超过估计只在锚上 ⚠，不阻止。K3 审计、forecast 与报告不扣计量预算：计量预算花完（01 K2-1），时间与上下文预留约 10% 给它们。

## 4. 写草稿、停、确认

**停之前**写 `<cwd>/.research-pending/K0-intake.md`（run 目录还不存在；而且你永不写
`.proma-research/`）：

```
status: pending_user
mode: identify
success_predicate: <上表默认或用户原话>
depth: light            # light ≈ <N> 个 child · <墙钟>；full ≈ <N> 个 child · <墙钟>
recall: off             # on | off | parametric-only（benchmark 默认 off）
world: <world 名或 —> · seed: <seed 或 —>   # 钉死：来自题面 / PROMA_RESEARCH_RUN，不由你改
forks: auto             # auto（默认）| wait（只在宿主已接线时可选，见 forks.md）
prior_reports: not read (independent run)
ood: none
副作用信封:
  workdir: research-work/<run>/   # REPORT.md、lessons.md、ledger.md、recall/、sim/、nbsim/、候选代码
  jobs: .rlm-jobs/<run>/
  children: ≈ <N>（上面的公式）
  web: off
  tokens/墙钟: ≈ <估计>
budget: <世界计量预算 / admit 配额 K / 探针数>；保留额 ≈10%
seed_questions:         # 只在 open，≤3 个可选："约束是什么 / 已知死路 / 最在意什么"
```

然后在**一条消息**里展示草稿与每个字段的推荐值，问一次，停。

- **确认后**：草稿改成用户确认的值（`status: confirmed`，没答的字段写
  `INFERRED · default <X>`），调 `research_init{mode, success_predicate, depth, recall}`，
  再在 RULINGS.md 写 `Ruling: intake: mode=… · predicate=… · depth=… · cost≈… — <理由> — <押错代价>`。
  宿主在 init 时把 pending 文件收进 run 目录的 `K0-intake.md`（画布从那里读 `forks:`）；
  返回值没说已收入就留在 pending 路径——不要自己往 `.proma-research/` 里拷。
- **resume**：pending 文件仍是 `pending_user` → 原样重新呈现这一次确认，不调 `research_init`。
- **超时**：默认阻塞。宿主若配置了超时，超时后按推荐值继续，并写
  `unanswered = default <X> · revisit-when 用户回复`——**永不静默批准**。

## 5. K0 之后

- 信封内的动作（工作目录、child、web 开关、预算内的计量）不再停。
- 只有超出信封、且属于 ① 不可逆 ② 密钥 / 花钱 / 部署 ③ 工作区外副作用 的动作才停。
- ④ 欠定 → RULING（押错代价 + 何时回看），不停。
- 谓词需要改（K5 判定）→ 只写 RULING "建议开新 run"，本 run 按原谓词收尾。
