# REPORT — e1-d_type-s0-plus-litellm-r2

## 结论

- H1: LIVE
- H3: REFUTED
- H4: LIVE

**One-sentence summary**: Hyperpolarization-prepulse test killed Ih-like hypothesis (H3), but could not discriminate H1 from H4 due to overlapping frequency bands.

## 证据

关键落地探针 P3 度量值 = 15 (P3)。超极化预处理 (-30 uA/250 ms) 后接去极化测试 (+12 uA) 产生 spike count = 15 (P3)。

H3 被杀死：观测值 15 (P3) 远低于 H3 预测的 [28, 40] 频段，落入带外。
H1/H4 存活：观测值 15 (P3) 落在 H1 [12, 18] 和 H4 [10, 16] 的频段内。

辅助观测（非探针度量，仅描述模式）：brief step 产生少量 spike，long step 产生中等 spike，去极化条件测试产生大量 spike。

## 校准账本

P2 x H1: 预测 [12, 18], 观测 15 (P2), 带内
P2 x H3: 预测 [28, 40], 观测 15 (P2), 带外
P2 x H4: 预测 [10, 16], 观测 15 (P2), 带内
P3 x H1: 预测 [12, 18], 观测 15 (P3), 带内
P3 x H3: 预测 [28, 40], 观测 15 (P3), 带外
P3 x H4: 预测 [10, 16], 观测 15 (P3), 带内

## Held-out 预报

world_forecast 提交了对 held-out 协议的 spike count 预报。

## 存活假设与未检验状态

H1 和 H4 均处于 LIVE 状态，未被迁移至 SUPPORTED。原因：
1. P2/P3 的频段重叠未能提供判别力，观测值 15 同时兼容两者
2. 去极化条件测试揭示的条件易化机制超出 H1/H4 的声明范围
3. 对抗审查指出多个替代解释与观测一致

**我们还不知道**：额外电流究竟是 H1（低阈值快动力学）还是 H4（持续慢失活），或更可能是某种钙依赖机制或钾电流去招募的综合效应。

> 本报告未对样本量/随机种子设置独立下限；频段结论以预登记规约为准，未达下限的情形应视为 CONTESTED 而非支持/否证。

## 收窄与失败边界

- 本战役只在 seed=0 的 d_type 世界上检验了 H1-H4 的 spike count 响应。跨不同种子/世界成立未检验，是 scope 声明而非结论。
- H4 的 sodium-like 标签无药理学证据支持 (G5)，属于 scope 声明。
- H1 的快速动力学 (mtau 5-20 ms) 未被任何探针直接测量，属于 scope 声明。

## Graveyard

- H3 REFUTED (P3)：Ih-like 电流假设被杀死。死因：超极化预处理后 spike count 降至 15 (P3)，远低于 H3 预测的反弹兴奋 [28, 40]。

## 对抗记录

8 条攻击落账 (G1-G8)：
- G1 (constraint, H1)：去极化条件测试超出 H1 解释范围
- G2 (constraint, H1)：条件易化需额外机制
- G3 (new_h, H1)：I_A derecruitment 替代解释
- G4 (constraint, H1)：P3 观测值落在 H1/H4 重叠区
- G5 (constraint, H4)：sodium-like 标签无药理学证据
- G6 (constraint, H4)：persistent vs slow-inactivating 定义不清
- G7 (constraint, H4)：minimal effect in brief steps 与 P3 观测矛盾
- G8 (new_h, H4)：I_CAN 替代解释

## 裁决汇总

Ruling: 战役等级=遭遇战 — 单一未知电流机制发现任务，预期探针数≤5，复杂度可控 — 押错代价：若中途发现多电流耦合则升级会战

Ruling: 预算分配策略 — 8 reps 分配给 2-3 个关键判别实验，优先覆盖训练协议中的条件-测试范式 — 押错代价：若关键判别协议未覆盖则需重新设计实验

Ruling: 阶段转移 ABDUCE → PROBE — 3 个 LIVE 假设已登记(H1/H3/H4),存在可判别差异(激活电压、动力学、恢复特性),需要设计探针区分 — 押错代价:若探针设计不当则无法区分假设
