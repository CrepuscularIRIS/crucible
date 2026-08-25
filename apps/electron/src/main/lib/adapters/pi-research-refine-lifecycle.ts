/**
 * 验证/回滚/promotion（plan §5）。
 *
 * - observeToolOutcome：success/residual 进 stream；随后重放并结算 PENDING
 *   refinement——复发 → 返回 rollback 动作（调用方执行 native refine({rollbackId})
 *   后调 confirmRollback）；k 次干净 eligible → 直接 append validated。
 * - handleRefineComplete：refine_complete 落 stream；C3 lint 违规 → native 回滚
 *   + lint_violation residual + rolled_back(lint)。
 * - promoteValidated（C5，pre-dispose）：global manifest refine + manifest lint；
 *   不符 → 回滚（manifest_mismatch）。
 *
 * ponytail: manifest 校验为结构性（entry 数量 + lint），非逐字 diff 相等；
 * 升级路径是比对每条 entry 的 title/content 哈希。
 */
import {
  evaluateRefinementTransitions,
  type ResearchEpisodeStream,
} from './pi-research-refine-events'
import { lintAppliedEdits, lintManifestRefinement, type LintableRefineEdit } from './pi-research-refine-lint'
import {
  failureClassId,
  RESEARCH_REFINE_DEFAULTS,
  type ResearchResidualSource,
} from './pi-research-refine-types'

/** Prime session 的最小 refine 面（AgentSession.refine 子集），便于单测注入。 */
export interface RefineCapableSession {
  refine(options?: { instructions?: string; rollbackId?: string; global?: boolean }): Promise<{
    id: string
    appliedEdits: LintableRefineEdit[]
  }>
}

export type ToolOutcome =
  | { kind: 'success'; source: ResearchResidualSource; tool: string }
  | { kind: 'residual'; source: ResearchResidualSource; tool: string; ruleId: string; messageExcerpt: string }

export interface PendingRollback {
  action: 'rollback'
  refinementId: string
  classId: string
  seq: number
}

export function observeToolOutcome(
  stream: ResearchEpisodeStream,
  outcome: ToolOutcome,
  thresholds: Partial<typeof RESEARCH_REFINE_DEFAULTS> = {},
): PendingRollback[] {
  if (outcome.kind === 'residual') {
    const classId = failureClassId({ source: outcome.source, ruleId: outcome.ruleId, tool: outcome.tool })
    stream.append({ type: 'residual', classId, messageExcerpt: outcome.messageExcerpt })
  } else {
    stream.append({ type: 'success', source: outcome.source, tool: outcome.tool })
  }
  const state = stream.state()
  const pending: PendingRollback[] = []
  for (const transition of evaluateRefinementTransitions(state, thresholds.validationK ?? RESEARCH_REFINE_DEFAULTS.validationK)) {
    if (transition.action === 'validate') {
      stream.append({ type: 'validated', refinementId: transition.refinementId, evidenceSeqs: transition.evidenceSeqs })
    } else {
      pending.push(transition)
    }
  }
  return pending
}

export function confirmRollback(
  stream: ResearchEpisodeStream,
  refinementId: string,
  reason: 'refuted' | 'lint' = 'refuted',
): void {
  stream.append({ type: 'rolled_back', refinementId, reason })
}

export interface HandleRefineCompleteInput {
  refinementId: string
  /** reviewer 批准时锁定的归因 class（一次 refine 一个 class）。 */
  attributedClassIds: string[]
  appliedEdits: LintableRefineEdit[]
}

/** refine_complete 的结算：lint 通过、有归因且确有 edit → refined(PENDING)；
 * 违规 → 回滚 + 残差。无归因（refineNow 等显式路径）或零 edit → lint 但
 * 不入账，不产生无法验证或虚假成功的 PENDING。 */
export async function handleRefineComplete(
  stream: ResearchEpisodeStream,
  input: HandleRefineCompleteInput,
  extraDenyPatterns: RegExp[] = [],
): Promise<{
  status: 'pending' | 'untracked' | 'rollback_pending'
  violations: string[]
  rollback?: { refinementId: string; reason: 'lint' }
}> {
  const lint = lintAppliedEdits(input.appliedEdits, extraDenyPatterns)
  if (!lint.ok) {
    stream.append({
      type: 'residual',
      classId: failureClassId({ source: 'lint_violation', ruleId: 'refine-content', tool: 'refine' }),
      messageExcerpt: lint.violations.join('; ').slice(0, RESEARCH_REFINE_DEFAULTS.excerptMaxChars),
    })
    return {
      status: 'rollback_pending',
      violations: lint.violations,
      rollback: { refinementId: input.refinementId, reason: 'lint' },
    }
  }
  const appliedEntryIds = input.appliedEdits
    .filter((edit) => edit.applied === true && edit.id)
    .map((edit) => edit.id as string)
  if (input.attributedClassIds.length === 0 || appliedEntryIds.length === 0) {
    return { status: 'untracked', violations: [] }
  }
  stream.append({
    type: 'refined',
    refinementId: input.refinementId,
    attributedClassIds: input.attributedClassIds,
    entryIds: appliedEntryIds,
  })
  return { status: 'pending', violations: [] }
}

/** C5：pre-dispose 时把 VALIDATED refinement 经一次 global refine 沉淀。 */
export async function promoteValidated(
  stream: ResearchEpisodeStream,
  session: RefineCapableSession,
  extraDenyPatterns: RegExp[] = [],
): Promise<{ promoted: string[]; rolledBack: string[] }> {
  const state = stream.state()
  const validated = [...state.refinements.values()].filter((ref) => ref.status === 'VALIDATED')
  if (validated.length === 0) return { promoted: [], rolledBack: [] }
  const entryIds = validated.flatMap((ref) => {
    const event = state.events.find((candidate) => candidate.type === 'refined' && candidate.refinementId === ref.refinementId)
    return event && event.type === 'refined' ? event.entryIds : []
  })
  const manifest = [
    'Research 策略残差 promotion（确定性 checkpoint 触发）。',
    `逐字持久化以下已验证的 harness 条目，除此之外不新增、不修改、不删除任何条目: ${entryIds.join(', ')}`,
    '保持 local 版本的语义与措辞；不得在持久化时引入新的科学内容。',
    '禁止: claim/metric/band/run/benchmark 路径；禁止触碰 gate/guard/permission/reviewer/lint。',
  ].join('\n')
  const result = await session.refine({ global: true, instructions: manifest })
  const lint = lintManifestRefinement(result.appliedEdits, entryIds.length, extraDenyPatterns)
  if (!lint.ok) {
    await session.refine({ rollbackId: result.id })
    for (const ref of validated) stream.append({ type: 'rolled_back', refinementId: ref.refinementId, reason: 'manifest_mismatch' })
    return { promoted: [], rolledBack: validated.map((ref) => ref.refinementId) }
  }
  for (const ref of validated) stream.append({ type: 'promoted', refinementId: ref.refinementId })
  return { promoted: validated.map((ref) => ref.refinementId), rolledBack: [] }
}
