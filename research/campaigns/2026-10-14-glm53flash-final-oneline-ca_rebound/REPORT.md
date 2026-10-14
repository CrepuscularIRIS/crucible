# REPORT — ca_rebound 神经元放电机制辨识（run: ca-rebound · identify · light · seed=0）

## 1. 一句话结论

在预登记探针 P1（P5 协议 = hyperpol conditioning + depol test，r=4，prereg sha 18556d80…）的判别下，13 条机制候选中被计量观测 16.0 (P1) 落带外杀死/封顶 7 条（全部强促进族、两个负向族、Cd 污染对手），幸存 6 条收缩为等价类 equiv{H0, H13, H1, H9, H11, H12}（RULING），终局预报已提交：**spike_forecast_mse = 3.334212500000001 (F)**。

**框定行**：本结论关于 ca_rebound 真实细胞在 world=ca_rebound · seed=0 计量实现、spike_count 读数语义下的表现；不外推到其他 seed 或读数（如波形、早期密度）。

## 2. 证据链

- **探针 P1**（唯一计量探针，预算 4/8）：预登记 13 条频段（每条 = 64-rep nbsim 仿真 mean ± σ_total；σ_total 组合仿真 sd 与世界计量噪声，见 prereg 冻结件 discrimination 字段；provenance 全部 `sim:<id>`，13 条记录在 prereg sims 字段冻结）。落地观测 = **16.0 (P1)**。
- **带外 kill**（观测 16.0 (P1) 不在某 claim 预测带内 → 预登记 kill 分支命中）：
  - H2 cat：预测 [17.44, 24.47]；16.0 (P1) 在带外；判别度与 r* 复算见 prereg discrimination 字段（r* ≤ reps）→ REFUTED 请求（K3 后见 §6）
  - H3 nap：预测 [16.26, 21.96]；16.0 (P1) 在带外 → 同上
  - H5 combo：预测 [16.32, 24.33]；16.0 (P1) 在带外 → 同上
  - H8 ka100：预测 [18.36, 24.51]；16.0 (P1) 在带外 → 同上
  - H10 catna：预测 [19.04, 24.24]；16.0 (P1) 在带外；判别度与 r* 复算见 prereg discrimination 字段（r* ≤ reps）→ **REFUTED**（instance 参数点，干净迁移）
  - H4 mcur：预测 [10.39, 15.61]；16.0 (P1) 在带外；r* 复算见 prereg discrimination 字段（r* > reps）→ **检出限写法**："在 r=4、该精度下读数与其预测 [10.39, 15.61] 不相容；该协议下更小的负偏效应未被排除，结论封顶 lead"
  - H7 kahp：预测 [5.28, 10.38]；16.0 (P1) 在带外；判别度与 r* 复算见 prereg discrimination 字段（r* ≤ reps）→ 清洁 kill
- **带内存活**：观测 16.0 (P1) 落在 H0 预测 [12.77, 18.08]、H13 预测 [12.63, 18.12]、H1 预测 [15.13, 20.43]、H9 预测 [14.69, 20.71]、H11 预测 [14.09, 19.79]、H12 预测 [15.24, 20.61] 内。
- **K3 参数网格**（家族级否定前置审计，仿真免费，记录在 sim/grid-*.json）：弱 g 网格点（sim:grid-nap-g* / grid-ka100-g* / grid-catna-g* 系列，各含多个弱 g 取值）的 P5 预测全部落在以 16.0 (P1) 为中心的观测 2SE 窗口内；combo 的多个替代配比（sim:grid-combo-*）预测在带外，但 g→0 极限连续趋于参考（纯 IH 组分预测见 sim:combo-noCaT）。故家族级 REFUTED 一律不成立，只有注册参数点被杀（网格 claim：各家族弱 g 角均与观测相容，不写任何参数点估计为真）。

## 3. 校准账本（research_kit.calibration 摘要）

P1 × 13 claim：6 带内（H0/H1/H9/H11/H12/H13）、7 带外（H2/H3/H4/H5/H7/H8/H10）。带外 7 条恰为被迁移集合——频段区分度与本场判断一致，无"预测总在带内"（过松）或"总在带外"（失准）的病态模式。forecast 六标签为等价类均值预报，未做逐成员校准。

## 4. 控制与错误预测

