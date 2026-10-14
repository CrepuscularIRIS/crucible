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
  stagePromotionCandidates,
  type RefineCapableSession,
  type ToolOutcome,
} from './pi-research-refine-lifecycle'
import { createResearchRefineReviewer } from './pi-research-refine-reviewer'
import type { RefineEditScope } from './pi-research-refine-lint'
import {
  failureClassId,
  parseFailureClassId,
  RESEARCH_REFINE_DEFAULTS,
  type ResearchRefineConfig,
  type ResearchRefineMode,
  type ResearchRollbackReason,
} from './pi-research-refine-types'

export interface ResearchRefineRuntime {
  readonly mode: ResearchRefineMode
  readonly stream?: ResearchEpisodeStream
  /** learning → {enabled:true}（保留 native turn interval）；否则 {enabled:false}。 */
  autoRefineSettings: { enabled: boolean }
  autoRefineReviewer?: ReturnType<typeof createResearchRefineReviewer>
  serializedRefine: boolean
  /** 工具结果 seam 调用：记录 success/residual 并结算 PENDING refinement。 */
  onToolOutcome?(outcome: ToolOutcome): Promise<void>
  /**
   * refine_complete 事件调用：lint、归因、必要时回滚（02 §3.5 授权写入清单）。
   * 只有两种 local 写入被授权：消费到 C2 批准令牌的那一次，以及 userAuthorized
   * 的那一次（runUserRefine 按 id 认出的用户 refineNow）。其余 local 与全部 global 一律回滚。
   */
  onRefineComplete?(result: {
    id: string
    appliedEdits: Parameters<typeof handleRefineComplete>[1]['appliedEdits']
    scope?: 'local' | 'global'
    userAuthorized?: boolean
  }): Promise<void>
  /**
   * 用户「立即提炼」（授权写入 2）：发起一次 session.refine()，期间落定的 refine_complete
   * 只有 id 等于这次返回值的那条算授权；排队在它前面的 kernel refine.run 照常回滚。
   * 结算后在此静默边界执行回滚。调用方先 markContaminated(REFINE_NOW_REASON)。
   */
  runUserRefine?(session: UserRefineSession): Promise<void>
  /** 只允许在 prompt 已结束的静默边界执行 native rollback。 */
  flushPendingRollbacks?(session: RefineCapableSession): Promise<void>
  /** refine 规划/应用失败时清掉 reviewer 暂存归因，避免污染下一次显式 refine。 */
  onRefineFailed?(): void
  /** pre-dispose：排空结算，暂存晋升候选（不碰 global，02 §3.6）。 */
  beforeDispose?(session: RefineCapableSession): Promise<void>
  /** 归档条目：session-artifacts/<id>/research-refine → archive/research-refine。 */
  archiveSource?: string
  /** tool tap 调用：收集本会话 world_* 参数里的 world 名（SE0：digest 与 lint 剥掉它们）。 */
  noteToolArgs?(toolName: string, args: unknown): void
  /** 把 run / world 名替换成占位符；tap 在算类键之前调用（SE0）。 */
  redact?(text: string): string
  /**
   * 宿主标记本会话臂 contaminated（refineNow / harness 手工编辑，02 §3.5）：之后不再产生 VALIDATED。
   * 只标污染，不授权任何写入；用户 refine 的授权走 runUserRefine（按 refinement id 绑定）。
   */
  markContaminated?(reason: string): void
}

/** UI「立即提炼」调用 markContaminated 时用的 reason（adapter 的 refineNow 引用这个常量）。 */
export const REFINE_NOW_REASON = 'refineNow'

/** runUserRefine 需要的会话面：refine + 订阅 refine_complete（Prime AgentSession 子集）。 */
export interface UserRefineSession extends RefineCapableSession {
  subscribe(listener: (event: { type: string; result?: unknown }) => void): () => void
}

