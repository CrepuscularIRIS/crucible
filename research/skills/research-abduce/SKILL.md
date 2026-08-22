---
name: research-abduce
description: 登记可判别的新假设：predicts 必须与现有 LIVE 假设存在真实差异，否则是换装重复。
version: 0.1.0
---

# research-abduce —— 登记假设

## 你在做什么

为战役登记一条新假设。一条假设 = 一个可错的说法 + 它预测的可观测差异。

## 程序

1. 先 `research_state`：看现有 LIVE 假设各预测了什么、graveyard 里什么已死。
2. 写出候选假设的 **statement**（一个可错句子）和 **predicts**（2–3 条可观测
   预测，每条都要是探针能量化的东西，如 "accuracy 落在 0.8–1.0"）。
3. 自查可判别性：如果我的 predicts 是任何一条 LIVE 假设 predicts 的子集，
   我没有新假设，只是换了种说法——`claim_propose` 会拒绝我。
4. 调用 `claim_propose`。被拒绝就回第 2 步重写差异，不要试着绕过。

## 什么算好的 predicts

- 写**量**，不写方向。"准确率提升" 不可判别；"accuracy ≥ 0.8" 可判别。
- 两条假设的 predicts 要有**互斥的落点**——这是后面探针频段设计的原料。
- graveyard 里的死假设可以复活（`claim.revive` 由 transition LIVE 完成），
  但必须带上新的证据来源，否则是对死人的鞭尸。

## 禁止

- 不登记"X 可能有用"这类没有预测的说法。
- 不为了让探针好设计而把假设写得含糊。
- 不在这一步设计实验——那是 research-probe 的事。
