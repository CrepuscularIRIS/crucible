---
name: research-report
description: 写战役报告：数字只能来自 metric_recompute，引用格式 value (P#)，结论行必须与 register 一致，附校准账本与收窄声明，declare 即裁决。
version: 0.3.0
---

# research-report —— 报告纪律

## 你在做什么

把战役结果写成 REPORT.md。报告的可信度不来自文采，来自**每个数字都能被
重算对账**。gate 2 会逐行检查，写报告时就想清楚。

## 硬格式（gate 的对账契约）

1. **结果数字**：一律写 `value (P#)`，value 来自 `metric_recompute` 的返回值
   （可按引用值小数位四舍五入）。没有 (P#) 出处的小数会被整行拒绝。
   - 例：`accuracy 达到 0.83 (P1)`
2. **频段**：预登记内容写严格两数值 `[lo, hi]`，它们豁免出处对账。
   任意方括号（如 `准确率 [0.91]`）不被豁免。
3. **结论行**：`- H1: SUPPORTED` 形式，每个 claim 一行的状态枚举。
   状态必须与 register 实际状态**逐字一致**——写错就是红。
   LIVE 且未检验的假设照写 `LIVE`，这不丢人；把 LIVE 写成 SUPPORTED 才丢人。
4. **假设引用**：正文中 `H#` 引用的假设必须存在（`据H99的分析` 会被抓——
   中文里没有词边界可躲）。
5. 写完调用 `report_declare`——**declare 即裁决**：server 会当庭替你
   跑三道 gate，任何一道红都会拒绝声明并逐条给出理由。红了就修报告（或补
   实验），**绝不动 journal 与 register 去凑绿**。全绿后 declare 返回三道
   裁决，报告才算数。

   用户/CI 仍可独立复跑（结果与 declare 内嵌裁决一致，同一份实现）：

   ```bash
   bun <repo>/packages/research-mcp/gates/prereg.ts     <run-dir>
   bun <repo>/packages/research-mcp/gates/reconcile.ts  <run-dir>
   bun <repo>/packages/research-mcp/gates/trace.ts      <run-dir>
   ```

## 内容顺序

1. 一句话结论（哪个假设被支持、哪个被杀、以哪个探针为据）。
2. 证据：每个关键数字 + 出处探针 + 它落在哪个预登记频段。
3. **校准账本**：`research_kit.calibration(run)` 的输出摘要——每个落地探针
   预测频段 vs 观测、带内/外。预测总在带内说明频段太松，总在带外说明判断
   失准；两者都是下一场战役的品味数据，照实写。
4. 存活假设与其未检验状态（诚实的"我们还不知道"），并附一行声明：

   > 本报告未对样本量/随机种子设置独立下限；频段结论以预登记规约为准，
   > 未达下限的情形应视为 CONTESTED 而非支持/否证。
5. **收窄声明**：战役检验不了的断言，降格写成 scope，不硬测。
   模板："本战役只在〈模型/数据/设置〉上检验了 H#；'跨〈更大范围〉成立'
   未检验，是 scope 声明而非结论。"——收窄一个说法比检验一个测不了的
   说法诚实得多。
6. graveyard 摘要与死因（probe id）。
7. 对抗记录（attack gid 摘要）——报告要能看出假设挨过打，
   静默假设清账的 constraint 攻击逐条列出。

## 禁止

- 不引用对话记忆里的数字——只信 `metric_recompute`。
- 不写"显著提升/大幅下降"这类无量化形容词来代替数字。
- 不为了全绿而压缩诚实内容——gate 检查的是一致性，不是立场。
