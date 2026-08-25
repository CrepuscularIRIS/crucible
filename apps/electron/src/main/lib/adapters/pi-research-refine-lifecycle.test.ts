import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { createResearchEpisodeStream } from './pi-research-refine-events'
import type { LintableRefineEdit } from './pi-research-refine-lint'
import {
  confirmRollback,
  handleRefineComplete,
  observeToolOutcome,
  promoteValidated,
  type RefineCapableSession,
} from './pi-research-refine-lifecycle'

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
  it('lint 违规 → native 回滚 + lint_violation residual', async () => {
    const stream = makeStream()
    const session = makeFakeSession()
    const outcome = await handleRefineComplete(stream, session, {
      refinementId: 'r1',
      attributedClassIds: [CLASS_ID],
      appliedEdits: [{ id: 'bad', content: 'H5 为真且 band [0,1]', applied: true }],
    })
    expect(outcome.status).toBe('rolled_back')
    expect(session.calls[0]).toContain('"rollbackId":"r1"')
    const state = stream.state()
    // refined 从未入账（违规直接回滚），不存在 PENDING 残留
    expect(state.refinements.get('r1')).toBeUndefined()
    expect(state.classes.get('lint_violation§refine-content§refine')).toBeDefined()
  })

  it('lint 通过 → PENDING 入账，entryIds 记录', async () => {
    const stream = makeStream()
    const session = makeFakeSession()
    const outcome = await handleRefineComplete(stream, session, {
      refinementId: 'r1',
      attributedClassIds: [CLASS_ID],
      appliedEdits: [{ id: 'e1', content: '先 init 再 probe', applied: true }],
    })
    expect(outcome.status).toBe('pending')
    expect(stream.state().refinements.get('r1')?.status).toBe('PENDING')
  })
})

describe('promotion（C5）', () => {
  async function validatedStream(stream: ReturnType<typeof makeStream>) {
    stream.append({ type: 'refined', refinementId: 'r1', attributedClassIds: [CLASS_ID], entryIds: ['e1'] })
    stream.append({ type: 'validated', refinementId: 'r1', evidenceSeqs: [2, 3, 4] })
  }

  it('无 VALIDATED 时 zero-refine 收尾（零是理想）', async () => {
    const stream = makeStream()
    const session = makeFakeSession()
    expect(await promoteValidated(stream, session)).toEqual({ promoted: [], rolledBack: [] })
    expect(session.calls).toEqual([])
  })

  it('global refine 通过 manifest lint → PROMOTED', async () => {
    const stream = makeStream()
    await validatedStream(stream)
    const session = makeFakeSession([
      { id: 'g1', appliedEdits: [{ id: 'e1', content: '先 init 再 probe', applied: true }] },
    ])
    const outcome = await promoteValidated(stream, session)
    expect(outcome.promoted).toEqual(['r1'])
    expect(session.calls[0]).toContain('"global":true')
    expect(stream.state().refinements.get('r1')?.status).toBe('PROMOTED')
  })

  it('manifest 不符 → 回滚，不进 global', async () => {
    const stream = makeStream()
    await validatedStream(stream)
    const session = makeFakeSession([
      { id: 'g1', appliedEdits: [{ id: 'e1', content: 'x' }, { id: 'e-extra', content: 'y' }] },
    ])
    const outcome = await promoteValidated(stream, session)
    expect(outcome.rolledBack).toEqual(['r1'])
    expect(session.calls[1]).toContain('"rollbackId":"g1"')
    expect(stream.state().refinements.get('r1')?.status).toBe('ROLLED_BACK')
  })

  it('未验证的 refinement 在 dispose 后无 global 痕迹（EXPIRED = 无代码检疫）', async () => {
    const stream = makeStream()
    stream.append({ type: 'refined', refinementId: 'r-pending', attributedClassIds: [CLASS_ID], entryIds: ['e1'] })
    const session = makeFakeSession()
    expect(await promoteValidated(stream, session)).toEqual({ promoted: [], rolledBack: [] })
    expect(session.calls).toEqual([])
  })
})
