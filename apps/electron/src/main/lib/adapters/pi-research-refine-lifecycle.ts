/**
 * 验证/回滚/晋升暂存（plan §5；02 §3.6）。
 *
 * - observeToolOutcome：success/residual 进 stream；随后重放并结算 PENDING
 *   refinement——复发 → 返回 rollback 动作（调用方执行 native refine({rollbackId})
 *   后调 confirmRollback）；k 次干净 eligible → 直接 append validated。
 *   同参数连续调用不计成功，连续 stagnationRun 次记 `stagnation` residual（L7）。
 * - handleRefineComplete：refine_complete 落 stream；C3 lint 违规 → native 回滚
 *   + lint_violation residual + rolled_back(lint)。
 * - stagePromotionCandidates（pre-dispose）：global 晋升只经 run 结束复盘 + 用户批准
 *   （02 §3.6，H3）。dispose 时只把 VALIDATED 条目的序列化字节与 sha256 从 local
 *   harness 拷进暂存文件；落 global 由宿主在用户批准后逐字节拷贝（SE10，赛后）。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  evaluateRefinementTransitions,
  successRunLengths,
  type ResearchEpisodeStream,
} from './pi-research-refine-events'
import {
  lintAppliedEdits,
  type LintableRefineEdit,
  type RefineEditScope,
} from './pi-research-refine-lint'
import {
  failureClassId,
  RESEARCH_REFINE_DEFAULTS,
  type ResearchResidualSource,
  type ResearchRollbackReason,
} from './pi-research-refine-types'

/** Prime session 的最小 refine 面（AgentSession.refine 子集），便于单测注入。 */
export interface RefineCapableSession {
  refine(options?: { instructions?: string; rollbackId?: string; global?: boolean }): Promise<{
    id: string
    appliedEdits: LintableRefineEdit[]
  }>
}

export type ToolOutcome =
  /** fingerprint：调用参数原文（只取 sha256 存盘）；缺省 = 不做重复调用判定（旧行为）。 */
  | { kind: 'success'; source: ResearchResidualSource; tool: string; fingerprint?: string }
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
    // 分块反复 wait/field/collect（01§4.3-2）跑在 ipython 里，只经 guard 进流且不带指纹，不会停滞（L7）。
    const fp = outcome.fingerprint
      ? createHash('sha256').update(outcome.fingerprint).digest('hex').slice(0, 16)
      : undefined
    const event = stream.append({ type: 'success', source: outcome.source, tool: outcome.tool, ...(fp && { fp }) })
    const stagnationRun = thresholds.stagnationRun ?? RESEARCH_REFINE_DEFAULTS.stagnationRun
    if (fp && successRunLengths(stream.state().events).get(event.seq) === stagnationRun) {
      stream.append({
        type: 'residual',
        classId: failureClassId({ source: outcome.source, ruleId: 'stagnation', tool: outcome.tool }),
        messageExcerpt: `同参数连续调用 ${outcome.tool} ${stagnationRun} 次，期间无其他调用`,
      })
    }
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
  reason: ResearchRollbackReason = 'refuted',
): void {
  stream.append({ type: 'rolled_back', refinementId, reason })
}

export interface HandleRefineCompleteInput {
  refinementId: string
  /** reviewer 批准时锁定的归因 class（一次 refine 一个 class）。 */
  attributedClassIds: string[]
  appliedEdits: LintableRefineEdit[]
  /** F9：触发类可点名的工具 / code；无归因时不传。 */
  scope?: RefineEditScope
}

/** F1/F2/F6/F7/F9 命中是 S/R 账的证据（"拒绝 ≠ 丢弃"）。SE10 渲染 RETRO 之前只写日志。 */
function logFilterRoutes(refinementId: string, violations: string[]): void {
  for (const violation of violations) {
    if (/^F[12679] /.test(violation)) console.warn(`[research-refine] route: R|S · ${violation} · ${refinementId}`)
    // F6 skill 类：refine 想写 skill = 能力缺口信号 → T3 kit-function 提议桩（02 §3.4）。
    if (violation.startsWith('F6 ') && violation.includes(' skill ')) {
      console.warn(`[research-refine] kit-function 提议桩 · ${violation} · ${refinementId}`)
    }
  }
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
  const lint = lintAppliedEdits(input.appliedEdits, extraDenyPatterns, input.scope)
  if (!lint.ok) {
    logFilterRoutes(input.refinementId, lint.violations)
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

export const PROMOTION_CANDIDATES_FILE = 'promotion-candidates.json'

/**
 * dispose 时暂存晋升候选（02 §3.6）：每个 VALIDATED refinement 的条目，从本会话 local
 * `harness_state.json`（artifactDir 的兄弟目录 harness/）拷出条目字节与 sha256。
 * L1：`bytes` 是 `JSON.stringify(条目对象)`，不是 harness_state.json 里那段文件字节
 * （整个文件是一份 JSON，条目没有独立的字节边界）。SE10 校验时必须用同一序列化复算 sha。
 * 文件在 state 根内（P12）；没有 VALIDATED 就不写（零是理想）。会话存储被删 → 候选随之 expired。
 */
export function stagePromotionCandidates(stream: ResearchEpisodeStream, artifactDir: string): string | undefined {
  const state = stream.state()
  const validated = [...state.refinements.values()].filter((ref) => ref.status === 'VALIDATED')
  if (validated.length === 0) return undefined
  const harnessPath = join(dirname(artifactDir), 'harness', 'harness_state.json')
  const entries = readLocalHarnessEntries(harnessPath)
  const candidates = validated.map((ref) => {
    const refined = state.events.find((event) => event.type === 'refined' && event.refinementId === ref.refinementId)
    const validatedEvent = state.events.find((event) => event.type === 'validated' && event.refinementId === ref.refinementId)
    const entryIds = refined?.type === 'refined' ? refined.entryIds : []
    const staged = entryIds.flatMap((id) => {
      const entry = entries.get(id)
      if (!entry) return []
      const bytes = JSON.stringify(entry.value)
      return [{ kind: entry.kind, id, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }]
    })
    return {
      refinementId: ref.refinementId,
      evidenceSeqs: validatedEvent?.type === 'validated' ? validatedEvent.evidenceSeqs : [],
      entries: staged,
      missing: entryIds.filter((id) => !entries.has(id)),
    }
  })
  const path = join(artifactDir, PROMOTION_CANDIDATES_FILE)
  writeFileSync(path, `${JSON.stringify({ generatedAt: new Date().toISOString(), contaminated: state.contaminated, candidates }, null, 2)}\n`, 'utf8')
  return path
}

function readLocalHarnessEntries(harnessPath: string): Map<string, { kind: string; value: unknown }> {
  const out = new Map<string, { kind: string; value: unknown }>()
  if (!existsSync(harnessPath)) return out
  try {
    const parsed = JSON.parse(readFileSync(harnessPath, 'utf8')) as { entries?: Record<string, Record<string, unknown>> }
    for (const [kind, byId] of Object.entries(parsed.entries ?? {})) {
      for (const [id, value] of Object.entries(byId ?? {})) out.set(id, { kind, value })
    }
  } catch (error) {
    // 读不了就记为 missing，不编造字节；候选仍列出，供 RETRO 显示。
    console.error('[research-refine] local harness 读取失败，候选按 missing 暂存:', error)
  }
  return out
}
