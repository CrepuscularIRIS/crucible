# P6.0b Research Evaluation Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 P6.0 审计的全部后端问题，在 `5173` 真实产品路径验证 Prime 原生能力，然后才执行 benchmark eval。

**Architecture:** Research MCP 以完整性校验 journal 作为 run 的唯一预算与终局权威，meter 仅负责确定性世界计算，ledger 仅作派生展示。评测启动 fail closed 注入固定 run 与 deny 根；Prime 会话用可排空的 async dispose、可验证的证据归档和真实父子 kernel 隔离测试守住运行时语义。

**Tech Stack:** Bun 1.3、TypeScript、MCP SDK、Electron、Prime Agent SDK、Python 3、NeuronBench、Chrome。

**Spec:** `docs/superpowers/specs/2026-08-23-p6-0b-research-evaluation-boundary-design.md`

## Global Constraints

- 使用 Bun；测试命令只使用 `bun test`、`bun run typecheck`、`bun run electron:build`。
- 不读取 `.env` 或 `dash.md`，不改变共享 LiteLLM 配置，不修改 NeuronBench 源码。
- 不新增 headless runner，不新增 ResearchClawBench adapter，不恢复 Claude Agent SDK。
- 不使用 `any`；对象类型优先 `interface`；类型导入使用 `import type`。
- 每个生产行为变更先写失败测试并观察正确失败，再实施最小修复。
- 当前 dirty worktree 是权威状态；不覆盖既有修改，不自动提交混合所有权文件。
- 至少将 `packages/research-mcp` 从 `0.2.3` 升到 `0.2.4`，将 Electron 从 `0.17.61` 升到 `0.17.62`；若本轮继续修改研究 Skill，则将对应 frontmatter patch 版本加一。
- 严格串行：Tasks 1–7 后端全绿后执行 Task 8；Task 8 全绿后执行 Task 9。

---

### Task 1: journal 权威的 world 预算与一次性 forecast

**Files:**
- Modify: `packages/research-mcp/src/state.ts`
- Modify: `packages/research-mcp/src/server.ts`
- Modify: `research/eval/world-meter.py`
- Modify: `packages/research-mcp/src/world-meter.test.ts`
- Modify: `packages/research-mcp/src/server.test.ts`

**Interfaces:**
- Produces: `WorldJournalSummary { spent: number; forecastCount: number }`
- Produces: `summarizeWorldJournal(events: JournalEvent[]): WorldJournalSummary`
- Produces MCP tool: `world_forecast({ run, world, seed, counts })`
- Journal ops: `world.info | world.observe | world.simulate | world.forecast`

- [ ] **Step 1: 写预算重置与 forecast 重放失败测试**

在 `world-meter.test.ts` 增加真实 MCP 测试：预算为 1 时首次 observe 成功，删除展示 ledger 后第二次 observe 仍返回 `budget exhausted`；首次 forecast 成功，删除展示 ledger 并重建 MCP client 后第二次仍返回 `终局不可重复`。断言失败前后 journal 事件数不变。

```ts
expect(await callWorldObserve(run, 1)).toMatchObject({ cost: 1 })
rmSync(ledgerPath, { force: true })
await expect(callWorldObserve(run, 1)).rejects.toThrow('budget exhausted')
expect(readWorldOps(run)).toEqual(['world.observe'])
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `bun test packages/research-mcp/src/world-meter.test.ts`

Expected: 删除 ledger 后第二次 observe 或 forecast 成功，证明当前准入仍信任 ledger；`world_forecast` 尚未注册时对应测试以 unknown tool 失败。

- [ ] **Step 3: 扩展 world journal 类型与重放摘要**

在 `state.ts` 为四种 world op 定义明确字段，并实现只统计经过现有 hash-chain 验证事件的纯函数：

```ts
export interface WorldJournalSummary {
  spent: number
  forecastCount: number
}

