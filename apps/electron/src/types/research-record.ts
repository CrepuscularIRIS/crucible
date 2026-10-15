/**
 * 研究记录 IPC 契约（04 §2 / §3.7，轨道 R）——主进程、preload、渲染层共用。
 *
 * 通道常量只在这里一份（04 §2.4 原计划放 shared，shared 那份已删，避免两处漂移）。
 */

export const RESEARCH_RECORD_IPC_CHANNELS = {
  GET_RECORD: 'research:get-record',
  /** 画布卸载 / 退订：停掉 GET_RECORD 开始的轮询 */
  RELEASE_RECORD: 'research:release-record',
  LIST_ARCHIVES: 'research:list-archives',
  OPEN_ARCHIVE: 'research:open-archive',
  INTERVENE: 'research:intervene',
  /** 读 research-work/<run>/ 下的一份阶段文档（只读） */
  READ_STAGE_DOC: 'research:read-stage-doc',
  /** run 记录建立之前的 K0 草稿 `.research-pending/K0-intake.md` 原文（只读；没有为 null） */
  PENDING_INTAKE: 'research:pending-intake',
  /** 评委报告 HTML（research/report/judge-report.ts；需要 annotations.json） */
  JUDGE_REPORT: 'research:judge-report',
  /** 主进程 → 渲染层推送：{ sessionId, snapshot } */
  RECORD_CHANGED: 'research:record-changed',
} as const

export type ResearchControlKind = 'pause' | 'resume' | 'ask' | 'steer' | 'stop'
export type ResearchInterventionKind = ResearchControlKind | 'fork_open' | 'fork_answer'
export type ResearchControlStateName = 'IDLE' | 'RUNNING' | 'AWAIT_USER' | 'PAUSING' | 'PAUSED' | 'ASKING' | 'DONE'
export type ResearchForksMode = 'auto' | 'wait'

export interface ResearchGate {
  readOnly: boolean
  stopAtTurn: boolean
}

/** 选项原样留痕（label + 三段式 description），三栏由视图解析（04 §3.6 选项格式）。 */
export interface ResearchForkOption {
  label: string
  description?: string
}

export interface ResearchFork {
  id: string
  class: string
  question: string
  options: ResearchForkOption[]
  request_id?: string
  /** 仅 fork_answer：用户所选（AskUser answers 的值，多问时以 " / " 连接） */
  chosen?: string
}

export interface ResearchChildJob {
  /** job_name = `<step>-<target>-<nonce>` */
  name: string
  status: 'running' | 'ok' | 'blocked' | 'failed' | 'nonconforming'
}

/** `<run>/interventions.jsonl` 的一行（仅宿主写；自带哈希链，钉 journal 行号 + 链头）。 */
export interface ResearchIntervention {
  id: string
  ts: string
  actor: 'user' | 'host'
  kind: ResearchInterventionKind
  text?: string
  affects: string[]
  state_before: ResearchControlStateName
  state_after: ResearchControlStateName
  wired: boolean
  children: ResearchChildJob[]
  fork: ResearchFork | null
  /** 记录时 journal 行数；投影把本条排在该行之后 */
  journal_lines: number
  /** 记录时 journal 末行原文的 sha256（空 journal 对空串） */
  journal_head: string
  session_id: string
  /** 上一行 interventions 原文的 sha256（首行对空串） */
  prev: string
}

export interface ResearchControlView {
  state: ResearchControlStateName
  gate: ResearchGate
  waitingOn?: string
  /** IR-C1 是否已接线（回合边界停 + 只读闸门） */
  wired: boolean
  /** IR-C3 是否可用（空闲时取消子任务） */
  canCancelChildren: boolean
  forks: ResearchForksMode
}

export interface ResearchRecordSnapshot {
  source: 'live' | 'archive'
  sessionId?: string
  /** run 目录（live）或归档目录 */
  root: string
  run: string
  /**
   * 归档布局的相对路径 → 原文（live 布局在主进程里归一：作业目录压平成 child-jobs/<job_name>/）。
   * 工作台三栏（@proma/shared/research-record 的 workbench(parseBundle(files), seq)）另用：
   * `rejections.jsonl`（run 目录）与 `research-work/_P*.json`（工作目录顶层草稿）。
   */
  files: Record<string, string>
  /** null = 链完好；字符串 = 第一处断链说明 */
  integrity: { journal: string | null; interventions: string | null }
  control: ResearchControlView | null
  /** 工作目录 `research-work/<run>/`（live：会话 cwd 下；归档：归档目录下）；不存在为 null */
  workdir: ResearchWorkdir | null
  /** 世界计量总预算（live：PROMA_EVAL_BUDGET，缺省同 MCP 的 8）；归档不给，由 K0 的 budget 行推 */
  budgetTotal?: number
}

/** 阶段文档：工作目录里任意深度的 .md + 顶层 .json（不含 sim/、nbsim/） */
export interface ResearchStageDoc {
  /** 相对工作目录，`/` 分隔 */
  path: string
  mtimeMs: number
  size: number
}

export interface ResearchWorkdir {
  /** 新的在前 */
  docs: ResearchStageDoc[]
  /** sim/、recall/ 目录的 mtime（新增文件即变）：状态条据此推"正在仿真 / 检索" */
  simMtimeMs?: number
  recallMtimeMs?: number
}

/** 读阶段文档：live 只给 sessionId；归档另给 archivePath（同 open-archive 白名单） */
export interface ResearchStageDocInput {
  sessionId: string
  archivePath?: string
  path: string
}

export type ResearchStageDocResult = ResearchStageDoc & { text: string }

export interface ResearchJudgeReportInput {
  sessionId: string
  archivePath?: string
}

export type ResearchJudgeReportResult = { html: string } | { error: string }

export interface ResearchArchiveEntry {
  path: string
  run: string
}

export interface ResearchInterveneInput {
  sessionId: string
  kind: ResearchControlKind | 'fork_answer'
  text?: string
  affects?: string[]
  /** 仅 fork_answer（会话已结束后在焦点卡上作答） */
  forkId?: string
  chosen?: string
}

/** 主进程不发消息：渲染层用现有发送 API 执行（queue = 运行中追加 priority now；prompt = 新一轮）。 */
export interface ResearchSendPlan {
  mode: 'queue' | 'prompt'
  text: string
}

export interface ResearchInterveneResult {
  /** 本次写入的干预 id；运行中暂停已生效时再点"问"不新增记录 */
  id?: string
  control: ResearchControlView
  send?: ResearchSendPlan
  /** "问"先暂停：状态到 PAUSED 后渲染层再以 kind:'ask' 调用一次 */
  askAfterPause?: boolean
  /** 用户点了终止且会话在运行：渲染层调用现有 stopAgent */
  stop?: boolean
}
