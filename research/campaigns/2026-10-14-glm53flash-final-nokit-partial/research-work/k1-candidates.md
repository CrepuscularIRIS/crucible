# K1-abduce 产出: ca_rebound 机制候选空间
> **环境缺陷注明**: (1) `research_kit` 不可用（RULINGS-001 已裁定 fallback）；(2) 本子代理 kernel 对
> session 目录（.proma-dev/sdk-config/session-artifacts/...）写入被隔离护栏拒绝，故按宿主指引把
> out.md 写到 research-work/ca_rebound/k1-out.md，候选清单副本写 k1-candidates.md。
> 证据契约未变：不触碰真细胞观测、全部最终证据 seed=0/reps=64、sim JSON 在 sim/ 下。

## SUMMARY
以 nbsim（reps=64, seed=0 全部最终证据）建立 H0 基线并生成 5 个家族级机制候选：C1_CaT（低阈 Ca，Cd 敏感，rebound 放大器）、C2_Ih（超极化激活阳离子，HCN 样）、C3_M（Kv7 样慢 K，XE991 敏感）、C4_SNa（Na 慢失活，药物不敏感）、C5_KA（A 型 K，rebound 抑制对照族）。关键世界事实：干净 HH 基线自带 ~10.9–11.3 spikes 的 anode-break rebound，对超极化深度 -25→-40 平坦——候选必须以"深度依赖形状 + 药物敏感性签名"区分，而非以"有无 rebound"区分。经三轮参数修订（rev1/rev2 的作废 sim 已删除，现存 213 个，编号不连续），15 对候选（含 H0）全部存在 (协议, blocker) cell 使 |Δmean|/σ_max ≥ 1.02。最小判别 cell 集仅需 4 次观测（预算 8 内）：A) -40 release+XE991；B) paired long pulses+XE991；C) depol cond+test 无药；D) -40 release+Cd。建议 4 cell + 重复 A/D 共 6 次，留 2 次机动。

## 方法与可复现性
- 载入: `sys.path.insert(0,'/root/research-work/ca_rebound'); import nbsim`；协议取自 nbsim.protocols.POOL（9 池）与 task.json held_out（4 release + 2 step 重叠）。
- 计数: test 窗口内 V 上穿 0 mV（features.spike_count）。release 协议 test_start=0（build_I 的 20 ms 前导之后全窗计数），150 ms release 尾段的反弹放电全部计入。
- 随机 kernel（stochastic.run_particles）: DT=0.025, n_channels=100, 门控通道级 Langevin 噪声, V∈[-95,60]。
- 固定 seed: 全部最终证据 seed=0, reps=64；早期调参扫描（seed=7, reps=16）与确定性扫描不作为证据。确定性核对：同 mech/协议/blocker/seed 两次运行 counts 逐粒相等（通过）。
- 接口 sanity: 所有候选 +TTX 在 -40 release 上 counts=0（6/6），确认 spike 全走基础 gNa；Cd 删 E>=100、XE991 删 name=='M'（blockers.py 核对）。
- 证据文件: /root/research-work/ca_rebound/sim/sim-0001.json 起；参数档案 k1-candidate-params.json；机器可读判别汇总 k1-discrimination.json（唯一权威索引）。

## H0 基线（无药，seed=0, reps=64）
| 协议 | mean | sd | sim |
|---|---|---|---|
| brief step (12 uA, 40 ms) | 6.69 | 1.37 | sim-0001 |
| long step (10 uA, 300 ms) | 25.95 | 1.90 | sim-0002 |
| strong step (18 uA, 120 ms) | 14.00 | 1.70 | sim-0003 |
| weak step (5 uA, 120 ms) | 10.86 | 1.72 | sim-0004 |
| hyperpol conditioning + depol test | 15.42 | 1.74 | sim-0005 |
| hyperpol pre-pulse + weak test | 7.16 | 1.25 | sim-0006 |
| paired long pulses | 27.39 | 2.59 | sim-0007 |
| depolarising conditioning + test | 36.36 | 2.40 | sim-0008 |
| brief hyperpol conditioning + test | 15.69 | 1.81 | sim-0009 |
| hyperpol -25 then release | 11.33 | 1.82 | sim-0010 |
| hyperpol -35 then release | 10.92 | 1.77 | sim-0011 |
| hyperpol -30 then release | 10.98 | 1.81 | sim-0012 |
| hyperpol -40 then release | 10.92 | 1.77 | sim-0013 |
**关键基线事实**: (1) anode-break rebound 是 H0 自带的（~11 spikes/150ms release）；(2) rebound 对深度 -25→-40 平坦；(3) H0 无慢过程记忆，协议间近似独立。

