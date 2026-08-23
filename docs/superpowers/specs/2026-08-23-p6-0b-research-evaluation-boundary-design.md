# P6.0b 研究评测边界修复设计

日期：2026-08-23

## 目标与顺序

本设计落实 `docs/reviews/2026-08-23-p6-0-audit.md` 的全部阻塞项和中风险项，并遵守
`docs/plans/PLAN.md` 与 `docs/plans/EVAL-PLAN.md` 的架构边界。工作严格分为三阶段：

1. 修复并验证后端研究评测边界；
2. 在 `http://127.0.0.1:5173/` 验证真实产品路径可用；
3. 后端和产品路径均通过后，才执行 NeuronBench、AutoResearchEval 与
   ResearchClawBench 任务评测。

不得以编译成功、测试文件存在或单一路径冒烟替代运行时证据。每个修复必须先有能够
复现审计问题的失败测试，再实施最小修复，并通过正常路径、主要边界和破坏性反向验证。

## 权威边界

Research MCP 是评测期唯一受认可的世界接口。Agent 可以通过 `world_simulate` 研究候选
机制，通过 `world_observe` 购买真实观测，通过 `world_forecast` 做一次终局裁决；不得
通过 `world-meter.py`、NeuronBench Python 模块或 benchmark 源文件直接取得真值。

研究 journal 是 run 的权威事件流：

- `world.info`：公开题面，成本为零；
- `world.observe`：真实观测与实际成本；
- `world.simulate`：候选机制模拟，成本为零；
- `world.forecast`：终局预测与评分，每个 run 最多一次。

`world-ledger.jsonl` 降级为派生的展示与诊断产物。预算消耗、forecast 是否已发生等准入
判断只从经过完整性校验的 journal 重放结果得出。删除、替换 ledger，改变 ledger 路径，
重启 MCP，或直接新建同名展示账本，都不能恢复预算或第二次 forecast。

`PROMA_RESEARCH_RUN` 把评测进程钉在单一 run；所有调用仍必须携带相同 run，任一不一致
都拒绝。评测启动还必须显式提供 `PROMA_RESEARCH_DENY`。变量缺失、为空、目标不存在或
未覆盖 benchmark 真值根时，world 工具 fail closed，不允许以不受隔离的方式退化运行。

## 组件与数据流

### Research MCP

`packages/research-mcp/src/server.ts` 注册三个有状态 world 工具和一个题面路径：

1. 调用前验证固定 run、meter 供给、deny 根和 journal 完整性；
2. 从 journal 计算累计 observe cost 和 forecast 次数；
3. 在预算或终局约束满足时调用确定性 meter 计算；
4. 先取得完整 meter 结果，再把一个规范化 world 事件追加到 journal；
5. 最后更新展示 ledger。展示产物写入失败必须显式报错，但不能让已经追加的权威事件
   消失，也不能通过重试重复购买观测；需要从 journal 重建展示账本。

`world_simulate(mode="info")` 继续兼容当前调用面，但记为 `world.info`，不再虚增
`world.simulate`。正式的候选模拟才记 `world.simulate`。

`world_forecast` 由 MCP 暴露，并在调用 meter 前拒绝 journal 中已有 forecast 的 run。
meter 的 forecast 计算不再作为 Agent 可反复更换 ledger 调用的公开评分 CLI。MCP 的一次性
准入和 liveness 的直接访问检测共同构成当前威胁模型；不声明同一 OS 用户下的密码学隔离。

### 隔离与泄漏检测

benchmark 真值根放在 Agent 项目工作区之外，并通过 `PROMA_RESEARCH_DENY` 注入 probe
sandbox。liveness 同时扫描会话工具调用、kernel 代码与 shell 命令，检测以下行为：

- import `neuronbench` 或直接加载其 truth/world 模块；
- 读取 `NEURONBENCH_ROOT`、benchmark 根或 meter 源路径；
- 直接执行 `world-meter.py` 或等价评分入口。

任一命中都将该 run 标为 truth leak，质量分无效。由于 Prime ipython 与用户同属本机进程，
本设计把泄漏做成可测的失败条件，不夸称 OS 级不可达。

### 会话收尾与证据归档

五个无头研究脚本都必须 `await session.disposeAsync()`。该调用负责排空 pending
auto-refine、等待 in-flight refine、关闭 kernel 并刷新最终快照；固定 sleep 不属于完成条件。

收尾完成后再归档：

- campaign/project 目录；
- sessions；
- session-artifacts，包括 harness、kernel snapshot 与 RLM child registry；
- liveness、gates、score 和命令输出。

可选目录在复制前检查是否存在；必须存在的权威证据缺失则脚本失败。归档完成前不得删除
源 campaign 目录。

### RLM 与权限

RLM 隔离测试必须真实生成一个 child，而非比较两个独立 parent。测试在 parent kernel 写入
父变量，在 child kernel 写入子变量，等待两边 disposeAsync 后读取各自 snapshot manifest：

- parent `savedNames` 含父变量、不含子变量；
- child `savedNames` 含子变量、不含父变量；
- child session/artifact 路径与 parent 分离。

反向测试重新构造旧的共享同名 `ipython` customTool，证明子变量会污染 parent，确保测试
确实能捕获原回归机制。

