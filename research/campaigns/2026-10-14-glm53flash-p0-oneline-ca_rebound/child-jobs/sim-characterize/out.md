# ca_rebound 模拟表征（sim-characterize）— 参考基线任务报告

- run/world/seed: `ca_rebound` / `ca_rebound` / 0；参考模型 mechanismJSON = `{"extra": [], "slow_na": false}`（无附加电流、无 slow Na）。
- 角色: rlm child（递归深度 1），任务是对参考模型跑免费 `world_simulate` 表征基线。

## 结论

**本任务被运行时门禁确定性阻断，未产出任何模拟数值。** `world_simulate`（`mode='info'` 与 `mode='candidate'` 两种模式均试过）被服务端一律拒绝，错误信息固定为：
> `rlm child cannot call world_simulate: the parent session is the only research-state writer. Write your result into the out.md your brief names (last line = the STATUS line) and finish; the parent collects it and records state.`

这是**设计约束而非瞬时故障**：拒绝来自 `/crucible/apps/electron/src/main/lib/research-isolation-guard.ts` 的 `classifyRlmChildToolCall()`——凡 rlm child（rlmDepth>0）调用研究状态变更类工具（含全部 world_*，因 simulate 也追加 journal）即确定性拦截；源码注释明言「world_* 一律拒（含 world_simulate：它也往 journal.jsonl 追加）」「child 用 ipython 直接写文件不受此限（父会话收集并记账）」。两次复测（不同模式、不同参数）返回同一错误，重试无意义。**child 不产出数字，父会话才是唯一 research-state writer**——本文件因此交付：阻断证据 + 父会话可直接执行的完整调用清单 + 回填模板与分析口径。数据完整性优先：在零真实数据的情况下写 COMPLETED 即虚构，故本报告以 BLOCKED 收束；全部模拟数值须由父会话执行 §3 后回填 §5。

## 1. 执行情况与证据

| # | 尝试 | 关键参数 | 结果 |
|---|---|---|---|
| 1 | `mcp__research__world_simulate`, mode=`info` | run/world=`ca_rebound`, seed=0 | isError，同上门禁文案（toolResult 时间戳 2026-10-14T14:54:55Z） |
| 2 | `mcp__research__world_simulate`, mode=`candidate` | 参考模型 mechanism，protocol=`brief step (12 uA, 40 ms)`，reps=3, seed=0 | isError，同一门禁文案（14:55:31Z）；证明与 mode/参数无关 |

只读复核（未写入任何研究状态根）：
- `/root/.proma-research/ca_rebound/journal.jsonl` 仅 2 条：`run.init`（14:48:50Z）与父会话的 `world.info`（14:49:02Z）；无任何 simulate/observe 记录——佐证上述两次调用在落账前即被拦截。
- `world-ledger.jsonl` 仅 1 条 info（cost=0, budget_before=0）：预算分文未动。
- `register.json` 为空骨架（claims/probes/reports 全空）。

## 2. 合规声明

- **world_observe：0 次调用**（真细胞计量、耗预算，任务明令禁止——未触碰，预算保持 0）。
- **研究状态根（`.proma-research`）：0 字节写入**，仅只读核验上述证据。
- **未用本地代码复算或替代 MCP 模拟器**：即使能本地重算，结果也不与父会话权威账本同源，且守卫设计意图即 child 不产出研究数据；本文件不含任何推测或虚构的尖峰数。
- 门禁属确定性拦截（服务端按会话角色判断），不是权限配置可由 child 绕过的问题；正确路径就是父会话亲自执行。

## 3. 父会话复现清单（15 次免费调用，可直接逐条执行）

统一参数：`run='ca_rebound'`, `world='ca_rebound'`, `seed=0`, `reps=3`, `mode='candidate'`, mechanismJSON=`{"extra": [], "slow_na": false}`。全部为免费 simulate（cost 0，不触真细胞）。如父会话尚未读过题面，先执行一次 `mode='info'`（同样免费）确认协议标签与返回字段名。

**第 2 步：9 个主协议**

| # | protocol 标签（原样传入） |
|---|---|
| P1 | `brief step (12 uA, 40 ms)` |
| P2 | `long step (10 uA, 300 ms)` |
| P3 | `strong step (18 uA, 120 ms)` |
| P4 | `weak step (5 uA, 120 ms)` |
| P5 | `hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA)` |
| P6 | `hyperpol pre-pulse + weak test (-30 uA/250 ms, gap, +6 uA)` |
| P7 | `paired long pulses (12 uA/300 ms, 60 ms gap, 12 uA/300 ms)` |
| P8 | `depolarising conditioning + test (+15 uA/250 ms, then +12 uA)` |
| P9 | `brief hyperpol conditioning + test (-30 uA/40 ms, then +12 uA)` |

