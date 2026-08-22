# 技能打包方案 —— grill-loop 主导，其余降级为被路由项

**背景**：基线跑完三条（`BASELINE-HOLES.md`），**46.9 / 7.0 / 无产出** ——
三条 = 三种互不相干的失败，而 `stats` 三条全部 `evidence:0 round:1`，**一个闸门都没响**。
这份文档回答的是：**为什么没触发，以及技能这一层要怎么重新组织**。

结论先写：**加载机制没坏，坏的是内容的形状。**不新建包，就改 `crucible/plugin/`。

---

## 一 · 现状诊断（四个实测缺陷）

### D1 · 主导的那个技能，「导」被砍掉了

同一套 Grilling Science 分了两个叉，**形状完全相反**：

| | `ccf/.claude/skills/grill-loop` | `crucible/plugin/skills/grill-loop` |
|---|---|---|
| SKILL.md | **7,177 B** | **69,551 B** |
| 形态 | 路由器 + `loop/0-orient…5-verify` 六个阶段文件 | 单体，六阶段全部内联 |
| 状态机 | `.grill/STATE.md`「先读它，它说你在哪一阶段」 | **没有** |
| 加载纪律 | 「load one phase file, **nothing else**」；每个 reference 开头一行 `LOAD WHEN:` | **没有** |
| 工具绑定 | ChatGPT web / `analyst` / `grok-verifier`（那边的栈） | `run_falsifier` / `arbor` / 我们的 MCP（**对的**） |
| 悬空引用 | — | **8 个** |

crucible 这版**不是 ccf 版拍平的**，是独立演化的另一支：绑定对、语言对、
但把 ccf 那套「一次只进一个阶段」的骨架整个丢了。

**这直接解释 H1。**一个 69.5 KB ≈ 17k token 的单体，调用即整份进上下文，
而且进去之后模型拿到的是一墙散文，**没有任何东西告诉它「你现在在第几步」**。
对比 ccf 版的第一句：「Read `.grill/STATE.md` first. It names the phase.」——
那是个状态机，而状态机正是我们要做的「编排」。

八个悬空引用（`grill/mechanism-bank.md`、`grill/prediction-ledger.md`、
`grill/schema-library.md`、`references/browser-patterns.md`，以及四个写成裸文件名
但实际在 `references/` 下的）—— 模型照着字符串去读，一律 404。

### D2 · 技能面 83% 指向「写论文」，而 benchmark 考的是「做研究」

18 个技能里 15 个是 `ts-*`，同一家上游（Spark-To-Paper-Skills，MIT，commit a32b1a7）：
latex / cite / figure / review / refine / write / plan / data / experiment / kg-build /
idea2story / figure-svg / figure-optimize / paper。

RCB 的 rubric 一条都不考 LaTeX 排版和参考文献格式（实测：Astronomy_003 三条 rubric
全是 `type: image`，考的是**数值对不对、结论对不对**）。NeuronBench 更是纯数值。

### D3 · 预算错配：最该主导的技能，广告最弱、代价最大

| | description（每次进上下文） | body（调用时进） |
|---|---|---|
| 全部 18 个合计 | 11,312 B ≈ **2.8k token** | 326,723 B ≈ **82k token** |
| `grill-loop` 单条 | **407 B**（倒数第二小） | **67,731 B ≈ 17k token（最大）** |
| `ts-figure-optimize` | 996 B | 20 KB body / **2.8 MB 目录** |

description 那 2.8k token 不是问题，**别去优化它**。问题是 `grill-loop` 的
「触发面最小、代价最大」这个组合 —— 它既不容易被选中，选中了又贵。
三条基线 run 里 `Skill` 工具一次都没被调用，这个组合是原因之一。

`ts-figure-optimize` 目录 2.8 MB，和 2026-08-18 那次 `claude-api`（852 KB 撑爆上下文）
是同一个形状。现在没炸只是因为没人调它。

### D4 · always-on 钩子指向一个不存在的技能

