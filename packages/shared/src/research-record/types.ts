/**
 * 研究记录投影的类型（04 §2）。一份记录 = run 目录这一捆文件；本模块只读、同步、无 Node API。
 * 哈希函数由调用方注入（主进程 / bun 脚本用 node:crypto）。
 */

/** journal 一行。`seq` 为 1 起算行号；`data` 是整行 JSON（含 op/ts/prev）。 */
export interface JournalEvent {
  seq: number
  ts: string
  op: string
  raw: string
  data: Record<string, unknown>
}

export type Band = [number, number]
export type BranchAction = 'kill' | 'support' | 'scope'

export interface Prereg {
  pid: string
  question: string
  protocol: string
  reps: number
  /** observe.blockers 原文（'' / 'none' = 无阻断剂） */
  blockers: string
  /** metricSpec 原文（观测量名称） */
  metricSpec?: string
  bands: Record<string, Band>
  branches: { band: Band; action: BranchAction; target: string; scopeNote?: string }[]
  frozenAt?: string
  /** sha256(文件原文)；与 `prereg.write.spec_sha256` 不一定同口径，只作版本卡展示 */
  fileSha256: string
}

export type ChildStatus = 'running' | 'ok' | 'blocked' | 'failed' | 'nonconforming'

export interface ChildJob {
  /** `job_name` = `<step>-<target>-<nonce>`；归档布局下即 `child-jobs/<name>/` 的目录名 */
  name: string
  status: ChildStatus
  selfReviewed?: boolean
  path?: string
  /** out.md 末行原文（不合契约时保留，前端截 80 字） */
  lastLine?: string
}

export type InterventionKind = 'ask' | 'pause' | 'resume' | 'steer' | 'stop' | 'fork_open' | 'fork_answer'

export interface ForkOption {
  label: string
  resolves: string
  cost: string
  remaining: string
  blocked_by?: string
}

export interface Intervention {
  id: string
  ts: string
  actor: 'user' | 'host'
  kind: InterventionKind
  text?: string
  affects?: string[]
  state_before?: string
  state_after?: string
  wired?: boolean
  children?: { name: string; status: string }[]
  fork?: { id: string; class: string; question: string; options: ForkOption[]; recommended?: string; chosen?: string } | null
  /** 记录时 journal 的行数；投影把它排在第 journal_lines 行之后 */
  journal_lines: number
  /** 记录时 journal 第 journal_lines 行原文的 sha256（0 行对空串） */
  journal_head?: string
  session_id?: string
  /** 上一行 interventions 原文的 sha256（首行对空串） */
  prev?: string
}

export interface ResearchRecord {
  run: string
  world?: string
  seed?: number
  events: JournalEvent[]
  journalSha256: string
  /** prev 链校验：broken 时 brokenAt = 第一处对不上的行（1 起算） */
  integrity: 'ok' | 'broken'
  brokenAt?: number
  preregs: Record<string, Prereg>
  report?: { text: string; lines: string[]; sha256: string; declaredSha256?: string }
  childJobs: ChildJob[]
  /** RULINGS.md 里以 `Ruling:` / `U#:` 开头的行 */
  rulings: string[]
  /** null = 本归档没有干预文件（报告写"未记录"，不写 0） */
  interventions: Intervention[] | null
  /** interventions.jsonl 第一处问题（坏行 / prev 断 / journal_head 对不上）；完好或无文件时缺省 */
  interventionsBroken?: { line: number; note: string }
  /** 其余原文件的 sha256（annotations / recompute 等），按相对路径 */
  fileSha256: Record<string, string>
  /** rejections.jsonl（MCP 被拒调用，无哈希链）；null = 本记录没有该文件 */
  rejections: Rejection[] | null
  /** 工作目录顶层的 _P*.json 草稿（agent 写的当前内容，无历史、无时间） */
  drafts: Draft[]
}

/** rejections.jsonl 一行；`line` 1 起算。prereg_write 的 spec 原样保留。 */
export interface Rejection {
  line: number
  ts: string
  op: string
  error: string
  pid?: string
  spec?: Record<string, unknown>
}

export interface Draft {
  /** 相对工作目录（可直接交给 research:read-stage-doc） */
  path: string
  sha256: string
  /** 内容里的 pid；解析失败时取文件名里的 P#，再不行为 undefined */
  pid?: string
  observe?: { protocol: string; blockers: string }
}