export function summarizeWorldJournal(events: JournalEvent[]): WorldJournalSummary {
  return events.reduce((summary, event) => {
    if (event.op === 'world.observe') summary.spent += event.cost
    if (event.op === 'world.forecast') summary.forecastCount += 1
    return summary
  }, { spent: 0, forecastCount: 0 })
}
```

- [ ] **Step 4: 让 MCP 在调用 meter 前从 journal 准入**

`world_observe` 用 `summary.spent + reps > budget` 拒绝；`world_forecast` 用
`summary.forecastCount > 0` 拒绝。`world_simulate(mode:'info')` 追加 `world.info`；候选模式追加
`world.simulate`。meter 成功后只追加一个规范事件，ledger 写入不参与准入。

- [ ] **Step 5: 移除公开 forecast oracle 语义**

调整 `world-meter.py`，使 forecast 计算只能由 MCP 受控路径调用，并删除“换任意 ledger 即可重新裁决”的公开契约。保留 observe/simulate 的确定性计算输出；MCP 把已验证 journal 的 spent 传给 meter，仅用于返回展示字段。

- [ ] **Step 6: 运行最小测试并确认 GREEN**

Run: `bun test packages/research-mcp/src/world-meter.test.ts packages/research-mcp/src/server.test.ts`

Expected: 正常路径、删 ledger、重建 MCP、跨 run 隔离、info event key 与一次性 forecast 全部通过。

- [ ] **Step 7: 执行破坏性命令验证**

使用测试创建的临时 run，分别删除 ledger、改 ledger 内容和重启 MCP，再尝试超预算 observe 与第二次 forecast。Expected: 两者都在 meter 执行前失败；journal hash chain 和事件数不变。

---

### Task 2: fail-closed deny 注入与 truth-leak liveness

**Files:**
- Modify: `packages/research-mcp/src/sandbox.ts`
- Modify: `packages/research-mcp/src/server.ts`
- Modify: `packages/research-mcp/src/world-meter.test.ts`
- Modify: `research/eval/liveness.py`
- Create: `research/eval/test_liveness.py`
- Modify: `apps/electron/scripts/first-campaign.ts`
- Modify: `apps/electron/scripts/two-round-campaign.ts`
- Modify: `apps/electron/scripts/routing-acceptance.ts`

**Interfaces:**
- Produces: `resolveResearchDenyRoots(env: NodeJS.ProcessEnv): string[]`
- Produces liveness field: `truth_leak: { detected: boolean; matches: string[] }`

- [ ] **Step 1: 写 deny 缺失和真实 import 泄漏失败测试**

覆盖未设置、空字符串、不存在路径和未包含 NeuronBench 根四种配置；调用 world 工具必须失败。为 liveness 构造包含 `import neuronbench`、直接 meter 命令、benchmark 绝对路径读取的 session JSONL，断言 `truth_leak.detected === true`；普通 `world_observe` 工具卡保持 false。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `bun test packages/research-mcp/src/world-meter.test.ts && python3 -m unittest research/eval/test_liveness.py`

Expected: 当前 server 在 deny 缺失时仍执行；当前 liveness 不产生 `truth_leak`。

- [ ] **Step 3: 实施 fail-closed 配置验证**

解析 `PROMA_RESEARCH_DENY` 为规范绝对路径，拒绝空项和不存在项，并验证至少一个 deny 根覆盖
`NEURONBENCH_ROOT`。所有 world 工具在任何 meter spawn 前调用该验证；错误只说明配置类别，不输出真值内容。

- [ ] **Step 4: 固定脚本环境**

三个 campaign/routing 脚本的 MCP env 同时设置 `PROMA_RESEARCH_CWD`、`PROMA_RESEARCH_RUN`、
`PROMA_RESEARCH_DENY`、`NEURONBENCH_ROOT`。Agent cwd 指向 campaign project，不指向 benchmark 根。

- [ ] **Step 5: 实施 liveness 泄漏扫描**

扫描 tool input、ipython code、bash command 与 shell 输出路径，不扫描正常 MCP 返回的公开题面。
匹配 import、meter 入口和规范 benchmark 根；输出脱敏 match 类别与 session entry id。

- [ ] **Step 6: 运行测试并确认 GREEN**

Run: `bun test packages/research-mcp/src/world-meter.test.ts packages/research-mcp/src/server.test.ts && python3 -m unittest research/eval/test_liveness.py`

Expected: 配置负例全部拒绝，sandbox 读真值失败，直接 import/read/meter 全部判 leak，诚实 MCP 路径不误报。

---

### Task 3: research 权限分类与稳定 ipython 权限边界

**Files:**
- Modify: `apps/electron/src/main/lib/research-permission-policy.ts`
- Modify: `apps/electron/src/main/lib/research-permission-policy.test.ts`
- Modify: `apps/electron/src/main/lib/adapters/pi-ipython-rlm.ts`
- Modify: `apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`
- Modify: `apps/electron/src/main/lib/adapters/pi-ipython-permission.test.ts`
- Modify: `apps/electron/src/main/lib/adapters/pi-agent-adapter.ts`

**Interfaces:**
- Produces: `installSessionIpythonPermission(session, canUseTool): void`
- Mutating tools include: `world_observe`, `world_simulate`, `world_forecast`
- Read-only world tool: public problem/info retrieval only when it does not append journal

- [ ] **Step 1: 写 world 权限和 runtime rebuild 失败测试**

断言计划模式拒绝三个有副作用 world 工具。构建真实 session，安装拒绝型 ipython 权限，首次调用被拒；触发 Prime runtime rebuild 后再次调用仍被拒。真实 RLM child 不继承 parent 的同名 customTool。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `bun test apps/electron/src/main/lib/research-permission-policy.test.ts apps/electron/src/main/lib/adapters/pi-ipython-permission.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: world 工具未分类；重建 `_baseToolDefinitions` 后现有一次性 wrapper 丢失。

