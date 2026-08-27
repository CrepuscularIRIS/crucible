# z_rebound 机制发现报告

## 战役概览

- **Run**: e1-z_rebound-s0-plus-litellm-r2
- **World**: z_rebound, seed=0
- **预算**: 8 reps 全部使用
- **LIVE 假设**: 1 (H3)
- **SUPPORTED 假设**: 2 (H1, H4)
- **REFUTED 假设**: 1 (H2)

## 核心发现

z_rebound 世界存在一种**去极化激活的慢电流机制**，显著调制 spike 发放率。两种等价机制假说（H1 和 H4）均获得强证据支持：

- **H1 (SUPPORTED)**: 去极化激活、超极化失活的慢内向电流（类似 persistent Na+ 或 ICAN）
- **H4 (SUPPORTED)**: 去极化诱导胞内 Ca²⁺ 累积增强非选择性阳离子电流

两者在功能上等价，区分需要 Ca²⁺ 螯合剂实验（当前数据无法判别）。

**H2 被直接否证**：预测去极化激活外向电流应抑制发放，实测 40 spikes 远超预测上限 [5,12]。

**H3 形式上仍为 LIVE 但被强烈否证**：预测所有协议结果相近 [18,25]，实测呈现系统性梯度（极差 31 spikes），无法由数值伪影解释。因探针设计限制（需至少 2 个 LIVE 假设才能判别）未能通过 claim_transition 正式迁移。

## 关键证据

### 训练协议观测（8/8 预算）

| 协议 | 实测 spike count |
|------|------------------|
| depolarising conditioning + test | 40 |
| hyperpol conditioning + depol test | 11 |
| hyperpol pre-pulse + weak test | 9 |
| brief hyperpol conditioning + test | 21 |
| paired long pulses | 30 |
| long step (10uA, 300ms) | 30 |
| strong step (18uA, 120ms) | 18 |
| weak step (5uA, 120ms) | 13 |

### 探针验证

- **P5** (depolarising conditioning): 实测 40 spikes，落在 H1 预测 [30,50] 内，kill H2/H3
- **P6** (hyperpol conditioning): 实测 11 spikes，落在 H4 预测 [8,14] 内

### Held-out 预报（world_forecast）

| 协议 | 预报 spike count |
|------|------------------|
| cond -20/+10 | 32 |
| cond -22/+9 | 35 |
| cond -30/+8 | 11 |
| cond -35/+12 | 14 |
| depol 14 uA/200 ms | 38 |
| strong step 16 uA/150 ms | 22 |

**预报 MSE**: 见 world_forecast 返回值

## 对抗攻击总结

共 10 条 typed 攻击（G1-G10）：

- **G1-G3 (H2)**: 观测与 H2 预测方向完全相反，直接否证
- **G2, G4, G8 (H3)**: 系统性梯度无法由数值伪影解释
- **G5, G7, G9 (H1)**: 
  - G5: hyperpol conditioning 预测偏高 ~30%，时间常数需校准
  - G7: 时间常数粗粒度约束（100-300ms 而非 200-500ms）
  - G9: 迁移后约束——缺乏超极化失活动力学独立探针
- **G6 (H1→H4)**: 提出 Ca²⁺ 累积 ICAN 替代机制
- **G10 (H4)**: 迁移后约束——Ca²⁺ 累积时间尺度需独立验证

## 方法论

1. **观测阶段** (8/8 预算): 8 个训练协议揭示系统性电压依赖模式
2. **候选机制生成**: 基于观测提出 H1/H2/H3，后增补 H4
3. **免费仿真对比**: world_simulate 对比候选预测
4. **对抗攻击**: 9 条攻击揭示约束和替代解释
5. **探针验证**: P5/P6 确认 H1/H4，否证 H2
6. **终局预报**: 6 个 held-out 协议提交

## 局限性与未来工作

1. **H1 vs H4 不可区分**: 需 Ca²⁺ 螯合剂实验（BAPTA）或电压钳测量
2. **H3 未正式迁移**: 形式上仍为 LIVE，但所有证据强烈否证
3. **时间常数精度**: ~200-500ms 为粗粒度估计，需系统性改变 conditioning 时长

## 报告生成信息

- **时间**: 2026-08-25 17:50 UTC
- **Run 状态**: 完成
- **Gate 状态**: 待 declare

---

**结论**: z_rebound 世界存在去极化激活的慢电流机制（H1/H4），显著调制 spike 发放。去极化增强发放（40 spikes vs baseline 13-30），超极化抑制发放（9-11 spikes）。数值伪影假说（H3）被系统性梯度证据强烈否证。预报已完成，预算用尽。
