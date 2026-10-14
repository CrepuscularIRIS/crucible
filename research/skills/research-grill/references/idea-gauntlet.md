# Idea gauntlet——在花大成本前分离攻击与修订

**何时加载：** 候选已能写成 proposition，但还没进入昂贵实验；需要检查贡献、
近邻覆盖、证据设计，或一个审查者同时批评又替自己修补时。

审查的目标不是投票，而是产生**不同失效轴**。提案、攻击和修订必须分开：同一上下文
一边发明 objection 一边回答它，会只留下自己会回答的 objection。

## 冻结 proposition packet

所有盲审收到同一包，不附父会话的偏好或辩护：

```text
THESIS: 一句话，数字变化之外什么变为真
CLAIMS: phenomenon / mechanism / intervention / generality（空位照实为空）
EVIDENCE PLAN: 每条 claim 的实验、metric、阈值、控制和 scope
NOVELTY DELTA: 相对最近近邻具体多了什么
GRAVEYARD: 已排除的方向及死因
```

## 三个互盲攻击面

可以由父会话顺序完成，也可以按 delegation 规则各交给独立 reviewer/researcher；
不要为了形式强制开三个 child。真正分离的是输入与任务，不是进程数量。

### A. Contribution skeptic

只问 insight 还是 delta、claim 是否超过 evidence、是否有更平凡解释。输出最强拒绝句
和 1–3 个能改变 verdict 的具体要求。禁止列优点、平衡和修稿建议。

### B. Prior-art hunter

按 phenomenon、mechanism、evaluation、intervention 四轴分别找异名近邻，返回准确题名/
定位、重叠部分和查询词。任何命中只是 lead，必须由 researcher 通过来源核验；miss
写 `not_found_under_queries`，不能写“新颖”。（这四轴用于攻击已登记的 claim；登记前的
撞车门 `research-scoop` 用 problem framing / mechanism / insight / domain 四轴打 Level。）

### C. Methods skeptic

逐实验审 severity、construct validity、最大混杂、最缺负控制和静默 protocol 前提。
高收益输出是可独立检验的 silent assumptions，而不是泛化的“样本可能不足”。

每个角色使用明确 contract：ROLE、OBJECTIVE、CRITERIA、OUTPUT、OUT OF SCOPE。
`OUT OF SCOPE` 用来阻止默认 helpfulness 把攻击软化。

## Reformulator：只在攻击完成后看全量材料

单独的新上下文读取 proposition + 三组原始 finding，区分：

- fatal to claim：收窄/重写 statement 可修；
- fatal to idea：任何诚实改写都绕不过；
- surviving version：证据实际能支持的最小强 claim；
- one defusing experiment：最便宜消解最强 objection 的实验。

Reformulator 不能静默改 falsifier。claim 语义变化后，旧 predicts/bands 作废，回到
ABDUCE/PROBE 重写并重新 prereg。

## 执行过的 finding 优先于流利反驳

若 coherence dry-run 已用具体微型实例证明 `equivalent_to_naive`、未定义数据流或数值
不可能，审查者必须逐条 disposition：

- `upheld`：承认并路由 revise/abandon；
- `refuted`：只能指出形式化与原文不符、算术错误或实例违反规格之一。

“我重新推理后觉得可以”不是 refutation。对 `refuted` 的 load-bearing finding 做一次
独立、限定范围的 recheck；对 `upheld` 不需要重复确认。

## 清账

- rewrite/scope/demote/new_h/constraint 按原文进入 `attack_record`；
- 静默前提需要成为新 claim 或下个 prereg 的显式前提/控制；
- 近邻命中先核验再 scope；
- 驳回的攻击写 `no change, because <可核验理由>`；
- 只有测量能终结 claim，gauntlet 不能直接 kill。

### 多个 reviewer 的确定性合并

移植自 RC `skills/research-companion/SKILL.md:103-110,148-153`。先合并，再落账；
不按印象概括。只有一个模型可用：同模型多席一致只说明采样稳定，不是独立确认
（RS `evaluation/idea_quality/SKILL.md:69-72`），落账时写明席数与“同模型”。

1. **裁决看一致**：所有判断席对同一 claim 的处置（rewrite/scope/demote/no change）
   一致才采用；分歧 → 取 `scope`/`rewrite` 这一档并标 `panel split`，不由多数或
   额外一席打破平局。
2. **红旗取并集，但须带证据**：任一席的红旗都进清账，前提是附上它引用的来源
   定位或执行 finding；无出处的红旗降为黄旗，只进待核验清单，不能驱动 demote。
3. **绿旗须一致**：“可以推进”要所有判断席同意；单席不能放行。B Prior-art hunter
   相当于 RC 的召回席：有发现权，无裁决权。
4. **分歧即调查项**：席位在近邻覆盖、时机或某条事实上分歧，不取平均；各自带证据
   并列，交 researcher 核验或写成待人裁决的 ruling。
5. **One question**：各席给出的下一个可检验问题一致则原文采用；否则选最可检验的
   一条，注明分歧。查询词与近邻 lead 取并集去重。

一次 gauntlet 后若没有新实验或新证据，不重复同一组意见。下一轮应发生在结果改变之后。