- **negative control（H0 null 预测带）**：若真实系统=参考模型，读数应落其预测 [12.77, 18.08] 内。实际 16.0 (P1)——null 控制在带内，"参考模型 + 计量噪声"足以解释 P5 读数。
- **无聊对手守门**：H13（近阈噪声源伪影，方差膨胀型）与 H0 预测近重合（H13 预测 [12.63, 18.12]），作为守门对手保留在等价类内——均值贴参考的读数不能区分"无附加机制"与"只有方差伪影"。
- **最重要的错误预测**：CaT 假说（H2，rebound 的经典第一解释）预测 [17.44, 24.47]（中心值 sim:cat-p5）；实际 16.0 (P1) 落带外——低阈瞬态 Ca 电流的注册参数化被排除。落带外即模型错：本战役所有带外族的共同错误是把"促进强度"高估——真实读数没有超出 H0 预测 [12.77, 18.08] 上沿的净促进成分。
- **预报**（等价类均值，逐标签值与来源见 research-work/ca-rebound/forecast.md）：**终局预报误差 spike_forecast_mse = 3.334212500000001 (F)**。

## 5. 存活假设与未检验状态（结论行，与 register 逐字一致）

- H0: LIVE
- H1: LIVE
- H9: LIVE
- H11: LIVE
- H12: LIVE
- H13: LIVE
- H2: CONTESTED
- H3: CONTESTED
- H4: CONTESTED
- H5: CONTESTED
- H7: CONTESTED
- H8: CONTESTED
- H10: REFUTED

结论（等价类表述）：**在 P5 单格判别与全部 11 个池内格的仿真分离度扫描下，真实细胞的放电行为与"参考模型直接解释"或"一个弱 IH 型附加电流（其 P5 预测与 H0 预测 [12.77, 18.08] 重合的参数角）"不可分辨；强促进机制（低阈瞬态、持续 Na、组合）与负向机制（M 型、AHP 型）的注册参数点在该读数下被排除。**

> 本报告未对样本量/随机种子设置独立下限；频段结论以预登记规约为准，未达下限的情形应视为 CONTESTED 而非支持/否证。

## 6. 收窄与失败边界（scope）

- 本战役只在 P5 单格（r=4）上做了计量判别；P8/P9/P6/P1–P4/P7 及全部阻断剂组合只进了 nbsim 仿真矩阵（免费列），未对真实细胞计量——"该等价类在其余协议下也成立"是 scope 声明而非结论。
- IH 族内部的分离（H1 vs H9 vs H12 vs H11）需要时间尺度轴读数：全池内格扫描中最佳分离格为 P2（sim:dualih-p2 vs sim:ref-p2，两两 max min |Δpred|/σ 低于 1），达到 1σ 分离所需真细胞重复数超出剩余预算——等价类出口（RULING `equiv{H0, H13, H1, H9, H11, H12}`）。
- 条件期末电位、早期窗口密度（spikes_in）、条件期放电在计量读数（spike_count）之外，本战役无法检验；真实实验中这些是首选判别轴（families.md 各族"预期可判别读数"节）。
- TTX 列：全部候选在 P5+TTX 仿真下零出峰（额外内向电流不足以独立驱动放电）——该格从未对真实细胞计量，只作联合死亡检验备用。

## 7. Graveyard 摘要（死因 = 探针）

- H10（CaT 单价异名 instance）：P1 观测 16.0 (P1) 落其预测 [19.04, 24.24] 之外，instance 参数点级，REFUTED（P1）。禁止换装重提同一参数化。

## 8. 对抗记录（攻击债清账）

- G1（constraint → H13）：r=4 无法检验方差轴（方差比检验需大样本），H13 在预算内不可证伪——**主动 scope**（本节与 §6 已声明；H13 保留在等价类内作守门）。
- G2（constraint → H1）：H1 的两个独特签名（短抑制衰减比需大重复数；条件期末电位是非计量读数）在预算内不可测——**因预算不足 scope**。
- G3（constraint → H11）：对冲结构自由参数欠定，"恰好抵消"组合与 H0 预测重合——**因预算不足 scope**。
- G4（constraint → H12）：split 比例欠定，形状签名分离所需重复数超预算——**因预算不足 scope**。
- G5（constraint → H10，对最新终态迁移）：REFUTED 只覆盖注册参数化（g/E 取值见 families.md）与 P5 计数读数；弱 g 变体（sim:grid-catna-g* 系列）存活在贴参考等价类邻域——**主动 scope**。
- 全面解读需假设 A1..An：在"读数语义=spike_count 均值、世界计量噪声、r≤4"下，H（机制归属）只能到等价类粒度。

**未偿债 scope 段**：已偿 0（无 prereg 点名清偿）；主动 scope：G1、G5；预算不足 scope：G2/G3/G4。标题即 finding：**该世界的计数读数在 ≤8 计量预算下只能把机制辨识推进到"贴参考等价类"粒度**——优先表述为"在假设 A1（读数语义）与 A2（预算上限）下，机制类归属为 equiv{H0,H13,H1,H9,H11,H12} 及弱参数角邻域"。

