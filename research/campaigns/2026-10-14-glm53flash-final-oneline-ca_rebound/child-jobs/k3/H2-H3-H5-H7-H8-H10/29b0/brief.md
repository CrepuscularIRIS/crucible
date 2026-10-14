# K3 迁移前审计（W2）— ca-rebound · P1 落地后的 4 条家族级 REFUTED

你是 Research Reviewer。只读审计，不修补、不做观测、不写 run 状态、不建子代理。
**禁止运行 nbsim.simulate 超过 4 次**（可 import nbsim 算门稳态）。本 brief 内嵌了
prereg 冻结字段的事实摘录（宿主在 declare 时会独立复验结构，你只做语义审计）。

## 冻结事实（P1，sha 18556d80…，已落地 metric=16.0）
P5 协议 reps=4 观测均值 16.0。频段 = 64-rep 仿真 mean ± σ_total，σ_total=sqrt(sim_sd²+2²)。
claim: band → 落点命中分支：
- H3 nap: [16.26,21.96]（sim:nap-p5）→ 命中下侧 kill [0,16.25]，headline 已冻结
- H5 combo: [16.32,24.33]（sim:combo-p5）→ 命中下侧 kill [0,16.31]，headline 已冻结
- H8 ka100: [18.36,24.51]（sim:ka100-p5）→ 命中下侧 kill [0,18.35]，headline 已冻结
- H10 catna: [19.04,24.24]（sim:catna-p5）→ 命中下侧 kill [0,19.03]，headline 已冻结
- H4 mcur: [10.39,15.61]（参数点级，不审覆盖）→ 命中上侧 kill [15.62,45]
- H7 kahp: [5.28,10.38]（参数点级）→ 命中上侧 kill [10.39,45]
- H2 cat: [17.44,24.47]（参数点级）→ 命中下侧 kill [0,17.43]
存活对手带（16.0 落在带内，未被 kill）：H0 [12.77,18.08]、H13 [12.63,18.12]、
H1 [15.13,20.43]、H9 [14.69,20.71]、H11 [14.09,19.79]、H12 [15.24,20.61]。
待审计：H3/H5/H8/H10 四条 family 级 REFUTED（statement 是族不是参数点）。

## 审计项（逐项 verdict: pass/fail + 理由）
1. **数字溯源**：读 /root/research-work/ca-rebound/sim/ 下 nap-p5.json、combo-p5.json、ka100-p5.json、catna-p5.json、
   ref-p5.json，核对 counts_mean/counts_sd 与上述 band 端点（重算 σ_total）一致。
2. **判别度**：d=|μ_claim−μ_ref|/σ_total；对每条被审计族给 d 与 r*=⌈(2/d)²⌉，
   判断 reps=4 是否 ≥ r*（不够的写明，封顶检出限）。
3. **参数覆盖（核心）**：逐族判断观测 16.0（±1.5 = 2SE）是否落在该族"合理参数网格"
   （g±50%、mvh±5mV、tau×3）的预测带外。用 ≤4 次 nbsim.simulate（reps≥64）实测关键替代点
   （如 nap g=0.2、combo 去掉 CaT 组分、ka100 g=0.6、catna g=0.4）：
   (a) 替代点仍预测明显 ≠16 → 家族级 REFUTED 成立；
   (b) 存在合理参数点预测 ≈16 → 该族只能杀参数点，写明降级。
4. **门方向**：打印 4 族+H2/H4/H7 的 m∞/h∞（V=−95/−65/−40），方向与
   /root/research-work/ca-rebound/recall/families.md 及 /root/.rlm-jobs/ca-rebound/rivals/K1b/8012/out.md 的 statement 对照。
5. **对手完整性**：kill 判定是否依赖与存活对手带重叠的假设；无 support 分支故无 rival_overlap 项。

## 输出
写 /root/.rlm-jobs/ca-rebound/k3/H2-H3-H5-H7-H8-H10/29b0/out.md：SUMMARY（≤200 词）→ 5 项 verdict → 裁决行
`AUDIT: <pass|fail> — 可全部迁移 / H#: 降级为参数点（理由）`
末行：STATUS: <ok|blocked|failed> PATH: .rlm-jobs/ca-rebound/k3/H2-H3-H5-H7-H8-H10/29b0/out.md