## 候选清单（家族级；参数为家族代表点，非真值断言）

### C1_CaT — 低阈值钙型 rebound 放大器（Cd 敏感）
- **statement**: 附加电流是低阈激活、慢失活的内向 Ca 型电流：超极化期间去失活（h 门 V<-65 开）、复极时瞬态激活（m 半激活 -38 mV），以额外内向电流放大 release 后放电。
- **参数 (Chan)**: name='CaT', g=0.7, E=120, mvh=-38, mk=6, mtau=6, mpow=1, hvh=-65, hk=6, htau=130, hpow=1; slow_na=False.
- **predicts**:
  1. release 协议全面放大且深度平坦（-25/-30/-35/-40: 13.4/13.7/13.9/13.9, H0≈10.9-11.3）；sim-0238/0240/0239/0241。
  2. 同 cell +Cd：精确回到 H0（10.92，与 H0 同 rng 流一致）；sim-0259/0260。
  3. +XE991 放大保留（13.94）；sim-0266。
  4. 去极化协议小幅增益（depol cond 38.8 vs H0 36.4）；sim-0236。

### C2_Ih — 超极化激活阳离子型（HCN 样，Cd 不敏感）
- **statement**: 附加电流在超极化时缓慢激活（m 半激活 -88 mV, tau≈180 ms）、E≈-35 内向阳离子电流，持续去极化张力抬高 release 后兴奋性；对 Cd 不敏感。
- **参数**: name='Ih', g=0.16, E=-35, mvh=-88, mk=7, mtau=180, mpow=1, hvh=-60, hk=8, htau=150, hpow=1.
- **predicts**:
  1. -40 release: 13.8（H0+2.9）；sim-0256。
  2. **+Cd 不变**（13.77，与无药同）；sim-0261 ←→ 与 C1 的最终裁决 cell。
  3. +XE991 不变（13.77）；sim-0267。
  4. 全协议轻度增益（weak 12.3, long 27.5）；sim-0247/0258。

### C3_M — Kv7 样慢钾（XE991 敏感）
- **statement**: 附加电流是慢激活（tau≈80 ms）、阈下即开（半激活 -35 mV）、E≈-90 的外向 K 电流：稳定去极化张力既压放电也压 rebound；被 XE991 整体删除。
- **参数**: name='M', g=0.55, E=-90, mvh=-35, mk=6, mtau=80, mpow=1, hvh=None（无失活）.
- **predicts**:
  1. rebound 低于 H0（-40 release 9.9 vs 10.9；-30 release 9.8）；sim-0172/0171。
  2. **+XE991 精确回 H0**（-40 release 10.92；paired 27.39）；sim-0268/0298。
  3. 去极化协议显著受压（depol cond 33.5 vs 36.4, d=1.16 @+Cd cell sim-0310/0307；long 24.3）。
  4. +Cd 轻度低于 H0（9.92，串扰效应非判别轴）；sim-0262。

### C4_SNa — Na 慢失活/恢复（药物不敏感）
- **statement**: 无附加通道；基础 Na 携带慢失活门 s(V)（超极化 s→1 恢复 tau 1500ms、去极化 s→0 tau 380ms）：长时程去极化累积钝化，超极化条件化恢复；Cd/XE991 完全无效。
- **参数**: extra=[], slow_na=True.
- **predicts**:
  1. 短协议≈H0（brief 6.8 vs 6.7; -40 release 11.0）；sim-0074/0073。
  2. 长/强去极化受压（depol cond 34.7；paired 24.8 vs 27.4）；sim-0068/0067。
  3. **Cd/XE991 均不改变其压制**（paired+XE991 24.75；depol cond 无药=+Cd≈+XE991≈34.7）；sim-0299/0068 ←→ 与 C3 的分离轴（XE991 救回 C3 但救不回 C4）。

### C5_KA — A 型钾（rebound 抑制对照族）
- **statement**: 附加电流是快激活/快失活 A 型外向 K：超极化解除失活，release 时瞬态外向电流压制 first-spike 群，反弹净减少（与 C1/C2 符号相反）。
- **参数**: name='KA', g=0.8, E=-77, mvh=-50, mk=8, mtau=3, mpow=1, hvh=-60, hk=8, htau=80, hpow=1.
- **predicts**:
  1. release 全面压制（-25/-30/-35/-40: 8.8/8.9/8.7/8.7）；sim-0085/0087/0086/0088。
  2. weak step 轻度低（9.4 vs 10.9）；sim-0079。
  3. 去极化协议轻度低（34.6）；sim-0083。
  4. Cd/XE991 不敏感（-40 release+XE991 8.73）；sim-0270/0264。

