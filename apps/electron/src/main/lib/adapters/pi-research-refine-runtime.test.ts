import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import {
  classifyMcpResidual,
  createResearchRefineRuntime,
  installResearchRefineToolTap,
  REFINE_NOW_REASON,
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
    installResearchRefineToolTap(agent, runtime)
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
    await runtime.onToolOutcome?.({
      kind: 'residual', source: 'mcp', tool: 'mcp__research__probe_run', ruleId: 'missing-init', messageExcerpt: '先 init',
    })
    await runtime.onToolOutcome?.({
      kind: 'residual', source: 'mcp', tool: 'mcp__research__probe_run', ruleId: 'missing-init', messageExcerpt: '先 init',
    })
    expect((await runtime.autoRefineReviewer?.({ reason: 'turn_interval' }))?.shouldRefine).toBe(true)
    runtime.onRefineFailed?.()
    await runtime.onRefineComplete?.({
      id: 'manual-after-failure',
      appliedEdits: [{ id: 'e1', content: '先初始化再执行工具', applied: true }],
    })
    expect(runtime.stream?.state().refinements.size).toBe(0)
  })

  it('复发只登记 rollback，静默边界才调用 Prime refine', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-deferred-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    const residual: ToolOutcome = {
      kind: 'residual', source: 'mcp', tool: 'mcp__research__probe_run', ruleId: 'missing-init', messageExcerpt: '先 init',
    }
    await runtime.onToolOutcome?.(residual)
    await runtime.onToolOutcome?.(residual)
    expect((await runtime.autoRefineReviewer?.({ reason: 'turn_interval' }))?.shouldRefine).toBe(true)
    await runtime.onRefineComplete?.({
      id: 'r1',
      appliedEdits: [{ id: 'e1', content: '先初始化再执行工具', applied: true }],
    })

    const calls: string[] = []
    const session = {
      async refine(options?: { rollbackId?: string }) {
        calls.push(JSON.stringify(options ?? {}))
        return { id: 'rollback', appliedEdits: [] }
      },
    }
    await runtime.onToolOutcome?.(residual)
    expect(calls).toEqual([])

    await runtime.flushPendingRollbacks?.(session)
    expect(calls).toEqual(['{"rollbackId":"r1"}'])
    expect(runtime.stream?.state().refinements.get('r1')?.status).toBe('ROLLED_BACK')
  })

  it('SE0：run=ca_rebound-s0 时 digest 里没有 ca_rebound，且两条落进同一个类', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-world-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root, run: 'ca_rebound-s0' })
    const agent: { afterToolCall?: unknown } = {}
    installResearchRefineToolTap(agent, runtime)
    const hook = agent.afterToolCall as (context: unknown) => Promise<unknown>
    for (const text of ['ca_rebound 的协议标签 step_x 不存在', 'ca_rebound-s0 的协议标签 step_x 不存在']) {
      await hook({ toolCall: { name: 'mcp__research__probe_run' }, isError: true, result: { content: [{ type: 'text', text }] } })
    }
    const state = runtime.stream!.state()
    expect(state.classes.size).toBe(1)
    const decision = await runtime.autoRefineReviewer!({ reason: 'turn_interval' })
    expect(decision.shouldRefine).toBe(true)
    expect(decision.instructions).not.toContain('ca_rebound')
    expect(decision.rationale).not.toContain('ca_rebound')
  })

  it('SE0：本会话 world_* 调用参数里的 world 名同样剥掉', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-world-args-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root, run: 'demo' })
    const agent: { afterToolCall?: unknown } = {}
    installResearchRefineToolTap(agent, runtime)
    const hook = agent.afterToolCall as (context: unknown) => Promise<unknown>
    await hook({
      toolCall: { name: 'mcp__research__world_observe' },
      args: { run: 'demo', world: 'na_fatigue', seed: 0, protocol: 'step' },
      isError: false,
      result: { content: [{ type: 'text', text: 'ok' }] },
    })
    for (let i = 0; i < 2; i += 1) {
      await hook({
        toolCall: { name: 'mcp__research__probe_run' },
        isError: true,
        result: { content: [{ type: 'text', text: 'na_fatigue 不支持协议 ramp' }] },
      })
    }
    const decision = await runtime.autoRefineReviewer!({ reason: 'turn_interval' })
    expect(decision.shouldRefine).toBe(true)
    expect(decision.instructions).not.toContain('na_fatigue')
  })

  it('SE1：F9 scope 取自 C2 批准的触发类——点名别的工具的 edit 被回滚', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-f9-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    const residual: ToolOutcome = {
      kind: 'residual', source: 'mcp', tool: 'mcp__research__report_declare', ruleId: '报告不存在: reports/final-report.md', messageExcerpt: '报告不存在: reports/final-report.md',
    }
    await runtime.onToolOutcome?.(residual)
    await runtime.onToolOutcome?.(residual)
    expect((await runtime.autoRefineReviewer?.({ reason: 'turn_interval' }))?.shouldRefine).toBe(true)
    await runtime.onRefineComplete?.({
      id: 'r-f9',
      appliedEdits: [{ id: 'e1', kind: 'memory', content: 'bands 被拒时用 claim_propose 登记主假设的否定', applied: true }],
    })
    const calls: string[] = []
    await runtime.flushPendingRollbacks?.({
      async refine(options) { calls.push(JSON.stringify(options ?? {})); return { id: 'rb', appliedEdits: [] } },
    })
    expect(calls).toEqual(['{"rollbackId":"r-f9"}'])
    expect(runtime.stream?.state().refinements.get('r-f9')).toBeUndefined()
  })

  function recordingSession() {
    const calls: string[] = []
    return {
      calls,
      async refine(options?: { rollbackId?: string }) {
        calls.push(JSON.stringify(options ?? {}))
        return { id: 'rb', appliedEdits: [] }
      },
    }
  }

  it('SE3：没有 C2 令牌的 local refine_complete（kernel refine.run）→ 回滚，记 system residual', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-token-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    await runtime.onRefineComplete?.({
      id: 'kernel-1', scope: 'local', appliedEdits: [{ id: 'e1', kind: 'memory', content: '先 init 再 probe', applied: true }],
    })
    const session = recordingSession()
    await runtime.flushPendingRollbacks?.(session)
    expect(session.calls).toEqual(['{"rollbackId":"kernel-1"}'])
    const state = runtime.stream!.state()
    expect([...state.classes.keys()]).toEqual(['system§harness_direct_write§refine'])
    expect(state.refinements.size).toBe(0)
  })

  it('SE3：global refine_complete 一律回滚（晋升不走 refine，H3）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-global-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    await runtime.onRefineComplete?.({
      id: 'global-1', scope: 'global', appliedEdits: [{ id: 'e1', kind: 'memory', content: '先 init 再 probe', applied: true }],
    })
    const session = recordingSession()
    await runtime.flushPendingRollbacks?.(session)
    expect(session.calls).toEqual(['{"rollbackId":"global-1"}'])
    expect(runtime.stream!.state().classes.has('system§harness_direct_write§refine')).toBe(true)
  })

  /** 假会话：refine() 期间按序发出 events（refine_complete），返回最后一个；throws 时发完后抛错。 */
  function userRefineSession(emitted: Array<{ id: string; content: string }>, options: { throws?: boolean } = {}) {
    const listeners = new Set<(event: { type: string; result?: unknown }) => void>()
    const calls: string[] = []
    return {
      calls,
      subscribe(listener: (event: { type: string; result?: unknown }) => void) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      async refine(opts?: { rollbackId?: string }) {
        calls.push(JSON.stringify(opts ?? {}))
        if (opts?.rollbackId) return { id: `rb-${opts.rollbackId}`, appliedEdits: [] }
        let last = { id: 'none', appliedEdits: [] as Array<{ id: string; kind: string; content: string; applied: boolean }> }
        for (const item of emitted) {
          last = { id: item.id, appliedEdits: [{ id: `e-${item.id}`, kind: 'memory', content: item.content, applied: true }] }
          for (const listener of [...listeners]) listener({ type: 'refine_complete', result: { ...last, scope: 'local' } })
        }
        if (options.throws) throw new Error('refine failed')
        return last
      },
    }
  }

  it('SE3：refineNow（runUserRefine）不回滚，但条目永不 VALIDATED，臂为 contaminated', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-refinenow-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    runtime.markContaminated?.(REFINE_NOW_REASON)
    const session = userRefineSession([{ id: 'user-1', content: '先 init 再 probe' }])
    await runtime.runUserRefine?.(session)
    for (let i = 0; i < 4; i += 1) {
      await runtime.onToolOutcome?.({ kind: 'success', source: 'mcp', tool: 'mcp__research__probe_run' })
    }
    await runtime.flushPendingRollbacks?.(session)
    expect(session.calls).toEqual(['{}'])
    const state = runtime.stream!.state()
    expect(state.contaminated).toBe(true)
    expect([...state.refinements.values()].some((ref) => ref.status === 'VALIDATED')).toBe(false)
    // 授权只绑在那一次用户 refine 的 id 上：之后的无令牌 refine 照样回滚。
    await runtime.onRefineComplete?.({
      id: 'kernel-2', appliedEdits: [{ id: 'e2', kind: 'memory', content: '先 init 再 probe', applied: true }],
    })
    await runtime.flushPendingRollbacks?.(session)
    expect(session.calls).toEqual(['{}', '{"rollbackId":"kernel-2"}'])
  })

  it('授权按 id 绑定：用户 refine 等待期间先落定的 kernel refine.run 被回滚，用户那次保留（令牌竞争）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-race-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    runtime.markContaminated?.(REFINE_NOW_REASON)
    const session = userRefineSession([
      { id: 'kernel-in-flight', content: '先 init 再 probe' },
      { id: 'user-2', content: '先 init 再 probe' },
    ])
    await runtime.runUserRefine?.(session)
    expect(session.calls).toEqual(['{}', '{"rollbackId":"kernel-in-flight"}'])
  })

  it('M1：用户 refine 失败不留下授权——下一次无令牌 local refine 照样回滚', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-user-fail-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    runtime.markContaminated?.(REFINE_NOW_REASON)
    const session = userRefineSession([], { throws: true })
    await expect(runtime.runUserRefine!(session)).rejects.toThrow('refine failed')
    runtime.onRefineFailed?.()
    await runtime.onRefineComplete?.({
      id: 'kernel-4', appliedEdits: [{ id: 'e4', kind: 'memory', content: '先 init 再 probe', applied: true }],
    })
    await runtime.flushPendingRollbacks?.(session)
    expect(session.calls).toEqual(['{}', '{"rollbackId":"kernel-4"}'])
  })

  it('H2：触发类 scope 下，点名 research_kit.wait 的程序性条目不回滚', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-f9-kit-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    const residual: ToolOutcome = {
      kind: 'residual', source: 'mcp', tool: 'mcp__research__claim_transition', ruleId: 'child 未完成', messageExcerpt: 'child 未完成',
    }
    await runtime.onToolOutcome?.(residual)
    await runtime.onToolOutcome?.(residual)
    expect((await runtime.autoRefineReviewer?.({ reason: 'turn_interval' }))?.shouldRefine).toBe(true)
    await runtime.onRefineComplete?.({
      id: 'r-kit', appliedEdits: [{ id: 'e1', kind: 'memory', content: 'wait for children with research_kit.wait before reading out.md', applied: true }],
    })
    const session = recordingSession()
    await runtime.flushPendingRollbacks?.(session)
    expect(session.calls).toEqual([])
    expect(runtime.stream?.state().refinements.get('r-kit')?.status).toBe('PENDING')
  })

  it('SE3：harness 直写被恢复时的 markContaminated 不授权下一次 refine（只有 refineNow 授权）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rr-runtime-restore-'))
    tempRoots.push(root)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: root })
    runtime.markContaminated?.('harness_direct_write restored: create memory:x')
    await runtime.onRefineComplete?.({
      id: 'kernel-3', appliedEdits: [{ id: 'e3', kind: 'memory', content: '先 init 再 probe', applied: true }],
    })
    const session = recordingSession()
    await runtime.flushPendingRollbacks?.(session)
    expect(session.calls).toEqual(['{"rollbackId":"kernel-3"}'])
    expect(runtime.stream!.state().contaminated).toBe(true)
  })
})
