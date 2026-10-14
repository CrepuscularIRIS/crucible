/**
 * 记录 → 画布 / 评委报告用的投影（04 §2.4、§3.3–§3.6）。纯函数，按 journal 行号（1 起算）排序。
 */
import type {
  CellMark,
  ClaimState,
  ClaimView,
  EvidenceCell,
  Flag,
  Focus,
  Intervention,
  JournalEvent,
  ResearchRecord,
} from './types.ts'

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const upTo = (rec: ResearchRecord, seq: number) => rec.events.filter((e) => e.seq <= seq)

export interface ProbeCycle {
  pid: string
  preregSeq: number
  landSeq?: number
  exitCode?: number
  metric?: number
  observeSeq?: number
  reps: number
  cost?: number
  /** by_probe 指向本探针的迁移 */
  transitions: JournalEvent[]
  /** 本探针落地之后、下一次落地之前、没有 by_probe 的迁移（"判断，非测量"） */
  judgments: JournalEvent[]
}

export function probeCycles(rec: ResearchRecord): ProbeCycle[] {
  const lands = rec.events.filter((e) => e.op === 'probe.land')
  return rec.events
    .filter((e) => e.op === 'prereg.write')
    .map((w) => {
      const pid = String(w.data.pid)
      const land = lands.find((e) => e.data.pid === pid)
      const observe = rec.events.find((e) => e.op === 'world.observe' && e.data.pid === pid)
      const nextLand = land ? lands.find((e) => e.seq > land.seq)?.seq ?? Infinity : -1
      return {
        pid,
        preregSeq: w.seq,
        landSeq: land?.seq,
        exitCode: land ? num(land.data.exit_code) : undefined,
        metric: land ? num(land.data.metric) : undefined,
        observeSeq: observe?.seq,
        reps: num(observe?.data.reps) ?? rec.preregs[pid]?.reps ?? 1,
        cost: num(observe?.data.cost),
        transitions: rec.events.filter((e) => e.op === 'claim.transition' && e.data.by_probe === pid),
        judgments: land
          ? rec.events.filter(
              (e) =>
                e.op === 'claim.transition' &&
                e.data.by_probe === undefined &&
                e.seq > land.seq &&
                e.seq < nextLand,
            )
          : [],
      }
    })
}

export function claimsAt(rec: ResearchRecord, seq = Infinity): Map<string, ClaimView> {
  const claims = new Map<string, ClaimView>()
  for (const e of upTo(rec, seq)) {
    const id = str(e.data.id)
    if (!id) continue
    if (e.op === 'claim.propose') {
      claims.set(id, {
        id,
        statement: str(e.data.statement) ?? '',
        state: 'LIVE',
        parent: str(e.data.parent),
        proposedAt: e.seq,
        history: [],
      })
    } else if (e.op === 'claim.transition') {
      const c = claims.get(id)
      if (!c) continue
      c.state = String(e.data.to) as ClaimState
      c.history.push({ seq: e.seq, to: c.state, byProbe: str(e.data.by_probe), note: str(e.data.note) ?? '' })
    }
  }
  return claims
}

export interface SimWindow {
  values: number[]
  seqs: number[]
  min?: number
  max?: number
}

/**
 * 同协议候选仿真值。默认窗口：该 prereg 之前、最近一次 claim.propose / prereg.write 之后；
 * `{from: 1}` 取全程。这是"候选值范围"，候选参数未记录，含参数差异——不是噪声。
 */
