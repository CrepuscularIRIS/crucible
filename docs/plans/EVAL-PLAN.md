# EVAL-PLAN —— 综合评测与真实闭环测试（P6）

**权威**：`Race/` 赛事材料仍是全项目权威（方向 1B，截止 **2026-09-05**）。
本文件是**评测阶段**的权威计划；架构决策仍看 `docs/plans/PLAN.md`。

**本计划只做评测，不做架构扩张。** 唯一允许的代码改动是 §1 的两处封边——
它们不是新能力，是让现有能力的读数可信；不修，后面每个数字都不成立。

**第一问不是分数，是机制到底有没有被用。** `docs/specs/BASELINE-HOLES.md` H1：
一场 26 轮、exit 0、11 张图、report 齐全的 RCB run，55 条事件里
`evidence:0 killed:0 survived:0`——对外声称的全部贡献一次都没触发，而分数看着很正常。
**分数不会告诉你这件事。** 所以本计划里活性（liveness）排在质量之前。

---

## 0 · 现状：两次战役到底证明了什么

| | P5.1 两轮战役 | routing-acceptance |
|---|---|---|
| 流程 | 完整：journal 23 事件，`report.declare` + `gate.verdict passed=true` | **未完成**：7 事件，无 attack/report/gate |
| 路由（loop 先于首个 MCP） | **FAIL**——只打开过 research-grill，且是用户点名后 | **PASS**——loop 15:17:02 早于 research_init 15:17:26 |
| `anchor()` / COUNTERS | **从未调用**，⚠ 调度层全程未激活 | 调用 4 次，COUNTERS 正常 |
| 预登记前跑评测（F1） | **违规**：14:26:22 跑完 4 个条件，14:29:27 冻结频段（+3m05s） | **未违规**：只读源码，用噪声模型推导频段 |
| P11 因果链 | **成立**，六个索引逐一对上（子序列，非连续） | 未跑到 |

**结论：v0.5.1 的开场输出契约修好了路由（F3），F1 随之消失。** 这是一对干净的
RED/GREEN。但两场都不足以支撑"系统可用"的结论，原因见 §1。

---

## 1 · 阻塞项——跑任何 benchmark 之前必须处置

> **P6.0 已实施并审计（2026-08-23）：1.2 机制正确并已关闭共享 kernel；
> 1.1/1.3 未达成目标。** 复审出 5 项 BLOCKING（评分神谕可反复查询、denylist
> 从未接线、kernel/bash 直通真值、预算可重置、`dispose()` 中止 refine），
> 修复计划见 `docs/reviews/2026-08-23-p6-0-audit.md` §四（P6.0b-1…7）。
> **E1 在 P6.0b 全绿之前不启动。**

### 1.1 战役脚本没走产品路径〔**BLOCKING**〕

`apps/electron/scripts/routing-acceptance.ts:108,126` 直接调 Prime 的
`createAgentSessionServices` / `createAgentSessionFromServices`，**绕过
`PiAgentAdapter`、常驻会话注册表与 orchestrator**；`:184 dispose()` 紧接
`:194 process.exit()`。后果有二：

1. 两场战役测的是**脚本骨架**，不是产品。产品路径的唯一实证是 app run
   `~/.proma-dev/sdk-config/`（01a02dc8，08:41–08:56）。
2. `_maybeAutoRefine` 挂在 `setTimeout(0)` 上且 `_disposed` 即放弃——
   **战役里 refine 永远不会触发**。这正是"过了所有闸门却从不触发"的老病，
   现在住在战役脚本里。

**处置**：评测跑批改走产品路径（或在脚本里保留常驻会话 + 排空后再 dispose），
并**无条件归档 `session-artifacts/`**（routing-acceptance 丢了它，harness 状态不可复原）。

### 1.2 RLM 子代理跑在**父会话的 kernel 里**〔**BLOCKING**〕

`pi-ipython-rlm.ts:127-154` 的委托闭包捕获的是**父会话**的 wiredDefinition，
Prime 又把父的 `customTools` 按引用拷进每个子代理（`agent-session.ts:9031`），
同名 customTool 覆盖内置——于是子代理的 `ipython` 在父 kernel 里执行。
两次独立运行的交叉证据：只在子代理 cell 出现过的变量（`run_eval`、`eval_code`、
`pca_shuf`、`Path`、`attacks_path`）出现在**父**的 `kernel-state.json`，
而 grep 全部 35 个父 cell 均为 False。

