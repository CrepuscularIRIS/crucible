import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import {
  classifyMcpResidual,
  createResearchRefineRuntime,
  installResearchRefineToolTap,
  type ResearchRefineRuntime,
} from './pi-research-refine-runtime'
import type { ToolOutcome } from './pi-research-refine-lifecycle'

const tempRoots: string[] = []
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('MCP residual 分类（审计 F4）', () => {
  it('纪律性拒绝不进 residual 流（budget/带外/强制分诊/graveyard/forecast closed）', () => {
    expect(classifyMcpResidual('budget exhausted: spent=8 + reps=1 > budget=8；下一步：…')).toBeUndefined()
    expect(classifyMcpResidual('观测值 0.9 不落在任何针对 H1 的预登记分支频段内；不得事后解释 → 强制分诊：…')).toBeUndefined()
    expect(classifyMcpResidual('graveyard 非空（H1(REFUTED)），登记新假设必须带 conflicts：…')).toBeUndefined()
    expect(classifyMcpResidual('终局已裁决；world_observe 不再开放——下一步：report_declare')).toBeUndefined()
    expect(classifyMcpResidual('forecast 已裁决过一次；终局不可重复——下一步：report_declare')).toBeUndefined()
  })

  it('程序性失败按归一化首行作 ruleId（数字抹平，同类错误归并）', () => {
    const a = classifyMcpResidual('探针 P12 不存在或状态不允许执行（当前: 不存在）→ 先 prereg_write 登记探针，再 probe_run')
    const b = classifyMcpResidual('探针 P47 不存在或状态不允许执行（当前: 不存在）→ 先 prereg_write 登记探针，再 probe_run')
    expect(a?.ruleId).toBe('探针 P# 不存在或状态不允许执行（当前: 不存在）→ 先 prereg_write 登记探针，')
    expect(a?.ruleId).toBe(b?.ruleId)
  })

  it('afterToolCall 按前序 hook 覆写后的 isError/content 分类', async () => {
    const outcomes: ToolOutcome[] = []
    const runtime: ResearchRefineRuntime = {
      mode: 'learning',
      autoRefineSettings: { enabled: true },
      serializedRefine: true,
      async onToolOutcome(outcome) { outcomes.push(outcome) },
    }
    const agent: { afterToolCall?: unknown } = {
      afterToolCall: async () => ({
        isError: true,
        content: [{ type: 'text', text: '探针 P12 不存在' }],
      }),
    }
    installResearchRefineToolTap(agent, runtime, { async refine() { return { id: 'x', appliedEdits: [] } } })
    const hook = agent.afterToolCall as (context: {
      toolCall: { name: string }
      isError: boolean
      result: { content: Array<{ type: string; text: string }> }
    }) => Promise<unknown>
    await hook({
      toolCall: { name: 'mcp__research__probe_run' },
      isError: false,
      result: { content: [{ type: 'text', text: 'raw success' }] },
    })
    expect(outcomes[0]).toMatchObject({
      kind: 'residual',
      ruleId: '探针 P# 不存在',
      messageExcerpt: '探针 P12 不存在',
    })
  })

  it('refine_failed 清空 reviewer 暂存归因，后续显式 refine 不误入账', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-failed-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    const session = { async refine() { return { id: 'unused', appliedEdits: [] } } }
    await runtime.onToolOutcome?.({
      kind: 'residual', source: 'mcp', tool: 'mcp__research__probe_run', ruleId: 'missing-init', messageExcerpt: '先 init',
    }, session)
    await runtime.onToolOutcome?.({
      kind: 'residual', source: 'mcp', tool: 'mcp__research__probe_run', ruleId: 'missing-init', messageExcerpt: '先 init',
    }, session)
    expect((await runtime.autoRefineReviewer?.({ reason: 'turn_interval' }))?.shouldRefine).toBe(true)
    runtime.onRefineFailed?.()
    await runtime.onRefineComplete?.({
      id: 'manual-after-failure',
      appliedEdits: [{ id: 'e1', content: '先初始化再执行工具', applied: true }],
    }, session)
    expect(runtime.stream?.state().refinements.size).toBe(0)
  })

  it('global promotion 的 refine_complete 不重复进入 local C3 结算', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-global-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    const calls: string[] = []
    const session = {
      async refine(options?: { rollbackId?: string }) {
        calls.push(JSON.stringify(options ?? {}))
        return { id: 'unused', appliedEdits: [] }
      },
    }
    await runtime.onRefineComplete?.({
      id: 'global-1',
      scope: 'global',
      appliedEdits: [{ id: 'bad', content: 'H9 band [0,1]', applied: true }],
    }, session)
    expect(calls).toEqual([])
    expect(runtime.stream?.state().events).toEqual([])
  })
})
