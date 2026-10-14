# REPORT — ca_rebound 神经元放电机制研究（run: ca_rebound, seed 0）

日期：2026-10-14（UTC）。预算账目：P0=1 + P2=4 + P3=1 + P4=1 = **7/8**（余 1 备用未动用）。

## 1. 研究问题
ca_rebound 神经元含一个"身份未知的附加膜电流"（电压依赖与动力学未知，非教科书命名通道）。问题：该电流的身份/家族是什么，它如何产生（或为什么不产生）可观测的放电表型？

## 2. 方法
1. **免费模拟表征**（world_simulate mode=candidate，cost 0，journal 在案）：参考模型（无附加电流，slow_na=false）+ 8 个机制家族变体 × 标准池 9 协议。发现 rlm 子代理被确定性门禁禁止调用 world_simulate（父会话是唯一研究状态写入者），全部模拟由父会话执行。
2. **假设集**（claim_propose，LIVE）：H1 低阈值持续内向窗电流（反跳阳性、深度单调）；H2 浅层失活亚型（-35 饱和）；H3 外向电流假象（慢激活钾、反相/适应）；H4 零假设（附加电流在可观测轴不可见）。
3. **预注册判别探针**（prereg_write，sha256 冻结）→ 真细胞计量观测（probe_run，扣预算）→ metric_recompute → claim_transition。报告中全部真细胞观测数字均取自 metric_recompute 返回值并标注 (P#)；全部模拟数字来自 world.simulate journal 条目。

## 3. 免费模拟判别网格（对照 REF 的净变化，seed 0，模拟值来源：journal world.simulate 条目）
| 机制家族 | hyper250+test (REF 15) | hyper40+test (REF 17) | depol+test (REF 36) | weak (REF 11) | 判别签名 |
|---|---|---|---|---|---|
| CaT（T型钙样，h慢失活） | +9 (24) | +10 (27) | +8 (44) | +4 (15) | 双侧均衡反跳 |
| CaT_shift（浅失活） | +10 (25) | +8 (25) | +5 (41) | — | 超极化偏好 |
| Ih / Ih_fast | +7 (22) | +2/+6 (19/23) | +7 (43) | +4 (15) | 中等双侧 |
| CAN_sub（阈下持续阳电流） | +4 (19) | +6 (23) | +12 (48) | +3 (14) | 去极化偏好（比值≈3） |
| K_sub（阈下慢钾） | **−7 (8)** | −7 (10) | — | — | 释放抑制、压基线 |
| KM（M型钾） | −4 (11) | — | **−7 (29)** | — | 去极化适应、压基线 |
| KCa_like | — | — | 0 (36) | — | 无签名 |
| slow_na（内建开关） | −1 (14) | −2 (15) | 0 (36) | — | 近无签名 |

参考基线（模拟值，journal 在案）：brief=8, long=28, strong=13, weak=11, hyper250+test=15, hyper40+test=17, paired=26, depol+test=36, hyper_gap+weak test=8。

## 4. 探针账本（全部预注册后才落地；频段互斥；"结果"列为 metric_recompute 返回值）
| pid | 预注册观测 | 冻结频段（H1/H2、H3、H4） | 结果 | 分支执行 |
|---|---|---|---|---|
| P0 | brief ×1（校准锚） | H4∈[6,10]、H3∈[0,5] | **7 (P0)** | 锚有效；H4 校准侧面证据 |
| P1 | 'hyperpol -40 then release' ×4 | — | **FAILED（未落地）** | meter 协议注册表 KeyError：held-out 释放深度标签不可解析（G1）；P1 未扣预算 |
| P2 | hyperpol cond + depol test ×4 | H1∈[20,28]、H4∈[14,19]、H3∈[0,13] | **16 (P2)** | H4 SUPPORTED（byProbe=P2）；H1 REFUTED（byProbe=P2）；H3 频段外待专探针 |
| P3 | depolarising cond + test ×1 | H3∈[0,31]、H4∈[32,40] | **40 (P3)** | H3 REFUTED（byProbe=P3，kill 分支）；H4 去极化轴再支持（终态不可自迁移，探针+重算在案） |
| P4 | hyperpol cond + depol test ×1（同轴复测，点名 H2） | H2∈[20,28]、H4∈[14,19] | **16 (P4)** | H2 REFUTED（byProbe=P4，kill 分支）；H4 第三次复现 |

与 P2 的 gate 拒绝（终态迁移要求预登记分支点名假设）记录在案：P4 即为此补设的同轴复测。metric_recompute 复核返回：metric=7 (P0)、metric=16 (P2)、metric=40 (P3)、metric=16 (P4)，全部与落地一致。

## 5. 信念终态
- **H4 SUPPORTED**（byProbe=P2；P0/P4 复现，P3 扩展范围）：真细胞在基线校准轴（brief=7 (P0)∈[6,10] 对模拟 REF 8）、超极化释放轴（n250=16 (P2) 与 16 (P4)∈[14,19] 对模拟 REF 15）、去极化适应轴（ndep=40 (P3)∈[32,40] 对模拟 REF 36）三轴全部与"无附加电流"参考一致。
- **H1 REFUTED**（P2）：无低阈值持续内向反跳（16 (P2) ≪ 20）。
- **H2 REFUTED**（P4）：浅层失活亚型同轴被杀（16 (P4) ≪ 20；模拟带 22–25）。
- **H3 REFUTED**（P3）：无外向适应签名（40 (P3) ≫ 31），且 P0 基线未压低（7 (P0) ∉ [0,5]）。
- Graveyard（死于模拟阶段的先验，记录在案）：K_sub 的"释放去抑制反跳"预测被模拟证伪（匹配 REF 后 −7，实为抑制）。

## 6. 对抗记录（attack_record）
- **G1（constraint, H1）**：held-out 释放深度标签（-25/-35/-40 then release）在 meter 不可达 → 深度单调性/饱和性轴永久悬置。
- **G2（no_change, H2）**：H2 判别轴随 G1 消失，CONTESTED 挂起后由 P4 同轴处置。
- **G3（new_h, H4）**：混合替代解释 H4'（错窗电流：激活/失活窗避开三次探针电压轨）→ H4 范围限定为"已测轴上不可见"，不等于"附加电流不存在"。
- **G4（constraint, H4）**：P3 仅 reps=1、参考锚为 seed=0 单一模拟，对弱残差判别力受限，模型形式误差未量化。
- **G5（constraint, H4，终态迁移后）**：三支持轴共享 spike_count 度量与 +12uA 测试窗读出；只改变阈下轨迹、不产生额外尖峰的附加电流对本度量系统不可见。H4 范围据此限定。

## 7. 结论与局限
在 meter 可达的全部判别轴上，ca_rebound 真细胞的放电行为与无附加电流参考模型不可区分（三轴独立支持 H4，零假设四次观测复现：7 (P0)、16 (P2)、16 (P4)、40 (P3)）。最可能的解释（按 G3/G5 谨慎表述）：附加电流的电导/电压窗落在已测协议的敏感区之外（候选：仅深超极化激活的极慢电流、仅强电流激活的电流、或条件化时长不匹配），或附加电流只影响阈下波形/尖峰时刻而不改变 spike_count 统计量。悬置轴：paired pulses、strong/weak 单独轴、hyper_gap、40ms 短条件化、held-out 释放深度剖面（G1）。局限：预算 7/8 限制 reps；频段按各探针预注册规格中冻结的噪声假设划定（sha256 在案），对弱效应判别力有限。
