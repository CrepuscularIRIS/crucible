# REPORT — ca_rebound 放电机制辨识（run: ca-rebound）

mode: identify · depth: light · recall: off · seed: 0 · 谓词：LIVE 收缩到 1 个或写明等价类 + world_forecast 已提交（两者均已满足）

## 结论（headline）

**ca_rebound 神经元的"rebound 放电"不需要任何附加膜电流来解释。** 六格计量观测（P1 14 (P1)、P2 11 (P2)、P3 16 (P3)、P4 17 (P4)、P5 29 (P5)、P7 16 (P7)）与 held-out 预报全部与参考 HH 模型（identity）的仿真分布一致；12 条候选附加电流机制（11 族 + slow_na 伪影变体）逐一带外。幸存等价类 **equiv{H0, H7}**：

- **H0（null，组合证据偏向）**：真实系统 = 参考 HH 模型本身，观测偏离在通道噪声带内；
- **H7（slow_na 伪影）**：基线 Nav 的慢失活动力学（schema 硬编码点假设）——两者在剩余预算可用的未观测格上最大可分性不足 1σ（brief-hyper+TEA 仿真对比，出处 research-work/ca-rebound/sim/matrix.csv）——不可判别（RULING equiv{H0, H7}）。

检出限写法：在 6 格 × 1 rep 精度下未检出任何 ≥1σ 的附加电流效应；所有排除均为参数点级（CONTESTED + lead，self-reviewed 审计封顶），**不能宣称"不存在此类通道"**，只能宣称"在本战役的读数精度与候选空间内无证据支持"。

## 支撑证据链（探针 → 迁移）

| 探针 | 格子 | obs (P#) | 正式点名排除（迁移在案） |
|---|---|---|---|
| P1 | weak step, none | 14 (P1) | （带外：H3/H4/H8/H9——分支语义错误未执行，见 RULINGS） |
| P2 | weak step, Cd | 11 (P2) | H4 (KA), H5 (NaP), H8 (Kir) → CONTESTED lead |
| P3 | depol cond, TEA | 16 (P3) | （结构债：E≥100 簇分支被移出 bands，见 RULINGS） |
| P4 | hyper cond, TEA | 17 (P4) | H1 (Ih), H11 (Hvr) → CONTESTED |
| P5 | weak step, TEA | 29 (P5) | H2 (CaT) → CONTESTED |
| P7 | paired, TEA | 16 (P7) | H6 (CaL), H10 (CaTr), H12 (CaS) → CONTESTED |

- 全部终态为 CONTESTED + lead（family 级 REFUTED 请求 K3 审计；两次 W2 超时后代写 self-reviewed → 按表封顶）。lead claim 仍是活对手，报告按 lead 语气使用。
- P1→P2 的读数差（14→11，-3）曾组合暗示"钙型载体"，但 P7 的 16 (P7)（E≥100 归零带外）反向排除了全部钙型候选——单格弱证据（两个落地读数之差仅约一个半标准差，属弱证据）的教训见 lessons.md。

## 对抗攻击处置（W3，终态迁移后）

W3 reviewer 产出 10 条攻击，全部逐条落账（G1–G5，journal 在案）：
- 2 条 noise 攻击（P5 仿真带宽反常窄/双峰失配）被换 seed 256-reps 复核驳回（CaT weak+TEA 均值在个位数以下、重尾但主体归零（seed 复核，256 reps，记录在案）；H2 的 P5 排除稳健）；
- 4 条 constraint 进报告 scope（参数点级排除/小 g 缩放/多重比较无 FDR/慢 Ih 变体/TTX-XE991 轴未计量）；
- 1 条 no_change（约束计数批评与已写 scope 一致）。
H2 的复活攻击（P5 窄带依赖）由上述 seed 复核数据驳回。

## 等价类出口（I8）

- 剩余未观测格上 H0 vs H7 最大可分性不足 1σ（brief-hyper+TEA 仿真对比），held-out 上最大可分性不足半个标准差。
- P7 已观测读数组合偏向 H0：obs 16 (P7) 落 H0 预测带 [9.87,26.09] 内、落 H7 预测带 [21.38,50.62] 外（H7 带来自 P7 预登记 sims，ex-ante 冻结）。
- 押错代价：若存在效应 <1σ 的弱附加电流，会被归入 null——此为检出限，非存在性证明。

## held-out 预报（world_forecast 已提交）

幸存等价类 equiv{H0, H7} 两成员在全部 held-out 标签上的预报读数差均不足半个标准差（sim:self-fc-*.json，64 reps，seed=0）。
预报以 H0（null）身份提交：hyperpol 系列四标签读数彼此几乎相同（约 11 个尖峰），brief step 约 7 个，long step 约 26 个——
逐值与出处见 research-work/ca-rebound/forecast.md（journal 的 forecast 事件为官方版本）。

## 预算与花销

世界计量预算 8，实花 6（P1/P2/P3/P4/P5/P7 各 1 次计量观测，见上表 (P#)）。剩 2：保留 1 给确证、1 未用——等价类出口后不存在 >1σ 判别格（全部不足 1σ），无账可花（01 K2-1 记账）。

## 未覆盖协议（W3 攻击 G3 采纳）与 scope 声明

- **TTX 轴零计量格**：所有钠依赖机制在本战役读数上不可见（六格全在钠完好基线上）；
- **XE991 零计量格**：小 g M 型电流在 TEA 存在格上被结构性吸收，不可见；
- **单 rep + 无 FDR**：约 72 次带内外判定无多重比较控制（P(≥1 假带外)≈59%）；单次观测的测量噪声未计入带宽；
- **参数点级排除**：小 g 缩放后任意族的六格效应趋零，必然存在带内参数点——本战役只排除"六格分辨率下可检测"的机制；
- **慢 Ih/慢 Ca 变体**：只受 P4/P7 最宽的两格约束，区分力未量化；
- **多通道组合**：未单列成族（可辨识性继承单通道指纹）。

## RULINGS 摘要（全部见 RULINGS.md）

1. intake：identify/light/seed=0/预算 8（用户确认）。
2. 矩阵 child 超时 → 父会话按冻结 SPEC 补完；K1 三新族矩阵由父会话补扫 180 格。
3. P1 kill 分支 target 语义写反 → 未执行错误迁移，正式排除移交 P2。
4. 一次性多 claim 探针因 predicts 方向校验被拦 → 改自适应漏斗。
5. 家族级 REFUTED self-reviewed 封顶 lead；H6/H10/H12 因分支未点名被拒 → P7 清偿。
6. equiv{H0, H7}（本条）。
7. W3 十条攻击处置（驳回 2/落账 8，含 1 no_change）。

## 框定行

本报告回答："在参考 HH 模型 + 至多一条附加电流、12 个预登记候选族、6 格单 rep 计量精度"框架内，ca_rebound 的放电是否需要附加机制——答案是不需要（等价类 equiv{H0, H7}）。它不回答：多通道组合、>1σ 效应、TTX/XE991 消融格上的机制、或本候选空间之外的机制。

---

## 附录：value 判据映射（identify 谓词逐项）

1. "LIVE 收缩到 1 个或一个写明的等价类" → equiv{H0, H7}（RULING 在案，锚渲染）✓
2. "world_forecast 已提交" → journal 有 forecast 事件（journal forecast 事件在案）✓