export type ClaimState = 'LIVE' | 'SUPPORTED' | 'REFUTED' | 'SCOPED' | 'CONTESTED'

export interface ClaimView {
  id: string
  statement: string
  state: ClaimState
  parent?: string
  proposedAt: number
  history: { seq: number; to: ClaimState; byProbe?: string; note: string }[]
}

/** 证据格：✓ 支持（带内）✕ 否定（带内）◐ 收窄 · 带外 — 未登记带 ◌ 待测 ✗ 测量失败 */
export type CellMark = 'support' | 'kill' | 'scope' | 'outside' | 'unbanded' | 'pending' | 'failed'

export interface EvidenceCell {
  pid: string
  hid: string
  mark: CellMark
  /** 无 by_probe 的迁移落在此列时：该迁移的行号（"判断，非测量"） */
  judgmentSeq?: number
}

export type FocusKind = 'fork' | 'paused' | 'failed' | 'awaiting' | 'interpret' | 'done' | 'next'

export interface Focus {
  kind: FocusKind
  pids: string[]
  /** 焦点卡标题（白话） */
  title: string
}

export type FlagCode = 'M-reps' | 'M-single' | 'M-band' | 'M-null' | 'M-budget'

export interface Flag {
  code: FlagCode
  seq: number
  pid?: string
  hid?: string
  note: string
}

// ---- annotations（归档专用，04 §2.3） ----

export type Mark = 'yes' | 'no' | 'partial'
export type Layer = '接入层' | '推理层' | '实例化层' | '设计层'
export type NodeKind = 'refute' | 'support' | 'scope' | 'prereg' | 'propose' | 'attack' | 'forecast' | 'report' | 'other'

export interface Basis {
  text: string
  ref: string
}

export interface Verdict {
  mark: Mark
  text: string
}

export interface PlainFive {
  knew: string | null
  why: string | null
  expect: string | null
  actual: string | null
  adjust: string | null
}

export interface AnnotationNode {
  id: string
  /** 1 起算闭区间；null = 不对应 journal 行（全程 / 会话外） */
  seq: [number, number] | null
  kind: NodeKind
  layer: Layer
  key: boolean
  title_plain: string
  plain?: Partial<PlainFive>
  at_time: Verdict
  hindsight: Verdict
  basis: Basis[]
  options_at_time?: string[]
  /** 未经复算核对、不写判定时为 true（报告标"未审"） */
  unreviewed?: boolean
}

export interface Annotations {
  schema: 'crucible.annotations/2'
  journal_sha256: string
  report_sha256: string
  case: {
    title: string
    model: string
    session_id?: string
    task_plain: string
    how_plain?: string
    changed_plain: string
    next_plain: string
    headline_plain: string
    background: string
    prompt: string
    /** 原话出处；转引或有省略时写明 */
    prompt_source: string
    budget_total: number
    truth: { text: string; source: string }
  }
  names: Record<string, string>
  parents?: Record<string, string>
  attacks_by?: Record<string, string>
  nodes: AnnotationNode[]
  corrections: { quote_ref: string; quote: string; later: string; correction: string; basis: Basis[] }[]
  unknowns: string[]
}

export interface Recompute {
  schema: 'crucible.recompute/1'
  script: string
  values: Record<string, number | string | boolean>
}

export interface JudgeNode {
  id: string
  seq: [number, number] | null
  kind: NodeKind
  layer: Layer
  key: boolean
  title: string
  pid?: string
  five: { label: string; text: string; audited: boolean }[]
  atTime: Verdict
  hindsight: Verdict
  basis: Basis[]
  options: string[]
  /** 证据抽屉：原始记录行、推导值、复算键、审查者 */
  rawLines: { seq: number; raw: string }[]
  derived: string[]
  recomputeKeys: string[]
  reviewers: string[]
  unreviewed: boolean
}

/** 控制态名（04 §3.7）；状态机本身在主进程 research-control.ts，IPC 通道常量在 apps/electron/src/types/research-record.ts */
export type ControlStateName = 'DONE' | 'AWAIT_USER' | 'RUNNING' | 'PAUSING' | 'ASKING' | 'PAUSED' | 'IDLE'
