# variants.md — score 候选变体与可计算定义（S1 隐藏前提 + S3 可计算规约）

来源：/root/arc-ML04/task-card.yaml（用户钉死）。所有定义在 prereg 前冻结；probe_run 之后不改。

## S1 隐藏前提（每条假设成立所必需、但题面未写死的参数）

| 前提 | 冻结值 | 理由 |
|---|---|---|
| KNN 超参 | KNeighborsClassifier(n_neighbors=5, metric='minkowski', p=2)（sklearn 默认） | 题面只说 fixed k/metric；k=5 是 sklearn 默认，四条件共用 |
| 划分方式 | train_test_split(test_size=0.3, stratify=y)，split seeds = 42..46（5 个） | "≥5 random stratified splits"；由 master seed 42 派生 |
| 缩放器拟合 | 全部经 Pipeline(fit on train only)，防止测试折泄漏 | sklearn Pipeline 标准语义 |
| 合成数据集 | make_classification(n_samples=1000, n_features=20, n_informative=10, n_classes=3, class_sep=1.0, random_state=42)，再向 5% 样本（rng(42) 抽 50 个）注入粗大特征异常（选 5 个特征乘以 U(8,15) 随机因子并随机翻符号） | 题面："make_classification with injected feature outliers on a subset of samples"；幅度取"远超特征自然范围"以保证对欧氏距离的真实扰动 |
| 指标聚合 | test_accuracy = 5 splits 均值；macro_f1 同；accuracy_std = 5 splits 样本标准差（ddof=1） | 题面 metrics 定义 |
| 判定阈值 | 全部来自题面假设原文：H1 边界 0.03；H2 边界 0.02；H3 计数 ≥2/3 | 不得自行改边界 |

## S3 可计算定义（两人从同一输入独立算出同一量）

记号：acc[ds][c] = 条件 c 在数据集 ds 上 5 splits 的 test_accuracy 均值；
条件 c ∈ {none, standard, minmax, robust}；ds ∈ {wine, breast_cancer, synthetic_outlier}。

- **H1** ≡ d1 = acc[synthetic_outlier][robust] − acc[synthetic_outlier][standard]
  - d1 ≥ 0.03 → supported
  - 0 < d1 < 0.03 → scoped（方向为正但幅度低于题面 0.03）
  - d1 ≤ 0 → refuted
- **H2** ≡ g = max over ds∈{wine, breast_cancer} of ( max_c acc[ds][c] − min_c acc[ds][c] )，c ∈ {standard, minmax, robust}
  - g ≥ 0.02 → supported
  - 0 < g < 0.02 → scoped（有效应但低于题面 0.02 门槛）
  - g = 0 → refuted
- **H3** ≡ n_top = #{ ds ∈ 3 个数据集 : argmax_c acc[ds][c] ≠ none }，c 含全部 4 条件
  - n_top ≥ 2 → supported
  - n_top ≤ 1 → refuted（no_scaling 在 ≥2 个数据集上居首）
- **H0（incumbent）** ≡ Δ0 = mean over 3 ds of ( acc[ds][argmax_c≠none] − acc[ds][none] )，δ = 0.02
  - Δ0 ≥ 0.02 → H0 refuted（存在变体系统性超过 incumbent 达 margin）
  - Δ0 < 0.02 → H0 存续（无变体超过 incumbent 达 margin）

配对设计（同一 split 内比较条件）降低差值统计量方差；判别度见 prereg discrimination 字段与 sim/ 功效记录。
