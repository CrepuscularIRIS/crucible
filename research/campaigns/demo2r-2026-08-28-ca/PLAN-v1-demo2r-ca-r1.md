# PLAN-v1.md — demo2r-ca-r1 研究计划
**时间戳**: 2026-08-28T05:35Z (先于任何探针预登记)
**战役等级**: 遭遇战 — 单一未知电流、预算 ≤8、≤3 探针预期

## 题面
- 世界: ca_rebound(seed 0)
- 已知: 存在一个未知身份的额外膜电流（非标准命名通道），电压依赖性和动力学未知
- 参考模型: extra=[], slow_na=false
- 训练协议: 9 个（可用于观测）
- 测试协议: 6 个（held-out，需预报 spike count）

## 假设树

### H1: 慢失活 K⁺ 电流 (IKs)
- **statement**: 未知电流是一种去极化时缓慢失活的钾电流（E≈-80mV，τ_inact≈200-400ms，hv≈-45mV）。去极化条件脉冲通过失活移除此电流的抑制性影响，导致测试脉冲时放电增强。
- **predicts**:
  - depol conditioning + test: 25-45 spikes
  - hyperpol conditioning + depol test: 12-25 spikes
  - long step: 22-35 spikes
  - brief step: 4-10 spikes
- **conflicts**: none — 攻击未探索的轴

### H2: 慢 Na 通道失活改变兴奋性 (slow Na inactivation)
- **statement**: 未知效应来自慢 Na 通道失活动力学：静息时部分 Na 通道处于慢失活态，去极化条件脉冲改变慢失活平衡，影响测试脉冲时可用的 Na 通道数量。
- **predicts**:
  - depol conditioning + test: 22-40 spikes
  - hyperpol conditioning + depol test: 8-20 spikes
  - long step: 20-32 spikes
  - brief step: 5-12 spikes
- **conflicts**: none — 攻击未探索的轴

### H0 (boring opponent): 测量伪影/噪声
- **statement**: 观测到的放电模式完全由已知的基本 HH 型放电机制产生，无需额外电流。
- **predicts**:
  - 所有协议的 spike count 应与参考模型预测一致，差异 <15%
- **conflicts**: H1 和 H2 预测存在系统性偏离参考模型的效应

## 预算分配
| 阶段 | 预算 | 用途 |
|------|------|------|
| 训练观测 | 8 | 5 个协议 × reps 1-3 |
| 确证/攻击 | 0 | 依赖 free simulation |
| 预报 | 0 | world_forecast 免费 |

## 关键发现
1. depol cond + test = 40 spikes >> hyperpol cond + depol test = 19.33 spikes
2. long step = 26 spikes → 中等适应
3. brief step = 6.67 spikes → 基线兴奋性
4. IKs 候选最佳匹配训练数据
5. 两种候选均低估 depol cond + test（预测 36 vs 观测 40）