后果三条，每条都直接损坏评测效力：

- **信息不对称作废**：`claim_view` 构造的是不对称的 **prompt**，子代理的**工具面
  却是对称的**——它能 `print(父变量)`，也能直接读文件。P5.1 实测对抗子代理
  读了 `eval.py` 源码并自行算出真值（`gap=0.4450 / 0.0550`，14:33:10）。
  **"提示词是劝，工具面是拦"——这条本仓库自己写过，又栽了一次。**
- **深度守卫被绕过**：子代理 cell 里的 `rlm.run` 由**父**的 host handler 在
  `_rlmDepth===0` 派发，`RLM_MAX_DEPTH=1` 形同虚设。
- 子代理产出落进父目录（`attacks.md` 落点异常的真正原因）。

**处置**：每个会话绑自己的 ipython 委托，或改用 `tools:[...]` 放行内置由 Prime
自行按会话接线。**可跑的检查**：子代理 cell 里的变量**不得**出现在父的
`kernel-state.json` `savedNames`。

### 1.3 答案可达性〔**BLOCKING**，评测特有〕

NeuronBench 的真值写在 `neuronbench/worlds.py` 里，沙箱 ro-bind 整个根目录，
**agent 与其子代理都能直接读到答案**。这就是 ARFT 的 C.2 / 图 4a（"README 里的
答案变成方法"）。不封上，任何分数都不成立。

**处置**：世界只经**计量接口**暴露——给协议、返回带噪观测、扣预算；
`worlds.py`、`_truth_name`、held-out test 集一律不可达。

---

## 2 · 「机制真被用了吗」——活性作为一等指标

仪器已就位：`research/eval/liveness.py`（只读会话 JSONL，纯统计，不调模型）。
实测能区分那对 RED/GREEN（见 §0 表）。每次评测跑批**必须**产出活性报告。

```bash
python3 research/eval/liveness.py <session.jsonl> --eval-pattern='python3?\s+\S*eval\.py'
```

### 2.1 Prime 原生能力现状（2026-08-23 审计）

| 能力 | 接线 | 默认可达 | 可观测 | 判定 |
|---|---|---|---|---|
| auto-refine（25 轮计数） | ✅ | ✅ **产品路径实测触发** | harness_state.json + 徽章 | **SOUND** |
| refine 徽章（旧 bug） | ✅ | ✅ 已修（读 harness_state） | ✅ | **SOUND** |
| dispose-per-run 计数清零（旧 bug） | ✅ | ✅ 已修（常驻 + 10min TTL） | ✅ | **SOUND** |
| kernel 持久 + 快照 | ✅ | ✅ | kernel-state.{json,dill} | **SOUND** |
| `RLM_SESSION_DIR` | ✅ | ✅ 已修（persist 恒真） | ✅ | **SOUND**（但受 1.2 污染） |
| rlm() 派生 | ✅ | ✅ 实测 | 子会话 JSONL + child_usage | **SOUND** |
| 子代理继承工具/技能/MCP | ✅ | ✅ | 子代理工具直方图 | **SOUND**（正是 1.2 的病因） |
| **压缩** | ✅ 接线完整 | ✅ | compaction_* 事件 | **UNEXERCISED —— 至今 0 次** |
| 压缩后 refine | ✅ | ✅ | ✅ | **UNEXERCISED** |
| refine scope=global | ✅ | ❌ Proma 只发 local | — | **PARTIAL**（`refinements.jsonl` 永不产生，符合设计） |
| rlm 超时 | ❌ **Prime 里根本没有** | — | 完成通知有 | **PARTIAL** |
| `list_subagents.active_session_id` | ✅ | 恒为 `None`（无 daemon 注册表） | — | **PARTIAL —— `status` 才是可信字段** |
| `agent_message`（子→父回复） | ❌ 未传 controller | ❌ | — | **UNREACHABLE**（子代理无法回话，只能走文件） |
| `agent_observe` | ❌ | ❌ | — | **UNREACHABLE** |
| autonomous 模式 | ❌ | ❌ | — | **UNREACHABLE** |
| `rlm_heartbeat` | ❌ 无 controller | ❌ **但模块仍注入 kernel 命名空间** | — | **UNREACHABLE + 不可能指令面** |
| goals | 隐式接线 | 仅 `/goal` | 弱 | **UNEXERCISED** |