`plugin/hooks/always-on.sh` 读 `skills/crucible-research/SKILL.md` ——
**这个目录不存在**。脚本 `[ -f "$skill" ] || exit 0`，于是静默退出，什么都不注。
「科研纪律 always-on」这个功能目前是死的，而且**界面上完全看不出来**。

---

## 二 · 包的形状：一个包，三层

**不新建包。**`crucible/plugin/` 已经是合规的 Claude 插件
（`.claude-plugin/plugin.json` + `marketplace.json`），`host.py` 已经用
`plugins=[{"type":"local"}]` + `setting_sources=["project"]` + `skills=OUR_SKILLS`
装它，并且**已经避开了 `skills="all"` 那个雷**。这一层不要动。

```
crucible/plugin/skills/
├── grill-loop/                    ← 第 1 层：主导（唯一的入口）
│   ├── SKILL.md                   ← 路由器，目标 ≤ 8 KB
│   └── phases/0-orient … 5-verify.md
│
├── <科研执行层>                     ← 第 2 层：阶段文件点名加载
│   experimental-design · hypothesis-generation · crucible-recall
│   + 新捞的判据类技能（见第四节）
│
└── paper/                         ← 第 3 层：降级，只在 phase 5 可达
    ts-* × 15
```

**第 1 层是唯一进 `OUR_SKILLS` 顶层的东西吗？** 不是 —— `_our_skills()` 从磁盘数目录，
改分层要么改那个函数，要么用子目录。**推荐后者**：`ts-*` 挪进 `skills/paper/` 子目录，
`_our_skills()` 只数一级目录，它们自然从技能面上消失，但文件还在、phase 5 仍可 `Read`。
**不删任何文件** —— 这是可逆的那个选择。

> 这里有一个需要你拍板的取舍：`ts-*` 是 **(a) 全留在顶层**、**(b) 降级到 phase 5 可达**、
> 还是 **(c) 移出包**。我按 (b) 写方案 —— 它可逆，且不赌「比赛后期不需要成稿能力」。
> 你要 (a) 或 (c) 说一声。

---

## 三 · grill-loop 怎么改（这就是 task #14 + #15）

**MUST NOT 把 ccf 那份拷过来。**它绑的是那边的栈（ChatGPT web 主路、
`analyst`/`research`/`grok-verifier` 三个子智能体、ICLR 2027 的日期闸门），
拷过来在 crucible 里全是悬空的。

**要的是它的骨架，填我们的绑定：**

1. **状态文件**。`<workspace>/.grill/STATE.md`，第一行写当前阶段。
   SKILL.md 第一句就是「先读它」。缺失或过期 → 先重建，再做别的。
   *（ccf 原话：a session that cannot say which phase it is in will improvise one ——
   这正是三条基线 run 干的事。）*
2. **六个阶段文件**，一次只进一个。现有 69.5 KB 单体按 `## The loop` 那节切开重排。
3. **每个阶段一个出口闸门**，闸门是**工具裁决**不是提示词。三个，分别对应三条基线的死法：
   - **证据闸（H1）**：出结论 → MUST 有 `run_falsifier` 的 JSON 或一个 evidence id，
     否则只能标 provisional
   - **覆盖闸（H7）**：阶段 0 落一份**可核对的需求清单**，阶段 5 逐条走一遍，
     **把没覆盖的条目点名写进 `report.md`**。Neuroscience_000 就是死在这 ——
     六个实验条件的数据根本没随任务发，它做了一个条件，然后**一个字都没提这件事**
   - **地板闸（H6）**：收工 → MUST `report/report.md` 非空 + 图 ≥1
4. **`LOAD WHEN:` 纪律**。每个 reference 开头一行，那一行是唯一的加载触发。
5. **修掉 8 个悬空引用**，裸文件名补 `references/` 前缀，`grill/*` 三个要么建要么删。

**H6 的地板 MUST 是钩子，不是提示词 —— 这条已经被实测证否过一次了**：
RCB 的 `INSTRUCTIONS.md` 里白纸黑字写着

> **There is no human on the other end.** … **do not ask for help, do not pause, and do not
> interrupt the task.**

