/**
 * Research refine runtime（plan §4 接线面的共享装配）。
 *
 * UI 常驻会话（pi-agent-adapter）和无头战役脚本共用这一个工厂，避免两处
 * 各配一份 reviewer/lint/lifecycle。eval 三臂：
 * - off：不装 reviewer，autoRefine 关闭（历史 evidence 脚本默认臂）。
 * - frozen：autoRefine 关闭且不装 reviewer（冻结 global 快照，不学习）。
 * - learning：装确定性 reviewer + serializedRefine，native turn interval 作采样时钟。
 */
import { join } from 'node:path'
import { createResearchEpisodeStream, type ResearchEpisodeStream } from './pi-research-refine-events'
import {
  confirmRollback,
  handleRefineComplete,
  observeToolOutcome,
  promoteValidated,
  type RefineCapableSession,
  type ToolOutcome,
} from './pi-research-refine-lifecycle'
import { createResearchRefineReviewer } from './pi-research-refine-reviewer'
import {
  RESEARCH_REFINE_DEFAULTS,
  type ResearchRefineConfig,
  type ResearchRefineMode,
} from './pi-research-refine-types'

export interface ResearchRefineRuntime {
  readonly mode: ResearchRefineMode
  readonly stream?: ResearchEpisodeStream
  /** learning → {enabled:true}（保留 native turn interval）；否则 {enabled:false}。 */
  autoRefineSettings: { enabled: boolean }
  autoRefineReviewer?: ReturnType<typeof createResearchRefineReviewer>
  serializedRefine: boolean
  /** 工具结果 seam 调用：记录 success/residual 并结算 PENDING refinement。 */
  onToolOutcome?(outcome: ToolOutcome, session: RefineCapableSession): Promise<void>
  /** refine_complete 事件调用：lint、归因、必要时回滚。 */
  onRefineComplete?(result: { id: string; appliedEdits: Parameters<typeof handleRefineComplete>[2]['appliedEdits'] }, session: RefineCapableSession): Promise<void>
  /** pre-dispose（C5）：promotion + 归档前排空。 */
  beforeDispose?(session: RefineCapableSession): Promise<void>
  /** 归档条目：session-artifacts/<id>/research-refine → archive/research-refine。 */
  archiveSource?: string
}

export function createResearchRefineRuntime(config: ResearchRefineConfig): ResearchRefineRuntime {
  if (config.mode === 'off' || config.mode === 'frozen') {
    // frozen 不学习也不记录：global 快照由 harness 目录本身承载，归档走既有 harness entry。
    return {
      mode: config.mode,
      autoRefineSettings: { enabled: false },
      serializedRefine: false,
    }
  }
  // artifactDir 惰性解析：reviewer 必须在 createAgentSession 时传入，而 sessionId
  //（artifactDir 的一部分）要等会话创建后才存在。
  const getArtifactDir = (): string =>
    (typeof config.artifactDir === 'function' ? config.artifactDir() : config.artifactDir)
  let stream: ResearchEpisodeStream | undefined
  const getStream = () => stream ??= createResearchEpisodeStream(getArtifactDir())
  const extraDenyPatterns = config.run ? [new RegExp(`\\b${config.run.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)] : []
  let approvedClassId: string | undefined
  const reviewer = createResearchRefineReviewer({
    stream: {
      state: () => getStream().state(),
      append: (event) => getStream().append(event),
      get eventsPath() { return getStream().eventsPath },
    },
    thresholds: { ...RESEARCH_REFINE_DEFAULTS },
    onApprove: (classId) => { approvedClassId = classId },
  })
  return {
    mode: 'learning',
    get stream() { return getStream() },
    autoRefineSettings: { enabled: true },
    autoRefineReviewer: reviewer,
    serializedRefine: true,
    get archiveSource() { return getArtifactDir() },
    async onToolOutcome(outcome, session) {
      const pending = observeToolOutcome(getStream(), outcome)
      for (const item of pending) {
        await session.refine({ rollbackId: item.refinementId })
        confirmRollback(getStream(), item.refinementId)
      }
    },
    async onRefineComplete(result, session) {
      const attributed = approvedClassId ? [approvedClassId] : []
      approvedClassId = undefined
      await handleRefineComplete(getStream(), session, {
        refinementId: result.id,
        attributedClassIds: attributed,
        appliedEdits: result.appliedEdits,
      }, extraDenyPatterns)
    },
    async beforeDispose(session) {
      await promoteValidated(getStream(), session, extraDenyPatterns)
    },
  }
}

/** research 会话的 refine 证据目录：与 Prime harness 同级（session-artifacts/<id>/research-refine）。 */
export function researchRefineArtifactDir(sessionArtifactsRoot: string, sdkSessionId: string): string {
  return join(sessionArtifactsRoot, sdkSessionId, 'research-refine')
}

/** research 工具的统一 outcome seam（plan §4：MCP rejection 从 tool-result path 捕获）。 */
export function isResearchRefineTool(toolName: string): boolean {
  return toolName.startsWith('mcp__research')
}

/**
 * 在 session.agent.afterToolCall 上加采集 tap：research MCP 工具的
 * success / isError residual 进 episode stream（guard 拒绝从不执行工具，
 * 由 isolation extension 的 observer 另行记录）。
 * ponytail: ruleId 用常量 'mcp-iserror'；升级路径是让 MCP error transport
 * 带稳定 code（不改编码时用 normalized error prefix 做 class 细分）。
 */
type AfterToolCallContext = {
  toolCall: { name: string }
  isError?: boolean
  result?: { content?: Array<{ type?: string; text?: string }> }
}

export function installResearchRefineToolTap(
  agent: { afterToolCall?: unknown },
  runtime: ResearchRefineRuntime,
  session: RefineCapableSession,
): void {
  const previous = agent.afterToolCall as ((context: AfterToolCallContext, signal?: AbortSignal) => Promise<unknown>) | undefined
  agent.afterToolCall = async (context: AfterToolCallContext, signal?: AbortSignal) => {
    const previousResult = await previous?.(context, signal)
    if (runtime.onToolOutcome && isResearchRefineTool(context.toolCall?.name)) {
      if (context.isError) {
        const excerpt = (context.result?.content ?? [])
          .map((block) => (block.type === 'text' ? block.text : ''))
          .filter(Boolean)
          .join(' ')
          .slice(0, RESEARCH_REFINE_DEFAULTS.excerptMaxChars)
        await runtime.onToolOutcome(
          { kind: 'residual', source: 'mcp', tool: context.toolCall.name, ruleId: 'mcp-iserror', messageExcerpt: excerpt || 'MCP tool error' },
          session,
        )
      } else {
        await runtime.onToolOutcome({ kind: 'success', source: 'mcp', tool: context.toolCall.name }, session)
      }
    }
    return previousResult
  }
}