- [ ] **Step 3: 扩展权限集合**

将三个 world 工具加入 mutating 集；若保留追加 `world.info` 的兼容调用，也按 mutating 处理，避免“只读”名义下写 journal。

- [ ] **Step 4: 把 ipython 权限移到稳定会话执行边界**

组合 Prime Agent 的 tool-call 执行 hook：ipython 调用先走 Proma `canUseTool`，拒绝时抛出既有权限错误；其他工具继续调用 Prime 原 hook。hook 挂在 parent Agent 上，不注册同名 customTool，因此 `_buildRuntime()` 重建 Map 后仍存在，child 创建自己的 Agent/hook。

- [ ] **Step 5: 运行测试并确认 GREEN**

Run: `bun test apps/electron/src/main/lib/research-permission-policy.test.ts apps/electron/src/main/lib/adapters/pi-ipython-permission.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: 初始与 rebuild 后均拒绝；允许路径执行；child definition 与 parent 隔离；Prime 私有结构变化继续 fail loud。

---

### Task 4: 真实 RLM child kernel 隔离

**Files:**
- Modify: `apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`
- Modify: `apps/electron/scripts/rlm-runtime-e2e.ts`

**Interfaces:**
- Consumes: Prime `rlm.run`/child session publication and kernel snapshot manifest
- Produces test evidence: parent/child artifact paths and exact `savedNames`

- [ ] **Step 1: 写真实 child 隔离测试**

parent ipython 写 `parent_only_marker`，通过真实 RLM host path 生成 child，child 写
`child_only_marker`。等待 child 与 parent `disposeAsync()`，读取两个 manifest。

```ts
expect(parentManifest.savedNames).toContain('parent_only_marker')
expect(parentManifest.savedNames).not.toContain('child_only_marker')
expect(childManifest.savedNames).toContain('child_only_marker')
expect(childManifest.savedNames).not.toContain('parent_only_marker')
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `bun test apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: 现有测试没有 child artifact/manifest，新增断言失败。

- [ ] **Step 3: 补齐真实测试 harness**

复用 Prime 自己的 RLM host handler 与 fake stream model，不伪造两个 parent。等待 publication、child idle 和 async disposal；把共享 customTool 旧机制放入单独反向用例，证明该测试在污染发生时必红。

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `bun test apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: 正向隔离通过；反向 fixture 确认旧机制可被检测；无未处理 promise 或残留 kernel。

---

### Task 5: async dispose 与完整证据归档

**Files:**
- Modify: `apps/electron/scripts/first-campaign.ts`
- Modify: `apps/electron/scripts/two-round-campaign.ts`
- Modify: `apps/electron/scripts/routing-acceptance.ts`
- Modify: `apps/electron/scripts/p0-evidence.ts`
- Modify: `apps/electron/scripts/rlm-runtime-e2e.ts`
- Create: `apps/electron/scripts/research-script-lifecycle.ts`
- Create: `apps/electron/scripts/research-script-lifecycle.test.ts`

**Interfaces:**
- Produces: `disposeAndArchiveResearchSession(input: ResearchArchiveInput): Promise<void>`
- `ResearchArchiveInput` names required and optional evidence directories explicitly

