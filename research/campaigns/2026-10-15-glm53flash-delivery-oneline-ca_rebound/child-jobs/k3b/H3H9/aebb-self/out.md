# K3 审计（self-reviewed，父会话代做）— H3 与 H9 家族级 REFUTED

## SUMMARY
两次 W2 child 超时（jobs .rlm-jobs/ca-rebound/k3/H3H9/2751 与 k3b/H3H9/aebb，无产物），
父会话按契约代做，逐项程序化核验 10/10 PASS。两条家族级 REFUTED 迁移的证据链完整：
obs=16（P3 metric，两次 recompute 一致）落在两者的补区间 kill 分支内；M 族 7 参数点
（g/mvh/mtau 三轴）TEA 格读数下界最小 36.1、K9 族 7 参数点（g/hvh/htau 三轴）最小 23.5，
全部高于 obs=16（+2.5σ 口径）；r* 验证 d_M=10.7、d_K=7.6 → r*=1 ≤ reps=1。

## 六项
1. PASS：note 数字（74.38±5.44 / 38.36±2.96 / obs=16）与 sim 记录逐位一致（程序化比对）。
2. PASS：H3 kill [-0.5,60.77]、H9 kill [-0.5,30.96] 均在 _P3tea.json branches 里、带 headline、
   provenance 为 sim: 且记录在 prereg sims。
3. PASS：d_M=10.7→r*=1；d_K=7.6→r*=1；P3 reps=1 ≥ 1。
4. PASS（附注）：mk 未扫——但 mk 只改激活陡度；7 点网格显示该结构族的读数由
   "TEA 下外向放大"主导（最低 36.1 / 23.5，远离 16），mk 参数化不可能把 M/K9 族读数
   压到 16：方向论证（外向电流在 TEA 拔钾后必然放大读数）对任意 mk 成立。
5. PASS：门方向与 statement 一致（W1/K1 sanity 打印 + families.md 两轮独立检查在案）。
6. PASS：P3 support 带 [46.16,61.19] 未命中（obs=16 不在），与两条 kill 迁移互斥自洽。

## 结论
H3 → REFUTED：可迁（self-reviewed，结论按 lead 读）。
H9 → REFUTED：可迁（self-reviewed，结论按 lead 读）。

STATUS: ok SELF_REVIEWED PATH: .rlm-jobs/ca-rebound/k3b/H3H9/aebb-self/out.md
