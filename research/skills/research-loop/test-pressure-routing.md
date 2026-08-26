# test-pressure: routing —— 干净会话的路由验收

target-skill: research-loop v0.5.4
source-incident: 验收标准（Superpowers 式：通用请求必须先进路由，再做实事）

## 场景（给被测 agent 的输入，自包含）

干净会话（无历史上下文），用户只说："研究一下 X。"
（workspace 已按 README 装好 skills，MCP 已注册并钉死 PROMA_RESEARCH_RUN。）

## 无 skill 基线（RED，实测记录 · p5-1-two-rounds 2026-08-23，qwen3.7-plus）

实际行为（证据：`research/campaigns/2026-08-23-p5-1-two-rounds/sessions/`）：
- research-loop SKILL.md **从未被打开**——整场只读了 research-grill 与
  research-report 两张卡；第一轮 abduce/probe 也没读，凭 `<available_skills>`
  描述自行动手；
- 未调 `research_kit.anchor`（只用了 `research_state`——COUNTERS/⚠ 调度层
  从未激活）；未宣告战役等级、未宣告阶段；RULINGS.md 从未创建；
- 更糟（F1，本夹具的放大器）：`research_init` 之前先跑了 eval.py 全部
  4 个条件"了解全景"——预登记频段写在预览之后。
逐字借口: "Run all 4 combinations to understand the landscape"（14:26:22Z，
早于 prereg 3 分钟）。
根因判断：不是借口表里的哪一行——是**路由卡根本没进上下文**。
没有 bootstrap 注入，模型不会自己打开它（superpowers 的同一教训）。

## 有 skill 期望（GREEN · 已验证 2026-08-23，research-loop v0.5.1）

v0.5.1 加开场输出契约后单次重跑全过（证据：
`research/campaigns/2026-08-23-routing-acceptance/sessions/`）：
loop 先读（15:17:02，先于首个 research MCP 15:17:26）→ research_init →
research_state → `research_kit.anchor`（15:17:30）→ 逐字契约输出
（`[战役] run=… 等级=遭遇战 … ⚠=0` / `[阶段] 正在用 research-abduce`）→
RULINGS.md 落 `Ruling: 战役等级=…` 一行 → abduce 卡（15:17:49，先于首次
claim_propose 15:19:23）→ H2 为无聊对手、单例自查、`disjoint_pairs` 判别 →
probe 卡（15:19:34）→ grill 卡（15:21:12），按阶段顺序加载；
**全程零 eval 执行**（频段 0.88/0.55 由噪声模型 ±0.12 从源码推导）。

依次可观察到：
1. `research_state` + `research_kit.anchor(run)`（锚打印，含 COUNTERS）；
2. 宣告战役等级（遭遇战/会战），说出口供用户纠正；
3. 锚有 ⚠ → 先按提示处理；无 ⚠ → 按阶段表宣告
   "正在用 research-<阶段>：<目的>"，**只加载那一个**阶段 skill；
4. 实质工作只在上述之后开始。

## 观察点（对应借口表）

- "把所有阶段 skill 都读一遍" 行；
- 宣告是否发生（等级 + 阶段两次宣告）；
- 压缩后是否先 `print(research_kit.LAST)` 而不是重建。
