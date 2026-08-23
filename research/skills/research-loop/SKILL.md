---
name: research-loop
description: 研究战役的主路由：从 MCP 信念状态确定当前阶段，一次只装一个阶段 skill。开始任何研究工作时先来这里。
version: 0.2.0
---

# research-loop —— 研究战役主路由

你在一场研究战役里。战役的状态**不在对话里**，在 MCP 工具 `research_state` 返回的
信念状态里。对话会被压缩、会被截断；journal 不会。kernel 变量跨**压缩**存活
（kernel 重启会重置——那时按开场仪式重新立锚即可）。

## 开场仪式（每个会话的第一件事）

1. 调用 `research_state`（run 名由用户给出或从项目 README 继承）。
2. kernel 里 `research_kit.anchor(run)` 立锚——LIVE、graveyard 禁令、探针、攻击
   计数一屏收齐，且存进 `research_kit.LAST` 跨压缩存活。
3. 由状态推导当前阶段（见下表），**只加载对应的一个阶段 skill**。

**压缩发生后**：先 `print(research_kit.LAST)` 找回锚，再决定要不要重新
`anchor()`——锚在 kernel 里活着，不要凭对话记忆重建信念状态。

不要"为了上下文"把所有阶段 skill 都读一遍——那是这套设计消灭的行为，
上一代实现的教训：第一次决策前就读了 96 KB。

## 阶段推导

| 状态 | 阶段 | 加载 |
|---|---|---|
| 没有 LIVE 假设 | ABDUCE | `research-abduce` |
| 有 LIVE 假设、存在可检验差异但没有覆盖它的已落地探针 | PROBE | `research-probe` |
| 有新的落地证据未消化，或 LIVE 假设从未被攻击过 | GRILL | `research-grill` |
| 用户要结论，或 graveyard/SUPPORTED 已足以回答战役问题 | REPORT | `research-report` |

一个阶段做完回到本文件重新推导。阶段可以来回（grill 产生新假设 → 回到 probe）。
**攻击债优先于新想法**：grill 落下的 constraint/new_h 未消化前，不开新的探针方向。

## 硬纪律

- 信念状态的每一次改变都必须走 MCP 工具（journal 留痕）。**绝不手改
  `.proma-research/` 下的任何文件**——gate 会拿 journal 重放对账，手改等于造假。
  `research_kit` 是只读的，写不了也不要绕。
- 每个探针落地后，问自己：这个结果**杀死了什么**？没有杀死任何假设的实验
  是装饰性的，预登记时就会被拒绝。
- 对抗者（grill）必须能看到 graveyard——`research_kit.claim_view` 永远带上它，
  不要替对抗者过滤。
- 用户喊停就停。gate 是裁决，不是续命。
