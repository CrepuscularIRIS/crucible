# ledger — ca-rebound（I0）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## 题面（钉死，逐字）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- text_prior: "an additional membrane current of unknown identity, voltage-dependence, and kinetics -- not a named textbook channel, so how to probe it is not known a priori"- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 参考模型: HH（gNa=120, gK=36, gL=0.3; ENa=50, EK=-77, EL=-54.4），extra=[]，slow_na=false- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 额外电流: 未知身份 / 未知电压依赖 / 未知动力学；不是教科书命名通道- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- n_channels=100（通道噪声尺度），SIG_OBS=2.0（电压观测噪声，仅 world_observe 侧），DT=0.025- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 指标: test_start（最后一个幅值>0 段的起点）起的过零尖峰数；纯 release 协议 test_start=0 → 全程计数- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- budget_rule: "(protocol, repeats): running r times costs r and averages the noise"- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 计量预算: 8（K0 确认）；保留 ≈1 给确证- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## 协议池（world_observe 只接受这些标签 + 任意阻断剂组合）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
见 task["protocols"]（9 条）；held-out 6 个标签只能 nbsim 仿真、只进 world_forecast。- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## 阻断剂语义（nbsim/blockers.py，通用药理逻辑）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- TTX → 基线 gNa=0；TEA → 基线 gK=0- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- Cd → 阻断所有 E ≥ 100 mV 的附加通道（钙型判定）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- XE991 → 阻断 name == 'M' 的附加通道- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 对附加通道的"身份"判定只走通用规则（E 阈值 / name），不写 world 专属提示进报告方法段- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## 钉死 vs 自由- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 钉死: 参考模型参数、协议段、阻断剂语义、噪声尺度（通道数 100、SIG_OBS 2）、指标定义- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 自由（只能网格 claim，不许点估计为真）: 附加通道的 {name(仅影响 XE991 敏感性), g, E, mvh, mk, mtau, mpow, hvh, hk, htau, hpow}；slow_na ∈ {false, true} 也是一个候选族维度- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## σ 出处（按序）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
1. nbsim.simulate 每格 reps≥64 的 counts sd（用这个）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
2. 没有 → Δ 用原始单位 + σ unknown 旗- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## sim_env- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- path: /root/research-work/ca-rebound/nbsim · sha256: bd1b9c85aaa7d9a (完整值见 info 返回，冻结)- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## P1 落地（weak step none, reps=1）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- obs = 14（spike_count mean, P1 frozen bands）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 带内存活: ['H0', 'H1', 'H2', 'H5', 'H6', 'H7', 'H10', 'H11', 'H12']- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 带外: ['H3', 'H4', 'H8', 'H9']- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## P2 落地（weak step + Cd, reps=1）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- obs = 11- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 带内存活: ['H0', 'H1', 'H2', 'H3', 'H6', 'H7', 'H9', 'H10', 'H11', 'H12']- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 带外: ['H4', 'H5', 'H8']- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
## P3 落地（depolarising cond + TEA, reps=1）- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- obs = 16- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 带内存活: ['H0', 'H11', 'H2', 'H7', 'H8']- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- 带外: ['H3', 'H4', 'H5', 'H9']- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】
- E≥100 簇 H2 排除，H10/H12 同格同判- E≥100 簇（TEA×depolarising 格）：CaL 0.00±0.00、CaTr 0.00±0.00、CaS 0.02±0.12（归零）与 obs=16 矛盾 → H6/H10/H12 排除；CaT 16.22±3.89（非零）→ H2 存活【更正：此前误写 H2 排除】

## P4 落地（hyperpol cond + TEA, reps=1）
- obs = 17
- 带内: ['H0', 'H2', 'H7']
- 带外: ['H1', 'H11']

## P5 落地（weak step + TEA, reps=1）
- obs = 29
- 带内: ['H0', 'H7']
- 带外: ['H2']

## P7 落地（paired + TEA, reps=1）
- obs = 16
- 带内: ['H0', 'H12']
- 带外（E≥100 簇正式排除）: ['H6', 'H10']

## 终局判定
- 等价类 equiv{H0, H7}：null 与 slow_na 伪影在剩余预算下不可分（max d=0.93@brief-hyper+TEA）
- P7 组合证据偏向 H0（obs=16 在 H0 带内、H7 带外）
- 预算使用：P1-P7 共 6 格观测（14/11/16/17/29/16），剩 2（保留 1 确证、1 未用）
