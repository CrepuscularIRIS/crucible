# world-engine —— identify 模式的 I0–I9（世界任务）

**何时加载：** 锚显示 `MODE: identify`，且 NEXT 点名本卡。
信念状态 = 活对手（LIVE、lead、narrowed、SUPPORTED；含内置 H0 = null、伪影）· 坟场 · 等价类 · 钉死 / 自由参数账本 ·
未偿 constraint · PARK。**每个探针的价值 = 它把这个状态缩小了多少。**

```
held-out 不可观测；forecast 只一次
```

*why：held-out 协议只在 `world_forecast` 里评分一次；观测它或反复提交，就是先偷看后预测。
held-out **可以仿真**（nbsim），不可以观测。*

**本卡只点名已发布的东西**：MCP `world_simulate(mode=info)`、`world_observe`、`world_forecast` 与
research MCP；kit `research_kit.new_job` / `research_kit.wait` / `research_kit.field` /
`research_kit.anchor` / `research_kit.disjoint_pairs` / `research_kit.calibration`；工作目录里的
`nbsim.load_task` / `nbsim.protocol` / `nbsim.simulate` / `nbsim.observe_like`。Δ/σ 表在 ipython
里按 I4 的公式**手算**（没有专用函数）。

## 工作目录（全部草稿都在 `research-work/<run>/`，状态根之外）

| 文件 | 谁写 | 内容 |
|---|---|---|
| `research-work/<run>/nbsim/` | 宿主（info 时生成） | 剥离真相的仿真包；你只 import，不改（改了 forecast 时宿主复算 sha 会发现并封顶） |
| `research-work/<run>/ledger.md` | 你 | 钉死 / 自由参数、σ 出处 |
| `research-work/<run>/recall/families.md` | 你 / W1 | 机制族 + 每族的 mechanism JSON |
| `research-work/<run>/sim/<id>.json` | 你 / child（`<nonce>-<id>.json`） | 一次仿真的记录（I2） |
| `research-work/<run>/sim/matrix.csv` | 你 | 族 × 协议格的均值 / sd |
| `research-work/<run>/forecast.md` | 你 | 逐 held-out 预报值与来源（I9） |
| `research-work/<run>/lessons.md`、`REPORT.md` | 你 | W5 教训、报告 |

## I0 契约 + 账本 + σ

1. `world_simulate(mode=info)`：题面、协议池、held-out 标签、`sim_env`（`{path, sha256, import_hint}`）。
2. 在 ipython 里执行 `sim_env.import_hint`（只加 `sys.path`，不 pip install）：

   ```python
   import sys; sys.path.insert(0, "<research-work/<run> 的绝对路径>"); import nbsim
   task = nbsim.load_task()            # 题面字段 + held_out 段 + blockers + n_channels
   lab, seg = nbsim.protocol("<标签>")  # 池内或 held-out 标签都可以；自写段直接给段列表
   r = nbsim.simulate(mech, seg, reps=64, seed=0, block=())   # r["mean"], r["sd"], r["counts"]
   ```

   info 没给 `sim_env`（宿主没生成 nbsim）→ 按 `world_simulate` 工具描述里的旧仿真方式，
   并在 RULINGS 记一行。
3. `ledger.md`：逐字列出题面钉死的参数 vs 你可以自由拟合的参数。**自由参数上只许网格
   claim**（"g ∈ {…} 均复现"），不许点估计为真。
4. **σ 的来源**按序取：nbsim 每格 ≥64 reps 的 sd → 都没有时 Δ 用原始单位报，并带 `σ unknown` 旗。
   频段宽度按 `research-moves` 的 `references/derive.md` 从 σ 与本次观测 reps 推。
5. H0（null）已由 `research_init` 内置登记；它永远可以做互斥对的一方。

## I1 召回机制族 → 可仿真的 mechanism JSON

把现象写成**去领域化**一句（动词 + 抽象对象，无领域名词）再召回；W1 镜头：① 教科书族
② 异名 / collateral 族 + 伪影 ③ 哪个建模前提从未被质疑。light 下 1 个 W1 顺序跑三镜头。
每族在 `families.md` 给一个能直接喂给 `nbsim.simulate` 的 JSON。

**schema**：顶层 `{"extra": [<新增通道>, …], "slow_na": <bool>}`；每个新增通道 `name, g, E, mvh, mk, mtau, mpow`
必填，`hvh, hk, htau, hpow` 可选（给了 `hvh` 才有失活门）。公式：

- 激活 `m∞(V) = 1 / (1 + exp(−(V − mvh) / mk))`：`mk > 0` 去极化激活；`mk < 0` 超极化激活。
- 失活 `h∞(V) = 1 / (1 + exp((V − hvh) / hk))`：**`hk > 0`** 才是"去极化失活、超极化去失活"；
  `hk < 0` 把门反过来（超极化反而关上）。

**符号只拿参考模型自己的 Na 失活门示范**（本卡故意不给完整的新增通道例子：任何带失活的例子，
内向外向都会像某个 world）。参考模型的 Na 失活门去极化时关、超极化时开——在上面的写法里就是 `hk > 0`，
与 `vh` 取什么无关：

