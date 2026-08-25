/**
 * C2 · Research Refine Reviewer（plan §1.1/§6.1）。
 *
 * Prime `AutoRefineReviewer` 的确定性实现：模型永不 author 触发决策。
 * - approve 条件：存在一个 open class 的未消费 residual 达到阈值
 *   （默认 ≥2；compact tick ≥1——压缩前是看到完整轨迹的最后机会）、
 *   预算未耗尽、无 PENDING refinement（refine 不重叠）。
 * - 一次 digest 只含一个 failure class（rollback 单位是整个 refinement，
 *   多 class 会把有效修改一起回滚——audit 修正 #3）。
 * - digest 机械组装：固定 preamble + residual 引用 + 被回滚尝试的提示。
 *   无 claim/metric/band/run 内容（内容边界由 C3 lint 兜底）。
 */
import type { ResearchEpisodeStream } from './pi-research-refine-events'
import {
  RESEARCH_REFINE_DEFAULTS,
  parseFailureClassId,
} from './pi-research-refine-types'

export interface AutoRefineReviewDecision {
  shouldRefine: boolean
  rationale: string
  instructions?: string
}

export interface ReviewerDeps {
  stream: ResearchEpisodeStream
  /** 测试注入；缺省取 defaults。 */
  thresholds?: Partial<typeof RESEARCH_REFINE_DEFAULTS>
  /** approve 时回传被处理的 classId，runtime 在 refine_complete 时做归因。 */
  onApprove?: (classId: string) => void
}

const DIGEST_PREAMBLE = [
  'Research 策略残差提炼（确定性 reviewer 触发，非模型自评）。',
  '只学程序性教训：如何操作工具、如何避免重复的流程错误。',
  '优先零修改：若证据不足以支撑可复用的程序性规则，不要产出任何 edit。',
  '只允许 local scope；禁止 global。',
  '禁止：科学 claim、假设文本、metric 名或数值、band 值、run 名、benchmark/world/meter 路径、seed。',
  '禁止：创建或修改任何裁决性内容（gate、guard、permission、MCP 配置、reviewer/lint 自身）。',
  '规则标识符与工具名是程序性词汇，可以使用。',
].join('\n')

export function buildResidualDigest(
  classId: string,
  residuals: Array<{ seq: number; messageExcerpt: string }>,
  refutedRefinementIds: string[],
  excerptMaxChars: number,
): string {
  const cls = parseFailureClassId(classId)
  const lines = [
    DIGEST_PREAMBLE,
    '',
    `待处理失败类: source=${cls?.source} rule=${cls?.ruleId} tool=${cls?.tool}`,
    `residual 计数: ${residuals.length}（事件序号 ${residuals.map((r) => r.seq).join(', ')}）`,
  ]
  for (const residual of residuals.slice(-3)) {
    const excerpt = residual.messageExcerpt.length > excerptMaxChars
      ? `${residual.messageExcerpt.slice(0, excerptMaxChars)}…`
      : residual.messageExcerpt
    lines.push(`  · #${residual.seq}: ${excerpt}`)
  }
  if (refutedRefinementIds.length > 0) {
    lines.push(
      `此前尝试（${refutedRefinementIds.join(', ')}）未能阻止复发——不要原样重写同一补丁；换一个机制层面的角度，或放弃（零 edit）。`,
    )
  }
  return lines.join('\n')
}

export function createResearchRefineReviewer(deps: ReviewerDeps) {
  const t = { ...RESEARCH_REFINE_DEFAULTS, ...deps.thresholds }
  return async (request: { reason: 'turn_interval' | 'compact' }): Promise<AutoRefineReviewDecision> => {
    const state = deps.stream.state()
    const hasPending = [...state.refinements.values()].some((ref) => ref.status === 'PENDING')
    if (hasPending) {
      return { shouldRefine: false, rationale: '已有 refine 处于 PENDING，等验证/回滚结算后再触发' }
    }
    if (state.residualRefineCount >= t.residualRefineBudget) {
      return { shouldRefine: false, rationale: `本 run residual refine 预算已用尽（${state.residualRefineCount}/${t.residualRefineBudget}）` }
    }
    const threshold = request.reason === 'compact' ? t.compactResidualThreshold : t.residualThreshold
    const open = [...state.classes.values()]
      // ruling（审计 F1）: lint_violation 类没有 success 发射器，永远凑不满验证
      // 分母；让它触发 refine 只会把循环卡死在 PENDING。仍作为 residual 记录
      // （审计轨迹），但不作为 refine 触发源。
      .filter((cls) => !cls.classId.startsWith('lint_violation§'))
      .filter((cls) => cls.openResiduals.length >= threshold)
      .sort((a, b) => (a.openResiduals[0]?.seq ?? 0) - (b.openResiduals[0]?.seq ?? 0))
    const target = open[0]
    if (!target) {
      return { shouldRefine: false, rationale: '没有达到阈值的未消费 residual（decline 是常态）' }
    }
    deps.onApprove?.(target.classId)
    return {
      shouldRefine: true,
      rationale: `处理失败类 ${target.classId}（${target.openResiduals.length} 条未消费 residual）`,
      instructions: buildResidualDigest(
        target.classId,
        target.openResiduals,
        target.refutedRefinementIds,
        t.excerptMaxChars,
      ),
    }
  }
}
