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

/**
 * residual 来源；lint_violation 由 C3 写入（plan §3）。
 * system：Traceback / 宿主错误 / harness 直写（02 §3.3 S 行），只记录，永不触发 refine。
 */
export type ResearchResidualSource = 'guard' | 'mcp' | 'gate' | 'reconcile' | 'user' | 'lint_violation' | 'system'

/** 只记录、不作 refine 触发源的来源（02 §3.3：拒绝不可学；SE0）。 */
export const NON_LEARNABLE_SOURCES: readonly ResearchResidualSource[] = ['lint_violation', 'guard', 'system']

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
  /** fp：调用参数指纹（sha256 前 16 位，不存原文）；同 source 连续同 tool 同 fp = 重复调用，不计成功。 */
  | { type: 'success'; ts: string; seq: number; source: ResearchResidualSource; tool: string; fp?: string }
  | { type: 'refined'; ts: string; seq: number; refinementId: string; attributedClassIds: string[]; entryIds: string[] }
  | { type: 'validated'; ts: string; seq: number; refinementId: string; evidenceSeqs: number[] }
  | { type: 'rolled_back'; ts: string; seq: number; refinementId: string; reason: ResearchRollbackReason }
  | { type: 'promoted'; ts: string; seq: number; refinementId: string }
  /** 判定输入被篡改（磁盘与宿主内存基线不符）或宿主标记污染（refineNow）：本会话臂 contaminated（H2，SE3）。 */
  | { type: 'tamper'; ts: string; seq: number; reason: string }

/** unauthorized：没有 C2 令牌的 local refine_complete，或任何 global refine_complete（02 §3.5）。 */
export type ResearchRollbackReason = 'lint' | 'refuted' | 'manifest_mismatch' | 'unauthorized'

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
  rolledBackReason?: ResearchRollbackReason
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
  /** 出现过 tamper 事件：不再产生 VALIDATED（粘性）。 */
  contaminated: boolean
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
  /** 同参数连续调用达到此数记一条 procedural `stagnation` residual（02 §2.1 T1，[INF] 阈值）。 */
  stagnationRun: 5,
} as const