父会话的 ipython 权限不得依赖一次性改写 `_baseToolDefinitions`，因为 Prime 的
`_buildRuntime()` 会替换该 Map。权限检查应安装在会话级、运行时重建后仍存在且不被继承为
共享 child customTool 的执行边界。测试覆盖首次调用、runtime reload 后调用和 child 隔离。
无头验收脚本必须安装真实的确定性权限策略；不得用恒等 wrapper 冒充权限已接线。

`world_observe`、`world_simulate` 与 `world_forecast` 都属于 research mutating 工具；题面
读取可保持只读。计划模式必须拒绝会执行世界计算或追加 journal 的调用。

## 计量与 gate 定义

F1 不再称为“独立 meter 与 journal 对账”。它验证以下可证事实：

- journal 中每个 `world.observe` 的 cost、协议和结果字段完整；
- journal 累计 cost 单调且不超过预算；
- 展示 ledger 可由 journal 派生并与其一致；
- 删除或篡改展示 ledger 不影响下一次准入决定。

world 事件必须进入 gates/liveness 输入。信息泄漏断言检查真实敏感入口和 benchmark 标识，
不再用 `novel`、`I_h` 等偶然字符串作为唯一代理。事件 key 集使用精确断言，避免多记
`world.simulate` 或漏记 `world.info`/`world.forecast`。

## 错误处理

- 固定 run 不一致：拒绝并给出预期 run；
- deny 配置无效：world 工具 fail closed，并指出缺失的配置类别，不回显秘密内容；
- 预算不足：在 meter 执行前拒绝，journal 和 ledger 均不变；
- forecast 已存在：在 meter 执行前拒绝，终局事件保持唯一；
- meter 非零退出或输出不可解析：不追加成功 world 事件，保存可诊断错误；
- journal 完整性失败：污染 run，后续读写均拒绝；
- 归档证据缺失：验收脚本非零退出，不生成“通过”结论。

## 验证矩阵

### P6.0b 后端 gate

按审计顺序逐项执行：

1. `world_forecast` 正常一次成功；同 ledger、换 ledger、重启 MCP 后第二次均失败；Agent
   直接 meter 评分被 liveness 判 leak。
2. observe 在预算内成功；删除/替换 ledger、换显示路径、重启 MCP 后仍不能超预算；不同
   run 的预算互不污染。
3. 缺失/空/无效 deny 均 fail closed；probe sandbox 不能读 benchmark；kernel/bash 直接
   import 或读取 benchmark 会被 liveness 捕获。
4. 五个脚本的 refine 与 kernel snapshot 在退出前完成；删除固定 sleep 后结果仍稳定。
5. 归档完整且缺失可选目录不崩；缺失必需证据会失败。真实 RLM child 的 parent/child
   `savedNames` 隔离，旧共享工具反向测试能失败。
6. world 权限、F1、event key、真实泄漏、runtime reload 权限、版本号和相关文档全部通过。
7. 仅在 1–6 全绿后运行单世界 E1 smoke：`world_observe → probe_run →
   claim_transition → report_declare`，并核对 journal、artifact 和 liveness。

每一步先运行最小相关 Bun 测试和破坏性命令，再运行受影响包测试。后端阶段结束前运行
`bun run typecheck` 与 `bun run electron:build`。

### 5173 产品 gate

后端通过后，使用 Chrome 操作真实页面，创建干净会话并验证：

- Research Skills 在系统提示/技能目录可见且由模型实际调用；
- research MCP 工具卡和 journal 事件与 UI 行为一致；
- ipython kernel 跨轮持久化，RLM child 实际生成且状态隔离；
- Goal 能创建、继续、完成，并留下持久化状态；
- compaction、post-compaction refine 和 auto-refine 在运行证据中可见；
- 创建近时 cron/scheduled execution 后真实触发；暂停或取消的任务不会触发；
- 权限拒绝、加载态、错误态不会把失败显示成完成。

只有上述路径在 `5173` 可用，才进入 eval。

### Eval gate

- NeuronBench：按 EVAL-PLAN 的同模型、同 world/seed/budget 配对设计，先做 2 worlds ×
  2 seeds，再扩到 6 worlds；先完成单世界 liveness smoke。
- AutoResearchEval：通过转换 shim 运行 judge，只作为诊断证据，不写 accepted 状态。
- ResearchClawBench：抽取任务做真实产品行为测试；没有批准 adapter 前只作历史比较，不声称
  新旧结果严格可比，也不启动绑定 `0.0.0.0` 的服务。

eval 结果必须同时包含触发证据、运行时证据和破坏性反向证据。模型服务、凭据或预算不可用
时，保留后端与产品 gate 的已验证结果，并准确报告外部阻塞，不伪造质量结论。

## 版本与变更边界

本轮至少递增 `packages/research-mcp/package.json` 和 `apps/electron/package.json` 的 patch
版本。若修改任一默认/研究 Skill，按仓库规则同步递增其 `SKILL.md` frontmatter patch 版本。
不修改 NeuronBench 源码，不新增 headless runner，不恢复 Claude SDK，不读取 `.env` 或
`dash.md`，不改变共享 LiteLLM 配置，不删除 ClawUI。