```python
import math
def h_inf(V, vh, k): return 1 / (1 + math.exp((V - vh) / k))
for vh in (-90, -65, -40):                            # 任取；只看符号
    assert h_inf(-40, vh, +1) < h_inf(-95, vh, +1)   # hk > 0：去极化关（参考模型 Na 失活门的方向）
    assert h_inf(-40, vh, -1) > h_inf(-95, vh, -1)   # hk < 0：门反过来（超极化反而关上）
```

**仿真前先打印每个候选门的稳态值**（通用的实例化检查，每个族都做；历史上符号写反让
REFUTED 落在一个与陈述不一致的模型上，gate 查不到）：

```python
import math
def m_inf(V, vh, k): return 1 / (1 + math.exp(-(V - vh) / k))
def h_inf(V, vh, k): return 1 / (1 + math.exp((V - vh) / k))
for ch in mech["extra"]:
    for V in (-95, -65, -40):
        h = f" h∞={h_inf(V, ch['hvh'], ch.get('hk', 4.0)):.2f}" if ch.get("hvh") is not None else ""
        print(ch["name"], V, f"m∞={m_inf(V, ch['mvh'], ch['mk']):.2f}{h}")
```

打印出来的方向必须与 statement 一致（陈述"去极化时失活"却打印 h∞(−40) > h∞(−95) → 符号写反了，
先改 JSON 再仿真）。解析报错 → 回到上面的 schema 修，不要删掉这个族。

## I2 nbsim 矩阵（免费，机械）

每族 × 每协议段（池内、held-out、自写段）× `task["blockers"]` 的组合，每格 `reps ≥ 64`，seed 固定。
**所有阻断剂都当矩阵列扫一遍**——这是通用的药理剖分方法，对每个 world 一样。每次仿真写一条记录
`research-work/<run>/sim/<id>.json`：

```
{mechanism, segments 或 label, block, reps, seed, counts_mean, counts_sd, nbsim_sha256}
```

`nbsim_sha256` = `sim_env.sha256`。凡是要进 prereg 的仿真数字（band 中心与宽度、Δ、σ、r*）都必须
出自这样一条记录。汇总进 `sim/matrix.csv`。

复现不了已观测格子的族：**先在它的自由参数上扫网格**（钉死参数不动）——扫中 → 照常进 I3；
扫后仍不符 → PARK（RULING，`reopen-if grid widened`），但**仍保留为矩阵列**，K3 的对手带检查
包括 PARK 族。

## I3 对手完整性（K1）

首个 prereg 之前、以及 LIVE 新增一族时：开一个 W1-rival（`research_kit.new_job(run, "rivals", "K1")`），
它看得到问题、观测、坟场，**看不到**你偏好的机制；问"还缺哪个族？"与 C 轴 problem-fit（每个假设
判别的是不是这道战役问题本身）。输出 `research-work/<run>/rivals.md` → 父会话逐个 `claim_propose`
（note 带 `source: <job 路径>`；派生自某族的变体带 `parent`）。被辨识的只能是被召回的：漏掉的族
永远不会作为对手出现，SUPPORTED 也就只是"相对于一个不完整集合"。

## I4 判别设计（K2）—— Δ/σ 功效卡

**用一个实验做判别之前，先算它分不分得开。**

1. 对要区分的两个候选 a、b，在该协议段 × 阻断剂组合上各仿真 `reps ≥ 64`（`nbsim.simulate`，seed 固定），
   得到 μ_a、μ_b、σ（两者 sd 的合并值）。仿真记录写进 `research-work/<run>/sim/`。
2. 效应量 `d = |μ_a − μ_b| / σ`；连续读数（尖峰数均值）所需真细胞 reps：`r* = ⌈(2/d)²⌉`
   （观测均值的 2 个标准误 ≤ Δ）。
3. **零基线检出**：若一方在仿真里 0 次出峰（≥64 reps），另一方单次出峰概率为 p，则"至少见到 1 峰"
   所需 reps：`r* = ⌈ln 0.05 / ln(1 − p)⌉`；一个峰就足以否定零出峰的一方。
4. 先挑 `r*` 最小的格（候选格：池内协议 × `task["blockers"]` 的组合）。**阻断剂格必须进比较**：每一对
   （含 H0 对每个对手）都在**每个阻断剂下各仿真**一遍、各算 `r*`——某个阻断剂格把 null 与对手分开所需的
   reps 比无阻断格少，就优先登记它（`spec.observe.blockers`）。已观测的格子不能再登记，同协议加阻断剂是
   新格子。**本探针的真细胞 reps ≥ `r*`**
   才可以拿它下 REFUTED / SUPPORTED；reps < `r*` 时**照测**，结论按检出限写（"在 r 次、该精度下未检出；
   该协议下效应 ≤ x"），该结论封顶 `lead`。