### H0 — clean baseline（reference model）
- **statement**: 经典 HH，无附加电流；rebound 纯为 anode-break（h 门超极化恢复），深度平坦。
- **判别锚点**: +Cd/+XE991 均精确不变（10.92 @-40 release）；sim-0265/0259。

## 无药 13 协议 × 6 模型总表（mean；每模型 sim id 尾号）
| 协议 | H0 | C1 | C2 | C3 | C4 | C5 |
|---|---|---|---|---|---|---|
| brief step | 6.7[0014] | 7.1[0242] | 7.1[0257] | 6.1[0173] | 6.8[0074] | 5.9[0089] |
| long step | 26.0[0015] | 27.4[0243] | 27.5[0258] | 24.3[0174] | 25.0[0075] | 24.0[0090] |
| strong step | 14.0[0003] | 15.0[0231] | 15.1[0246] | 13.2[0162] | 13.9[0063] | 12.9[0078] |
| weak step | 10.9[0004] | 12.0[0232] | 12.3[0247] | 10.1[0163] | 11.2[0064] | 9.4[0079] |
| hyperpol cond + depol test | 15.4[0005] | 17.4[0233] | 16.6[0248] | 14.2[0164] | 14.9[0065] | 13.8[0080] |
| hyperpol pre-pulse + weak test | 7.2[0006] | 8.7[0234] | 8.9[0249] | 6.7[0165] | 7.1[0066] | 6.8[0081] |
| paired long pulses | 27.4[0007] | 29.0[0235] | 29.1[0250] | 25.3[0166] | 24.8[0067] | 25.7[0082] |
| depol cond + test | 36.4[0008] | 38.8[0236] | 38.0[0251] | 33.5[0167] | 34.7[0068] | 34.6[0083] |
| brief hyperpol cond + test | 15.7[0009] | 16.6[0237] | 16.8[0252] | 14.5[0168] | 15.3[0069] | 14.0[0084] |
| hyperpol -25 release | 11.3[0010] | 13.4[0238] | 13.7[0253] | 10.0[0169] | 10.9[0070] | 8.8[0085] |
| hyperpol -30 release | 11.0[0012] | 13.7[0240] | 13.6[0255] | 9.8[0171] | 10.8[0072] | 8.9[0087] |
| hyperpol -35 release | 10.9[0011] | 13.9[0239] | 13.7[0254] | 9.9[0170] | 11.0[0071] | 8.7[0086] |
| hyperpol -40 release | 10.9[0013] | 13.9[0241] | 13.8[0256] | 9.9[0172] | 11.0[0073] | 8.7[0088] |
（id 尾号为 sim-XXXX 的后四位。）

## 判别矩阵（每对最优 cell；d = |Δmean|/max(σ)）
| 对 | 最优协议 | blocker | d | mean vs | sims |
|---|---|---|---|---|---|
| H0 vs C1 | -40 release | XE991 | 1.36 | 10.92 vs 13.94 | sim-0265/0266 |
| H0 vs C2 | -40 release | XE991 | 1.61 | 10.92 vs 13.77 | sim-0265/0267 |
| H0 vs C3 | depol cond + test | Cd | 1.16 | 36.36 vs 33.48 | sim-0307/0310 |
| H0 vs C4 | paired long pulses | XE991 | 1.02 | 27.39 vs 24.75 | sim-0295/0299 |
| H0 vs C5 | -25 release | none | 1.39 | 11.33 vs 8.80 | sim-0010/0085 |
| C1 vs C2 | -40 release | **Cd** | 1.61 | 10.92 vs 13.77 | sim-0260/0261 |
| C1 vs C3 | -30 release | none | 1.92 | 13.69 vs 9.77 | sim-0240/0171 |
| C1 vs C4 | paired long pulses | XE991 | 1.89 | 29.05 vs 24.75 | sim-0296/0299 |
| C1 vs C5 | -40 release | XE991 | 2.35 | 13.94 vs 8.73 | sim-0266/0270 |
| C2 vs C3 | -40 release | Cd | 2.11 | 13.77 vs 9.92 | sim-0261/0262 |
| C2 vs C4 | paired long pulses | XE991 | 1.94 | 29.14 vs 24.75 | sim-0297/0299 |
| C2 vs C5 | -35 release | none | 2.91 | 13.73 vs 8.73 | sim-0254/0086 |
| C3 vs C4 | paired long pulses | XE991 | 1.02 | 27.39 vs 24.75 | sim-0298/0299 |
| C3 vs C5 | -40 release | XE991 | 1.24 | 10.92 vs 8.73 | sim-0268/0270 |
| C4 vs C5 | -40 release | XE991 | 1.03 | 11.00 vs 8.73 | sim-0269/0270 |
**15/15 对可判别（min d=1.02）**。最薄三对 H0|C4、C3|C4、C4|C5（d≈1.0）建议重复观测压噪。

