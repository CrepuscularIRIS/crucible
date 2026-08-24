# Research child 调度契约

**何时加载：** 一个阶段明显超过父会话几次工具调用，或需要独立的证据检索、
实现、机制分析、对抗审查时。默认仍由父会话完成。

## 先判断要不要拆

只有同时满足三点才委派：

1. 子任务与父会话当前动作真正独立；
2. 工作量大到 brief/report 的交接成本小于父会话直接完成；
3. 能明确落到 analyst、researcher、coder、reviewer 之一。

短查找、强顺序依赖、尚未定义清楚的任务不拆。一个 child 足够时不派多个；
实现型 child 不并行写同一工作区。child 不得再创建 child。

## 四个角色

| role | 负责 | 不负责 |
|---|---|---|
| `analyst` | THESIS / MECHANISM / FALSIFIER / MATH / EXPLORE / BRIDGE / DESIGN / AUDIT | 实现、批量检索、最终裁决 |
| `researcher` | 文献、数据、代码资产与 checkpoint 的三种措辞检索和实际可用性核验 | 排序候选、设计实验、改代码 |
| `coder` | 按冻结 SPEC 做最小实现，TDD，SMOKE → small → full | 补写规格、改研究结论 |
| `reviewer` | 只读检查设计、代码、结果与报告，给出可复现 finding | 修补被审查对象 |

四种角色都默认继承父会话当前模型。不要为了“更强”主动传 `modelId` 或 RLM
的 `model`；只有用户明确要求模型时才覆盖。

## 选择执行通道

| 情形 | 通道 |
|---|---|
| 几次工具调用即可结束，或下一步立即依赖结果 | 父会话直接做 |
| 有界、一次性、无需中途追问、无需前端可见的深推理 | Prime 原生 RLM child |
| 长耗时、多轮工具调用、用户需要看到进度，或需要显式 wait/stop/result | Proma Collaboration child |

RLM 与 Collaboration 不是双开同一个 child，也不是每阶段必调。父会话按任务形状
选择其一；没有收益就都不调。

## 五元素 brief

完整 brief 写入项目根下的文件（例如
`<项目根>/.research-handoffs/<task>-brief.md`），不要粘贴累积对话历史。委派消息只写：

1. 这项工作在当前阶段中的位置；
2. brief 的绝对路径，并声明其内容是逐字要求；
3. brief 不可能知道、但必须遵守的接口或先前裁决；
4. 父会话已经裁决的歧义；
5. report 的绝对路径和状态契约。

report 至少区分事实、推断、未验证项，并以以下状态之一结束：`DONE`、
`DONE_WITH_CONCERNS`、`NEEDS_CONTEXT`、`BLOCKED`、`OUT_OF_ROLE`。

## 两种调用的不变量

- **父会话是唯一 Research 状态写入者。** child 不调用会改变 claim、prereg、
  probe、attack、report 或 journal 的 Research MCP 工具，也不改
  `.proma-research/`。父会话读取 report 后自己裁决、落账。
- **RLM：** 先在 prompt 写死 report 绝对路径，再用 Prime 原生
  `rlm.harness.get('subagent', 'proma-research-<role>', global_=True).content` 读取
  完整角色契约，组装自包含 prompt 后调用
  `await rlm('<self-contained task>', name='research-<role>')`；省略 `model`。
  `rlm()` 返回准入句柄，不返回研究答案。后续由父会话读取 report 文件。
- **Collaboration：** `delegate_agent` 传对应 `role`，省略 `modelId`；需要结果
  时用 `wait_for_delegations` / `get_delegation_results`。完整结果仍以 report 文件
  为准，短回复只作状态通知。
- 不把父会话为某方案辩护的推理交给 reviewer；给它主张、证据、规格和产物，
  让信息不对称保持独立审查。

## 收敛

child 只提供建议、证据、代码或审查报告。父会话逐条核验后才执行
`claim_propose`、`claim_transition`、`prereg_write`、`attack_record` 或
`report_declare`。不能核验的内容标成未验证，不以“子 Agent 说了”代替证据。
