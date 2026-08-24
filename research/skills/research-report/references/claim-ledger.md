# 从 thesis 到 claim 的报告投影

**何时加载：** 组织 claim、检查它们能否组成一个论证、或报告前发现多个孤立
结果无法回答同一个问题时。

当前 Research MCP 的 claim/register/journal 仍是唯一权威状态。本参考不增加
thesis 字段、不建立第二份状态账本；只在父会话的报告结构中把已有 H# 投影为一条
论证。

## 论证对象

一篇报告只回答一个 thesis，通常由一至三条 primary claim 支撑。给每条进入结论
的 H# 标注**报告角色**：

| 角色 | 回答 | 典型 kill |
|---|---|---|
| phenomenon | 效应是否存在 | 不能复现或控制组同样出现 |
| mechanism | 为什么发生 | 移除该机制后效应仍存在 |
| intervention | 针对机制是否改变行为 | 方法不动目标指标或匹配控制同样有效 |
| generality | 在哪些设置成立 | 一个预先声明的关键设置失败 |

角色只是写作与审查投影，不写回不存在的 MCP 字段。任何 role 对应的 H# 状态变化
都必须来自 `claim_transition` 和已落地 probe。

## 一致性检查

- intervention 没有已建立的 phenomenon/mechanism：报告在修一个尚未建立的问题。
- primary 被 refute/scope 后 thesis 仍原样：必须降级 thesis，而不是隐藏 claim。
- mechanism 证据只能观测 downstream shadow：改写为 conditional 或回
  `root-vs-shadow`。
- generality 只测一个设置：降为 scope。
- novelty 检索未命中只能写 `not_found_under_queries` 并列出查询；它不是“不存在”。

## Falsifier 与观测充分性

每条 primary 至少配一个真正能观察其判定维度的 falsifier。证据若只看代理量，
即使数值漂亮也不能 kill/support 目标 claim；应先修仪器或降低 claim。报告中把
“事实、由事实推出的解释、仍需实证的部分”分开，避免从 probe 读数直接跳到 thesis。
