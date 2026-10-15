/**
 * 运行中状态条（研究画布顶部）：阶段 / 预算 / 假设计数 / 最新事件 / 下一步。
 * 状态只从 journal（MCP 唯一写入）与工作目录的文件时间推出——agent 写的 ledger.md 可能写坏，不读。
 */
import { claimsAt, focusAt } from './project.ts'
import type { JournalEvent, ResearchRecord } from './types.ts'

export type RunPhase = 'K0' | 'recall' | 'sims' | 'prereg' | 'probe' | 'attack' | 'forecast' | 'report'

export const PHASE_LABEL: Record<RunPhase, string> = {
  K0: 'K0 开局',
  recall: 'recall 检索',
  sims: 'sims 假设与仿真',
  prereg: 'prereg 预登记',
  probe: 'probe 测量',
  attack: 'attack 攻击审查',
  forecast: 'forecast 预报',
  report: 'report 报告',
}

/** 工作目录 `research-work/<run>/` 的活动信号（主进程 stat 得到的 mtime，毫秒） */
export interface RunActivity {
  simMtimeMs?: number
  recallMtimeMs?: number
  docs?: { path: string; mtimeMs: number }[]
}

export interface RunStatus {
  phase: RunPhase
  budget: { spent: number; total?: number }
  counts: { LIVE: number; CONTESTED: number; REFUTED: number; SUPPORTED: number }
  latest?: { seq: number; ts: string; op: string; summary: string }
  /** 记录里推得出具体下一步时才有（等待测量 / 判读结果 / 测量失败 / 等你决定 / 已结束） */
  next?: string
}

const OP_PHASE: Record<string, RunPhase> = {
  'run.init': 'K0',
  'env.snapshot': 'K0',
  'world.info': 'K0',
  'world.env': 'K0',
  'claim.propose': 'sims',
  'world.simulate': 'sims',
  'prereg.write': 'prereg',
  'probe.start': 'probe',
  'world.observe': 'probe',
  'probe.land': 'probe',
  'claim.transition': 'probe',
  'attack.record': 'attack',
  'world.forecast': 'forecast',
  'world.env.verify': 'forecast',
  'report.declare': 'report',
  'gate.verdict': 'report',
}

function journalPhase(e: JournalEvent): RunPhase | undefined {
  if (e.op === 'claim.propose' && e.data.builtin === true) return 'K0'
  return OP_PHASE[e.op]
}

/** 工作目录里对应某阶段的文档；其余（lessons.md、ledger.md…）不改阶段 */
function docPhase(path: string): RunPhase | undefined {
  if (path.startsWith('recall/')) return 'recall'
  if (/^_P[^/]*\.json$/.test(path) || path === 'panel-design.json') return 'prereg'
  if (path === 'forecast.md') return 'forecast'
  if (path === 'REPORT.md') return 'report'
  return undefined
}

/** K0-intake 的 `budget:` 行里第一个整数（如"budget: 世界计量预算 8（…）"） */
export function budgetFromK0(k0: string | undefined): number | undefined {
  const m = /^\s*budget:\D*(\d+)/m.exec(k0 ?? '')
  return m ? Number(m[1]) : undefined
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))

export function summarize(e: JournalEvent): string {
  const d = e.data
  switch (e.op) {
    case 'claim.propose': return `提出 ${s(d.id)}`
    case 'claim.transition': return `${s(d.id)} → ${s(d.to)}${d.by_probe ? `（依据 ${s(d.by_probe)}）` : '（无探针）'}`
    case 'prereg.write': return `登记 ${s(d.pid)}`
    case 'probe.start': return `开始测量 ${s(d.pid)}`
    case 'world.observe': return `测量 ${s(d.pid)}：${s(d.protocol)} × ${s(d.reps)} 次`
    case 'probe.land': return d.exit_code === 0 ? `${s(d.pid)} 落地，读数 ${s(d.metric)}` : `${s(d.pid)} 测量失败（exit ${s(d.exit_code)}）`
    case 'attack.record': return `攻击 ${s(d.gid)} → ${s(d.target)}`
    case 'world.forecast': return '提交预报'
    case 'report.declare': return `声明报告 ${s(d.path)}`
    case 'gate.verdict': return `账本检查${d.passed === true ? '通过' : '未通过'}`
    default: return e.op
  }
}

const NEXT_KINDS = new Set(['fork', 'failed', 'awaiting', 'interpret', 'done'])

export function runStatus(
  rec: ResearchRecord,
  opts: { k0?: string; budgetTotal?: number; activity?: RunActivity } = {},
): RunStatus {
  const last = rec.events.at(-1)
  const phased = rec.events.findLast((e) => journalPhase(e) !== undefined)
  let phase: RunPhase = phased ? journalPhase(phased)! : 'K0'
  // 工作目录比 journal 最后一个阶段事件更新 → agent 正在做 journal 不记的事（检索 / 仿真 / 写草稿）
  let since = phased ? Date.parse(phased.ts) || 0 : 0
  const signals: [RunPhase | undefined, number | undefined][] = [
    ['recall', opts.activity?.recallMtimeMs],
    ['sims', opts.activity?.simMtimeMs],
    ...(opts.activity?.docs ?? []).map((d): [RunPhase | undefined, number] => [docPhase(d.path), d.mtimeMs]),
  ]
  for (const [p, t] of signals) {
    if (p && t !== undefined && t > since) {
      phase = p
      since = t
    }
  }

  const spent = rec.events
    .filter((e) => e.op === 'world.observe')
    .reduce((sum, e) => sum + (typeof e.data.cost === 'number' ? e.data.cost : 0), 0)
  const total = opts.budgetTotal ?? budgetFromK0(opts.k0)
  const counts = { LIVE: 0, CONTESTED: 0, REFUTED: 0, SUPPORTED: 0 }
  for (const c of claimsAt(rec).values()) if (c.state in counts) counts[c.state as keyof typeof counts]++
  const focus = last ? focusAt(rec, last.seq) : undefined

  return {
    phase,
    budget: total === undefined ? { spent } : { spent, total },
    counts,
    ...(last ? { latest: { seq: last.seq, ts: last.ts, op: last.op, summary: summarize(last) } } : {}),
    ...(focus && NEXT_KINDS.has(focus.kind) ? { next: focus.title } : {}),
  }
}
