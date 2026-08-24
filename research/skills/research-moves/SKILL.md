---
name: research-moves
description: Use when 信念锚出现 ⚠、探针落带外被 server 拒、正要写频段却说不出宽度的推导、或打算投入改进某组件却不知它的贡献上界时。
version: 0.2.2
---

# research-moves —— 认知移动库

## 你在做什么

底座（MCP + gate）守住证据的诚实；这个库负责抬高上限——产生**值得被 gate
检验**的假设与实验。按调度表加载一张移动卡，执行，落账。

## 铁律

```
不落成 claim_propose / prereg_write / attack_record 的认知移动等于没有发生
```

**违反字面就是违反精神。** ARFT 论文（800 条轨迹）的教训：被要求"表演"的
认知动作会被照做然后无视——写下的反思若不变成状态，和没反思一样。
唯一例外：明确写出的"no change, because ——"一行，也算清账。

## 调度表——事件与计数器优先

锁死框架的 agent 注意不到自己的前提，**但它会数数**。`research_kit.anchor(run)`
每次打印 COUNTERS 与 ⚠；判断型触发只做二级确认，不做主引擎。

**事件触发（工具拒绝当场发生，不经过锚）：** 探针落在**所有**预登记频段之外、
或 `claim_transition` 被 server 拒——报错本身就是信号，**立即**打开
`references/triage.md`（强制，非建议）。

| 触发（可数，锚的 ⚠ 直接提示） | 移动卡 |
|---|---|
| 连续 ≥2 探针落地而信念未动（无 transition/propose） | `references/reframe.md` |
| 同一探针杀死 ≥2 条假设 | `references/reframe.md` |
| 无 LIVE 假设且坟场非空 | `references/reframe.md`（给 abduce 供料；坟场已够答题则直接 report） |
| 正要写频段但宽度说不出推导 | `references/derive.md` |
| 打算投入改进组件 X，却没有 X 的贡献上界 | `references/oracle.md` |

| 触发（判断型，二级确认） | 移动卡 |
|---|---|
| 所有 LIVE 假设共享一个没写下的前提 | `references/reframe.md` |
| claim 形如"X 是瓶颈 / X 承载效应" | `references/oracle.md` |
| claim 涉及多组件/多模态归因，单一总分无法定位 | `research-probe/references/experimental-tactics.md` |
| 机制类 claim 要预登记，点值频段判别力弱 | `references/derive.md`（形状承诺） |
| 问题类别不清、出现意外或需要切换 explore/exploit | `references/research-judgment.md` |
| 机制 claim 把可读位置当成因果根 | `references/root-vs-shadow.md` |

## 三条纪律

1. **triage 的每个出口都是 journal 落账**（prereg / attack_record /
   claim_propose）；拖着不分诊，server 会持续拒绝该指标上的任何终态迁移。
2. **每张卡自带边界与"何时不用"。** oracle 只授权投资决策不授权机制结论；
   derive 的推导不是证据；reframe 动到冻结预登记的语义 = 升级给人。
3. **一场战役至少预算一次刻意的 reframe 尝试**——重述胜于求解便宜、高方差、
   几乎没人做；不必等 ⚠。
4. **认知移动必须变成实验语法。** “可能是 X”至少落成 oracle/rescue、移除、
   swap、剂量或交叉干预之一；只改解释不改可观测分叉，不算移动。

## 借口 | 现实

| 借口 | 现实 |
|---|---|
| "我在对话里已经反思过了" | 不落账的反思 = ARFT F.4（82.5%：找到问题、写下来、照旧交付）。落成 propose/prereg/attack，或明确一行 no change。 |
| "⚠ 是建议，先做完手头的" | ⚠ 优先于阶段推导（research-loop 程序第 3 步）。计数器替你数的正是你注意不到的东西。 |
| "带外结果解释一下就能用" | server 拒绝迁移【结构】。triage 是强制移动，没有绕行道。 |

## 参考索引

| 卡 | 一句话 | 何时不用（详见卡内） |
|---|---|---|
| `references/triage.md` | 落带外强制分诊：伪影→bug→方差→已知→真实意外，journal 落地终结 | 带内结果（规则机械适用） |
| `references/reframe.md` | 换框架/换抽象层级/换问题类别/重述问题；D-S-R 起手 | 本周期刚做过且 no change |
| `references/oracle.md` | 特权干预三臂设计，测组件贡献上界 | 想要机制结论时 |
| `references/derive.md` | 最小参数模型→诚实频段宽度；机制类 claim 的形状承诺 | 已看过答案再倒推频段时 |
| `references/research-judgment.md` | 问题类别、severity、解释选择、异常分诊、探索/利用与停止 | 当前只是机械执行既定 prereg 时 |
| `references/root-vs-shadow.md` | 分离因果根、损伤位置、下游影子与修复杠杆 | 现象尚未建立或有更便宜直接 kill test 时 |

跨 Skill 实验库：`research-probe/references/experimental-tactics.md`——把 oracle、
root-vs-shadow 和混杂隔离组合成可预登记的高判别力实验。
