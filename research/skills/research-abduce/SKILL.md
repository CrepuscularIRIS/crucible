---
name: research-abduce
description: 登记可判别的新假设：predicts 必须与现有 LIVE 假设存在真实差异；graveyard 非空时必须写 conflicts 声明与死者的关系。
version: 0.2.0
---

# research-abduce —— 登记假设

## 你在做什么

为战役登记一条新假设。一条假设 = 一个可错的说法 + 它预测的可观测差异 +
它与已死方向的关系。

## 程序

1. **先读坟场**：`research_kit.anchor(run)`——graveyard 段是禁令体。换装重提
   共享同一隐藏假设的想法是长程 agent 的既证失败模式，锚就是为堵它存在的。
2. 写出候选假设的三件套（Arbor 四行契约的映射）：
   - **statement**：一个可错句子——机制是名词（新组件/新路径/新数据结构），
     不是"更多 X"或调参方向；
   - **predicts**：2–3 条可观测预测，每条都是探针能量化的东西
     （如 "accuracy 落在 0.8–1.0"）；
   - **conflicts**：与 graveyard 的关系。坟场非空时 `claim_propose` 结构性必填：
     要么 `none — 攻击未探索的轴`，要么点名死者与死因并说明本假设如何
     反驳/绕开（"H2 死于 P6 落带外；本假设主张该观测由 X 产生，预测 Y"）。
3. 自查可判别性：如果我的 predicts 是任何一条 LIVE 假设 predicts 的子集，
   我没有新假设，只是换了种说法——`claim_propose` 会拒绝我。
4. 调用 `claim_propose`。被拒绝就按报错里的路由修，不要试着绕过。

## 什么算好的 predicts

- 写**量**，不写方向。"准确率提升" 不可判别；"accuracy ≥ 0.8" 可判别。
- 两条假设的 predicts 要有**互斥的落点**——这是后面探针频段设计的原料。
- graveyard 里的死假设可以复活（`claim_transition` 到 LIVE），
  但必须带 note 点名新证据来源，否则 server 拒绝。

## 禁止

- 不登记"X 可能有用"这类没有预测的说法。
- 不为了让探针好设计而把假设写得含糊。
- 不在这一步设计实验——那是 research-probe 的事。
- 假设一旦实质改写（statement 语义变了），旧预登记分支随之作废——
  重新走 prereg，不要拿旧探针的频段套新语义（结构管不了语义漂移，
  这条只能靠你自己诚实）。
