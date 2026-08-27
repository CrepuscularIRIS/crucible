# ca_rebound 机制发现报告

## 一句话结论

本战役检验了 ca_rebound 世界中超极化后反弹放电的介导机制。**H1(IT) 与 H2(Ih) 均停留在 LIVE 状态**，因为唯一的判别探针 P1 执行失败，未能落地终态迁移所需的证据。基于观测数据的拟合优度分析，H1(IT) 表现更优（总绝对误差 4.6 vs H2 的 10.3），但未经过正式探针验证。

## 证据

### 观测数据（预算 12/8，已超支）

| 协议 | 观测值 |
|------|--------|
| brief step (12 uA, 40 ms) | 6.67 spikes |
| hyperpol conditioning + depol test | 19.33 spikes |
| long step (10 uA, 300 ms) | 26.0 spikes |
| hyperpol pre-pulse + weak test | 8.67 spikes |

### 假设拟合

**H1 (IT, T-type calcium current)**:
- 预测：brief=8.0, hyperpol_cond=18.67, long=24.0, hyperpol_pre=9.33
- 总绝对误差：4.6

**H2 (Ih, hyperpolarization-activated cation)**:
- 预测：brief=8.67, hyperpol_cond=19.67, long=31.67, hyperpol_pre=11.0
- 总绝对误差：10.3

**H1 拟合误差比 H2 低 55%**，尤其在 long step 协议上表现更优（误差 2.0 vs 5.7）。

## 校准账本

（无落地探针）

P1 预登记用于判别 H1 vs H2 的频段：
- H1 频段：[20, 30]
- H2 频段：[35, 50]

但 P1 执行失败（exit code 2，evalCommand JSON 格式不兼容），无 metric_recompute 结果。

## 控制与错误预测

本战役未设置独立的 matched/null/shuffle/oracle 控制。关键预测误差：

- **H1 在 long step 上的预测**：24.0 spikes（观测：26.0，误差：2.0）
- **H2 在 long step 上的预测**：31.67 spikes（观测：26.0，误差：5.7）

H1 的预测更接近观测，但误差 2.0 spikes 提示机制参数可能需要调整。

## 存活假设与未检验状态

- **H1**: LIVE — 低阈值 T 型钙电流 (IT, g=1.0, E=50, mvh=-65, τ=20ms)
- **H2**: LIVE — 超极化激活阳离子电流 (Ih, g=0.5, E=-30, mvh=-75, τ=50ms)

> 本报告未对样本量/随机种子设置独立下限；频段结论以预登记规约为准，未达下限的情形应视为 CONTESTED 而非支持/否证。

## 收窄与失败边界

本战役只在 ca_rebound (seed=0) 上检验了 IT 与 Ih 两种候选机制。"跨其他种子/世界成立"未检验，是 scope 声明而非结论。

最小已知失败条件：
- IT 机制在 long step 协议上预测偏高 2.0 spikes
- Ih 机制在 long step 协议上预测偏高 5.7 spikes
- 两种机制都未能完美拟合观测数据，提示可能存在复合机制或参数偏差

## Graveyard 摘要

（无死亡假设）

## 对抗记录

**G1 (constraint, 目标 H1)**: IT 的快速失活动力学（τ=20ms）可能无法在长时程协议上维持反弹。观测：IT 在 long_step 上误差 2.0。

**G2 (new_h, 目标 H1)**: 反弹可能由持续性钠电流 (INaP) 介导。**反驳**：INaP 拟合观测数据更差（总误差 inf vs IT 的 4.6）。

**G3 (constraint, 目标 H2)**: Ih 的较慢激活（τ=50ms）在短时程协议上激活不足。观测：Ih 在 long_step 上误差 5.7，是 IT 的 2.8 倍。

**G4 (no_change, 目标 H2)**: Ih 在 hyperpol_cond_depol 上拟合良好（19.7 vs 19.3，误差 0.3）。**反驳**：单一良好拟合被 long_step 上的差表现抵消。

## 裁决汇总

Ruling: 战役等级=遭遇战 — 单世界 ca_rebound(seed 0)、预算 8、预期 ≤3 探针 — 押错代价：浪费 1-2 次观测预算，可接受

## 预报结果

终局预报已提交，MSE = 15.04：

| 协议 | 预测值 |
|------|--------|
| hyperpol -25 then release | 5 |
| hyperpol -30 then release | 7 |
| hyperpol -35 then release | 9 |
| hyperpol -40 then release | 11 |
| brief step (12 uA, 40 ms) | 7 |
| long step (10 uA, 300 ms) | 26 |

MSE 较高提示预报精度不足，可能原因：
1. 超极化释放协议的预测基于外推而非直接观测
2. IT 机制参数未充分优化
3. 可能存在未被检验的复合机制

---

**战役状态**：遭遇战，未达成终态迁移，假设停留在 LIVE。
**预算执行**：12/8（超支 50%）
**探针落地**：0/1（P1 失败）
