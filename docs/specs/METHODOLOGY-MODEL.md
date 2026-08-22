# 方法论建模 —— 闸门是不变量，方法论是它的参数

**结论先写**：不要为每种方法论各写一条流水线。

```
闸门 = 不变量谓词  ×  方法论提供的证据模式
```

六个闸门（G0–G5）一个不加、一个不改，谓词全是通用的；**方法论只负责填进去的那个参数**。
`PHASE-DESIGN.md` 的六阶段弧也不动 —— 那是**治理顺序**（先诊断再承诺、先对照再下结论、
先评审再交付），四十条任务共用。方法论换的是**每一阶段里做什么**，不是阶段的先后。

这是唯一一个不新增机制的建模方式。`gates/` 已经写完了不变量那一半，缺的那一半只有一个词。

---

## 零 · 先说一个实测发现，它比建模本身重要

**任务的「野心」写在 `task` 散文里，任务的「范围」写在 `data[].description` 里，
而这两者是矛盾的。**三条抽样，三条都矛盾：

| 任务 | `task` 散文说 | `data[].description` 说 | 实际数据 |
|---|---|---|---|
| **Material_002** | 用 MPtrj **~150 万结构** 训练一个原子级基础模型 | 「复现 MACE-MP-0 在**三个测试**上的表现」 | **3,178 B**，一张 MD 运行卡：32 个水分子 / 12 Å 盒子 / 330 K / 0.5 fs / 2000 步 |
| **Astronomy_001** | 研究 EDE 模型能否缓解 CMB–BAO 张力 | 「**Tables II/III** 的最佳拟合参数与 1σ 误差……用于复现关键参数约束」 | **2,010 B** |
| **Physics_000** | 多组分二十面体壳层堆积的普适理论 | 「复现论文**全部仿真实验**所需的完整参数与结果数据」 | **4,446 B** |

Material_002 这条最刺眼：散文让你**训练**一个基础模型，数据让你**下载**一个已发布的模型跑三次 MD。
**这是两种相反的方法论。**照散文执行 = 烧完 200 轮 = 0 分。

再叠三个实测：

1. **`target_study/` 不进工作区。**`run_task.py:34` 只拷 `data/` 和 `related_work/`。
   评分用的 `checklist.json`（3–8 条、带 `weight`、全是 `image`/`text`）和目标论文 **是扣住的**。
   所以「要复现哪几条」必须**推**出来，推的依据只能是 manifest。
2. **40 条里只有 1 条的文件名直接点了图号** —— 就是 `Astronomy_003` 的
   `fig6_data.csv / fig7_data.csv / fig8_data.csv`。**我们那 46.9 分，是在最容易的那条上拿的。**
   别把它当代表性成绩。
3. **rubric 考的是「那个数」**。Astronomy_003 第一条（`weight: 0.4`）要的是：一张直方图 ·
   中位数 **4×10⁻⁴** · 对数正态形状 · **y 轴取对数**。四个 keyword 就是四个得分原子。

**所以 P0 诊断的产物不是「这是天文学任务」，而是「manifest 支撑得起的那 3–5 条待复现命题」。**
域标签没用 —— 上一轮已经量过：任务形状不按域聚类。

---

## 一 · 方法论是一个四元组，不是一份文档

```
methodology = {
  deliverable :  每条 rubric 项是什么对象   （数 | 图 | 指标 | 候选集 | 轨迹）
  control     :  把「结果」和「假象」分开的那一次运行   ← G2 里「applicable」的定义
  kill        :  什么测量会推翻这个切入点              ← claims.py 的 falsifier
  figure      :  P5 必须渲染出来的那张图              ← G5 的「≥1 图」变成「这张图」
}
```

四个格子全部落在**已有代码的输入位**上，一个新字段都不加。落库走 `declare_design`
（`fields.PLAN_SPEC`，已经是预注册的形状），选型本身作为一条 claim 进 `claims.json`。

**选型是可证伪的。**「本任务是 M2」带一条 kill：*若 manifest 里不存在已发布模型/工具的引用，
M2 被推翻*。选错了就杀掉重选，而 `claims.py latency` 已经在量「错的活了多久」——
那是**系统**的指标，不是任务的指标。这是我们唯一一个能自己给自己打分的地方。

---

## 二 · 五条方法论（按 manifest 归的类，不是按散文）

| | 方法论 | manifest 长什么样 | **control（G2 要的那次运行）** | P5 的图 |
|---|---|---|---|---|
| **M1** | **RECOMPUTE** 重算 | 数据本身≈结果或其直接输入（后验样本 / 已拟合参数 / 采样结果） | **换一个估计量，数不许动**；精度对得上论文声明的位数 | 分布 / 误差棒 |
| **M2** | **RUN-KNOWN-TOOL** 驱动已知工具 | 已发布模型或工具 + 一张运行卡；**常常随包发参考输出** | **阳性对照**：先跑通随包的参考输出，对上了才跑新的 | 参考 vs 复现 并排 |
| **M3** | **TRAIN-EVAL** 训练评测 | 带划分的数据集（train/test、多个 benchmark csv） | **同划分下的基线** + 至少一次消融 | 基线对比表/曲线 |
| **M4** | **SIMULATE** 仿真 | 机理 + 参数（步长、盒子、网络拓扑、情景） | **收敛/分辨率检查** + 一个守恒量或不变量 | 收敛图 |
| **M5** | **SOLVE-PER-INSTANCE** 逐实例求解 | 一个实例集（2500 张地图 / 30 道题 / 一个优化实例） | **平凡基线**（贪心/随机）+ **逐实例报告，禁止只报均值** | 逐实例散点/累积曲线 |

