---
name: research-abduce
description: Use when 战役没有 LIVE 假设、grill 攻击产生了替代解释（new_h）、triage 判定真实意外、或 LIVE 集缺一条伪影类无聊对手时。
version: 0.5.2
---

# research-abduce —— 登记假设

## 你在做什么

为战役登记一条新假设：一个可错的说法 + 它**独有**的可观测预测 + 它与已死
方向的关系。假设空间的质量在这里决定——探针只能判别已写下的东西。

## 铁律

```
没有独有可观测预测的说法不是假设——包括伪装成两条的一条（取反）
```

**违反字面就是违反精神。** `H2 = 并非 H1` 能骗过每一道结构检查（predicts 不是
子集、频段互斥、必然"判别"出结果），但假设空间仍是单例：两条频段合起来盖满
值域，实验不可能有意外。**类型检查器判不出取反，这条只能靠你。**

## 程序

1. **先读坟场**：`research_kit.anchor(run)`——graveyard 段是禁令体。
   ✓ 成功条件：能点名每条死者的死因。
2. **先写 bottleneck，再生成候选**：新方向、候选换皮或近邻拥挤时，打开
   `references/discovery-methods.md`。用来源残差和方法谱系写一个不偷渡 cure 的
   结构性失败，再用模式词汇拓宽机制；模式是诊断，不是生成模板。
   ✓ 成功条件：bottleneck 允许至少两种 cure；候选会死于不同观测。
3. **写三件套**（Arbor 四行契约的映射）：
   - **statement**：一个可错句子——机制是名词（新组件/新路径/新数据结构），
     不是"更多 X"或调参方向；
   - **predicts**：2–3 条可量化预测（"accuracy ∈ [0.8, 1.0]"），写**量**不写方向；
   - **conflicts**：坟场非空时结构性必填——`none — 攻击未探索的轴`，或点名
     死者与死因并说明本假设如何反驳/绕开。
   ✓ 成功条件：两条假设的 predicts 有互斥落点（后续频段设计的原料）。
4. **前提账本**：按 `research-loop` 的 `references/stage-questioning.md` 中 S1/S3
   检查 load-bearing premise、可计算定义、观测模型和 estimand；未检验前提必须成为
   falsification target，不能藏在 prose 中。再独立构造 naive 版本：若 naive 已足够，
   诚实标成增量或把“领域误判”冻结成可检验的盲预测。
5. **单例自查**：如果 H1 被证伪，H2 是否自动为真？是 → 你只有一条假设，
   回去想第二个**机制**。好的假设组留出一个"两条都不支持"的观测区间——
   那是意外的入口，也是这套系统唯一能学到新东西的地方。
6. **无聊对手准入**：进探针设计前，LIVE 集必须含一条**伪影/混杂类**对手——
   主张观测将由 bug/泄漏/选择效应/测量伪影产生。这是**纪律而非 server 检查**
   （`claim_propose` 看不见没写下的假设），research-probe SELECT 第 1 步自查
   兜底。写法同权：statement 指名具体伪影机制，predicts 给它专属落点
   （伪影通常预测"效应在打乱标签/随机对照下不消失"）。它死得快是好事——
   死法就是控制臂。
7. `claim_propose`。被拒按报错路由修，不绕。
   ✓ 成功条件：锚里出现新的 LIVE 行。

## 角色辅助（可选）

少量机制由父会话直接写。候选空间跨多个抽象轴、需要 falsifier 或数学推导时，
按 research-loop 的 `references/delegation.md` 委派 `analyst`，并在 brief 指定唯一
MODE；需要核对既有解释、论文或资产时委派 `researcher`。两者只交 report，不能
调用 `claim_propose`，也不能替父会话选择最终假设。父会话必须逐条检查其独有
预测、禁止观测和坟场冲突后再登记。

## 借口 | 现实

| 借口 | 现实 |
|---|---|
| "H2 = H1 不成立，也算第二假设" | P4.3 实测原样翻车（`H1: pass=45 且 fail=0` / `H2: pass≤44 或 fail≥1`）——骗过全部结构检查，证据链整场作废。第二假设是**另一个机制**：不是"特征 X 无效"，是"提升来自数据泄漏"。 |
| "伪影对手太无聊，不值得占一条" | 从未被写下的第二假设，没有任何结构能标记它的缺席（ARFT："nothing can flag what was never written down"）。它的死是报告"为什么不是伪影"段的现成证据。 |
| "conflicts 先随便写，以后补" | conflicts 是换装重提的唯一闸门。共享同一隐藏前提的想法回锅，是长程 agent 的既证失败模式。 |
| "假设写模糊点，探针好设计" | 模糊假设产出装饰性探针，prereg 的互斥/kill 检查当场拒绝。 |
| "statement 改几个字不算改写" | 语义变了旧频段就答非所问——旧预登记作废，重新 prereg。结构管不了语义漂移，这条只能靠诚实。 |
| "先想一个解法，再把问题写成它能解决的样子" | 这是把 cure 偷渡进 bottleneck。先写允许多个 cure 的失败句；否则候选比较从一开始就是伪选择。 |
| "套两个创新模式看起来更深" | 多模式只有形成 `A → 中间对象 → B` 才是组合。强行叠加两个 ad-hoc 决定，反而让贡献不可归因。 |

## 快速参考

| 步骤 | 动作 | 成功条件 | 执法 |
|---|---|---|---|
| 读坟场 | anchor | 能复述死因 | 纪律 |
| 写瓶颈 | 来源残差 + 方法谱系 | 不偷渡 cure、允许多解 | 纪律 |
| 三件套 | statement/predicts/conflicts | predicts 互斥落点 | conflicts（坟场非空时）【结构】 |
| 前提账本 | premise/observation model/estimand/naive | 隐藏前提成为 falsifier | 纪律 |
| 单例自查 | "H1 假则 H2 真？" | 答"否" | 纪律 |
| 无聊对手 | 伪影类 claim_propose | LIVE 含 ≥1 条 | 纪律（probe 兜底） |
| 登记 | claim_propose | 锚出新 LIVE 行 | 子集/复活【结构】 |

## 交接

- 机制来源枯竭 / 坟场涨而 LIVE 空 → `research-moves` 的 `references/reframe.md`
- 登记完、存在可判别差异 → `research-probe`
- 死假设复活：`claim_transition` 到 LIVE，note 点名新证据来源（否则 server 拒）
- **不在这一步设计实验**——那是 research-probe 的事

## 参考索引

- `references/discovery-methods.md` —— 文献残差、方法谱系、15 类结构 move、
  前提账本、朴素基线与 TRUE × WORTH IT