- [ ] **Step 1: 写排空与归档边界失败测试**

fake session 的 `disposeAsync` 延迟写 snapshot；调用 helper 后断言 snapshot 已存在再复制。覆盖可选
session-artifacts 缺失不崩、必需 journal 缺失抛错、源目录在归档成功前不删除。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `bun test apps/electron/scripts/research-script-lifecycle.test.ts`

Expected: helper 尚不存在。

- [ ] **Step 3: 实施最小 lifecycle helper**

先 `await session.disposeAsync()`；再逐一验证 required paths；存在的 optional paths 才 `cpSync`；归档写完后返回。helper 不 sleep、不删除输入目录、不吞异常。

- [ ] **Step 4: 替换五个脚本的同步 dispose 与 sleep**

删除所有 `session.dispose()` 和为 refine 添加的固定 8 秒等待。无头脚本安装真实 deterministic permission decision：只允许预先列出的研究命令和已隔离 ipython，其他请求拒绝并记录原因。

- [ ] **Step 5: 运行测试并确认 GREEN**

Run: `bun test apps/electron/scripts/research-script-lifecycle.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: async 写入在 helper 返回前可见；五个脚本静态搜索无同步 dispose/固定 refine sleep；归档边界测试通过。

---

### Task 6: gates、F1、事件 key、版本与文档清理

**Files:**
- Modify: `research/eval/liveness.py`
- Modify: `packages/research-mcp/gates/lib.ts`
- Modify: `packages/research-mcp/gates/trace.ts`
- Modify: `packages/research-mcp/gates/reconcile.ts`
- Modify: `packages/research-mcp/gates/gates.test.ts`
- Modify: `research/README.md`
- Modify: `packages/research-mcp/src/world-meter.test.ts`
- Modify: `apps/electron/package.json`
- Modify: `packages/research-mcp/package.json`
- Modify only if behavior text changed: `docs/plans/PLAN.md`
- Modify only if acceptance text changed: `docs/plans/EVAL-PLAN.md`

**Interfaces:**
- Produces F1 fields: `journal_budget_valid`, `ledger_projection_matches`, `truth_leak`
- Exact world op set: `world.info`, `world.observe`, `world.simulate`, `world.forecast`

- [ ] **Step 1: 写 F1 与精确 key 失败测试**

构造 journal 正确但 ledger 删除、ledger 篡改、observe 超预算、info-only、simulate-only、forecast-only
fixtures。断言 ledger 删除不使预算失效，ledger 不一致单独报 projection failure，四种 op 计数精确。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `python3 -m unittest research/eval/test_liveness.py && bun test packages/research-mcp/gates/gates.test.ts packages/research-mcp/src/world-meter.test.ts`

Expected: 当前 gate 看不到 world 事件或把同 handler 双写误称独立对账；info 被计成 simulate。

- [ ] **Step 3: 实施 gate 与评分清理**

预算有效性只由 journal 决定；ledger projection 是独立诊断布尔值；truth leak 为质量 gate 的硬失败。
reconcile 不把同一 handler 的双写当独立证据，trace 不把 `world.info` 增加到 simulate counter。

- [ ] **Step 4: 更新版本与受影响说明**

设置 Electron `0.17.62`、research-mcp `0.2.4`，保持 lockfile 与 package manifest 一致。文档明确 ledger 是派生视图、forecast 只经 MCP、liveness 检测直接 truth 访问。

- [ ] **Step 5: 运行测试并确认 GREEN**

Run: `python3 -m unittest discover -s research/eval -p 'test_*.py' && bun test packages/research-mcp/src packages/research-mcp/gates/gates.test.ts apps/electron/src/main/lib/research-permission-policy.test.ts apps/electron/src/main/lib/adapters/pi-ipython-permission.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts apps/electron/scripts/research-script-lifecycle.test.ts`

Expected: Python 与 Bun 相关套件全部通过，精确 op 和版本断言通过。

---

### Task 7: P6.0b 后端总 gate 与单世界 E1 smoke

**Files:**
- Evidence output: `research/campaigns/<new-p6-0b-smoke>/`
- Inspect only: all files modified in Tasks 1–6

**Interfaces:**
- Requires Tasks 1–6 all green
- Produces liveness/gates/journal/session-artifacts evidence bundle

- [ ] **Step 1: 运行静态与类型 gate**

Run: `bun run typecheck`

Expected: exit 0，无新增 TypeScript error。

- [ ] **Step 2: 运行 Electron build gate**

Run: `bun run electron:build`

Expected: exit 0，Prime 本地依赖与 research MCP 打包成功。

- [ ] **Step 3: 重跑全部 P6 相关测试**

Run: Task 6 Step 5 的完整命令。

Expected: exit 0；保存命令输出到 smoke evidence。

- [ ] **Step 4: 执行单世界诚实路径**

使用固定 Qwen 模型、固定 world/seed/budget 和新 run，顺序必须出现：
`research_init → world.info → world_observe → prereg_write → probe_run →
claim_transition → world_forecast → report_declare`。

- [ ] **Step 5: 核验证据链**

检查 journal hash chain、预算累计、forecast 唯一、probe provenance、report terminal state、RLM child
registry、kernel manifest、refine 事件、liveness truth_leak=false 与 gates 全绿。任一缺失都返回对应后端 Task 修复，不进入 `5173`。

---

### Task 8: `5173` 真实产品可用性 gate

**Files:**
- Inspect runtime only: `http://127.0.0.1:5173/`
- Evidence output: `.playwright-mcp/` or the existing product-test evidence directory