## 9. 裁决汇总（RULINGS.md 按时序，数字为可读性转写；原文见项目根 RULINGS.md）

Ruling: intake: mode=identify · predicate=LIVE 收缩到 1 个或写明等价类且 world_forecast 已提交 · depth=light · recall=off · world=ca_rebound · seed=0 · cost≈10 child / 计量预算 8 — 用户确认（消息+AskUserQuestion）按 K0 草案执行 — 押错代价：light 档漏掉需 full 复评的候选，届时按锚 ⚠ 追加复评窗口

Ruling: K1 收编范围 — family 层收 H7(KAHP)/H8(KA-E100)/H11(hedge)/H12(dual-IH)；instance 层收 H9(ihfast,parent=IH)/H10(catna,parent=CaT)；伪影层收 H13(noisysrc) — K1 rival 报告判定这 7 项 problem-fit 且可判别 — 押错代价：真实机制若属未收编类，首轮探针只能 SCOPE 不能杀

Ruling: 不立候选 — shunt（贴参考，当前 g 下与 H0 等价）；亚毫秒快电流（计数读数盲，探针设计约束非 claim）；读数层对手（早期密度/条件期放电/采样欠计数，must-rule-out 清单）；mpow 协同与 slow_na+补偿交互挂起（若母族存活再收） — schema 无对应自由度或与已立 claim 的 predicts 子集重叠 — 押错代价：结构对手漏网时 SUPPORTED 退化为 CONTESTED+lead

Ruling: K3 审计 self-reviewed — W2 失败两次（k3 child 超时；k3b 写入两次被宿主守卫拦截），父会话代做（.rlm-jobs/ca-rebound/k3b/P1-audit/c862-self/out.md） — 审计卡明文允许 — 押错代价：全部家族级 kill 结论封顶 lead

Ruling: K3 网格降级 — H3/H5/H8/H10 按参数覆盖规则（每自由参数多点扫描须全部落在观测带外才可否定家族）降为注册参数点 kill（grid-*.json：nap/ka100/catna 弱 g 点均落观测窗；combo g→0 极限连续趋于参考），家族弱 g 角不作家族级否定、并入贴参考等价类；H4 mcur 真细胞重复数不足其检出下限 → 检出限写法封顶 lead — 押错代价：若真实机制是某族强参数点，后续 forecast 失配会暴露

Ruling: 跳过确证探针 P5Cd — P1=16.0 (P1) 落贴参考带，正区 combo-vs-cat 簇分离目标已随 7 条 kill 消失；剩余预算留给 forecast 与确证 — 押错代价：无（目标分支不存在）

Ruling: equiv{H0, H13, H1, H9, H11, H12} — P1 落点后全部幸存者带贴参考区；两两 max min |Δpred|/σ 低于 1（sim:dualih-p2 vs ref-p2，全部 11 个池内格含阻断剂列扫描），任何对达 1σ 所需重复数超出剩余预算；弱 g 角降级族（H3/H5/H8/H10 家族残余）预测同贴参考，一并归入该等价类的参数化邻域 — 押错代价：真实机制若是类内某成员的具体参数化，forecast 仍应命中（类内预测差不足 1 尖峰），但机制命名只能到类级

Ruling: 报告审计 self-reviewed — 报告审计 W2 因本会话 child 连续超时与宿主守卫误拦改由父会话逐句对账（每个数字均带 (P#)/sim: 记录 id/(F) 出处，唯一的计量读数来自 metric_recompute） — 押错代价：报告若有个别出处断链，gate reconcile 会逐行抓出

## 10. identify 追加

- **预报**：终局预报误差 3.334212500000001 (F)；逐 held-out 预报值与 `(sim:H#)` 来源见 research-work/ca-rebound/forecast.md（成员级仿真记录 sim/{ref,ih,ihfast,dualih,hedge,noisysrc}-{p1,p2,ho25,ho30,ho35,ho40}.json）。
- **等价类**：在 P5 单格与全部 11 个池内仿真格下 equiv{H0, H13, H1, H9, H11, H12} 不可分（最佳格 sim:dualih-p2 vs sim:ref-p2，两两 max min |Δpred|/σ 低于 1）；不挑胜者。
- **网格 claim**：各家族自由参数只写网格（弱 g 角集均与观测相容），无点估计为真。
- **检出限**：H4 按"在 r=4、该精度下与其预测 [10.39, 15.61] 不相容；该协议下更小负偏效应未排除"读写，从不写"不存在"。
- **未覆盖协议**：真实细胞未计量过的池内协议 P1/P2/P3/P4/P6/P7/P8/P9 与全部阻断剂组合（TEA 完全未用）；held-out 六标签按契约只预报未观测。
