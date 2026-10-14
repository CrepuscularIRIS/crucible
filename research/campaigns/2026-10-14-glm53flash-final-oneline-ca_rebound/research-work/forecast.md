# forecast.md — I9 预报（ca-rebound）

预测日期：2026-10-14 · 等价类：equiv{H0, H13, H1, H9, H11, H12}（RULINGS）
预测方法：等价类各成员在 nbsim 64-reps（seed=0）下仿真每个 held-out 协议段，
取 6 成员 counts_mean 的算术平均（无后验加权：P1 单格对六成员似然近似相等——
16.0 距各带中心 0.2–1.8，σ_total≈2.6–3.5）。记录：sim/*-ho25/30/35/40.json、
sim/{ref,ih,ihfast,dualih,hedge,noisysrc}-{p1,p2}.json。

| held-out 标签 | 类均值预测 | 成员预测（ref/noisysrc vs IH 族） |
|---|---|---|
| hyperpol -25 then release | 14.30 | ref 11.3 · ns 11.0 · ih 16.4 · ihfast 16.0 · dualih 16.2 · hedge 14.8 |
| hyperpol -35 then release | 14.57 | ref 10.9 · ns 11.3 · ih 16.6 · ihfast 16.4 · dualih 16.8 · hedge 15.4 |
| hyperpol -30 then release | 14.50 | ref 11.0 · ns 11.1 · ih 16.7 · ihfast 16.2 · dualih 16.8 · hedge 15.2 |
| hyperpol -40 then release | 14.59 | ref 10.9 · ns 11.3 · ih 16.8 · ihfast 16.3 · dualih 16.8 · hedge 15.4 |
| brief step (12 uA, 40 ms) | 7.38 | ref 6.7 · ns 6.8 · ih 7.8 · ihfast 7.7 · dualih 8.0 · hedge 7.3 |
| long step (10 uA, 300 ms) | 27.09 | ref 26.0 · ns 25.8 · ih 28.1 · ihfast 27.9 · dualih 28.5 · hedge 26.2 |

注：类内最大预测差在释放协议（5.5 尖峰）——若宿主评分按标签误差计，
等价类均值是 min-max 悲观选择；若真实机制属 IH 族，类均值偏保守 ~2。
