# 报告前证据审计——从“结果存在”到“主张站得住”

**何时加载：** 开始写 REPORT、claim→probe 链较复杂、负结果需要定性，或准备让
reviewer 审查报告时。

审计者只读，不替作者补证据。先判断做的是不是正确实验，再判断数字与文案是否一致。

## 每条主张的七项卡

| 项 | 问题 |
|---|---|
| claim strength | statement 是否只说证据能支持的强度？ |
| observable | metric 是否观察到 claim 依赖的维度，而非 proxy？ |
| provenance | 数字能否由 P# artifact 与 metricSpec 独立重算？ |
| controls | 最强 mundane alternative 是否有 matched/null control？ |
| boundary | 最小失败设置、scope 与未测轴是否明确？ |
| prediction error | 预登记频段与实际偏差是什么，模型哪里猜错？ |
| adversary | 迁移后攻击是否仍站得住，constraint 是否被偿还？ |

缺一项不自动伪造补齐：要么回 PROBE，要么把 claim 降为 CONTESTED/LIVE/scope。

## 把控制组放进主叙事

控制不是附录卫生项，而是“为什么不是伪影”的核心证据。正文点名：

- trivial/null baseline；
- matched-rank / matched-energy / matched-compute；
- shuffle/swap/wrong-answer；
- oracle/ablation 的解释边界。

如果 control 本身不能失败，它只证明 pipeline 能运行，不证明主张。

## 诚实记录错误预测

报告一个最重要的 prior prediction、实际结果与误差。落带外的“赢”首先是解释模型
失败，其次才是性能提升；不要把意外吸收到新故事里。若候选曾有盲预测面板，可以引用
其错误方向作为动机，但不能把代理模型的错误冒充 field novelty。

## 负结果何时是产品

只有同时满足才升级为结论：

1. **一般性：** 指向一个方法类/结构限制，不只是某份实现坏了；
2. **解释性：** 有机制说明为什么失败，而不只是 null number；
3. **边界性：** 说清在哪些条件下不成立，在哪些条件下尚未知；
4. **可复用性：** 留下反例、诊断仪器或 graveyard prohibition，阻止同类候选回锅。

否则照实写失败，不包装成 impossibility。

## 失败边界与 fallback

在结论旁明确：

- 最小已知失败输入/设置；
- 样本、seed、模型族和数据域的 scope；
- 若 mechanism 未立住但 phenomenon 稳定，可交付现象与控制；
- 若 artifact 对手获胜，可交付测量缺陷与修正协议；
- 若只有上界 probe，报告投资裁决，不升级为性能/机制主张。

fallback 不是截止日前临时降格，而是 evidence shape 的诚实投影。

## 独立审查顺序

1. 用 `references/claim-ledger.md` 核对 thesis 与四类 claim 角色，空位保持为空；
2. 逐 P# 重算 metric，核对同一代码路径和 seed/预处理；
3. 逐 claim 填七项卡；
4. 按最强 claim 反向找缺失控制与失败边界；
5. 再写 REPORT，并让 reviewer 只读检查；
6. 父会话修订后调用 `report_declare`。

审查者与修订者保持分离；reviewer 的 finding 原文保留，父会话决定如何采纳。