export function simsBefore(rec: ResearchRecord, pid: string, opts: { from?: number } = {}): SimWindow {
  const pre = rec.events.find((e) => e.op === 'prereg.write' && e.data.pid === pid)
  const protocol = rec.preregs[pid]?.protocol
  if (!pre || !protocol) return { values: [], seqs: [] }
  const anchor = rec.events.findLast(
    (e) => e.seq < pre.seq && (e.op === 'claim.propose' || e.op === 'prereg.write'),
  )
  const from = opts.from ?? (anchor ? anchor.seq + 1 : 1)
  const sims = rec.events.filter(
    (e) => e.op === 'world.simulate' && e.seq >= from && e.seq < pre.seq && e.data.protocol === protocol,
  )
  const values = sims.map((e) => num(e.data.mean_spike_count) ?? NaN)
  return {
    values,
    seqs: sims.map((e) => e.seq),
    min: values.length ? Math.min(...values) : undefined,
    max: values.length ? Math.max(...values) : undefined,
  }
}

/** prereg 带表或分支里点名的假设 */
export function namedBy(rec: ResearchRecord, pid: string): Set<string> {
  const p = rec.preregs[pid]
  return new Set([...Object.keys(p?.bands ?? {}), ...(p?.branches ?? []).map((b) => b.target)])
}

const inBand = (x: number, [lo, hi]: [number, number]) => x >= lo && x <= hi

/** 该观测触发的预登记分支动作（kill > support > scope） */
export function branchHit(rec: ResearchRecord, pid: string, hid: string, metric: number): CellMark | undefined {
  const acts = new Set(
    (rec.preregs[pid]?.branches ?? []).filter((b) => b.target === hid && inBand(metric, b.band)).map((b) => b.action),
  )
  return acts.has('kill') ? 'kill' : acts.has('support') ? 'support' : acts.has('scope') ? 'scope' : undefined
}

export function evidenceCells(rec: ResearchRecord): EvidenceCell[] {
  const hids = [...claimsAt(rec).keys()]
  return probeCycles(rec).flatMap((c) =>
    hids.map((hid) => {
      let mark: CellMark
      if (c.landSeq === undefined) mark = 'pending'
      else if (c.exitCode !== 0 || c.metric === undefined) mark = 'failed'
      else mark = branchHit(rec, c.pid, hid, c.metric) ?? (namedBy(rec, c.pid).has(hid) ? 'outside' : 'unbanded')
      const judgment = c.judgments.find((e) => e.data.id === hid)
      return { pid: c.pid, hid, mark, ...(judgment ? { judgmentSeq: judgment.seq } : {}) }
    }),
  )
}

export function derivation(
  rec: ResearchRecord,
  annotated?: Record<string, string>,
): { status: 'recorded' | 'annotated' | 'unrecorded'; parents: Record<string, string> } {
  const recorded: Record<string, string> = {}
  for (const c of claimsAt(rec).values()) if (c.parent) recorded[c.id] = c.parent
  if (Object.keys(recorded).length) return { status: 'recorded', parents: recorded }
  if (annotated && Object.keys(annotated).length) return { status: 'annotated', parents: annotated }
  return { status: 'unrecorded', parents: {} }
}

export type TimelineItem = { pos: number; event: JournalEvent } | { pos: number; intervention: Intervention }

/** journal 行 + 干预，干预排在第 journal_lines 行之后、下一行之前 */
export function timeline(rec: ResearchRecord): TimelineItem[] {
  const items: TimelineItem[] = rec.events.map((event) => ({ pos: event.seq, event }))
  for (const intervention of rec.interventions ?? []) items.push({ pos: intervention.journal_lines + 0.5, intervention })
  return items.sort((a, b) => a.pos - b.pos)
}

const PAUSE_STATES = new Set(['PAUSING', 'PAUSED', 'ASKING'])

