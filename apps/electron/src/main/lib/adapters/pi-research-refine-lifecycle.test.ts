import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { createResearchEpisodeStream } from './pi-research-refine-events'
import type { LintableRefineEdit } from './pi-research-refine-lint'
import {
  confirmRollback,
  handleRefineComplete,
  observeToolOutcome,
  type RefineCapableSession,
} from './pi-research-refine-lifecycle'
import { createResearchRefineRuntime, installResearchRefineToolTap } from './pi-research-refine-runtime'

const tempRoots: string[] = []
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function makeStream() {
  const stream = createResearchEpisodeStream(join(mkdtempSync(join(tmpdir(), 'rr-lifecycle-')), 'research-refine'))
  tempRoots.push(stream.eventsPath)
  return stream
}

/** 记录调用序列的假 Prime session。 */
function makeFakeSession(results: Array<{ id: string; appliedEdits: LintableRefineEdit[] }> = []): RefineCapableSession & { calls: string[] } {
  const calls: string[] = []
  let nextId = 0
  return {
    calls,
    async refine(options) {
      calls.push(JSON.stringify(options ?? {}))
      const preset = results[nextId]
      nextId += 1
      if (preset) return preset
      return { id: `auto-${nextId}`, appliedEdits: [{ id: 'e-ok', content: '程序性教训', applied: true }] }
    },
  }
}

const CLASS_ID = 'mcp§mcp-iserror§mcp__research__probe'

describe('验证与回滚（plan §5）', () => {
  it('同类复发 → 返回 rollback 动作；confirm 后 class 重开', () => {
    const stream = makeStream()
    stream.append({ type: 'refined', refinementId: 'r1', attributedClassIds: [CLASS_ID], entryIds: ['e1'] })
    const pending = observeToolOutcome(stream, {
      kind: 'residual', source: 'mcp', tool: 'mcp__research__probe', ruleId: 'mcp-iserror', messageExcerpt: 'boom',
    })
    expect(pending).toEqual([{ action: 'rollback', refinementId: 'r1', classId: CLASS_ID, seq: 2 }])
    confirmRollback(stream, 'r1')
    const state = stream.state()
    expect(state.refinements.get('r1')?.status).toBe('ROLLED_BACK')
    expect(state.refinements.get('r1')?.rolledBackReason).toBe('refuted')
    expect(state.classes.get(CLASS_ID)?.refutedRefinementIds).toContain('r1')
  })

  it('k 次干净 success → 自动 VALIDATED', () => {
    const stream = makeStream()
    stream.append({ type: 'refined', refinementId: 'r1', attributedClassIds: [CLASS_ID], entryIds: ['e1'] })
    for (let i = 0; i < 3; i += 1) {
      expect(observeToolOutcome(stream, { kind: 'success', source: 'mcp', tool: 'mcp__research__probe' })).toEqual([])
    }
    expect(stream.state().refinements.get('r1')?.status).toBe('VALIDATED')
  })
})

describe('refine_complete 结算（C3）', () => {
  it('lint 违规 → 登记待回滚 + lint_violation residual', async () => {
    const stream = makeStream()
    const outcome = await handleRefineComplete(stream, {
      refinementId: 'r1',
      attributedClassIds: [CLASS_ID],
      appliedEdits: [{ id: 'bad', content: 'H5 为真且 band [0,1]', applied: true }],
    })
    expect(outcome.status).toBe('rollback_pending')
    expect(outcome.rollback).toEqual({ refinementId: 'r1', reason: 'lint' })
    const state = stream.state()
    // refined 从未入账（违规直接回滚），不存在 PENDING 残留
    expect(state.refinements.get('r1')).toBeUndefined()
    expect(state.classes.get('lint_violation§refine-content§refine')).toBeDefined()
  })

  it('无归因 refine（refineNow 路径）→ lint 通过也不入 PENDING（审计 F3 untracked）', async () => {
    const stream = makeStream()
    const outcome = await handleRefineComplete(stream, {
      refinementId: 'manual-1',
      attributedClassIds: [],
      appliedEdits: [{ id: 'e1', content: '先 init 再 probe', applied: true }],
    })
    expect(outcome.status).toBe('untracked')
    expect(stream.state().refinements.size).toBe(0)
  })

  it('无归因 + lint 违规 → 仍回滚并记 lint_violation（显式路径不免检）', async () => {
    const stream = makeStream()
    const outcome = await handleRefineComplete(stream, {
      refinementId: 'manual-2',
      attributedClassIds: [],
      appliedEdits: [{ id: 'bad', content: 'seed 7 最优', applied: true }],
    })
    expect(outcome.status).toBe('rollback_pending')
    expect(outcome.rollback?.refinementId).toBe('manual-2')
  })

  it('lint 通过 → PENDING 入账，entryIds 记录', async () => {
    const stream = makeStream()
    const outcome = await handleRefineComplete(stream, {
      refinementId: 'r1',
      attributedClassIds: [CLASS_ID],
      appliedEdits: [{ id: 'e1', content: '先 init 再 probe', applied: true }],
    })
    expect(outcome.status).toBe('pending')
    expect(stream.state().refinements.get('r1')?.status).toBe('PENDING')
  })

  it('有归因但零实际 edit → 不产生虚假 PENDING', async () => {
    const stream = makeStream()
    const outcome = await handleRefineComplete(stream, {
      refinementId: 'r-noop',
      attributedClassIds: [CLASS_ID],
      appliedEdits: [{ id: 'e1', content: '先 init 再 probe', applied: false }],
    })
    expect(outcome.status).toBe('untracked')
    expect(stream.state().refinements.size).toBe(0)
  })
})