这段话就在上下文里，`Math_000` 照样问了「What would you like to do next?」。
**所以「再写一段更狠的提示词」是一条走过的死路。**做成 `Stop` 钩子
（`plugin/hooks/hooks.json` 已有钩子机制，`always-on.sh` 是现成范例）——
交付物不存在就 deny stop，把控制权还给编排而不是还给一个不存在的人。
**提示词是劝，钩子是拦** —— 这次不是推理，是有对照的实验结论。

---

## 四 · 其余 repo 的技能：点名捞，不是批量装

`crucible/docs/2026-08-18/SKILL-SCREEN-MERGED.md` 已经把 785 条筛完了（KEEP 52 / FACTOR 101），
**结论是「跑完闭环之后，拿真实卡住的那一步去点名捞」**。基线跑完了，卡点有名字了：

| 实测卡点 | 捞哪条 | 票 |
|---|---|---|
| **H6** 没有地板，跑一半问人 | `planning-with-files` | 4（唯一全票） |
| **H1** 结论不追证据 | `result-to-claim` · `paper-claim-audit` · `experiment-audit` | 2 / 2 / 2 |
| **H7** 范围没人核对（7.0 分） | `experiment-audit`（同上，覆盖核对那一半） | 2 |
| **丢 65 分**：结论没人反驳 | `kill-argument` · `auto-review-loop` | 2 / 2 |

**位置已确认**：`planning-with-files` 在 `~/oss/planning-with-files/`；
其余 5 条全部来自同一个 repo `~/oss/aris`（= `autoresearch/Auto-claude-code-research-in-sleep`）。
捞的面比想象中窄 —— **一个 repo 加一个 skill**。

**已实测的坑（决定了怎么捞）**：这 5 条在 aris 里**只有 `SKILL.md`，没有 `scripts/`**
（逐条 `find` 过）。所以：

> **KEEP 的含义是「这套判据值得照着重写」，不是「拷过来能跑」。**

`kill-argument` 的价值是那套反驳判据，不是散文；落地形态应当是
`mcp__sci__run_falsifier` 的裁决规则，或者阶段 3 的出口闸门 —— **写进代码，不是塞进技能面**。
照抄 SKILL.md 只会让 D2/D3 更严重：技能数 +5，牙齿 +0。

---

## 五 · 不做什么

- **MUST NOT** 新建第二个插件包。
- **MUST NOT** 用 `skills="all"`（2026-08-18 事故，`claude-api` 852 KB 撑爆上下文）。
- **MUST NOT** 删除任何 `ts-*` 文件 —— 降级是移动目录，可逆。
- **MUST NOT** 为了「技能数好看」批量装 KEEP 52。SWE-Skills-Bench 实测：
  49 个公开 skill 里 39 个没提高通过率，1 个让 token 涨 451%，3 个反而降约 −10pp。
- **MUST NOT** 动 `host.py` 的加载三件套（`plugins` / `setting_sources` / `OUR_SKILLS`）——
  那部分是对的，改了会把已经踩平的雷重新踩一遍。

---

## 六 · 验收（怎么算做完）

一条 RCB 任务跑完，事件流里 MUST 同时满足：

1. `Skill` 工具被调用过，且调的是 `grill-loop`
2. `stats` 事件里 `evidence > 0`，`round > 1`（现在恒为 `evidence:0 round:1`）
3. `run_falsifier` 至少一次真实调用（不是只出现在 `init` 的工具清单里）
4. `report/report.md` 非空 —— 且这一条由钩子保证，不是靠模型自觉
5. 报告里有一节**覆盖核对**，逐条对上阶段 0 的需求清单，未覆盖项点名列出
6. 分数与基线 46.9 可比（同任务 `Astronomy_003`，同网关，串行）

**任何一条不满足 = 没做完。**第 2、3 条是这轮的核心，第 4 条是 H6，第 5 条是 H7。

**复测 MUST 用 `Astronomy_003`，不要用 `Neuroscience_000`** ——
后者 60% 的权重在给定数据下拿不到（见 H7），用它调 harness 是在调噪声。