export function focusAt(rec: ResearchRecord, seq: number, ctx: { controlState?: string } = {}): Focus {
  const events = upTo(rec, seq)
  const openForks = (rec.interventions ?? []).filter(
    (i) =>
      i.kind === 'fork_open' &&
      i.journal_lines <= seq &&
      !(rec.interventions ?? []).some((a) => a.kind === 'fork_answer' && a.journal_lines <= seq && a.fork?.id === i.fork?.id),
  )
  if (openForks.length) return { kind: 'fork', pids: [], title: '等你决定' }
  if (ctx.controlState && PAUSE_STATES.has(ctx.controlState)) return { kind: 'paused', pids: [], title: '已暂停' }

  const lands = events.filter((e) => e.op === 'probe.land')
  const writes = events.filter((e) => e.op === 'prereg.write')
  const failed = lands.findLast((e) => e.data.exit_code !== 0)
  if (failed && !writes.some((w) => w.seq > failed.seq)) {
    return { kind: 'failed', pids: [String(failed.data.pid)], title: `测量失败 ${failed.data.pid}` }
  }
  const waiting = writes.map((w) => String(w.data.pid)).filter((pid) => !lands.some((l) => l.data.pid === pid))
  if (waiting.length) return { kind: 'awaiting', pids: waiting, title: `等待测量 ${waiting.join('、')}` }
  const ok = lands.findLast((e) => e.data.exit_code === 0)
  if (ok && !events.some((e) => e.op === 'claim.transition' && e.seq > ok.seq && e.data.by_probe === ok.data.pid)) {
    return { kind: 'interpret', pids: [String(ok.data.pid)], title: `判读结果 ${ok.data.pid}` }
  }
  if (events.some((e) => e.op === 'report.declare')) return { kind: 'done', pids: [], title: '已结束' }
  return { kind: 'next', pids: [], title: '下一步' }
}

export interface ForkCandidate {
  hid: string
  pid: string
  reps: number
  seq: number
}

/**
 * F-a（§3.6）：即将 REFUTED，且 by_probe 是唯一一个已成功落地、点名该假设的探针，reps ≤ 2，
 * 该假设没问过，本 run F-a 已问 < 2 次。
 */
export function forkCandidate(
  rec: ResearchRecord,
  t: { id: string; to: string; by_probe?: string; seq: number },
  asked: string[] = [],
): ForkCandidate | null {
  if (t.to !== 'REFUTED' || !t.by_probe || asked.includes(t.id) || asked.length >= 2) return null
  const naming = probeCycles(rec).filter(
    (c) => c.landSeq !== undefined && c.landSeq < t.seq && c.exitCode === 0 && namedBy(rec, c.pid).has(t.id),
  )
  if (naming.length !== 1 || naming[0]!.pid !== t.by_probe || naming[0]!.reps > 2) return null
  return { hid: t.id, pid: t.by_probe, reps: naming[0]!.reps, seq: t.seq }
}

/** 按 journal 顺序回放全部 REFUTED，返回会触发 F-a 的那些 */
export function forkCandidates(rec: ResearchRecord): ForkCandidate[] {
  const hits: ForkCandidate[] = []
  for (const e of rec.events) {
    if (e.op !== 'claim.transition') continue
    const hit = forkCandidate(
      rec,
      { id: String(e.data.id), to: String(e.data.to), by_probe: str(e.data.by_probe), seq: e.seq },
      hits.map((h) => h.hid),
    )
    if (hit) hits.push(hit)
  }
  return hits
}