**第 3 步：6 个测试协议标签**

| # | protocol 标签 | 备注 |
|---|---|---|
| T1 | `hyperpol -25 then release` | |
| T2 | `hyperpol -35 then release` | |
| T3 | `hyperpol -30 then release` | |
| T4 | `hyperpol -40 then release` | |
| T5 | `brief step (12 uA, 40 ms)` | 与 P1 重复，可注明复用 P1 结果（若仍重跑，seed 固定，结果应一致） |
| T6 | `long step (10 uA, 300 ms)` | 与 P2 重复，同上 |

## 4. 分析口径（父会话回填时按此执行，保证可横向比较）

1. **读数**：取每次 simulate 返回 JSON 中 test 窗尖峰数字段（以实际字段名为准，如 `spike_count` / test 窗计数）；reps=3 记录 rep1/rep2/rep3 原值，均值保留 2 位小数。
2. **放电判定**：均值 ≥ 1 → 「有放电」；均值 = 0 → 「无放电」。
3. **对比度清单**：把 15 行分为「有放电 / 无放电」两组；有放电组按均值降序列出，并单独标注「参考模型下完全静默的协议全集」——静默协议对后续真细胞观测是最强对照（任何非零尖峰都指向附加电流）。
4. **参考画像必须回答的问题**：
   - 幅度/时长依赖：brief(12,40) vs long(10,300) vs strong(18,120) vs weak(5,120) 的放电阈值在哪；
   - rebound 现象：超极化条件后释放期（P5/P6/P9、T1–T4）是否放电——参考模型若无附加电流而真细胞有，rebound 放电即附加电流的首要指纹；T1–T4 的强度梯度（-25→-40）给出剂量-响应曲线；
   - 成对脉冲：P7 第二个 test 窗相对第一窗的衰减/恢复；
   - 条件方向对比：P5（hyper 条件）vs P8（depol 条件）同测 +12：若 P8 静默而 P5 放电，说明去极化条件致失活/适应。
5. **空结果预案**：若 15 行全 0 → 参考模型在该刺激集下完全静默，这本身是关键基线事实（使任何真细胞非零观测成为附加电流的强证据），应明确报告，而非视为任务失败。

## 5. 结果回填模板（父会话执行 §3 后覆盖填写本节）

### 5.1 主协议（第 2 步）

| # | 协议 | rep1 | rep2 | rep3 | 均值 | 放电? |
|---|---|---|---|---|---|---|
| P1 | brief step (12 uA, 40 ms) | — | — | — | — | — |
| P2 | long step (10 uA, 300 ms) | — | — | — | — | — |
| P3 | strong step (18 uA, 120 ms) | — | — | — | — | — |
| P4 | weak step (5 uA, 120 ms) | — | — | — | — | — |
| P5 | hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA) | — | — | — | — | — |
| P6 | hyperpol pre-pulse + weak test (-30 uA/250 ms, gap, +6 uA) | — | — | — | — | — |
| P7 | paired long pulses (12 uA/300 ms, 60 ms gap, 12 uA/300 ms) | — | — | — | — | — |
| P8 | depolarising conditioning + test (+15 uA/250 ms, then +12 uA) | — | — | — | — | — |
| P9 | brief hyperpol conditioning + test (-30 uA/40 ms, then +12 uA) | — | — | — | — | — |

### 5.2 测试协议标签（第 3 步）

| # | 协议 | rep1 | rep2 | rep3 | 均值 | 放电? | 备注 |
|---|---|---|---|---|---|---|---|
| T1 | hyperpol -25 then release | — | — | — | — | — | |
| T2 | hyperpol -35 then release | — | — | — | — | — | |
| T3 | hyperpol -30 then release | — | — | — | — | — | |
| T4 | hyperpol -40 then release | — | — | — | — | — | |
| T5 | brief step (12 uA, 40 ms) | — | — | — | — | — | 与 P1 重复 |
| T6 | long step (10 uA, 300 ms) | — | — | — | — | — | 与 P2 重复 |

### 5.3 参考基线行为画像（要点，待回填）

- （待填：阈值行为、rebound 有无、成对脉冲衰减、条件方向效应）

### 5.4 对比度最大协议清单（待回填）

- 有放电：（待填）
- 无放电（静默全集）：（待填）

---

BLOCKED: rlm child 门禁确定性拦截全部 world_simulate 调用（设计如此：父会话是唯一 research-state writer），未产生任何真实或虚构模拟数据、未触碰 world_observe 与研究状态根；请父会话按 §3 清单执行 15 次免费 simulate 后回填 §5。
