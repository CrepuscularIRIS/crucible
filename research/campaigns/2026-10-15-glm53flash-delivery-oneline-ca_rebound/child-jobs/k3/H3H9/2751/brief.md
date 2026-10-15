# K3 迁移前审计（W2）— H3 与 H9 家族级 REFUTED

你是独立审计窗口（coder 角色：按冻结清单逐项核对，最小实现，不改研究结论）。本 brief 覆盖你继承到的一切路由；不调用任何 research_* / world_* 工具；不 spawn。

## 输入（只读，绝对路径）
- prereg：/root/research-work/ca-rebound/_P3tea.json（P3 的 bands/branches/sims/provenance）
- 落地：journal P3 metric=16（父会话转述：P3 LANDED metric=16，metric_recompute 两次一致返回 16）
- 审计对象 note 草稿（下文）
- 仿真记录：/root/research-work/ca-rebound/sim/ 下的 cdfa-*-pool-08-TEA.json、self-K1-Hvr-pool-07-TEA.json、self-grid-M-*.json（7 点）、self-grid-K9-*.json（7 点）

## 待审计的两条迁移 note
**H3（M 型慢钾）→ REFUTED**：
- P3 (depolarising cond + TEA, reps=1) obs=16 落在 H3 补区间 kill 分支 [-0.5,60.77]（低于 M 族预测带下界 60.78）。
- 依据：M 族 TEA 格代表点读数 74.38±5.44@64reps（sim:cdfa-M-pool-08-TEA）；家族级扫参：g∈{1.2,2.4,0.6}、mvh∈{-30,-40,-20}、mtau∈{50,100,200} 共 7 点（sim:self-grid-M-*.json），全部 TEA 格读数下界 ≥36.1，无一参数点能产生 obs=16。
- 门方向检查：m∞(-40)=0.08、m∞(-65)=0.00 → 高阈、静息基本关，与"高阈持续外向"陈述一致（families.md M 段）。

**H9（Kv 慢失活）→ REFUTED**：
- 同格 obs=16 落在 H9 补区间 kill 分支 [-0.5,30.96]（低于 K9 预测带下界 30.97）。
- 依据：K9 TEA 格代表点 38.36±2.96@64reps（sim:cdfa-KslowInact-pool-08-TEA）；扫参 g∈{2,4,8}、hvh∈{-30,-40,-50}、htau∈{300,600,1200} 共 7 点（sim:self-grid-K9-*.json），全部读数下界 ≥23.5。
- 门方向检查与 families.md KslowInact 段一致（h 去极化慢失活）。

## 只查这六项（逐项给出 pass/fail + 一句依据）
1. note 里每个数字都能在账本找到出处（sim 记录的 counts_mean/counts_sd，或 P3 metric=16）；
2. P3 prereg 的 kill 分支 target=H3 与 target=H9 的 band 出处标签是 sim:<记录> 且该记录在 prereg sims 里、有 headline；
3. 真细胞 reps（P3 observe.reps=1）≥ r*：请从 sim 记录算 d=|74.38-16|/5.44 与 d=|38.36-16|/2.96，验证 r*=⌈(5/d)²⌉ ≤ 1；
4. 家族级 REFUTED 扫参充分性：M 与 K9 各 7 个网格点是否覆盖 statement 声明的自由参数（M: g/mvh/mk/mtau——注意 mk 未扫，判断这是否致命：mk 只改激活陡度不改变"TEA 下外向放大"方向；给出你的判断）；K9: g/mvh/mk/mtau/hvh/hk/htau 同理；
5. 被迁移候选的 mechanism JSON 门方向与 statement 一致（读 families.md 或 sim 记录里存下的 mechanism）；
6. 对手集检查：support 分支（若有）与每个对手带不重叠——本审计对象是 kill 迁移，确认 P3 support 带 [46.16,61.19] 与 H3 自己的 kill 补区间 [-0.5,60.77] 的关系是否自洽（support 是给 H3 的，kill 也是给 H3 的——两者频段不相交、互斥即自洽）。

## 输出
/root/.rlm-jobs/ca-rebound/k3/H3H9/2751/out.md：第一节 SUMMARY（≤200 词，给出两条迁移各自 pass/fail 总评）→ 六项逐项 → 结论（每条：可迁/不可迁，不可迁给理由）。
末行逐字：`STATUS: <ok|blocked|failed> PATH: .rlm-jobs/ca-rebound/k3/H3H9/2751/out.md`
你的最后一条消息首行逐字重复这条 STATUS 行。
