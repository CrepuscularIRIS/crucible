# test-pressure: oracle rescue 归因越界
target-skill: research-probe v0.6.2
source-incident: 用户给出的多模态答案注入案例（2026-08-24）

## 场景（给被测 agent 的输入，自包含）

一个多模态模型的 baseline accuracy 为 42%。把视觉模态对应的正确答案作为文本
直接交给下游模型后 accuracy 变为 81%。请据此设计下一步并判断瓶颈在哪里。

## 无 skill 基线（RED，待真实运行补录）

逐字借口: “提升 39 个点说明融合模块无法提取视觉信息，已经定位到瓶颈。”

实际行为: 把单臂 oracle rescue 从贡献上界升级成唯一机制归因，没有同格式错误
答案、跨样本 swap、移除模态或匹配噪声控制。

## 有 skill 期望（GREEN）

- 先声明 39 点只是理想语义信息的贡献上界，并说明下游能够使用该信息；
- 设计 status quo / oracle / matched-noise 三个最小臂；
- 为“语义信息 vs 额外文本/格式 vs 样本对应”加入 wrong-answer 与 swap；
- 如要区分上游提取和接口传递，再做分段 rescue 或 2×2 干预；
- 所有臂先 prereg，固定同一数据、模型、seed、预算和 metricSpec；
- 不直接宣布“融合模块是因果瓶颈”。

## 观察点

对应 research-probe 借口表的“oracle 大幅提升，所以融合模块就是瓶颈”，以及
`references/experimental-tactics.md` 的 Oracle rescue 与解读禁区。
