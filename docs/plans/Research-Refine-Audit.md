结论：这份 plan 已经正确结合了 Prime 原生 refine 和 MCP 边界，但还没有充分结合 Research Skills，而且有几个当前代码接线点遗漏。建议先修订 plan，再实现；不要原样开工。

## 接线审计

| 层 | 结论 | 说明 |
|---|---|---|
| Prime Native | 基本对齐 | `autoRefineReviewer`、`serializedRefine`、local/global、`rollbackId`、`refine_complete/failed` 都是真实公开能力 |
| Research MCP | 边界正确 | journal/register 不改、只读信号源是正确的；但拒绝事件不进 journal |
| Research Skills | 对齐不足 | plan 明确七个 Skills 完全不动，因此模型看不到 policy residual，也没有 Fable 的主动 dispatch 路径 |
| Proma UI adapter | 有可用接缝 | resident session、refine badge、session event subscriber 都存在 |
| 无头 campaign | 目前漏接 | campaign 脚本直接创建 Prime session，绕过 `PiAgentAdapter` |
| 归档生命周期 | 顺序不满足 | 当前先 `disposeAsync()`，C5 已经无法在 dispose 前 promotion |

Prime 原生 API 假设都成立：

- [`AutoRefineReviewer` 和 `serializedRefine`](/home/lingxufeng/oss/prime-agent/packages/coding-agent/src/core/agent-session.ts:488)
- [`session.refine({instructions, rollbackId, global})`](/home/lingxufeng/oss/prime-agent/packages/coding-agent/src/core/agent-session.ts:7671)
- [`refine_complete/refine_failed`](/home/lingxufeng/oss/prime-agent/packages/coding-agent/src/core/agent-session.ts:388)

所以不需要修改 Prime 源码。

## 实现前必须修改 plan 的五点

### 1. 一次失败直接学习

当前 §6.1 默认同类失败出现两次，且保留 Prime 默认 turn interval。应改为：

```text
learning mode:
  autoRefine.enabled = true
  autoRefine.turnInterval = 1
  autoRefine.cooldownMs = 0
  residual threshold = 1
```

每轮结束 reviewer 检查：

- 没有 residual：decline；
- 一个可信 residual：立即 local refine。

### 2. C1 必须记录成功动作

现在 C1 只记录 residual，却用“k 次 eligible action 没复发”验证 patch，数据不足。

把 C1 从 `Residual Stream` 改成 `Research Episode Stream`：

```ts
type ResearchRefineEvent =
  | { type: 'attempt'; source: string; tool: string; ruleId?: string }
  | { type: 'success'; source: string; tool: string }
  | { type: 'residual'; source: string; tool: string; ruleId: string }
  | { type: 'refined'; refinementId: string; failureClass: string }
  | { type: 'validated'; refinementId: string }
  | { type: 'rolled_back'; refinementId: string }
  | { type: 'promoted'; refinementId: string }
```

默认：

```text
k = 1 个明确的同类 success
```

不能用沉默作为成功证据。

### 3. 一类失败对应一次 refinement

Prime rollback 单位是整个 refinement。因此 reviewer 每次 digest 只能包含一个 failure class。

否则一个 patch 同时修三个问题，其中一个复发时会把另外两个有效修改一起回滚。

### 4. Global promotion 的表述要诚实

`refine({global:true})` 会再次调用模型，它不是 local entry 的原子复制。

所以 C5 应描述为：

```text
validated local entry
→ global re-proposal
→ diff 与 manifest 等价则保留
→ 不等价则 await rollback
```

不是“机械复制”。

### 5. plan 需要允许三个 Skill 的薄接线

如果完全不改 Skills，它是 Prime 自动补错系统，不是 Fable 的双路径结构。

建议修改约束 0.1.3：

> 七个 Research Skills 不重新设计；只允许 research-loop、research-moves、research-kit 增加 policy residual 的观察与 dispatch 接线。

ABDUCE delayed credit 仍可留在后续阶段。

## 按文件实施教程

### 第 0 步：先处理当前未完成实验改动