/** 画布标记（只打标、不问人）。M-indep 需要复算，只走 annotations；M-budget 需调用方给预算。 */
export function flags(rec: ResearchRecord, opts: { budgetTotal?: number } = {}): Flag[] {
  const out: Flag[] = []
  const cycles = new Map(probeCycles(rec).map((c) => [c.pid, c]))
  for (const e of rec.events) {
    if (e.op !== 'claim.transition') continue
    const hid = String(e.data.id)
    const pid = str(e.data.by_probe)
    const to = String(e.data.to)
    const c = pid ? cycles.get(pid) : undefined
    if (!c || (to !== 'REFUTED' && to !== 'SUPPORTED')) continue
    if (c.reps <= 2) out.push({ code: 'M-reps', seq: e.seq, pid, hid, note: `依据 ${pid} 只测了 ${c.reps} 次` })
    if (to !== 'REFUTED') continue
    const landedNaming = [...cycles.values()].filter(
      (x) => x.landSeq !== undefined && x.landSeq < e.seq && x.exitCode === 0 && namedBy(rec, x.pid).has(hid),
    )
    if (landedNaming.length === 1) out.push({ code: 'M-single', seq: e.seq, pid, hid, note: `否定只依据 ${pid} 一个探针` })
    const band = rec.preregs[pid!]?.bands[hid]
    const sims = simsBefore(rec, pid!, { from: 1 }).values
    if (band && !sims.some((v) => inBand(v, band))) {
      out.push({ code: 'M-band', seq: e.seq, pid, hid, note: `${hid} 的预测区间 [${band.join(', ')}] 没有任何同协议仿真值落入（区间无仿真来源）` })
    }
  }
  const declare = rec.events.find((e) => e.op === 'report.declare')
  const refuted = [...claimsAt(rec).values()].some((c) => c.state === 'REFUTED')
  if (declare && refuted && rec.report) {
    rec.report.lines.forEach((line, i) => {
      if (/不存在/.test(line)) out.push({ code: 'M-null', seq: declare.seq, note: `REPORT.md:${i + 1} 把"没测到"写成"不存在"` })
    })
  }
  if (declare && opts.budgetTotal !== undefined) {
    const spent = probeCycles(rec).reduce((s, c) => s + (c.cost ?? 0), 0)
    const named = new Set([...cycles.keys()].flatMap((pid) => [...namedBy(rec, pid)]))
    const unprobed = [...claimsAt(rec).values()].filter((c) => c.state === 'LIVE' && !named.has(c.id))
    if (opts.budgetTotal - spent <= 2 && unprobed.length) {
      out.push({ code: 'M-budget', seq: declare.seq, note: `预算剩 ${opts.budgetTotal - spent}，${unprobed.map((c) => c.id).join('、')} 未被任何探针点名` })
    }
  }
  return out.sort((a, b) => a.seq - b.seq)
}

export interface FeedbackChange {
  from: string
  to: string
  fromProtocol: string
  toProtocol: string
  observed: number
  reps: number
  landedIn: string[]
  transitions: { id: string; to: string }[]
  toQuestion: string
}

/** 第一处"一次反馈改变"：相邻两次成功落地的探针换了协议 */
export function feedbackChange(rec: ResearchRecord): FeedbackChange | null {
  const ok = probeCycles(rec).filter((c) => c.exitCode === 0 && c.metric !== undefined)
  for (let i = 0; i + 1 < ok.length; i++) {
    const a = ok[i]!
    const b = ok[i + 1]!
    const pa = rec.preregs[a.pid]
    const pb = rec.preregs[b.pid]
    if (!pa || !pb || pa.protocol === pb.protocol) continue
    return {
      from: a.pid,
      to: b.pid,
      fromProtocol: pa.protocol,
      toProtocol: pb.protocol,
      observed: a.metric!,
      reps: a.reps,
      landedIn: Object.entries(pa.bands)
        .filter(([, band]) => inBand(a.metric!, band))
        .map(([hid]) => hid),
      transitions: [...a.transitions, ...a.judgments].map((e) => ({ id: String(e.data.id), to: String(e.data.to) })),
      toQuestion: pb.question,
    }
  }
  return null
}

/** 阶段报告：已知 / 未知 / 下一步，各 ≤ 3 条 */
export function stageReport(rec: ResearchRecord, seq: number): { known: string[]; unknown: string[]; next: string[] } {
  const claims = [...claimsAt(rec, seq).values()]
  return {
    known: claims.filter((c) => c.state !== 'LIVE' && c.state !== 'CONTESTED').slice(-3).map((c) => `${c.id} ${c.state}`),
    unknown: claims.filter((c) => c.state === 'LIVE' || c.state === 'CONTESTED').slice(0, 3).map((c) => `${c.id} ${c.state}`),
    next: [focusAt(rec, seq).title],
  }
}