describe('SE3 · dispose 只暂存晋升候选，不碰 global（02 §3.6）', () => {
  function sessionWithLocalHarness(entry: Record<string, unknown> | undefined) {
    const sessionDir = join(mkdtempSync(join(tmpdir(), 'rr-stage-')), 'sess-1')
    tempRoots.push(dirname(sessionDir))
    const artifactDir = join(sessionDir, 'research-refine')
    mkdirSync(join(sessionDir, 'harness'), { recursive: true })
    const harness = { schema: 1, entries: { memory: entry ? { e1: entry } : {}, prompt: {}, skill: {}, subagent: {} }, refinements: [] }
    writeFileSync(join(sessionDir, 'harness', 'harness_state.json'), JSON.stringify(harness, null, 2))
    return artifactDir
  }
  const ENTRY = { id: 'e1', kind: 'memory', title: 'init first', content: '先 init 再 probe', path: 'general', scope: 'local', metadata: {} }

  it('带 1 条 VALIDATED 的会话 dispose → 无 global refine；暂存字节的 sha256 与 local 条目相等', async () => {
    const artifactDir = sessionWithLocalHarness(ENTRY)
    const globalFile = join(dirname(dirname(artifactDir)), 'global-harness.json')
    writeFileSync(globalFile, '{"schema":1}')
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir })
    const stream = runtime.stream!
    stream.append({ type: 'refined', refinementId: 'r1', attributedClassIds: [CLASS_ID], entryIds: ['e1'] })
    stream.append({ type: 'validated', refinementId: 'r1', evidenceSeqs: [2, 3, 4] })
    const session = makeFakeSession()
    await runtime.beforeDispose?.(session)
    expect(session.calls).toEqual([])
    expect(readFileSync(globalFile, 'utf8')).toBe('{"schema":1}')
    const staged = JSON.parse(readFileSync(join(artifactDir, 'promotion-candidates.json'), 'utf8'))
    const [candidate] = staged.candidates
    expect(candidate.refinementId).toBe('r1')
    expect(candidate.evidenceSeqs).toEqual([2, 3, 4])
    const local = JSON.stringify(ENTRY)
    expect(candidate.entries[0].bytes).toBe(local)
    expect(candidate.entries[0].sha256).toBe(createHash('sha256').update(local).digest('hex'))
  })

  it('没有 VALIDATED（PENDING 不算）→ 不写暂存文件，零是理想', async () => {
    const artifactDir = sessionWithLocalHarness(ENTRY)
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir })
    runtime.stream!.append({ type: 'refined', refinementId: 'r-pending', attributedClassIds: [CLASS_ID], entryIds: ['e1'] })
    await runtime.beforeDispose?.(makeFakeSession())
    expect(existsSync(join(artifactDir, 'promotion-candidates.json'))).toBe(false)
  })
})

