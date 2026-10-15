# K3 审计（W2 第二轮，收窄版）— H3 与 H9 家族级 REFUTED

独立审计窗口；不调用任何 research_* / world_* 工具；不 spawn；只读下列文件、只写 out.md。

## 待核对事实（父会话已核对，你复核算术与语义）
- P3 预登记：/root/research-work/ca-rebound/_P3tea.json（bands、branches、sims、provenance）
- P3 落地 metric = 16（journal 两次一致）
- M 族代表点（TEA×depolarising, 64reps）：μ=74.38, σ=5.44（sim/cdfa-M-pool-08-TEA.json，在 prereg sims 里）
- K9 代表点：μ=38.36, σ=2.96（sim/cdfa-KslowInact-pool-08-TEA.json，在 prereg sims 里）
- M 族扫参 7 点（sim/self-grid-M-*.json）：g∈{1.2,2.4,0.6}→74.4/47.7/98.9；mvh∈{-30,-40,-20}→74.4/68.0/83.5；mtau∈{50,100,200}→74.1/74.4/78.2
- K9 扫参 7 点（sim/self-grid-K9-*.json）：g∈{4,8,2}→38.4/27.9/64.9；hvh∈{-40,-30,-50}→38.4/37.1/40.8；htau∈{600,300,1200}→38.4/40.2/37.4
- obs=16；kill 分支：H3 [-0.5,60.77]，H9 [-0.5,30.96]，均带 headline、出处 sim: 且记录在 prereg sims
- P3 reps=1

## 六项审计（逐项 pass/fail + 一句依据）
1. note 数字出处（μ/σ 与 sim 记录一致、obs=16 一致）；
2. kill 分支 band 出处与 headline（读 _P3tea.json 核对）；
3. r* 验证：d_M=|74.38-16|/5.44、d_K=|38.36-16|/2.96，r*=⌈(5/d)²⌉ 是否 ≤1；
4. 扫参充分性：mk 未扫（M 与 K9 都是）——判断是否致命（提示：mk 只改激活陡度，不改变"TEA 格外向放大→读数应大幅高于 16"的方向论证；参数化是否可能把读数压到 16？）；
5. 门方向与 statement 一致（M：高阈静息关；K9：去极化慢失活）——读 sim 记录里的 mechanism JSON 与 /root/research-work/ca-rebound/recall/families.md 对应段；
6. P3 support 带 [46.16,61.19]（给 H3，未命中——obs=16 不在）与本次 kill 迁移是否互斥自洽。

## 输出
/root/.rlm-jobs/ca-rebound/k3b/H3H9/aebb/out.md：SUMMARY（≤150词）→ 六项 → 结论（H3 可迁/不可迁；H9 可迁/不可迁）。
末行：`STATUS: ok PATH: .rlm-jobs/ca-rebound/k3b/H3H9/aebb/out.md`
最后一条消息首行逐字重复该行。
