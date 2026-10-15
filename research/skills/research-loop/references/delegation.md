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

完整 brief 写入文件，不要粘贴累积对话历史：RLM 写进作业目录的 `brief.md`（见下文
"RLM 作业"），Collaboration 写到项目根下（例如
`<项目根>/.research-handoffs/<task>-brief.md`）。委派消息只写：

1. 这项工作在当前阶段中的位置；
2. brief 的绝对路径，并声明其内容是逐字要求；
3. brief 不可能知道、但必须遵守的接口或先前裁决；
4. 父会话已经裁决的歧义；
5. report 的绝对路径和状态契约。

report 至少区分事实、推断、未验证项。状态词按通道分：

- **RLM child**：只用 `ok` / `blocked` / `failed`，写在下文的 STATUS 行里（`wait` /
  `collect` 不认别的词）。做完（含带疑虑，疑虑写进 SUMMARY）→ `ok`；缺上下文、受阻、
  超出角色 → `blocked`；做不完 → `failed`。父会话用 `new_job` / `wait` / `field` 走这套。
- **Collaboration child**：以 `DONE`、`DONE_WITH_CONCERNS`、`NEEDS_CONTEXT`、`BLOCKED`、
  `OUT_OF_ROLE` 之一结束。

## RLM 作业：目录 · STATUS · 等待

```python
job, name = research_kit.new_job(run, "<step>", "<target>")  # <cwd>/.rlm-jobs/<run>/<step>/<target>/<nonce4>/
# 写 job/"brief.md"（角色契约 + 任务 + 输入清单 + 输出 schema），然后：
await rlm(f"读 {job}/brief.md 并逐字执行；写 {job}/out.md，末行写 STATUS 行；"
          "你的最后一条消息首行逐字重复这条 STATUS 行", name=name)
results = await research_kit.wait([job, ...], timeout_s=1200)  # 同一 turn 内阻塞等全部
research_kit.field(job, "verdict")                             # 按字段取，不整份读进来
```

- **作业目录在 `.proma-research/` 之外**：`<cwd>/.rlm-jobs/<run>/…`（cwd = 研究工作目录）。
  研究隔离守卫拦一切写 `.proma-research/` 的 ipython，所以 child 写 out.md、父会话写
  `-self/out.md` 都只能在这里（父会话的 REPORT.md、lessons.md 同理写在 `<cwd>/research-work/<run>/`）。`run` 传 run 名（如 `"r1"`）：同一 cell 里出现含
  `.proma-research` 的字面路径，守卫会把由它算出的 `job` 也视为状态路径，写 brief.md 被拦。
- **STATUS 行（唯一写法）**：`STATUS: <ok|blocked|failed>[ SELF_REVIEWED] PATH: <相对作业根的路径>`，
  作业根 = 含 `.rlm-jobs/` 的工作目录，所以 PATH 以 `.rlm-jobs/` 开头，
  例 `STATUS: ok PATH: .rlm-jobs/r1/certify/C2/7f3a/out.md`。它是 out.md 的**最后一行**
  （`wait` / `collect` 只认这一行），也是 child 最后一条消息的**第一行**（完成通知只预览
  最后一条消息的前 160 字符）。out.md 第一节是 SUMMARY。
- **名字带 nonce**：用 `new_job` 给的 `name`。固定名（如 `research-reviewer`）第二次
  spawn 必抛错——已完成的 child 仍占着名字。
- **等待 = 一个阻塞 cell**：一次扇出只调一次 `wait`，不要结束 turn 去等通知，也不要
  短间隔轮询。完成通知只是早唤醒；PATH 已回收的通知直接忽略。
- **超时 / 失败**：结果里 `status == "timeout"`（`wait` 已删掉该 child）或 `"failed"`
  （child 已结束却没写 STATUS），都已记进 `<cwd>/.rlm-jobs/<run>/failures.jsonl`。换一个新
  `new_job` 收窄 brief 重派一次；仍失败就父会话自己做，
  写到 `<job>-self/out.md`，末行 `STATUS: ok SELF_REVIEWED PATH: …`——它被接受，但结论
  只按降级（`lead`）使用，RULING 标 `self-reviewed`。
- **第二轮 = 新作业目录**，把上一轮 out.md 列为输入；不续聊旧 child。
- **Python 只在 ipython 跑**：brief 写明"读写与计算只用 ipython；Bash 里不跑 python、不接管道（隔离守卫会拒）"——
  守卫拒绝 Bash 里的任何解释器调用（含只读脚本），child 被拒后反复换写法，是交付 run 三个零产出超时的可能来源。
- **仿真输出**：brief 要求 child 仿真时，它的第二个合法输出是
  `research-work/<run>/sim/<nonce>-<id>.json`，out.md 只列这些路径。

## 两种调用的不变量

- **父会话是唯一 Research 状态写入者。** child 不调用会改变 claim、prereg、
  probe、attack、report 或 journal 的 Research MCP 工具，也不改
  `.proma-research/`（作业目录 `.rlm-jobs/` 在它之外，out.md 照写）。父会话读取 report 后自己裁决、落账。
- **RLM：** 读路由块给出的 `research-roles/proma-research-<role>.md`（宿主受管的角色契约，
  绝对路径在每回合的路由块里），连同任务写进作业目录的 `brief.md`，按上文"RLM 作业"spawn（`name` 用
  `new_job` 给的 nonce 名）；省略 `model`。
  `rlm()` 返回准入句柄，不返回研究答案。同一 turn 内 `wait`，再从 out.md 读结果。
- **Collaboration：** `delegate_agent` 传对应 `role`，省略 `modelId`；需要结果
  时用 `wait_for_delegations` / `get_delegation_results`。完整结果仍以 report 文件
  为准，短回复只作状态通知。
- 不把父会话为某方案辩护的推理交给 reviewer；给它主张、证据、规格和产物，
  让信息不对称保持独立审查。

## 收敛

child 只提供建议、证据、代码或审查报告。父会话逐条核验后才执行
`claim_propose`、`claim_transition`、`prereg_write`、`attack_record` 或
`report_declare`。不能核验的内容标成未验证，不以“子 Agent 说了”代替证据。
