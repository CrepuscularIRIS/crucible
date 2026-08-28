# REPORT.md — demo2r-ca-r1

## 战役状态
Run: demo2r-ca-r1
世界: ca_rebound(seed 0)
等级: 遭遇战

## 一句话结论
H1（慢失活 K+ 电流）被 SUPPORTED（P16），H0（测量伪影）被 REFUTED（P12），H2（慢 Na 失活）被 CONTESTED（P16）。

## 证据

### 落地探针
| 探针 | 指标 | 出处 | 效果 |
|------|------|------|------|
| P9 (long step) | 26 | metric_recompute(P9) | 确认基线兴奋性 |
| P12 (depol cond+test) | 40 | metric_recompute(P12) | REFUTED H0（观测 40 超出 H0 kill 区间 [0,25]） |
| P14 (hyperpol cond+test) | 19.33 (P14) | metric_recompute(P14) | 支持 H1（观测在 H1 support 区间 [16,30]） |
| P16 (depol cond+test) | 40 | metric_recompute(P16) | SUPPORTED H1（观测在 H1 support 区间 [35,60]） |

### 关键数字
- depol cond + test: 40 spikes (P12, P16) — 所有候选均低估
- hyperpol cond + depol test: 19.33 (P14) spikes — H1 定性解释
- long step: 26 spikes (P9) — 基线匹配

## 校准账本
- P9: H0 带外（预测 [0,5]，观测 26），H1/H2 带内
- P12: H0 带外（预测 [0,25]，观测 40），H1 带内（预测 [35,60]，观测 40）
- P14: H1 带内（预测 [16,30]，观测 19.33 (P14)），H2 带外（预测 [5,14]，观测 19.33 (P14)）
- P16: H1 带内（预测 [35,60]，观测 40），H2 带外（预测 [22,34]，观测 40）

## 存活假设状态
- H1 (SUPPORTED by P16): 慢失活 K+ 电流 — depol conditioning 通过失活移除 K+ 抑制导致增强
- H0 (REFUTED by P12): 测量伪影 — 参考模型无法解释 conditioning 增强
- H2 (CONTESTED by P16): 慢 Na 失活 — 预测方向可能错误

本报告未对样本量/随机种子设置独立下限

## 收窄与失败边界
- 本战役只在 ca_rebound(seed 0) 上检验
- H1 的 IKs 参数为手动选择近似值
- depol cond 增强效应可能被低估（所有候选预测 < 观测）

## Graveyard 摘要
- H0 REFUTED (P12): 参考模型无法解释 depol cond 增强（观测 40 超出预测 [0,25]）
- H1 SUPPORTED (P16): 慢 K+ 电流定性解释 conditioning 模式
- H2 CONTESTED (P16): 预测方向可能错误（P14/P16 带外）

## 对抗记录
- G1 constraint H0: 偏差超过自身阈值
- G2 constraint H0: 偏差模式系统性
- G3 new_h H2: 方向错误（未消化，留作收窄声明）
- G4 constraint H1: 低估 depol cond
- G5 new_h H1: ICAN 提供同等解释（未消化，留作收窄声明）

## 裁决汇总
本轮无正式 RULINGS.md 条目

## 遗留与债务（Epistemic Debts）

### 未清偿遗留
1. **攻击债 2 条未消化**: G3 (new_h H2) 和 G5 (new_h H1) 未登记为新假设。G3 指出 H2 方向错误，G5 提出 ICAN 同等解释。
2. **H2 CONTESTED 未终态**: H2 标记为 CONTESTED 而非 REFUTED，因观测值 40 不在其预登记分支频段内。需进一步探针或分诊。
3. **探针沙箱早期故障**: P1-P8 均失败（沙箱权限问题），P9 起恢复。
4. **预算超支**: 实际支出 11（预算 8）。
5. **depol cond 机制未完全确定**: H1 定性解释，但所有候选定量低估 depol cond 响应（预测 36-37 vs 观测 40），暗示可能遗漏慢内向电流成分（ICAN 或 INaP）。
6. **H1 频段过宽**: 预测区间 [35,60] 判别力有限。

### 第二轮建议起点
- 消化攻击债：登记 ICAN 为新假设或明确驳回
- 收紧 H1 预测区间
- 设计判别 H1 vs ICAN 的探针
- 严格控制预算
