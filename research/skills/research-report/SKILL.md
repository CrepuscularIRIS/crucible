---
name: research-report
description: Use when 用户要结论，或坟场与 SUPPORTED 已足以回答战役问题、且每个进结论的主张都已挨过攻击时。
version: 0.4.0
---

# research-report —— 报告纪律

## 你在做什么

把战役结果写成 `.proma-research/<run>/REPORT.md`——这是 run 目录里**唯一
由你写入**的文件（journal/register/prereg/probes 只有 server 能写），声明时
调 `report_declare(run, path="REPORT.md")`（path 相对 run 目录，越界被拒）。
报告的可信度不来自文采，来自**每个数字都能被重算对账**——gate 2 逐行检查，
写的时候就按对账契约写。

## 铁律

```
数字只能来自 metric_recompute；gate 红了改报告或补实验，绝不动 journal 与 register
```

**违反字面就是违反精神。** 手改账本凑绿 = 造假，trace gate 逐字重放当场抓
【结构】；"我记得那个数是 0.83" 不是出处。

## 程序（硬格式 = gate 的对账契约，全部【结构】）

1. **结果数字**：一律 `value (P#)`，value 来自 `metric_recompute`（可按引用值
   小数位四舍五入）。没有 (P#) 出处的小数整行被拒。例：`accuracy 达到 0.83 (P1)`。
2. **频段**：预登记内容写严格两数值 `[lo, hi]`，豁免出处对账；任意别的方括号
   （`准确率 [0.91]`）不豁免。
3. **结论行**：`- H1: SUPPORTED` 逐 claim 一行，状态与 register **逐字一致**。
   LIVE 且未检验照写 LIVE——这不丢人；把 LIVE 写成 SUPPORTED 才丢人。
4. **假设引用**：正文 `H#` 必须存在（`据H99的分析` 会被抓）。
5. **declare 即裁决**：`report_declare` 当庭跑三道 gate，任何一道红 → 声明被拒
   并逐条给理由。全绿才写入 journal。用户/CI 可独立复跑同一份实现：

   ```bash
   bun <repo>/packages/research-mcp/gates/prereg.ts     <run-dir>
   bun <repo>/packages/research-mcp/gates/reconcile.ts  <run-dir>
   bun <repo>/packages/research-mcp/gates/trace.ts      <run-dir>
   ```

## 内容顺序

1. 一句话结论（哪个假设被支持/被杀、以哪个探针为据）。
2. 证据：每个关键数字 + 出处探针 + 落在哪个预登记频段。
3. **校准账本**：`research_kit.calibration(run)` 摘要——预测总在带内说明频段
   太松，总在带外说明判断失准；都是下一场战役的品味数据，照实写。
4. 存活假设与未检验状态（诚实的"我们还不知道"），附一行：
   > 本报告未对样本量/随机种子设置独立下限；频段结论以预登记规约为准，
   > 未达下限的情形应视为 CONTESTED 而非支持/否证。
5. **收窄声明**：战役检验不了的断言降格写成 scope——"本战役只在〈设置〉上
   检验了 H#；'跨〈更大范围〉成立'未检验，是 scope 声明而非结论。"
6. graveyard 摘要与死因（probe id）。
7. 对抗记录（attack gid 摘要）——报告要能看出假设挨过打；静默假设清账的
   constraint 攻击逐条列出。
8. **裁决汇总**：项目根 `RULINGS.md` 的全部 `Ruling:` 行按文件顺序照抄
   （追加式文件，顺序即时序）——死在工作区里的决定等于秘密决定，这是
   它们唯一浮出水面的地方。（纪律：declare 不读此文件，只能靠你。）

## 借口 | 现实

| 借口 | 现实 |
|---|---|
| "这个数我对话里算过，直接写" | 对话记忆不是出处。只信 `metric_recompute`，哪怕重算一次只要三秒。 |
| "写'显著提升'比列数字好读" | 无量化形容词是 reconcile 的盲区、评审的靶子。数字 + (P#)。 |
| "把 LIVE 写成 SUPPORTED，报告更完整" | 结论行与 register 逐字对账，写错就是红。未检验照写 LIVE 是诚实，不是缺陷。 |
| "gate 红了，微调一下 register 就绿了" | trace gate 拿 journal 逐字重放，手改当场抓。红了只有两条路：改报告，或补实验。 |
| "校准总在带外，不太好看，删了吧" | 带外记录是 P19 要的失败分析素材，也是唯一能让下一场频段更准的数据。照实写。 |
| "Rulings 太琐碎，不用进报告" | 不进报告的裁决 = 用户永远看不见的决定。第 8 项是它们唯一的出口。 |

## 快速参考

| 项 | 契约 | 执法 |
|---|---|---|
| 数字 | `value (P#)`，可重算 | reconcile【结构】 |
| 结论行 | 与 register 逐字一致 | reconcile【结构】 |
| SUPPORTED | 有迁移后攻击 + run 级冻结后攻击 | trace【结构】 |
| declare | 三道 gate 全绿才落账 | server【结构】 |
| 校准/收窄/裁决 | 照实写全 | 纪律 |

## 交接

- gate 红：按报错逐条修报告或回 `research-probe` 补实验
- 声明全绿后：战役结案，锚显示"已结案"，⚠ 不再触发