**F4 的诊断要更正**：`rlm()` **没有卡死**——它 27 ms 就返回了句柄。子代理与父会话
都是撞上 **`stopReason:"length"`，output 恰好 8194 tokens 被 thinking 吃光**。
修法是**输出预算 / thinking 档位**，不是超时。而 `list_subagents` 5 ms 就返回了
`status='completed'`，`rlm_heartbeat` 模块一直躺在 kernel 里没人碰——
**F4 想要的三样里有两样早就存在，只是没被用。**

### 2.2 每个能力的验收三件套（沿用 PLAN.md 验证规则）

| 能力 | 触发方式 | 运行时证据 | 反向验证 |
|---|---|---|---|
| 压缩 | 长战役压到阈值（或显式调用） | `compaction_start/end` 事件 | 压缩后 `print(research_kit.LAST)` 仍取回锚；kernel 变量存活 |
| 压缩后 refine | 同上 | harness_state 新增条目 | 关掉 compact 触发器则不产生 |
| auto-refine | 单次运行 >25 助手轮 | `prime-agent.refinement` + harness_state | dispose-then-exit 的脚本里**不应**出现（1.1 的回归） |
| kernel 持久 | 跨压缩取变量 | `kernelRestarted:false` | 重启 kernel 后锚必须重建 |
| rlm 隔离（**修完 1.2 后**） | 派生对抗子代理 | 子变量**不在**父 savedNames | 故意在子里定义变量，父快照里不得出现 |
| 路由 | 干净会话说"研究 X" | loop 卡早于首个 research MCP | 去掉开场契约 → 应回到 FAIL（P5.1 已是天然 RED） |
| ⚠ 调度层 | 制造攻击债/连续落地 | anchor 输出含 ⚠ 且被处置 | 只调 `research_state` → 调度层死（P5.1 已是天然 RED） |

---

## 3 · 评测阶梯

**可行性约束（已核实）**：`@proma/cli` 是**只读会话检视器**，没有无头跑批通道。
40 任务 × 重复的规模跑不动——**规模必须服从这一点**，不能靠新建 runner 绕过
（那是架构扩张，本计划明确不做）。

### E1 · NeuronBench 同条件对照〔**最高优先**，直接交付 P5.2 / P18〕

`/home/lingxufeng/oss/neuronbench`，已实测可导入，6 个 world，确定性打分
（`spike_forecast_mse`，纯程序，无模型判断——满足"不得让模型判断写 accepted"）。
它天然具备我们 gate 造不出的两个性质：**观测要花预算**，**held-out 永不可达**。

| 臂 | 内容 |
|---|---|
| **A 基线** | NeuronBench 自带 pure-LLM baseline（无信念状态、无 VoI、无 gate） |
| **B 本系统** | Proma+Prime + 研究 skills + MCP + gates + moves |

**同一模型（qwen3.7-plus，经百炼）、同 world、同 seed、同预算。**
唯一差异是脚手架——这样差值才归因于我们的贡献，而不是模型。
（基线默认走 OpenRouter+Claude，**必须换成同一 Qwen**，否则量的是模型不是方法。）

规模：先 2 world × 2 seed 打通，再扩到 6 world。

**关于 F1 的记账——原文有错，2026-08-23 更正。** 本节曾写"meter 记账与 journal
探针数的差额即账外观测"。**这个定义不成立**：meter 落在同一个 server 进程里，
两侧由同一个 handler 写，差额结构性恒为 0；而诚实路径写的是 `world.observe`
不是 `probe.land`，拿它比探针数会把每一场诚实的 run 都判成泄漏。原意需要一个
**独立于我们 server 的记账者**，把 meter 放进 server 就没有独立性了。