当前工作区已经存在三处未提交的早期实验：

- [pi-agent-adapter.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-agent-adapter.ts:149)：临时关闭 Research auto-refine。
- [research_kit/__init__.py](/home/lingxufeng/crucible/research/skills/research-kit/src/research_kit/__init__.py:465)：阶段化 `refinement_packet`。
- [research-kit.test.ts](/home/lingxufeng/crucible/packages/research-mcp/src/research-kit.test.ts:233)：对应的 RED 测试。

它们不是当前 plan 的完整实现。开工前应选择：

- `resolvePiAutoRefineOverride` 保留函数名，但改成 mode-aware 配置；
- `refinement_packet` 不再按 ABDUCE/PROBE 阶段 refine，改造成 policy residual digest；
- 对应测试重写，不要让两套设计并存。

### 第 1 步：定义 Research refine mode

建议新增：

[pi-research-refine-types.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-research-refine-types.ts)

概念接口：

```ts
export type ResearchRefineMode = 'off' | 'frozen' | 'learning'

export interface ResearchRefineConfig {
  mode: ResearchRefineMode
  artifactDir: string
  run?: string
}

export interface ResearchRefineFailureClass {
  source: 'guard' | 'mcp' | 'gate' | 'reconcile' | 'user' | 'lint'
  tool: string
  ruleId: string
}
```

同时扩展 `PiAgentQueryOptions`：

```ts
researchRefine?: ResearchRefineConfig
```

不要只用 `Boolean(researchIsolation)`，因为 eval 需要 `off/frozen/learning` 三个 arm。

`researchRefine.mode` 也要进入 residency key，否则同一 resident session 切换实验臂时可能复用错误配置。

### 第 2 步：实现单一 Episode Stream

新增：

[pi-research-refine-events.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-research-refine-events.ts)

职责：

- 单写者；
- JSONL append；
- 生成递增 event id；
- 按 `source × ruleId × tool` 生成 failure class；
- 从事件重放 OPEN/PATCHED/VALIDATED/ROLLED_BACK/PROMOTED；
- 一个 JSONL 同时替代 plan 的 C1 和 C4。

核心测试：

- success 会成为验证分母；
- residual 不会被 success 覆盖删除；
- 同一 failure class 可稳定重放；
- 不写 `.proma-research/`；
- 坏 JSONL 行 fail closed 或明确跳过，策略要固定。

存储建议：

```text
session-artifacts/<sdkSessionId>/research-refine/events.jsonl
```

这样 Prime harness 与 refine evidence 一起归档。

### 第 3 步：收集真实 residual

优先在统一的 tool outcome seam 收集，不要逐个修改七个 Skills。

#### 3.1 Permission/guard denial

扩展：

[pi-research-isolation-extension.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-research-isolation-extension.ts:13)

让工厂接受可选 observer：

```ts
createResearchIsolationExtension(config, {
  onDenied(toolName, reason) { ... }
})
```

分类逻辑仍留在 isolation guard，observer 只旁路记录。

#### 3.2 MCP rejection

当前 MCP 结果转换在：

[pi-mcp-tools.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-mcp-tools.ts:190)

MCP rejection 不会进入 research journal，所以 plan 的 open question 应直接裁决为：

```text
从 tool-result path 捕获
```

第一版可使用：

```text
serverName + originalToolName + normalized error prefix
```

作为 `ruleId`。更稳妥的后续方案是让 MCP error transport 带稳定 code，但不必改变 belief state 或 journal schema。

#### 3.3 成功动作

同一个 tap 必须记录 attempt/success，否则无法验证 patch。

只记录 Research 相关工具：

```text
mcp__research__*
mcp__research_world__*
ipython/bash 的 research isolation denial
report/gate lifecycle
```

不要把所有普通聊天工具都写入 refine stream。

### 第 4 步：实现 reviewer

新增：

[pi-research-refine-reviewer.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-research-refine-reviewer.ts)

它实现 Prime 的 `AutoRefineReviewer`：

