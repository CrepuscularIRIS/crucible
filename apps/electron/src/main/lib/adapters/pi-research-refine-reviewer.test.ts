import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { createResearchEpisodeStream } from './pi-research-refine-events'
import { createResearchRefineReviewer } from './pi-research-refine-reviewer'

const tempRoots: string[] = []
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function makeReviewer(thresholds?: Parameters<typeof createResearchRefineReviewer>[0]['thresholds']) {
  const stream = createResearchEpisodeStream(join(mkdtempSync(join(tmpdir(), 'rr-reviewer-')), 'research-refine'))
  tempRoots.push(stream.eventsPath)
  return { stream, review: createResearchRefineReviewer({ stream, thresholds }) }
}

const CLASS = 'mcp§mcp-iserror§mcp__research__probe'

describe('Research Refine Reviewer（C2）', () => {
  it('零 residual 时 decline（decline 是常态，零 refine 是理想）', async () => {
    const { review } = makeReviewer()
    const decision = await review({ reason: 'turn_interval' })
    expect(decision.shouldRefine).toBe(false)
  })

  it('同类 residual ≥2 才 approve；单条只在不同 class 累计或 compact tick 放行', async () => {
    const { stream, review } = makeReviewer()
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'boom' })
    expect((await review({ reason: 'turn_interval' })).shouldRefine).toBe(false)
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'boom again' })
    const approved = await review({ reason: 'turn_interval' })
    expect(approved.shouldRefine).toBe(true)
    expect(approved.instructions).toContain('mcp__research__probe')
    expect(approved.instructions).toContain('#1')
  })

  it('compact tick 阈值放宽为 1（压缩前是看到完整轨迹的最后机会）', async () => {
    const { stream, review } = makeReviewer()
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'boom' })
    expect((await review({ reason: 'compact' })).shouldRefine).toBe(true)
  })

  it('digest 不含科学内容（无 metric/band/run），且只含一个 class', async () => {
    const { stream, review } = makeReviewer()
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'probe rejected' })
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'probe rejected' })
    stream.append({ type: 'residual', classId: 'guard§isolation-guard§bash', messageExcerpt: 'deny' })
    stream.append({ type: 'residual', classId: 'guard§isolation-guard§bash', messageExcerpt: 'deny' })
    const decision = await review({ reason: 'turn_interval' })
    expect(decision.instructions).toContain('mcp__research__probe')
    expect(decision.instructions).not.toContain('isolation-guard')
  })

  it('预算耗尽后 decline', async () => {
    const { stream, review } = makeReviewer()
    for (let i = 0; i < 3; i += 1) {
      stream.append({ type: 'residual', classId: `${CLASS}#${i}`, messageExcerpt: 'a' })
      stream.append({ type: 'residual', classId: `${CLASS}#${i}`, messageExcerpt: 'b' })
      stream.append({ type: 'refined', refinementId: `r${i}`, attributedClassIds: [`${CLASS}#${i}`], entryIds: [] })
      stream.append({ type: 'rolled_back', refinementId: `r${i}`, reason: 'manifest_mismatch' })
    }
    const decision = await review({ reason: 'turn_interval' })
    expect(decision.shouldRefine).toBe(false)
    expect(decision.rationale).toContain('预算')
  })

  it('已有 PENDING refinement 时 decline（refine 不重叠）', async () => {
    const { stream, review } = makeReviewer()
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'boom' })
    stream.append({ type: 'refined', refinementId: 'r1', attributedClassIds: [CLASS], entryIds: [] })
    expect((await review({ reason: 'turn_interval' })).shouldRefine).toBe(false)
  })

  it('lint_violation 类不作为 refine 触发源（无验证分母，触发即卡死，审计 F1）', async () => {
    const { stream, review } = makeReviewer()
    stream.append({ type: 'residual', classId: 'lint_violation§refine-content§refine', messageExcerpt: 'deny 词汇' })
    stream.append({ type: 'residual', classId: 'lint_violation§refine-content§refine', messageExcerpt: 'deny 词汇' })
    expect((await review({ reason: 'turn_interval' })).shouldRefine).toBe(false)
  })

  it('guard 类 residual 可触发（success 分母由 isolation observer 提供）', async () => {
    const { stream, review } = makeReviewer()
    stream.append({ type: 'residual', classId: 'guard§isolation-guard§bash', messageExcerpt: 'deny' })
    stream.append({ type: 'residual', classId: 'guard§isolation-guard§bash', messageExcerpt: 'deny' })
    const decision = await review({ reason: 'turn_interval' })
    expect(decision.shouldRefine).toBe(true)
  })

  it('被回滚的 class 复发时，digest 引用被否决的上次尝试', async () => {
    const { stream, review } = makeReviewer()
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'boom' })
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'boom' })
    stream.append({ type: 'refined', refinementId: 'r1', attributedClassIds: [CLASS], entryIds: [] })
    stream.append({ type: 'rolled_back', refinementId: 'r1', reason: 'refuted' })
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'boom' })
    stream.append({ type: 'residual', classId: CLASS, messageExcerpt: 'boom' })
    const decision = await review({ reason: 'turn_interval' })
    expect(decision.instructions).toContain('r1')
    expect(decision.instructions).toContain('未能阻止复发')
  })
})