现行口径：**kernel 不可沙箱化，所以泄漏是被测量的量，不是被封死的性质。**
① 评测接线注入 `PROMA_RESEARCH_DENY` 并在 `world_*` 注册时 fail closed；
② benchmark 树移出 agent 工作区；③ `liveness.py` 检出 kernel/bash 对 benchmark
树的读取与 import，把泄漏作为一个要照实报告的数。详见
`docs/reviews/2026-08-23-p6-0-audit.md` §B2/B3 与 P6.0b-3。

### E2 · ARFT 判官复跑我们自己的轨迹〔便宜、离线、不需要新战役〕

`/home/lingxufeng/oss/AutoResearchEval/agent-as-a-judge`：Stage 1 轨迹 →
`analysis.md`，Stage 2 → 45 模式 ARFT 分类。人校 κ=0.75/0.83。
输入要 `<run-dir>/traj/*.json`（带 `task_id` + 可识别日志形状）——我们的会话
JSONL 需要一个小转换垫片（评测基建，允许）。

**用它把 P5.1 / routing-acceptance / E1 的轨迹翻译成领域通用语汇**，
直接支撑模板 P19（失败与边界）。**判官是诊断，永远不是闸门**——
模型判断不得写 `accepted`（红线）。

### E3 · ResearchClawBench〔对照口径，非本系统测试〕

`eval_configs/crucible_dsv4flash.yaml` 已存在，40 任务，判官可配。
但它跑的是 RCB 自带 `researchharness`，**不是我们的栈**；接我们的栈需要适配器
＝架构扩张。故 E3 只作为**历史对照**（H1 的 46.9 / 7.0 / 0 字节就出自这里），
时间不够就整体推迟。**跑之前先处置 H4：RCB 评测服务绑 `0.0.0.0`——红线，
必须改回回环。**

---

## 4 · 指标

**先看活性，再看质量。活性不过，质量数不解读。**

| 类 | 指标 | 来源 |
|---|---|---|
| 活性 | 路由 PASS 率 · anchor/COUNTERS 激活率 · 移动卡打开率 · MCP 信念写入次数 · rlm 子代理数与回收成功率 · 压缩/refine 是否触发 | `liveness.py` |
| 诚信 | **F1 复发率**（预登记前执行评测命令）· kernel/bash benchmark 读取/import 泄漏率 · journal 预算/一次终局 gate 通过率 · 零宽/取反频段出现率 | `liveness.py` + journal/trace gate |
| 质量 | `spike_forecast_mse`（vs 基线臂）· 预算内 kill 数 · 校准（频段命中率） | NeuronBench + `research_kit.calibration` |
| 失败面 | ARFT 模式命中率（尤其 F.4 / D.7 / E.2 / A.5 / C.2） | E2 判官 |

**发不出去的东西**：任何"我们的分"若没有同条件对照臂，一律记为待证实
（H5 的教训：手上只有自己的分，说明不了任何事）。

---

## 5 · 排期（到 09-05）

| 时间 | 事项 | 门槛 |
|---|---|---|
| 08-24 | P6.0 两处封边（1.1 / 1.2）+ 1.3 计量接口 | 子代理变量不落父快照的检查变绿 |
| 08-25 | E1 打通：2 world × 2 seed，双臂 | 活性报告路由/anchor 全 PASS；预算表对得上 |
| 08-26–27 | E1 扩到 6 world；顺带跑满一次**压缩**与 **auto-refine** | 压缩事件 ≥1，harness_state 有新条目 |
| 08-28 | E2 判官复跑全部轨迹 | ARFT 模式表出炉 |
| 08-29–31 | 缺口回补 + 交付物（P13–P20 证据链、PDF） | 每个数字有出处 |
| 09-01–04 | P5.3 评委可用服务 + 百炼凭证；缓冲 | 评估期内持续可用 |

**gateway `:4004` 当前 `/v1/models` 返回空**——跑批前先确认 Qwen 可用（凭证与花费是人的事）。

---

## 6 · 明确不做

无头 runner / 新 agent 注册表 / RCB 适配器 / 陷阱世界套件 / 消融梯队全套
（只做 A vs B 两臂）/ 让判官写 `accepted` / 为凑指标补做无意义实验。