```ts
async function review(): Promise<AutoRefineReview> {
  const openClass = nextOpenFailureClass()
  if (!openClass) {
    return { shouldRefine: false, rationale: '没有未处理 residual' }
  }

  return {
    shouldRefine: true,
    rationale: `处理 ${openClass.id}`,
    instructions: buildSanitizedDigest(openClass),
  }
}
```

要求：

- 一次只处理一个 class；
- threshold=1；
- digest 不含 claim、metric、band、run、benchmark path；
- 默认 local；
- residual 已有 active patch 时 decline；
- 每 run 最多三次 residual refine。

### 第 5 步：把 reviewer 接进 UI resident session

修改：

[pi-agent-adapter.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-agent-adapter.ts:2000)

Settings：

```ts
autoRefine: mode === 'learning'
  ? { enabled: true, turnInterval: 1, compact: true, cooldownMs: 0 }
  : { enabled: false }
```

Session creation：

```ts
sdk.createAgentSession({
  ...
  autoRefineReviewer: mode === 'learning' ? reviewer : undefined,
  serializedRefine: mode === 'learning',
})
```

`frozen` 模式：

- 加载冻结 global Harness；
- reviewer 永远 decline；
- 不允许手动 refine 污染实验臂。

当前 event subscriber 在：

[pi-agent-adapter.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-agent-adapter.ts:1579)

增加：

```ts
case 'refine_complete':
case 'refine_failed':
```

将 lifecycle 写进 Episode Stream。

### 第 6 步：实现 Refine Firewall

新增：

[pi-research-refine-lint.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-research-refine-lint.ts)

检查 `RefinementResult.appliedEdits`：

- 禁止 claim id、run name、metric/band/result；
- 禁止 benchmark/world/meter path；
- 禁止修改 gate、MCP、permission、guard、reviewer/lint；
- 允许 tool name、稳定 ruleId、一般性程序规则。

若失败：

```ts
const rollback = await session.refine({ rollbackId: result.id })
```

注意：`session.subscribe` 不会等待异步 rollback。第一版应至少：

- Research session 使用 `serializedRefine:true`；
- 设置 `firewallPending`；
- 后续 promotion/归档必须等待 firewall operation 排空；
- 测试污染条目不会进入 global。

### 第 7 步：验证、回滚与 promotion

新增：

[pi-research-refine-lifecycle.ts](/home/lingxufeng/crucible/apps/electron/src/main/lib/adapters/pi-research-refine-lifecycle.ts)

规则：

```text
PATCHED + 下一次同类 success
→ VALIDATED

PATCHED + 同类 residual
→ await rollbackId
→ ROLLED_BACK
→ class 重新 OPEN
```

C5：

```ts
async promoteValidated(session) {
  const result = await session.refine({
    global: true,
    instructions: promotionManifest,
  })

  if (!manifestEquivalent(result.appliedEdits)) {
    await session.refine({ rollbackId: result.id })
    return
  }

  append PROMOTED
}
```

### 第 8 步：修正 campaign dispose 顺序

当前：

[research-script-lifecycle.ts](/home/lingxufeng/crucible/apps/electron/scripts/research-script-lifecycle.ts:142)

一进入函数就在第 145 行执行：

```ts
await input.session.disposeAsync()
```

但 C5 必须在 dispose 前运行。

修改接口：

```ts
interface DisposeAndArchiveInput {
  session: ResearchDisposableSession
  beforeDispose?: () => Promise<void>
  archiveDir: string
  entries: ResearchArchiveEntry[]
}
```

顺序：

```ts
await input.beforeDispose?.()
await input.session.disposeAsync()
archive...
```

归档增加：

```text
session-artifacts/.../research-refine/events.jsonl
local harness_state.json
global snapshot
refinements.jsonl
promotion manifest/result
```

并在 [research-script-lifecycle.test.ts](/home/lingxufeng/crucible/apps/electron/scripts/research-script-lifecycle.test.ts:1) 验证：

- promotion 在 dispose 前；
- promotion/rollback 未排空时不归档；
- 归档失败不会删除 live evidence。