5. 全部候选格的 `r*` 都超过剩余预算 → 预算**照花**（花在 `r*` 最小的格上），结论一律按第 4 条的
   检出限写法，不写"不存在"。没花完的预算本身就是失败（01 K2-1）：剩余预算 > 0 且活对手未分开时，
   锚的 NEXT 是 `剩余预算 N → 选判别度最高的下一探针（含阻断剂）`，排在 forecast 之前。
6. **永不凭一组参数否定一个家族**：否定一个家族之前，它的每个自由参数至少扫 3 个点，全部落在观测的
   2 SE 之外才可以；否则只否定那个参数点（statement 写参数点），家族留 LIVE。
7. `prereg_write` 的结构字段（宿主只读这些；只写在 `question` 里的同名内容不算）：
   - `discrimination`：一句写 `d`、`σ`、`r*`、本次 reps、所用仿真记录 id；
   - `sims[{path}]`：每个用到的仿真记录，`path` = `sim/<id>.json`；宿主当场算 sha256 并冻结（不要手抄哈希；给了前缀就核对，不符即拒）；
   - `provenance{H#: …}`：每条 band 的出处，`sim:<记录 id>`（`<id>` = `sims` 里那条记录的文件名去 `.json`）·
     `measured:P#`（已落地探针）· `asserted` · `invented`；
   - `branches[].headline`：该分支命中时报告的第一句（`HYPOTHETICAL`）。

kill 或 support 分支只靠 `asserted` / `invented` 带 → 结论封顶 `lead`；缺 `headline`、support 缺
`discrimination` 同样封顶（宿主落成 `CONTESTED + lead`，见 research-probe 的 `references/k3-audit.md`）。

实验语法：先写对手的预测差、单一承重干预、最强的平凡对照、先测上下界
（research-probe 的 `references/experimental-tactics.md`）。`question` 里写 mattering 子句（区分这两个机制
会改变哪个预测或干预）。

## I5 预登记 / 计量

`prereg_write`（`spec.observe`）→ `probe_run`。看过的格子不许再登记（同格计量是确定性的）——
换格子，或在 nbsim 里仿真。计量扣预算；K3、forecast 与报告不扣计量预算——不要为它们留着计量 reps 不花。

## I6 迁移（K3）

SUPPORTED 必审；**家族级 REFUTED 同样审**；support / kill 带互斥检查的对手集 = 全部活对手（含 H0）+ I2 的 PARK 族。
按 research-probe 的 `references/k3-audit.md`；迁移带 `claim_transition{audit}`。

## I7 对抗

W3 镜头：**可辨识性**（自由参数是否欠定：两组参数给出同样的读数）/ **噪声模型**（读数分布与仿真
是否同族）/ **未覆盖协议**（哪个协议段或阻断剂组合还没进矩阵）。每条攻击 `attack_record{target}`，
债绑定到被攻击的 claim。

## I8 信念更新（K4）

一行：本次缩小了什么（LIVE / 等价类 / 新 constraint / 新 lesson）。锚出现
`NEXT: synthesize lessons` → `references/w5-lessons.md`。

**等价类出口**：剩余 LIVE 在可用协议（含阻断剂格）与剩余预算下 max min |Δpred|/σ < 1（找不到能把它们分开 1σ 的格）
→ 写 RULING `Ruling: equiv{H5, H7} — max min |Δpred|/σ = <值>（sim:<id>）— <押错代价>`。锚渲染它，
并把它算作谓词里的"收缩到等价类"。锚的存活数与 MCP 同一个活集（LIVE / lead / narrowed / SUPPORTED）。
narrowed claim 可以入 bands；它的 `scoped_statement` 与存活者确实不重叠、不该再算时，在 RULINGS 写一行
理由再走 I9（NEXT 是建议，偏离要写明）。等价类**不免花预算**：剩余预算 > 0 时锚仍点名下一探针——
先按 I4 第 5 条花在 `r*` 最小的格（检出限写法），预算花完再走 I9。

## I9 预报

只在 K7 前、**一次**提交**全部** held-out：每个标签用最好的候选（或等价类各成员）在 nbsim 里仿真
≥64 reps 取均值，记为 `(sim:<记录 id>)`（`sim/<id>.json` 那条记录）；只有没有可仿真候选时才用 `(extrap)`。
逐标签的值与 `(sim:<记录 id>)` 写进 `research-work/<run>/forecast.md`，再调 `world_forecast`。
预算没花完就提交 → REPORT 写一行为什么没花（01 K2-1：记为失败，只记账，从不阻止 forecast 或声明）。

## I10 报告

research-report 的 identify 段：机制 + 等价类 + `value (F)` + 逐 held-out 标签的 `(sim:<记录 id>)` +
预算（已花 / 总额，剩余要写原因）+ 未覆盖协议 + 网格 claim + 框定行。

## 禁止

- 不写任何 world 专属提示进 RULINGS、brief 或报告的"方法"段（只写通用方法）。
- 不凭单次仿真抽样当基准；基准一律用均值 ± sd。
- 不为凑预算把探针花在 `d` 很小的格上而不报检出限。
