/**
 * 三栏研究工作台的投影（契约：mindset/画布-数据契约.md）：时间线 / 探针卡 / 版本链。
 * 纯函数；只读结构化字段（不从自然语言猜关联）。回放传完整记录 + seq，由本模块先裁切再投影。
 */
import { summarize } from './status.ts'
import type { JournalEvent, ResearchRecord } from './types.ts'

export interface TimelineEntry {
  seq: number
  ts: string
  op: string
  title: string
  pid?: string
  hids: string[]
}

export interface ProbeChange {
  seq: number
  hid: string
  /** 迁移前状态；该假设此前从未提出过则缺省 */
  from?: string
  to: string
  reason: string
  /** 被封顶时 agent 请求的状态（to 是封顶后的实际状态） */
  requested?: string
  /** 封顶原因码（MCP caps，如 no_audit） */
  lead?: string[]
}

export interface ProbeCard {
  pid: string
  question: string
  protocol: string
  /** 阻断剂原文；'' 或 'none' = 无 */
  blockers: string
  reps: number
  metric?: string
  status: 'pending' | 'measured' | 'failed'
  bands: { hid: string; low: number; high: number }[]
  observed?: number
  changes: ProbeChange[]
  note?: string
}

export interface ProbeVersion {
  id: string
  pid: string
  status: 'rejected' | 'accepted' | 'unrecorded'
  ts?: string
  /** 仅 accepted：prereg.write 所在 journal 行 */
  seq?: number
  /** 关联草稿，相对工作目录（research:read-stage-doc 可读的是当前内容，不是当时内容） */
  path?: string
  reason?: string
  sha256?: string
}

