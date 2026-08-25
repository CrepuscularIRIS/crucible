/**
 * Research-aware Continual Refinement Loop 的共享类型与常量。
 *
 * 设计来源 docs/plans/RESEARCH-REFINE-PLAN.md：
 * - MCP 持信念态，Harness 只持策略态；refine 学"如何操作"，不学科学结论。
 * - 失败类 = source × ruleId × tool（粗粒度、确定性、append 时可计算）。
 * - Episode Stream（C1+C4 合一）：同时记录 success/residual 与 lifecycle 事件，
 *   验证分母（k 次 eligible action）从同一事件流重放，不建第二份事实源。
 */

/** eval 三臂（EVAL-PLAN §7.2 / plan §7）：off / frozen / learning。 */
export type ResearchRefineMode = 'off' | 'frozen' | 'learning'

export interface ResearchRefineConfig {
  mode: ResearchRefineMode
  /**
   * episode stream 与 refine 证据的落盘目录（session-artifacts/<id>/research-refine）。
   * 可为惰性函数：reviewer 在会话创建前装配，而 sessionId 创建后才存在。
   */
  artifactDir: string | (() => string)
  /** 战役 run 名，进入归档与 digest 的标识；不进入 harness 条目内容。 */
  run?: string
}

/** residual 来源；lint_violation 由 C3 写入（plan §3）。 */
export type ResearchResidualSource = 'guard' | 'mcp' | 'gate' | 'reconcile' | 'user' | 'lint_violation'

/** 一次 failure class 的确定性键。 */
export interface ResearchRefineFailureClass {
  source: ResearchResidualSource
  ruleId: string
  tool: string
}

export function failureClassId(cls: ResearchRefineFailureClass): string {
  return `${cls.source}§${cls.ruleId}§${cls.tool}`
}

export function parseFailureClassId(id: string): ResearchRefineFailureClass | undefined {
  const [source, ruleId, tool] = id.split('§')
  if (!source || !ruleId || !tool) return undefined
  return { source: source as ResearchResidualSource, ruleId, tool }
}

/**
 * Episode Stream 事件（append-only JSONL，每行一个）。
 * ts / seq 由 stream 写入时补齐；重放是状态的唯一推导方式。
 */
export type ResearchRefineEvent =
  | { type: 'residual'; ts: string; seq: number; classId: string; messageExcerpt: string; run?: string }
  | { type: 'success'; ts: string; seq: number; source: ResearchResidualSource; tool: string }
  | { type: 'refined'; ts: string; seq: number; refinementId: string; attributedClassIds: string[]; entryIds: string[] }
  | { type: 'validated'; ts: string; seq: number; refinementId: string; evidenceSeqs: number[] }
  | { type: 'rolled_back'; ts: string; seq: number; refinementId: string; reason: 'lint' | 'refuted' | 'manifest_mismatch' }
  | { type: 'promoted'; ts: string; seq: number; refinementId: string }

export type ResearchRefinementStatus = 'PENDING' | 'VALIDATED' | 'ROLLED_BACK' | 'PROMOTED'

/** append 的入参形态：ts/seq 由 stream 补齐（Omit 对 union 需经 DistributiveOmit 分发）。 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type ResearchRefineEventInput = DistributiveOmit<ResearchRefineEvent, 'ts' | 'seq'>

export interface ResearchRefinementState {
  refinementId: string
  status: ResearchRefinementStatus
  attributedClassIds: string[]
  /** refine 之后、同 class 的 success/residual 序号（验证分母/分子）。 */
  postSeq: number
  rolledBackReason?: 'lint' | 'refuted' | 'manifest_mismatch'
}

export interface ResearchRefineClassState {
  classId: string
  /** 上一次 refined 事件之后新增的 residual（reviewer 的触发信号）。 */
  openResiduals: Array<{ seq: number; messageExcerpt: string }>
  /** 被回滚（refuted）的 refinement id 链，digest 需引用"上次尝试失败"。 */
  refutedRefinementIds: string[]
}

export interface ResearchRefineState {
  classes: Map<string, ResearchRefineClassState>
  refinements: Map<string, ResearchRefinementState>
  /** 本 run 已发生的 residual 触发型 refine 次数（budget 分子）。 */
  residualRefineCount: number
  events: ResearchRefineEvent[]
}

/** plan §6.1 / §5 的起始默认值；E-refine 中调参。 */
export const RESEARCH_REFINE_DEFAULTS = {
  /** 同一 class 未消费 residual 数达到阈值才 approve（compact tick 放宽到 1）。 */
  residualThreshold: 2,
  compactResidualThreshold: 1,
  /** 每 run residual 触发型 refine 预算（promotion 的 global refine 不占）。 */
  residualRefineBudget: 3,
  /** 每个归因 class 需要的 k 次干净 eligible action。 */
  validationK: 3,
  /** digest 中每条 residual 的 messageExcerpt 截断长度。 */
  excerptMaxChars: 160,
} as const
