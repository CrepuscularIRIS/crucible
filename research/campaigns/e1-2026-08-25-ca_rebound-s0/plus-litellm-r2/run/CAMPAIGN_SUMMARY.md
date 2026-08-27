# ca_rebound 战役总结

**Run ID**: e1-ca_rebound-s0-plus-litellm-r2  
**World**: ca_rebound (seed 0)  
**Date**: 2026-08-25  
**Campaign Level**: 遭遇战（Skirmish）

## 终局状态

| 指标 | 值 |
|------|-----|
| 预算使用 | 12 / 8 (超支 50%) |
| 落地探针 | 0 / 1 (P1 失败) |
| 假设状态 | H1(IT): LIVE, H2(Ih): LIVE |
| 预报 MSE | 15.04 |
| Gate 结果 | ❌ prereg, reconcile, trace 均未通过 |

## 程序性错误

本战役犯了关键程序错误：**观测发生在探针预登记之前**。

### 时间线
1. `research_init` ✓
2. `world_simulate(mode=info)` 获取题面 ✓
3. `world_observe` × 4 协议（花费 12，超出预算 8） ✗
4. `world_simulate(candidate)` 测试候选机制 ✓
5. `claim_propose` 提出 H1, H2 ✓
6. `prereg_write` P1 ✓（但已太晚）
7. `probe_run` P1 ✗（失败，exit code 2）
8. `world_forecast` ✓（MSE=15.04）
9. `report_declare` ✗（三道 gate 全部失败）

### 正确流程应该是
1. `research_init`
2. `world_simulate(mode=info)` 获取题面
3. `prereg_write` 预登记探针（**先于观测**）
4. `world_observe` 在预算内观测（**受探针引导**）
5. `probe_run` 落地探针
6. `claim_propose` 提出假设
7. `claim_transition` 终态迁移（需要 byProbe）
8. `attack_record` 对抗检验
9. `world_forecast` 终局预报
10. `report_declare` 声明报告

## 实质发现（非正式）

尽管程序错误导致无法正式声明，实质分析表明：

**H1 (IT, T-type calcium current) 是最佳拟合机制**
- 总绝对误差：4.6（vs H2 的 10.3）
- 在 long step 协议上表现最优（误差 2.0 vs 5.7）
- 机制参数：g=1.0, E=50, mvh=-65, τ=20ms

**H2 (Ih, hyperpolarization-activated cation) 拟合较差**
- 在 long step 上表现差（预测 31.67 vs 观测 26.0）
- 较慢的激活动力学（τ=50ms）无法匹配观测数据

**其他候选机制**
- INaP (persistent Na): 拟合更差（总误差 inf）
- IKCa (Ca-activated K): 数据不足无法评估

## 预报结果

| 协议 | 预测 spikes |
|------|-------------|
| hyperpol -25 then release | 5 |
| hyperpol -30 then release | 7 |
| hyperpol -35 then release | 9 |
| hyperpol -40 then release | 11 |
| brief step (12 uA, 40 ms) | 7 |
| long step (10 uA, 300 ms) | 26 |

MSE = 15.04，精度不足，可能原因：
- 超极化释放协议预测基于外推
- IT 参数未充分优化
- 可能存在复合机制

## 对抗检验

4 条攻击已记录：
- G1 (constraint, H1): IT 快速失活可能限制长时程反弹
- G2 (new_h, H1): INaP 可能是替代机制（但拟合更差）
- G3 (constraint, H2): Ih 慢激活在短时程协议上激活不足
- G4 (no_change, H2): Ih 在单个协议上拟合良好但整体较差

## 教训

1. **观测必须先预登记**：`prereg_write` 必须在 `world_observe` 之前
2. **预算纪律**：4 协议 × 3 reps = 12，超出预算 8，应在 2-3 协议内完成
3. **探针设计**：P1 的 evalCommand 格式不兼容 world_simulate，应使用正确的 JSON 格式
4. **终态迁移**：SUPPORTED/REFUTED 需要 `byProbe` 参数指向已落地探针

## 结论

本战役在实质上识别了 IT 机制作为 ca_rebound 世界反弹放电的最佳解释，但由于程序错误（观测先于预登记）和探针失败（P1 exit code 2），未能通过 formal gates，无法正式声明。假设停留在 LIVE 状态。

**战役状态**：未完成（Incomplete）
**建议**：新战役应从 prereg → observe 的正确流程开始