**升级条件**：E1 若显示活性全绿但质量不敌基线，那是**真发现**（我们的脚手架
在这个任务类上无增益），照实写进 P19，不许靠加实验掩盖。

---

## 7 · E1 首轮结果与第二轮计划(2026-08-24 追记)

**首轮(textbook_M s0 × 3 模型,同栈单变量)已完赛**,bundle 在
`research/campaigns/e1-2026-08-24-textbookM-s0/`(SCORE.md 为权威):

| 模型 | spike_forecast_mse | RLM 派出 | 终局 |
|---|---:|---:|---|
| qwen3.7-plus | 9.585 | 5 | ⚠ 缺 report/gate |
| qwen3.7-max | 12.186 | **0**(attack.record 系自写,未派子代理——ARFT E.2 样本) | ✅ |
| qwen3.8-max | **0.725** | 21 | ✅(含一次人工收尾) |

活性三臂全绿(路由/anchor/F1);两条 gate 首次真实全绿。

### 7.1 首轮暴露、二轮前应修的洞

1. **预算 reps 边界**:t8max spent=9>8(`server.ts:447` 的 `reps` 判定漏洞)。
2. **meter 源码可读**:denylist 未覆盖 `/crucible/research/eval/`(liveness 误报来源)。
3. **plus 臂 report_declare 调用过但 journal 无事件**——终局链可静默断裂。
4. max 臂"宣称派出但未派出"——attack_record 需要与 spawn_task 对账。

### 7.2 E-refine · harness 沉淀对照实验〔新增,源自 Continual Harness 论文 2605.09998 与 speedrun 规范〕

**假设**:t8max 的重模拟+对抗策略可经 `/refine` 沉淀为 skill/subagent spec;
沉淀后的 harness 能把弱模型(3.7-plus)的 MSE 显著拉低。

- 步骤:① 从 t8max session 提炼 refinement(prompt/skill/subagent 三类);
  ② global 写入 harness_state;③ 3.7-plus 换新 run 名重跑同 world×seed;
  ④ 对照首轮 9.585。活性上"压缩/refine 至今 0 次"这个 UNEXERCISED 行随之关闭。
- 红线不变:判官/分数不写 accepted;refine 条目要 evidence-backed(引 journal 事件)。
- 这是对 kbs.md"harness 层持续学习"论点的第一个可发表实证。

**RULINGS(2026-08-25,自动化 refine loop 实现时的两处有意偏离 audit 修订,记录在案)**

1. 触发阈值采用 plan 原始默认(residual ≥2,compact ≥1,k=3,budget 3+1,
   native turn interval 作采样时钟),而非 audit 修订 #1 的 1/1/1/turnInterval=1。
   理由:激进默认把 refine 变成每轮开销,与"零 refine 是理想"的 anti-Goodhart
   原则冲突;参数集中在 RESEARCH_REFINE_DEFAULTS,E-refine 中按臂数据调。
2. 三个 Skill 的薄接线(audit 修订 #5)暂不做:loop 保持 Prime 自动补错
   (reviewer 单路径),不做模型主动 dispatch。理由:违反 plan 约束 0.1.3 的
   原始裁决;双路径是否值得,等 E-refine 证明 harness 沉淀可迁移后再决定。
   无头 learning 臂经 RESEARCH_REFINE=learning 启用(见
   research-script-lifecycle.ts createHeadlessResearchRefine)。
3. 纪律性拒绝(budget exhausted/带外迁移/强制分诊/graveyard 冲突/forecast closed)不进
   residual 流:学"如何避免这些拒绝"等于学规避纪律本身
   (classifyMcpResidual 的 NON_LEARNABLE 清单,可扩展)。
4. sequencing:learning 臂对比实验必须在 F1+F2 修复(2026-08-25 已落)之后跑,
   否则测的是 harness 卡死,不是模型。

### 7.3 第二轮(E1 扩展):ca_rebound s0 × 3 模型

novel world(非 textbook 召回型),首次检验系统在"机制不可召回"任务上的表现。
口径:同预算 8、同 goal 模板、t8max 不再注入收尾指令,改观察自然终局;
若 90 分钟无 forecast 停损照旧(记干预)。
