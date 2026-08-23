# Grill attacks on H1 (SUPPORTED) — extracted from adversary sub-0ae57df8 analysis
# Subagent completed but failed to write file; parent extracted from its reasoning trace.

constraint | H1 | P1 频段归属在 n=200/SE=0.05 下判别力不足：频段间距 0.02（[0,0.09] 与 [0.11,1] 之间）< SE=0.05；true_gap=0 时 P(落入 H1 频段)=0.928，true_gap=0.10 时 P(落入 H1 频段)=0.421——两者均以高概率落入 H1 频段。若依赖不成立（探针判别力不优于随机），则 true_gap=0 与 true_gap=0.10 应以相近概率落入 H1 频段；实测差异仅 0.507，意味着即使 H2 为真（true_gap=0.10），仍有 42% 概率观测到 "支持 H1" 的结果。
new_h | H1 | pca-vs-none gap 是 oracle-vs-coin 恒真结果而非经验发现：eval.py "pca" 模式 `x>0.5` 是标签生成函数 `x+noise>0.5` 的精确去噪版（oracle），"none" 模式是 per-sample coin flip（`Random(i).random()>0.5`）；no-shuffle gap=0.445 由构造保证，shuffle gap=0.055 仅证实代码语法（pca 分支引用了 x，none 分支未引用），不证实任何 ML 洞察。替代解释：gap 反映实验者设计选择（oracle 阈值 + 随机基线），而非 PCA 或特征提取能力。
constraint | H1 | H1 的 SUPPORTED 状态仅基于一条预测的验证：H1 有两条预测——(a) no-shuffle gap>0.30, (b) shuffle gap<0.10；P1 仅预注册并检验了 (b)；no-shuffle gap=0.445 来自 post-hoc 运行（不在 P1 预登记命令中），不构成独立验证。若依赖不成立，H1 的 (a) 预测应可被独立探针证伪但实际被跳过——具体地，若存在某 DGP 变体使 no-shuffle gap<0.30 而 shuffle gap 仍在 [0,0.09] 内，H1 应被部分证伪但当前状态不允许此可能。
no_change | H1 | H2 REFUTED 消解了 H2 的机械预测但未触及结构批评：H2 的结构性主张（gap 由 oracle 阈值 + 稻草人基线制造）在 shuffle 后确实消失，但这仅证明 gap 依赖特征-标签关系，不证明 gap 反映有意义的 ML 信号。H2 死于窄技术条件（predicts shuffle gap>0.10 被否证），其核心洞察（eval.py 的 "pca" 不是 PCA，"none" 不是合理基线）从未被任何探针检验。此攻击不改变 H1/H2 状态，但标记 H1 结论的适用范围被高估。
# SCOPE-ONLY | H1 | H1 statement 中 "pca 模式利用了特征与标签之间的真实预测关系" 不可直接推广到 PCA 技术：eval.py 的 "pca" 模式是 `x > 0.5`（对原始特征做硬阈值），不是主成分分析；将其结果推广到 "PCA 捕获真实信号" 需要额外假设（PCA 投影保留预测信息），该假设在此战役中从未被检验。