**Interfaces:**
- Requires Task 7 complete
- Produces screenshot、session JSONL、journal、goal state、cron state 与 negative-path evidence

- [ ] **Step 1: 用 Chrome 打开真实页面并确认后端连接**

打开 `http://127.0.0.1:5173/`，确认不是静态 mock：创建新会话、选择实际 provider/model，消息产生真实 streaming/tool events。

- [ ] **Step 2: 运行研究任务并验证 Skills/MCP**

提交一个 NeuronBench 单世界任务；观察模型实际读取 research Skills 并调用 research MCP。核对 UI 工具卡与 journal op 一致，权限拒绝和 meter 错误显示为失败而非完成。

- [ ] **Step 3: 验证 kernel、RLM、compaction/refine**

跨两轮读取 parent kernel 变量；实际生成 RLM child 并核对 child artifact；触发 compaction 后继续 refine，确认 post-compaction refine 和 auto-refine 运行证据存在。

- [ ] **Step 4: 验证 Goal**

在真实会话创建 Goal，运行至少一次自动 continuation，完成 Goal；核对 UI 状态、session entry 和持久化 goal state 三者一致。

- [ ] **Step 5: 验证 cron/scheduled execution**

创建一个近时任务，等待真实触发并产生新 turn/tool event；再创建第二个任务后暂停或取消，跨过触发时间确认没有执行事件。

- [ ] **Step 6: 汇总产品 gate**

保存每项触发证据、运行时证据和破坏性反向证据。只有六步均通过才执行 Task 9。

---

### Task 9: benchmark eval

**Files:**
- Evidence output: `research/eval/results/<new-run>/`
- Inspect: NeuronBench、AutoResearchEval、ResearchClawBench task sources

**Interfaces:**
- Requires Task 8 complete
- Produces E1 paired results、E2 diagnostic judge、E3 product task evidence

- [ ] **Step 1: E1 小矩阵**

按同 Qwen、同 world、同 seed、同 budget 跑 pure-LLM A 与系统 B，先完成 2 worlds × 2 seeds。
每个 run 先过 liveness，再计算质量；保存 paired delta 与失败分类。

- [ ] **Step 2: E1 扩展矩阵**

小矩阵无 truth leak、预算绕过或生命周期缺证后，扩到 EVAL-PLAN 的 6 worlds。外部模型故障单独标记，不混入系统质量失败。

- [ ] **Step 3: E2 AutoResearchEval**

用现有 conversion shim 读取产品产物并运行 judge；judge 只写 diagnostic result，不写 accepted 或修改 research journal。

- [ ] **Step 4: E3 ResearchClawBench 任务**

抽取任务在 `5173` 真实产品中运行并验证 Prime 行为；不新增 adapter，不启动 `0.0.0.0` 服务，不声称与历史 harness 严格可比。

- [ ] **Step 5: 最终需求审计**

逐条对照 P6 audit B1–B5、M1–M10、PLAN、EVAL-PLAN 和用户目标，给每项链接到当前文件、测试输出或产品证据。证据弱、间接或缺失的项目保持未完成并继续修复。
