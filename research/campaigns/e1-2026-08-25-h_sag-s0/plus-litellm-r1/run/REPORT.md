# 战役报告: e1-h_sag-s0-plus-litellm-r1

## 结论

- H1: LIVE
- H2: REFUTED
- H3: REFUTED

## 证据

### 核心观测
- 超极化 conditioning 产生显著 sag(电压从最低点回弹,直接观测)
- 长 step spike count = 22,适应比 = 2.86 (P7)
- Hyperpol test / Depol test spike 比率 = 0.39 (P6)
- Hyperpol / Depol conditioning test ratio = 0.95 (P3)

### 探针结果
| 探针 | 问题 | 观测值 | 频段 | 作用 |
|------|------|--------|------|------|
| P3 | Hyperpol/Depol conditioning test ratio | 0.95 (P3) | I_h [0.8,1.2] 带内 | 支持 H1 |
| P6 | Hyperpol test / Depol test spike ratio | 0.39 (P6) | I_h [0.3,0.5] 带内 | 支持 H1, 杀死 H3 |
| P7 | Long step 适应比 | 2.86 (P7) | I_h [0.5,1.5] 带外 | H1 未通过, 杀死 H2/H3 |

### 校准账本
- 对于假设一(LIVE): P3 带内, P6 带内, P7 带外(预测无适应,观测强适应)
- 对于假设二(REFUTED): P3 带内, P6 带内, P7 带内
- 对于假设三(REFUTED): P3 带外, P6 带外, P7 带内

## 对抗检验
- **G1 (constraint on H1)**: H1 预测 hyperpol test spike 占比不低于 long step 的 80%, 实际低于该阈值。I_h 失活或存在其他抑制机制。
- **G2 (new_h vs H1)**: 可能是 I_h + slow K 组合。I_h 解释 sag, slow K 解释适应。单一 I_h 无法同时解释。
- **G3 (constraint on H1, 终态迁移后)**: H2 已被 P7 REFUTED, 但 P7 的 H1 频段被观测值带外拒绝。攻击债未清: G2 提出的混合机制是更强的替代解释。

## 预报评分
Held-out 协议预报已完成(world_forecast 提交)。

## 收窄与失败边界
- 本战役仅在 h_sag seed 0 上检验; 跨种子/跨世界的泛化未检验
- H1 的 sag 解释力强, 但适应机制未解决; "I_h 单独承载全部现象" 是 scope 声明, 非结论
- G2 提出的 I_h + slow K 组合假设未正式登记检验, 是下一步工作

> 本报告未对样本量/随机种子设置独立下限; 频段结论以预登记规约为准, 未达下限的情形应视为 CONTESTED 而非支持/否证。

## Graveyard
- H2 (I_T): REFUTED by P7。预测无 burst + 无适应, 观测到无 burst + 强适应 2.86 (P7)。
- H3 (M-current): REFUTED by P6/P7。预测无 sag + 无适应, 观测到 sag + 强适应 2.86 (P7)。

## 裁决汇总
Ruling: 战役等级=遭遇战 — 预算 8、单一未知膜电流机制发现,预期 ≤3 探针 — 押错代价:中途发现复杂度升级会战,gate 不缩水
Ruling: 首批观测协议 = long step / hyperpol conditioning + depol test / strong step — 三者分别暴露慢动力学、超极化激活/去失活、强去极化非线性;覆盖主要候选机制(I_h、I_T、persistent Na、M-current)的判别维度 — 押错代价:遗漏某候选特征,后续补观测消耗预算
