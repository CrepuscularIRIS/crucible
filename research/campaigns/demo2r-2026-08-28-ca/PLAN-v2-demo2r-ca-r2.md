# PLAN-v2.md — demo2r-ca-r2 研究计划
**时间戳**: 2026-08-28T06:10Z (先于任何观测)
**战役等级**: 遭遇战 — 继承第一轮机制信念，重新校准

## 题面
- 世界: ca_rebound(seed 1)
- 第一轮终局: MSE=6.595, gate 全绿
- 继承信念: H1 慢 K⁺ 失活 (SUPPORTED), H2 慢 Na 失活 (CONTESTED), ICAN 嫌疑

## 债务清单 → 计划推导

### 债务 1: H2 CONTESTED 未终态
**处置**: 本轮通过 depol cond+test 探针明确 REFUTED（若观测 <25）或 SUPPORTED（若观测 25-40）

### 债务 2: depol cond 机制未完全确定（ICAN 嫌疑）
**处置**: 
- 登记 H3 (ICAN) 为新假设
- 设计判别探针: depol cond+test vs hyperpol cond+test 的 spike ratio
  - H1 (慢 K⁺): ratio ≈ 2.0-2.5 (depol 增强，hyperpol 抑制)
  - H3 (ICAN): ratio ≈ 2.5-3.5 (Ca²⁺ 积累导致更强增强)

### 债务 3: H1 频段过宽 [35,60]
**处置**: 收紧至 [36,44] 基于第一轮观测 (40 spikes)

### 债务 4: 预算超支 (11 vs 8)
**处置**: 本轮严格 ≤8，分配如下：
| 阶段 | 预算 | 用途 |
|------|------|------|
| 训练观测 | 6 | 6 协议 × 1 rep |
| 确证 | 2 | 预留 |

## 假设树

### H1 (继承): 慢失活 K⁺ 电流
- **statement**: 未知电流是去极化时缓慢失活的钾电流 (E≈-80mV, τ≈200-400ms)
- **predicts** (收紧后):
  - depol cond+test: 36-44 spikes
  - hyperpol cond+test: 16-24 spikes
  - ratio (depol/hyperpol): 1.8-2.5
- **conflicts**: H3 (ICAN) 预测更高 ratio

### H3 (新登记): 钙激活非特异性阳离子电流 (ICAN)
- **statement**: 未知电流是钙激活的非特异性阳离子电流 (E≈-20mV)，去极化时 Ca²⁺ 内流激活 ICAN，产生持续去极化驱动
- **predicts**:
  - depol cond+test: 38-50 spikes (Ca²⁺ 积累增强)
  - hyperpol cond+test: 12-18 spikes (Ca²⁺ 最小化)
  - ratio: 2.5-3.5
- **conflicts**: H1 预测更低 ratio

### H2 (继承): 慢 Na 失活
- **statement**: 慢 Na 通道失活动力学调制放电
- **predicts**:
  - depol cond+test: 22-34 spikes
  - hyperpol cond+test: 8-16 spikes
- **conflicts**: H1/H3 预测更高 depol cond 响应

## 探针设计

### P1: depol cond+test (判别 H1 vs H2)
- bands: H1 [36,44], H2 [22,34]
- branches: support H1 if [36,44], kill H2 if [22,34]

### P2: hyperpol cond+test (判别 H1 vs H3)
- bands: H1 [16,24], H3 [12,18]
- branches: support H1 if [16,24], kill H3 if [12,18]

### P3: long step (基线确认)
- bands: H1 [24,30], H3 [24,30]
- branches: support both if [24,30]

### P4: brief step (基线确认)
- bands: H1 [5,9], H3 [5,9]
- branches: support both if [5,9]

## 预算分配
| 协议 | reps | cost |
|------|------|------|
| depol cond+test | 1 | 1 |
| hyperpol cond+test | 1 | 1 |
| long step | 1 | 1 |
| brief step | 1 | 1 |
| hyperpol pre-pulse+weak test | 1 | 1 |
| depol cond+test (确证) | 1 | 1 |
| **总计** | | **6** |