describe('SE3 · 停滞不算成功（L7）', () => {
  const PROBE = 'mcp__research__probe_run'
  it('同参数连续调用只记第一次为 eligible；连续 5 次记一条 stagnation residual', () => {
    const stream = makeStream()
    stream.append({ type: 'refined', refinementId: 'r1', attributedClassIds: [`mcp§x§${PROBE}`], entryIds: ['e1'] })
    for (let i = 0; i < 5; i += 1) {
      observeToolOutcome(stream, { kind: 'success', source: 'mcp', tool: PROBE, fingerprint: '{"pid":"P1"}' })
    }
    const state = stream.state()
    expect(state.refinements.get('r1')?.status).toBe('PENDING')
    expect(state.classes.get(`mcp§stagnation§${PROBE}`)?.openResiduals).toHaveLength(1)
  })

  it('research_kit.wait 连续 6 次 → 不记 stagnation（分块 wait 是协议本身）', () => {
    const stream = makeStream()
    // 真实形状：wait 跑在 ipython 里，只经 guard 的 onAllowed 进流，不带参数指纹（L2）。
    for (let i = 0; i < 6; i += 1) {
      observeToolOutcome(stream, { kind: 'success', source: 'guard', tool: 'ipython' })
    }
    expect([...stream.state().classes.keys()]).toEqual([])
  })

  it('L3：同参数 research_state ×5，但每两次之间隔着 ipython（guard 来源）→ 不记 stagnation', () => {
    const stream = makeStream()
    for (let i = 0; i < 5; i += 1) {
      observeToolOutcome(stream, { kind: 'success', source: 'mcp', tool: 'mcp__research__research_state', fingerprint: '{"run":"r"}' })
      observeToolOutcome(stream, { kind: 'success', source: 'guard', tool: 'ipython' })
    }
    expect([...stream.state().classes.keys()]).toEqual([])
  })
})

describe('SE3 · 合成主线（答辩声称"闭环能跑"之前必须是绿的）', () => {
  const TOOL = 'mcp__research__report_declare'
  async function drive(runtime: ReturnType<typeof createResearchRefineRuntime>, calls: Array<{ error?: string; args?: unknown }>) {
    const agent: { afterToolCall?: unknown } = {}
    installResearchRefineToolTap(agent, runtime)
    const hook = agent.afterToolCall as (context: unknown) => Promise<unknown>
    for (const call of calls) {
      await hook({
        toolCall: { name: TOOL },
        args: call.args ?? {},
        isError: Boolean(call.error),
        result: { content: [{ type: 'text', text: call.error ?? 'ok' }] },
      })
    }
  }
  const MISSING = { error: '报告不存在: reports/final-report.md' }

  function makeRuntime() {
    const root = mkdtempSync(join(tmpdir(), 'rr-mainline-'))
    tempRoots.push(root)
    return createResearchRefineRuntime({ mode: 'learning', artifactDir: join(root, 'research-refine') })
  }

  it('procedural ×2 → C2 批准 → refine_complete → 3 次同类 eligible success → VALIDATED', async () => {
    const runtime = makeRuntime()
    await drive(runtime, [MISSING, MISSING])
    expect((await runtime.autoRefineReviewer!({ reason: 'turn_interval' })).shouldRefine).toBe(true)
    await runtime.onRefineComplete?.({
      id: 'r1', appliedEdits: [{ id: 'e1', kind: 'memory', content: 'report_declare cannot find the report unless the path is relative to the run dir', applied: true }],
    })
    expect(runtime.stream!.state().refinements.get('r1')?.status).toBe('PENDING')
    // 同参数重复调用（状态不变）不计成功。
    await drive(runtime, [{ args: { path: 'REPORT.md' } }, { args: { path: 'REPORT.md' } }, { args: { path: 'REPORT.md' } }])
    expect(runtime.stream!.state().refinements.get('r1')?.status).toBe('PENDING')
    await drive(runtime, [{ args: { path: 'REPORT.md', note: 'a' } }, { args: { path: 'REPORT.md', note: 'b' } }])
    expect(runtime.stream!.state().refinements.get('r1')?.status).toBe('VALIDATED')
  })

  it('VALIDATED 前同类复发 → rollbackId', async () => {
    const runtime = makeRuntime()
    await drive(runtime, [MISSING, MISSING])
    expect((await runtime.autoRefineReviewer!({ reason: 'turn_interval' })).shouldRefine).toBe(true)
    await runtime.onRefineComplete?.({
      id: 'r1', appliedEdits: [{ id: 'e1', kind: 'memory', content: 'report_declare cannot find the report unless the path is relative to the run dir', applied: true }],
    })
    await drive(runtime, [{ args: { n: 1 } }, MISSING])
    const session = makeFakeSession()
    await runtime.flushPendingRollbacks?.(session)
    expect(session.calls).toEqual(['{"rollbackId":"r1"}'])
    expect(runtime.stream!.state().refinements.get('r1')?.status).toBe('ROLLED_BACK')
  })
})
