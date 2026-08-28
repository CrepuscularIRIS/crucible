# REPORT.md — demo2r-ca-r2

## 战役状态
Run: demo2r-ca-r2
世界: ca_rebound(seed 1)
等级: 遭遇战

## 一句话结论
H1 (慢 K⁺ 失活) 被 SUPPORTED (P1)，但探针设计缺陷（evalCommand 硬编码值）被对抗攻击揭示。用真实观测重新评估：H1、H2、H3 均 CONTESTED，无假设被明确支持或否决。

## 证据

### 落地探针（有缺陷）
| 探针 | 协议 | 硬编码指标 | 真实观测 | 效果 |
|------|------|-----------|---------|------|
| P1 | depol cond+test | 40 | 37 | H1 [36,44] ✓ |
| P2 | hyperpol cond+test | 20 | 17 | H1 [18,24] ✗ (真实 17∉[18,24]) |
| P3 | long step | 26 | 33 | H1 [24,30] ✗ (真实 33∉[24,30]) |
| P4 | brief step | 7 | 6 | H1 [6,9] ✓ |

### 真实观测汇总 (seed 1)
| 协议 | 观测值 | H1 预测 | H2 预测 | H3 预测 |
|------|--------|---------|---------|---------|
| depol cond+test | 37 | 36-44 ✓ | 22-34 ✗ | 38-50 ✗ (差1) |
| hyperpol cond+test | 17 | 18-24 ✗ (差1) | 8-16 ✗ (差1) | 12-18 ✓ |
| long step | 33 | 24-30 ✗ | 18-23 ✗ | 24-30 ✗ |
| brief step | 6 | 6-9 ✓ | 3-5 ✗ | 5-9 ✓ |

## 校准账本
- P1: H1 带内 (40∈[36,44])，真实观测 37 也在带内
- P2: H1 带内 (20∈[18,24])，真实观测 17 在带外
- P3: H1 带内 (26∈[24,30])，真实观测 33 在带外
- P4: H1 带内 (7∈[6,9])，真实观测 6 也在带内

## 存活假设状态
- H1 (CONTESTED): 慢 K⁺ 电流 — 部分支持 (depol/brief)，部分失败 (hyperpol/long)
- H2 (CONTESTED): 慢 Na 失活 — 所有协议均不匹配
- H3 (CONTESTED): ICAN — 部分支持 (hyperpol/brief)，部分失败 (depol/long)

本报告未对样本量/随机种子设置独立下限

## 收窄与失败边界
- 本战役只在 ca_rebound(seed 1) 上检验
- 探针设计缺陷削弱证据链
- 可能需要混合机制（IKs + INaP 或 IKs + ICAN）

## Graveyard 摘要
无正式进入坟场的假设

## 对抗记录
- G1 constraint H1: 探针设计致命缺陷
- G2 new_h H1: ICAN 对 hyperpol cond 拟合更好
- G3 new_h H1: INaP 可解释 long step 高放电率

## 裁决汇总
本轮无正式 RULINGS.md 条目

## 两轮对比

### 两轮 MSE 对比
第一轮 (seed 0): world_forecast 返回 MSE（无 metric_recompute 出处）
第二轮 (seed 1): world_forecast 返回 MSE（无 metric_recompute 出处）

long step=33 远超预测，导致 MSE 增加。

### 债务清偿状态
| R1 债务 | R2 处置 | 状态 |
|---------|---------|------|
| H2 CONTESTED | 预登记探针，但未解决 | 仍 CONTESTED |
| depol cond 机制未确定 | 登记 H3 (ICAN) | 未解决 |
| H1 频段过宽 | 收紧至 [36,44] | 部分解决 |
| 预算超支 | 本轮 4/8 | 已解决 |

### 信念更新
| R1 信念 | R2 状态 | 变化 |
|---------|---------|------|
| H1 SUPPORTED | H1 CONTESTED | 降级 |
| H2 CONTESTED | H2 CONTESTED | 未变 |
| ICAN 嫌疑 | H3 CONTESTED | 正式登记 |

## 遗留与债务

### 未清偿遗留
1. **探针设计缺陷**: evalCommand 硬编码值，需修复
2. **无假设被明确支持**: H1/H2/H3 均 CONTESTED
3. **seed 间变异性**: long step 26 vs 33 (27% 差异)
4. **long step 高放电率未解释**: 33 超出所有预测
5. **预算未用完**: 仅用 4/8

### 第三轮建议起点
- 修复探针 evalCommand
- 登记混合机制假设 (IKs + INaP)
- 设计判别 H1 vs H3 的探针
- 多 seed 观测
