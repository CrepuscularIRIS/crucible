import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import {
  createResearchEpisodeStream,
  evaluateRefinementTransitions,
  replayResearchRefineEvents,
} from './pi-research-refine-events'
import type { ResearchRefineEvent } from './pi-research-refine-types'

const tempRoots: string[] = []
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'research-refine-events-'))
  tempRoots.push(dir)
  return dir
}

describe('Research Episode Stream（C1+C4）', () => {
  it('零 residual 的 run 重放后没有任何 open class / refinement', () => {
    const stream = createResearchEpisodeStream(join(tempDir(), 'research-refine'))
    const state = stream.state()
    expect(state.classes.size).toBe(0)
    expect(state.refinements.size).toBe(0)
    expect(state.residualRefineCount).toBe(0)
  })

  it('residual 按 class 累计，refined 消费归因 class 的 open residual', () => {
    const events: ResearchRefineEvent[] = [
      { type: 'residual', ts: 't1', seq: 1, classId: 'mcp§mcp-iserror§mcp__research__probe', messageExcerpt: 'boom' },
      { type: 'residual', ts: 't2', seq: 2, classId: 'mcp§mcp-iserror§mcp__research__probe', messageExcerpt: 'boom again' },
      { type: 'residual', ts: 't3', seq: 3, classId: 'guard§isolation-guard§bash', messageExcerpt: 'deny' },
      { type: 'refined', ts: 't4', seq: 4, refinementId: 'r1', attributedClassIds: ['mcp§mcp-iserror§mcp__research__probe'], entryIds: ['e1'] },
    ]
    const state = replayResearchRefineEvents(events)
    expect(state.classes.get('mcp§mcp-iserror§mcp__research__probe')?.openResiduals).toHaveLength(0)
    expect(state.classes.get('guard§isolation-guard§bash')?.openResiduals).toHaveLength(1)
    expect(state.refinements.get('r1')).toMatchObject({ status: 'PENDING', postSeq: 4 })
    expect(state.residualRefineCount).toBe(1)
  })

  it('JSONL 持久化、递增 seq、坏行固定策略跳过', () => {
    const dir = join(tempDir(), 'research-refine')
    const stream = createResearchEpisodeStream(dir)
    const first = stream.append({ type: 'success', source: 'mcp', tool: 'mcp__research__probe' })
    const second = stream.append({ type: 'residual', classId: 'mcp§x§t', messageExcerpt: 'e' })
    expect(first.seq).toBe(1)
    expect(second.seq).toBe(2)
    // 模拟外部写入坏行
    writeFileSync(stream.eventsPath, 'not-json\n', { flag: 'a' })
    const state = stream.state()
    expect(state.events).toHaveLength(2)
    expect(state.skippedLines).toBe(1)
  })

  it('验证分母：refined 之后同 class 的 success 计数；复发优先回滚', () => {
    const classId = 'mcp§mcp-iserror§mcp__research__probe'
    const events: ResearchRefineEvent[] = [
      { type: 'residual', ts: 't1', seq: 1, classId, messageExcerpt: 'boom' },
      { type: 'residual', ts: 't2', seq: 2, classId, messageExcerpt: 'boom' },
      { type: 'refined', ts: 't3', seq: 3, refinementId: 'r1', attributedClassIds: [classId], entryIds: ['e1'] },
      { type: 'success', ts: 't4', seq: 4, source: 'mcp', tool: 'mcp__research__probe' },
      { type: 'success', ts: 't5', seq: 5, source: 'mcp', tool: 'mcp__research__probe' },
      { type: 'success', ts: 't6', seq: 6, source: 'mcp', tool: 'mcp__research__probe' },
    ]
    let state = replayResearchRefineEvents(events)
    expect(evaluateRefinementTransitions(state, 3)).toEqual([
      { action: 'validate', refinementId: 'r1', evidenceSeqs: [4, 5, 6] },
    ])

    const recurred: ResearchRefineEvent[] = [
      ...events,
      { type: 'residual', ts: 't7', seq: 7, classId, messageExcerpt: 'boom again' },
    ]
    state = replayResearchRefineEvents(recurred)
    expect(evaluateRefinementTransitions(state, 3)).toEqual([
      { action: 'rollback', refinementId: 'r1', classId, seq: 7 },
    ])
  })

  it('不写 .proma-research/（server-owned 目录）', () => {
    const dir = join(tempDir(), 'research-refine')
    const stream = createResearchEpisodeStream(dir)
    stream.append({ type: 'residual', classId: 'mcp§x§t', messageExcerpt: 'e' })
    const raw = readFileSync(stream.eventsPath, 'utf8')
    expect(raw).not.toContain('.proma-research')
    expect(stream.eventsPath).not.toContain('.proma-research')
  })
})