**四十条的归属**（`~` = 依据文件名+散文，未逐条读 manifest；动手前须核）：

- **M1 ×9** — Astronomy_000 ✔ · Astronomy_001 ✔ · Astronomy_002~ · Astronomy_003 ✔ ·
  Earth_000~ · Earth_001~ · Physics_001~ · Physics_002~ · Physics_003~
- **M2 ×9** — Material_002 ✔ · Material_001~ · Chemistry_001~ · Chemistry_002~ · Life_001~ ·
  Life_003~ · **Neuroscience_000 ✔（随包发了 `machine_results_reference.csv`）** ·
  Information_000~ · Information_001~
- **M3 ×8** — Chemistry_000 ✔ · Chemistry_003~ · Information_003 ✔ · Neuroscience_002 ✔ ·
  Neuroscience_003~ · Math_000~ · Earth_003~ · Material_000 ✔
- **M4 ×9** — Physics_000 ✔ · Material_003~ · Neuroscience_001~ · Energy_000~ · Energy_001~ ·
  Energy_002~ · Energy_003~ · Earth_002~ · Life_000~
- **M5 ×5** — Math_001~ · Math_002 ✔ · Math_003 ✔ · Life_002~ · Information_002 ✔

**Neuroscience_000 是 M2 的教科书例子，也是我们 7.0 分的那一条。**
它随包发了 `machine_results_reference.csv` —— 一份参考输出摆在那里，
基线**从没跑过阳性对照**。M2 的 control 如果当时在，这 7.0 分不会是这个死法。

---

## 三 · 三层，以及每层各自的选择规则

| 层 | 是什么 | 什么时候选 | 谁选 | 已有实现 |
|---|---|---|---|---|
| **L0 不变量** | 六个闸门的谓词 | **从不选**，永远开 | — | `gates/accept.py` · `gates/claims.py` · `cross_review` |
| **L1 方法论** | 上面那个四元组 | **P0 一次**，可被杀后重选 | 读 manifest 推，**不读散文** | `declare_design` + `claims.json` |
| **L2 技能** | 绑在 (方法论, 步骤) 上 | 那一步到期时 | 阶段文件**点名**加载 | `SKILL-PACKAGING.md` 的 L1/L2/L3 |

L2 这条解决了一个旧问题：三条基线里 `Skill` 工具**一次都没被调用**。
原因不是加载机制坏了，是**没有任何东西告诉模型现在该调哪个**。
「阶段文件点名」把技能选择从「模型浏览技能面」变成「编排指定」——
技能面从此不需要好看，只需要正确。

---

## 四 · 六个闸门怎么被参数化（这就是全部改动）

| 闸门 | 不变量谓词（不动） | 方法论填的那个参数 |
|---|---|---|
| **G0** 覆盖 | 无处置的需求条目 == 0 | **需求条目从哪来**：M1/M2 = manifest 每条 description 的每个可核对断言；M3 = 每个数据集×指标对；M5 = 每个实例 |
| **G1** 台账 | `claims.py check` exit 0 | **claim 的 role**（`claims.py` 已有四种）：M1→phenomenon · M4→mechanism · M3/M5→intervention · M2→generality |
| **G2** 对照 | applicable controls 已跑且落盘 | **applicable 的定义** = 第二节那一列。这是最主要的一处 |
| **G3** 评审 | `open_findings == 0` 且真跨家族 | **无参数** —— 评审独立性与方法论无关 |
| **G4** 杀伤 | KILL CONTRACT + OBSERVABILITY 成立 | **observability 比对的那个维度**（M1 是那个数，M3 是那个指标，M4 是那个不变量） |
| **G5** 交付 | 报告非空 + ≥1 图 + 覆盖节 | **「≥1 图」具体是哪张**（第二节最后一列） |

G3 一个参数都不要，这是个好信号：**它是唯一的 Type-B 闸门**，
方法论碰不到「谁有资格宣判」这件事 —— 那正是 `accept.py` 那句
「A goal/loop can DRIVE; it cannot ACQUIT」守的东西。

---

## 五 · 不做什么

- **MUST NOT** 为五条方法论各写一条阶段弧。弧是治理顺序，共用；换的是弧里的内容。
- **MUST NOT** 用域名（Astronomy/Chemistry/…）选方法论。已量过：形状不按域聚类。
- **MUST NOT** 用 `task` 散文定范围。三条抽样三条与 manifest 矛盾，Material_002 是相反的。
- **MUST NOT** 新增 claim 字段或第二套台账 —— 四元组全部落在 `declare_design` 已有的格子里。
- **MUST NOT** 把方法论选型当成不可撤销的。它是一条带 falsifier 的 claim，杀了重选，
  `claims.py latency` 量它活了多久。

---

## 六 · 验收（怎么算这个建模成立）

跑 **`Astronomy_003`**（同任务、同网关、串行，与 46.9 可比），事件流 MUST 同时满足：

1. `declare_design` 落库的四元组里 `control` 非空，且**引用了 manifest 里的具体字符串**
   （不是「做个对照」这种散文）
2. `claims.json` 里存在一条「方法论 = M?」的 claim，带 falsifier，且 `claims.py check` exit 0
3. G2 检查的那份 control 清单，**逐条能追到第二节表格的那一格**
4. 报告里的覆盖节，逐条走的是 **manifest 的 description**，不是 `task` 散文
5. 至少一条任务上方法论**被杀过并重选**（用 `Neuroscience_000` 造这个场景：
   它随包发参考输出，M2 的阳性对照一跑就知道选没选对）

第 5 条是这轮真正的判据 —— **前四条只证明写下来了，第 5 条证明它会自我纠错。**