export interface Workbench {
  timeline: TimelineEntry[]
  probeCards: ProbeCard[]
  versionChains: ProbeVersion[]
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const byId = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

function label(e: JournalEvent): string {
  const d = e.data
  switch (e.op) {
    case 'run.init': return `开始研究 ${str(d.run) ?? ''}`.trim()
    case 'env.snapshot': return '记录运行环境'
    case 'world.info': return `世界 ${String(d.world ?? '')} · seed ${String(d.seed ?? '')}`
    case 'world.env': return '记录世界生成器版本'
    case 'world.env.verify': return d.match === true ? '世界环境核对一致' : '世界环境核对不一致'
    case 'claim.transition': {
      const lead = Array.isArray(d.lead) ? d.lead.map(String) : []
      const capped = str(d.requested) ? `· 请求 ${d.requested} 被封顶${lead.length ? `（${lead.join('、')}）` : ''}` : ''
      return summarize(e) + capped
    }
    default: return summarize(e)
  }
}

function refs(e: JournalEvent): { pid?: string; hids: string[] } {
  const d = e.data
  const pid = str(d.pid) ?? str(d.by_probe)
  const hids = new Set<string>()
  if (e.op.startsWith('claim.')) {
    const id = str(d.id)
    if (id) hids.add(id)
  }
  const target = str(d.target)
  if (e.op === 'attack.record' && target) hids.add(target)
  if (e.op === 'prereg.write' && Array.isArray(d.claims)) for (const c of d.claims) if (typeof c === 'string') hids.add(c)
  return { ...(pid ? { pid } : {}), hids: [...hids] }
}

function probeCards(rec: ResearchRecord, events: JournalEvent[]): ProbeCard[] {
  const state = new Map<string, string>()
  const changes = new Map<string, ProbeChange[]>()
  for (const e of events) {
    const id = str(e.data.id)
    if (!id) continue
    if (e.op === 'claim.propose') state.set(id, 'LIVE')
    if (e.op !== 'claim.transition') continue
    const to = String(e.data.to)
    const pid = str(e.data.by_probe)
    if (pid) {
      const requested = str(e.data.requested)
      const from = state.get(id)
      changes.set(pid, [...(changes.get(pid) ?? []), {
        seq: e.seq,
        hid: id,
        ...(from ? { from } : {}),
        to,
        reason: str(e.data.note) ?? '',
        ...(requested ? { requested, lead: Array.isArray(e.data.lead) ? e.data.lead.map(String) : [] } : {}),
      }])
    }
    state.set(id, to)
  }
  const pids = [...new Set(events.filter((e) => e.op === 'prereg.write').map((e) => String(e.data.pid)))]
  return pids.map((pid) => {
    const p = rec.preregs[pid]
    const observe = events.find((e) => e.op === 'world.observe' && e.data.pid === pid)
    const land = events.find((e) => e.op === 'probe.land' && e.data.pid === pid)
    const metric = num(land?.data.metric)
    const status = !land ? 'pending' : land.data.exit_code === 0 && metric !== undefined ? 'measured' : 'failed'
    return {
      pid,
      question: p?.question ?? '',
      protocol: p?.protocol ?? str(observe?.data.protocol) ?? '',
      blockers: p?.blockers ?? str(observe?.data.blockers) ?? '',
      reps: num(observe?.data.reps) ?? p?.reps ?? 1,
      ...(p?.metricSpec ? { metric: p.metricSpec } : {}),
      status,
      bands: Object.entries(p?.bands ?? {})
        .sort(([a], [b]) => byId(a, b))
        .map(([hid, [low, high]]) => ({ hid, low, high })),
      ...(status === 'measured' ? { observed: metric } : {}),
      changes: changes.get(pid) ?? [],
      ...(status === 'failed'
        ? { note: land!.data.exit_code === 0 ? '测量失败（落地无数值）' : `测量失败（exit ${String(land!.data.exit_code)}）` }
        : {}),
    }
  })
}

const cellOf = (protocol: unknown, blockers: unknown): string => {
  const b = String(blockers ?? '').trim()
  return `${String(protocol ?? '')}\u0000${b.toLowerCase() === 'none' ? '' : b}`
}

/** 该时刻 journal 已到第几行（拒绝排在该行之后）；时间戳坏 → 末行（同未提交草稿） */
function journalPos(events: JournalEvent[], ts: string, lastSeq: number): number {
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return lastSeq
  return events.findLast((e) => Date.parse(e.ts) <= t)?.seq ?? 0
}

/**
 * 被拒的 prereg_write 提交 + 冻结的 prereg，按时间排；草稿挂到同 pid、同观测格（协议 + 阻断剂）的最后一次提交上
 * （草稿是文件当前内容，对应最近一次用它的提交）。挂不上的草稿 = unrecorded，没有时间，只在末行显示。
 * ponytail: 同格多次改写草稿只剩最后一份内容，旧版不可恢复；要逐版内容需 MCP 在提交时快照草稿。
 */
function versionChains(rec: ResearchRecord, cut: number): ProbeVersion[] {
  type Attempt = ProbeVersion & { cell: string; pos: number }
  const lastSeq = rec.events.at(-1)?.seq ?? 0
  const attempts: Attempt[] = []
  for (const r of rec.rejections ?? []) {
    if (r.op !== 'prereg_write' || !r.pid) continue
    const o = (r.spec?.observe ?? {}) as Record<string, unknown>
    attempts.push({
      id: `rejections.jsonl:${r.line}`, pid: r.pid, status: 'rejected', ts: r.ts, reason: r.error,
      cell: cellOf(o.protocol, o.blockers), pos: journalPos(rec.events, r.ts, lastSeq),
    })
  }
  for (const e of rec.events) {
    if (e.op !== 'prereg.write') continue
    const pid = String(e.data.pid)
    const p = rec.preregs[pid]
    attempts.push({
      id: str(e.data.prereg_path) ?? `prereg/${pid}.json`, pid, status: 'accepted', ts: e.ts, seq: e.seq,
      ...(p ? { sha256: p.fileSha256 } : {}),
      cell: cellOf(p?.protocol, p?.blockers), pos: e.seq,
    })
  }
  attempts.sort((a, b) => a.pos - b.pos || (a.ts ?? '').localeCompare(b.ts ?? ''))
  const orphans: ProbeVersion[] = []
  for (const d of rec.drafts) {
    if (!d.pid) continue
    const cell = d.observe && cellOf(d.observe.protocol, d.observe.blockers)
    // 同格多份草稿：依次挂到更早的同格提交上（按文件名序，不按写入时间）
    const hit = cell ? attempts.findLast((a) => a.pid === d.pid && a.cell === cell && !a.path) : undefined
    if (hit) hit.path = d.path
    else orphans.push({ id: `research-work/${d.path}`, pid: d.pid, status: 'unrecorded', path: d.path, sha256: d.sha256 })
  }
  const visible = attempts.filter((a) => a.pos <= cut).map(({ cell: _c, pos: _p, ...v }) => v)
  return cut >= lastSeq ? [...visible, ...orphans] : visible
}

/** 回放到第 seq 行：传完整记录（不要先裁切），缺省 = 全程。 */
export function workbench(rec: ResearchRecord, seq = Infinity): Workbench {
  const events = rec.events.filter((e) => e.seq <= seq)
  return {
    timeline: events.map((e) => ({ seq: e.seq, ts: e.ts, op: e.op, title: label(e), ...refs(e) })),
    probeCards: probeCards(rec, events),
    versionChains: versionChains(rec, seq),
  }
}