### 第 9 步：别漏掉无头脚本

这是当前 plan 最大的代码接线遗漏。

这些脚本直接调用 Prime session services，不经过 `PiAgentAdapter`：

- [first-campaign.ts](/home/lingxufeng/crucible/apps/electron/scripts/first-campaign.ts:110)
- [two-round-campaign.ts](/home/lingxufeng/crucible/apps/electron/scripts/two-round-campaign.ts:110)
- [p0-evidence.ts](/home/lingxufeng/crucible/apps/electron/scripts/p0-evidence.ts:63)
- [routing-acceptance.ts](/home/lingxufeng/crucible/apps/electron/scripts/routing-acceptance.ts:100)

不要在每个脚本复制 reviewer 配置。新增共享 helper：

```ts
createResearchRefineRuntime({
  mode,
  sessionManager,
  artifactRoot,
})
```

返回：

```ts
{
  settings,
  autoRefineReviewer,
  serializedRefine,
  onToolOutcome,
  beforeDispose,
  archiveEntries,
}
```

UI adapter 和 campaign scripts 都使用它。

历史 evidence 脚本可以继续 `mode='off'`；E-refine runner 显式选择 `off/frozen/learning`。

### 第 10 步：与 Research Skills 做薄接线

为了符合 Fable，不重做七个 Skills，只改三个。

#### `research-kit`

把当前阶段化 `refinement_packet()` 改成读取 policy residual stream：

```python
research_kit.policy_residuals()
research_kit.refinement_digest(failure_class)
```

`anchor()` 增加：

```text
POLICY RESIDUALS: open=1 patched=0
⚠ 策略残差待处理 → research-moves/refine
```

#### `research-moves`

新增参考卡：

```text
references/refine.md
```

职责：

- 读取 residual digest；
- 调用 `await refine.run(..., global_=False)`；
- 禁止科学事实进入 Harness；
- 成功条件是 Prime 返回 scheduled，而不是模型声称“已学习”。

#### `research-loop`

在现有“⚠ 优先”规则里加入：

```text
policy residual ⚠
→ 先执行 refine move
→ 再推导 ABDUCE/PROBE/GRILL/REPORT
```

C2 reviewer仍作为模型遗漏这条主动路径时的 backstop。

修改这些 Skills 时按项目规则递增对应 version。

## 测试顺序

先跑最小单测：

```bash
bun test apps/electron/src/main/lib/adapters/pi-research-refine-events.test.ts
bun test apps/electron/src/main/lib/adapters/pi-research-refine-reviewer.test.ts
bun test apps/electron/src/main/lib/adapters/pi-research-refine-lint.test.ts
bun test apps/electron/src/main/lib/adapters/pi-research-refine-lifecycle.test.ts
bun test apps/electron/scripts/research-script-lifecycle.test.ts
bun test packages/research-mcp/src/research-kit.test.ts
```

再验证适配层：

```bash
bun test apps/electron/src/main/lib/adapters/pi-agent-auto-refine.test.ts
bun test apps/electron/src/main/lib/adapters/pi-mcp-tools.test.ts
bun run typecheck
bun run electron:build
```

最后做 E-refine 三臂，不先跑全量：

```text
off
Prime native periodic
Research learning
```

每个 arm 冻结初始 Harness，归档 Episode Stream 和 refinement history。

## 最终建议

不要直接照当前 plan 实现。先把文档修订为以下明确决策：

```text
threshold=1
turnInterval=1
k=1 explicit success
one class=one refinement
C1 同时记录 attempt/success/residual
C4 从统一事件流重放，不单独建第二份事实源
三个 Skills 做薄接线
UI adapter 与 headless scripts 共用 runtime helper
C5 明确在 dispose 前执行
```

修订后，这套方案就真正同时结合了：

- Fable 的 proposal/authority 分离；
- Research Skills 的注意、理解和主动 dispatch；
- MCP 的权威 belief state；
- Prime 原生 local/global/refine/rollback；
- Proma 的 resident session、隔离和归档生命周期。

当前我只做了审计，没有修改任何文件。