## 最小判别 cell 集（4 次观测；预算 8 内）
| # | (协议, blocker) | 分割作用 | 各候选预期 mean [p5,p95] | sims |
|---|---|---|---|---|
| A | -40 release, XE991 | {H0,C3,C4}≈11 vs {C1,C2}≈13.8-13.9 vs C5≈8.7：三分候选空间 | H0 10.9 [8,14]·C1 13.9 [10,18]·C2 13.8 [11,17]·C3 10.9 [8,14]·C4 11.0 [8,14]·C5 8.7 [6,11] | sim-0265..0270 |
| B | paired long pulses, XE991 | C4≈24.8 vs {H0,C3}≈27.4 vs {C1,C2}≈29.1：区分"药物不敏感压制"与"被救回"与"增强保留" | H0 27.4 [24,33]·C1 29.1 [26,33]·C2 29.1 [26,33]·C3 27.4 [24,33]·C4 24.8 [21,27]·C5 25.7 [23,29] | sim-0295..0300 |
| C | depol cond + test, 无药 | C3≈33.5/{C4,C5}≈34.6-34.7 vs H0 36.4 vs {C1,C2} 38.0-38.8 | H0 36.4 [33,41]·C1 38.8 [35,44]·C2 38.0 [34,44]·C3 33.5 [30,38]·C4 34.7 [31,40]·C5 34.6 [31,40] | sim-0008/0236/0251/0167/0068/0083 |
| D | -40 release, **Cd** | **C1 精确归回 H0（10.9）而 C2 保持 13.8**：Ca/Ih 二选一最终裁决 | H0 10.9 [8,14]·C1 10.9 [8,14]·C2 13.8 [11,17]·C3 9.9 [7,12]·C4 11.0 [8,14]·C5 8.7 [6,11] | sim-0259..0264 |
- **读法**: A 分 3 组 → B 在"≈11 组"内钉出 C4（<25.5）并确认 C3（≈27.4，因 XE991 救回）→ C 无药去极化复核 C3（33.5<H0 36.4）→ D 裁决 C1 vs C2。
- **预算分配建议**: 4 cell ×1（4 次）+ 重复 A、D 各 1 次（共 6 次），余 2 次机动（备选：weak+Cd 分开 C2/C5；depol cond+Xd 复核 C3）。
- 频段以 64-rep counts 分位数给出；真观测噪声 SIG_OBS=2.0 叠加在电压 trace 上，指标仍为 counts。

## 供终局 forecast 的 held-out 预测（无药）
| 协议 | H0 | C1 | C2 | C3 | C4 | C5 |
|---|---|---|---|---|---|---|
| hyperpol -25 then release | 11.3 | 13.4 | 13.7 | 10.0 | 10.9 | 8.8 |
| hyperpol -30 then release | 11.0 | 13.7 | 13.6 | 9.8 | 10.8 | 8.9 |
| hyperpol -35 then release | 10.9 | 13.9 | 13.7 | 9.9 | 11.0 | 8.7 |
| hyperpol -40 then release | 10.9 | 13.9 | 13.8 | 9.9 | 11.0 | 8.7 |
| brief step (12 uA, 40 ms) | 6.7 | 7.1 | 7.1 | 6.1 | 6.8 | 5.9 |
| long step (10 uA, 300 ms) | 26.0 | 27.4 | 27.5 | 24.3 | 25.0 | 24.0 |

## 边界与不确定性
- 候选为家族级代表点（recall=off：全部论据来自本世界仿真，无教科书引用）；REFUTED 应针对家族签名（Cd 敏感性、XE991 救回/不救回、深度依赖形状），不针对精确 g 值。
- d 以 64-rep σ 估出，d≈1 的 cell 单次探针重叠风险可观；关键 cell 建议重复或以频段预登记吸收。
- 家族代表点距"参数不可辨识流形"的裕度未系统扫描（C1 g∈[0.5,0.7] 行为相近；C2 g∈[0.10,0.16] 同）。
- C3|C4 轴依赖 XE991 特异性；若真细胞对 XE991 有非特异效应需 fallback cell（depol cond+Cd，d=1.16 H0|C3）。
- rev1/rev2 的作废 sim 已删除（48+57 个），现存 213 个、编号不连续；k1-discrimination.json 为唯一权威索引。
- 环境缺陷两处（research_kit 缺失、session 目录写入被拒）应写入 REPORT.md scope 段。

STATUS: ok PATH: research-work/ca_rebound/k1-out.md