type RefineCompleteResult = {
  id: string
  appliedEdits: Parameters<typeof handleRefineComplete>[1]['appliedEdits']
  scope?: 'local' | 'global'
  rollbackOf?: string
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
  // SE0：world 名不取自 K0（P2 才有），取自 run 名 token 与本会话 world_* 调用参数。
  // `ca_rebound-s0` → world token `ca_rebound`（种子后缀由正则可选匹配）；
  // 不带 `-s<n>` 的 run 名本身作 token。
  const worldTokens = new Set<string>()
  const runWorld = config.run?.replace(/-s\d+$/, '')
  if (runWorld) worldTokens.add(runWorld)
  const tokenPatterns = (flags: string): Array<{ pattern: RegExp; placeholder: string }> =>
    [...worldTokens]
      .sort((a, b) => b.length - a.length)
      .map((token) => ({
        pattern: new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(token)}(?:-s[\\d#]+)?(?![A-Za-z0-9_])`, flags),
        placeholder: token === config.run ? '<run>' : '<world>',
      }))
  const redact = (text: string): string =>
    tokenPatterns('g').reduce((out, { pattern, placeholder }) => out.replace(pattern, placeholder), text)
  // F5：lint 的 run 特定 deny 同样覆盖 world 名（会话中途新见到的也算）。
  const extraDenyPatterns = (): RegExp[] => tokenPatterns('').map(({ pattern }) => pattern)
  let approvedClassId: string | undefined
  // tool outcome/refine_complete 都可能从 fire-and-forget 事件回调进入。统一串行，
  // beforeDispose 才能真正排空结算后再暂存晋升候选（审计 F7）。
  let settlementQueue: Promise<void> = Promise.resolve()
  const pendingRollbacks = new Map<string, ResearchRollbackReason>()
  // 未授权写入（无令牌 local、任何 global）：记不可学的 system residual，静默边界回滚。
  const rejectUnauthorized = (id: string, scope: string): void => {
    getStream().append({
      type: 'residual',
      classId: failureClassId({ source: 'system', ruleId: 'harness_direct_write', tool: 'refine' }),
      messageExcerpt: `未授权的 ${scope} refine_complete ${id}`,
    })
    pendingRollbacks.set(id, 'unauthorized')
  }
  const enqueueSettlement = (task: () => Promise<void>): Promise<void> => {
    const next = settlementQueue.then(task)
    settlementQueue = next.catch(() => {})
    return next
  }
  const reviewer = createResearchRefineReviewer({
    stream: {
      state: () => getStream().state(),
      append: (event) => getStream().append(event),
      get eventsPath() { return getStream().eventsPath },
    },
    thresholds: { ...RESEARCH_REFINE_DEFAULTS },
    onApprove: (classId) => { approvedClassId = classId },
  })
  const flushPendingRollbacks = (session: RefineCapableSession): Promise<void> =>
    enqueueSettlement(async () => {
      for (const [refinementId, reason] of [...pendingRollbacks]) {
        await session.refine({ rollbackId: refinementId })
        pendingRollbacks.delete(refinementId)
        confirmRollback(getStream(), refinementId, reason)
      }
    })
  return {
    mode: 'learning',
    get stream() { return getStream() },
    autoRefineSettings: { enabled: true },
    autoRefineReviewer: reviewer,
    serializedRefine: true,
    get archiveSource() { return getArtifactDir() },
    noteToolArgs(toolName, args) {
      const world = (args as { world?: unknown } | undefined)?.world
      if (/world_/.test(toolName) && typeof world === 'string' && /^[\w.-]{3,}$/.test(world)) worldTokens.add(world)
    },
    redact,
    onToolOutcome(outcome) {
      const scrubbed = outcome.kind === 'residual'
        ? { ...outcome, ruleId: redact(outcome.ruleId), messageExcerpt: redact(outcome.messageExcerpt) }
        : outcome
      return enqueueSettlement(async () => {
        const pending = observeToolOutcome(getStream(), scrubbed)
        for (const item of pending) {
          pendingRollbacks.set(item.refinementId, 'refuted')
        }
      })
    },
    onRefineComplete,
    async runUserRefine(session) {
      const seen: RefineCompleteResult[] = []
      const unsubscribe = session.subscribe((event) => {
        const result = event.result as RefineCompleteResult | undefined
        if (event.type === 'refine_complete' && result && !result.rollbackOf) seen.push(result)
      })
      let userRefinementId: string | undefined
      try {
        userRefinementId = (await session.refine()).id
      } finally {
        unsubscribe()
        // 失败时 userRefinementId 为空：期间落定的一律按未授权结算，不留下任何授权。
        for (const result of seen) {
          await onRefineComplete({ ...result, userAuthorized: result.id === userRefinementId })
        }
      }
      await flushPendingRollbacks(session)
    },
    markContaminated(reason) {
      getStream().append({ type: 'tamper', reason })
    },
    flushPendingRollbacks,
    onRefineFailed() {
      approvedClassId = undefined
    },
    async beforeDispose(session) {
      await flushPendingRollbacks(session)
      await settlementQueue
      stagePromotionCandidates(getStream(), getArtifactDir())
    },
  }

  function onRefineComplete(result: RefineCompleteResult & { userAuthorized?: boolean }): Promise<void> {
    // H3：研究会话里晋升不走 refine，所以任何 global refine_complete（含 kernel
    // refine.run(global_=True)）都是未授权写入。它不消费令牌。
    if (result.scope === 'global') {
      return enqueueSettlement(async () => rejectUnauthorized(result.id, 'global'))
    }
    const userAuthorized = result.userAuthorized === true
    // 用户 refine 不消费 C2 令牌：它没有归因（untracked），令牌留给 Prime 的那次。
    const attributed = !userAuthorized && approvedClassId ? [approvedClassId] : []
    if (!userAuthorized) approvedClassId = undefined
    return enqueueSettlement(async () => {
      const handled = await handleRefineComplete(getStream(), {
        refinementId: result.id,
        attributedClassIds: attributed,
        appliedEdits: result.appliedEdits,
        scope: scopeOf(attributed[0]),
      }, extraDenyPatterns())
      if (handled.rollback) {
        pendingRollbacks.set(handled.rollback.refinementId, handled.rollback.reason)
      } else if (attributed.length === 0 && !userAuthorized && result.appliedEdits.some((edit) => edit.applied === true)) {
        rejectUnauthorized(result.id, 'local')
      }
    })
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
 * ruling（审计 F4）：epistemic loop 设计内的**纪律性拒绝**不是 policy residual——
 * 预算耗尽/带外迁移/强制分诊/graveyard 冲突/forecast closed 是 meter 与 belief 侧裁决，
 * 学"如何避免这些拒绝"等于学如何规避纪律本身。它们不进 residual 流。
 * 其余 MCP 错误按归一化首行（数字替换为 #、截 48 字符）作 ruleId，
 * 避免"忘了 init"被无关 schema 错误误 refute。
 */
const NON_LEARNABLE_MCP_RESIDUALS: RegExp[] = [
  /budget exhausted/i,
  /不落在任何.{0,80}预登记分支频段内/,
  /强制分诊/,
  /graveyard 非空/,
  /终局已裁决/,
  /forecast 已裁决过一次/,
  // SE0（02 §3.3，R9§2.3-3）：真实流里出现过的 integrity / epistemic 拒绝。
  /报告未通过 gate/,
  /bands 必须覆盖/,
  /bands 引用了非 LIVE/,
  /本次会话已钉死/,
  // F1 候选模式拒绝（03 §7，接口 6：D 写首行固定前缀）。拒绝文本本身就是合法出口。
  /候选仿真已移到工作目录/,
]

// ponytail: regex 列表，新增规则时会漏；升级路径是 rule code `[R-<code>]` 查类别（SE9，随 01 P1）。
export function classifyMcpResidual(excerpt: string): { ruleId: string; source?: 'system' } | undefined {
  for (const pattern of NON_LEARNABLE_MCP_RESIDUALS) {
    if (pattern.test(excerpt)) return undefined
  }
  // S 类（02 §3.3）：Traceback 是系统缺陷，学了只会学成绕行（M3）。
  if (/\bTraceback\b/.test(excerpt)) return { ruleId: 'traceback', source: 'system' }
  const firstLine = (excerpt.split('\n')[0] ?? '')
    .replace(/[`'"]/g, '')
    .replace(/\d+/g, '#')
    .trim()
    .slice(0, 48)
  return { ruleId: firstLine || 'mcp-iserror' }
}

/**
 * 在 session.agent.afterToolCall 上加采集 tap：research MCP 工具的
 * success / isError residual 进 episode stream（guard 拒绝从不执行工具，
 * 由 isolation extension 的 observer 另行记录）。residual 分类见
 * classifyMcpResidual（纪律性拒绝豁免 + 归一化首行 ruleId，审计 F4）。
 * 升级路径：让 MCP error transport 带稳定 code，替代文本归一化。
 */
type AfterToolCallContext = {
  toolCall: { name: string; arguments?: unknown }
  args?: unknown
  isError: boolean
  result: { content: Array<{ type?: string; text?: string }> }
}

interface AfterToolCallResult {
  content?: Array<{ type?: string; text?: string }>
  isError?: boolean
  details?: unknown
  terminate?: boolean
}

export function installResearchRefineToolTap(
  agent: { afterToolCall?: unknown },
  runtime: ResearchRefineRuntime,
): void {
  const previous = agent.afterToolCall as ((context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>) | undefined
  agent.afterToolCall = async (context: AfterToolCallContext, signal?: AbortSignal) => {
    const previousResult = await previous?.(context, signal)
    if (runtime.onToolOutcome && isResearchRefineTool(context.toolCall?.name)) {
      runtime.noteToolArgs?.(context.toolCall.name, context.args ?? context.toolCall.arguments)
      const isError = previousResult?.isError ?? context.isError
      const content = previousResult?.content ?? context.result.content
      if (isError) {
        const raw = content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .filter(Boolean)
          .join(' ')
        // 先剥 world 名再截断与算类键：截断不会切出半个 world 名留在类键里。
        const excerpt = (runtime.redact?.(raw) ?? raw).slice(0, RESEARCH_REFINE_DEFAULTS.excerptMaxChars)
        const classified = classifyMcpResidual(excerpt)
        if (classified) {
          await runtime.onToolOutcome(
            { kind: 'residual', source: classified.source ?? 'mcp', tool: context.toolCall.name, ruleId: classified.ruleId, messageExcerpt: excerpt || 'MCP tool error' },
          )
        }
      } else {
        const args = context.args ?? context.toolCall.arguments
        await runtime.onToolOutcome({
          kind: 'success', source: 'mcp', tool: context.toolCall.name, fingerprint: JSON.stringify(args ?? null),
        })
      }
    }
    return previousResult
  }
}

/** F9：触发类只许点名它自己的工具与 rule code（02 §3.4，H4）。 */
function scopeOf(classId: string | undefined): RefineEditScope | undefined {
  const cls = classId ? parseFailureClassId(classId) : undefined
  return cls ? { tools: [cls.tool], codes: [cls.ruleId] } : undefined
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
