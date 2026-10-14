/**
 * 评委报告的节点卡（04 §4.2–§4.5）：annotations × 记录 × 复算 → JudgeNode[]。
 * 校验不过就抛 JudgeError（生成器据此拒绝生成）。确定性：不读时钟、不用 Intl / toLocale*。
 */
import { claimsAt, namedBy, probeCycles, simsBefore, type ProbeCycle } from './project.ts'
import type { Annotations, AnnotationNode, JudgeNode, Mark, Recompute, ResearchRecord, Verdict } from './types.ts'

export class JudgeError extends Error {}

export const JUDGE_REPORT_VERSION = 'judge-report/1'

/** 记录里的词 → 报告里的白话（§4.5）。画布 tooltip 也用它。 */
export const plainTerms: Record<string, string> = {
  prereg: '事先写下的预测和判定规则',
  预登记: '事先写下的预测和判定规则',
  band: '预测区间',
  REFUTED: '被否定',
  SUPPORTED: '得到支持',
  SCOPED: '收窄到更小的说法',
  CONTESTED: '有争议',
  LIVE: '待定',
  probe: '一次真实测量',
  'world.observe': '一次真实测量',
  'world.simulate': '免费的仿真',
  candidate: '免费的仿真',
  reps: '重复次数',
  gate: '程序检查',
  journal: '运行记录',
}

/** 首屏不得出现的原词（T2） */
export const FIRST_SCREEN_FORBIDDEN = Object.keys(plainTerms).filter((k) => k !== 'LIVE')
export const FIRST_SCREEN_ID = /[HPDGU]\d/

export function firstScreenViolations(text: string): string[] {
  const lower = text.toLowerCase()
  const hits = FIRST_SCREEN_FORBIDDEN.filter((w) => lower.includes(w.toLowerCase()))
  const id = FIRST_SCREEN_ID.exec(text)
  return id ? [...hits, id[0]] : hits
}

/** ISO 时刻 → 固定 UTC+08:00 显示（与运行环境时区无关） */
export function fmtTime(ts: string): string {
  const ms = Date.parse(ts)
  if (Number.isNaN(ms)) return ts
  const iso = new Date(ms + 8 * 3600_000).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}（UTC+08:00）`
}

export function fmtNum(x: number): string {
  return String(Math.round(x * 100) / 100)
}

const STATE_WORD: Record<string, string> = {
  REFUTED: '被否定',
  SUPPORTED: '得到支持',
  SCOPED: '收窄到更小的说法',
  CONTESTED: '改为有争议',
  LIVE: '待定',
}
const ACTION_WORD = { kill: '否定', support: '支持', scope: '收窄' } as const

export const MARK_WORD: Record<'atTime' | 'hindsight', Record<Mark, string>> = {
  atTime: { yes: '合理', no: '不合理', partial: '部分合理' },
  hindsight: { yes: '正确', no: '错误', partial: '部分正确' },
}
export const MARK_ICON: Record<Mark, string> = { yes: '✓', no: '✕', partial: '⚠' }

export function interpolate(text: string, rc: Recompute | undefined, used?: Set<string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const v = rc?.values[key]
    if (v === undefined) throw new JudgeError(`recompute.json 缺键 ${key}`)
    used?.add(key)
    return typeof v === 'boolean' ? (v ? '是' : '否') : String(v)
  })
}

const KIND_OPS: Record<string, (e: { op: string; data: Record<string, unknown> }) => boolean> = {
  refute: (e) => e.op === 'claim.transition' && e.data.to === 'REFUTED',
  support: (e) => e.op === 'claim.transition' && e.data.to === 'SUPPORTED',
  scope: (e) => e.op === 'claim.transition' && e.data.to === 'SCOPED',
  prereg: (e) => e.op === 'prereg.write',
  propose: (e) => e.op === 'claim.propose',
  attack: (e) => e.op === 'attack.record',
  forecast: (e) => e.op === 'world.forecast',
  report: (e) => e.op === 'report.declare',
}

export function hname(ann: Annotations, hid: string): string {
  const n = ann.names[hid]
  return n ? `${hid}（${n}）` : hid
}

function inRange(seq: number, range: [number, number] | null): boolean {
  return range !== null && seq >= range[0] && seq <= range[1]
}

const FIVE_LABELS = ['当时知道', '为什么这样选', '期待看到', '实际发生', '因此调整'] as const
const FIVE_KEYS = ['knew', 'why', 'expect', 'actual', 'adjust'] as const

/** 一个探针周期的五句话，全部由记录推出（§4.3） */
export function probeFive(rec: ResearchRecord, ann: Annotations, c: ProbeCycle): string[] {
  const p = rec.preregs[c.pid]!
  const live = [...claimsAt(rec, c.preregSeq).values()].filter((x) => x.state === 'LIVE' || x.state === 'CONTESTED')
  const before = probeCycles(rec).filter((x) => x.landSeq !== undefined && x.landSeq < c.preregSeq && x.metric !== undefined)
  const sims = simsBefore(rec, c.pid)
  const all = simsBefore(rec, c.pid, { from: 1 })
  const knew = [
    `登记时仍在考虑：${live.map((x) => hname(ann, x.id)).join('、') || '无'}。`,
    before.length
      ? `之前的真实测量：${before.map((x) => `${x.pid} 得 ${fmtNum(x.metric!)}（${x.reps} 次）`).join('；')}。`
      : '之前还没有真实测量。',
    sims.values.length
      ? `同协议候选仿真值 ${fmtNum(sims.min!)}–${fmtNum(sims.max!)}（${sims.values.length} 次；候选参数未记录，含参数差异）。`
      : all.values.length
        ? `上次登记之后没有同协议仿真；全程同协议候选仿真值 ${fmtNum(all.min!)}–${fmtNum(all.max!)}（${all.values.length} 次；候选参数未记录，含参数差异）。`
        : '同协议没有候选仿真。',
  ].join('')
  const groups = new Map<string, string[]>()
  for (const b of p.branches) {
    const k = `${fmtNum(b.band[0])}–${fmtNum(b.band[1])}`
    groups.set(k, [...(groups.get(k) ?? []), `${ACTION_WORD[b.action]} ${b.target}`])
  }
  const expect = `若结果落在 ${[...groups].map(([band, acts]) => `${band}：${acts.join('、')}`).join('；')}。`
  let actual: string
  if (c.landSeq === undefined) actual = '还没有测量。'
  else if (c.exitCode !== 0 || c.metric === undefined) actual = `这次测量没有成功（退出码 ${c.exitCode}），没有得到数值。`
  else {
    const landed = Object.entries(p.bands).filter(([, [lo, hi]]) => c.metric! >= lo && c.metric! <= hi).map(([h]) => h)
    actual = `测了 ${c.reps} 次，平均得 ${fmtNum(c.metric)}，${landed.length ? `落在 ${landed.join('、')} 的预测区间` : '不在任何假设的预测区间内'}。`
  }
  const moves = [
    ...c.transitions.map((e) => `${e.data.id} ${STATE_WORD[String(e.data.to)] ?? e.data.to}`),
    ...c.judgments.map((e) => `${e.data.id} ${STATE_WORD[String(e.data.to)] ?? e.data.to}（判断，非测量，第 ${e.seq} 行）`),
  ]
  const cycles = probeCycles(rec)
  const next = cycles[cycles.findIndex((x) => x.pid === c.pid) + 1]
  const nextP = next ? rec.preregs[next.pid] : undefined
  const adjust =
    (moves.length ? `${moves.join('、')}。` : '没有据此改变任何判断。') +
    (nextP ? `下一组实验 ${next!.pid} ${nextP.protocol === p.protocol ? '沿用同一协议' : `改用「${nextP.protocol}」`}。` : '')
  return [knew, p.question, expect, actual, adjust]
}

function nodePid(rec: ResearchRecord, n: AnnotationNode): string | undefined {
  const evs = rec.events.filter((e) => inRange(e.seq, n.seq))
  for (const e of evs) {
    if (e.op === 'claim.transition' && typeof e.data.by_probe === 'string') return e.data.by_probe
    if ((e.op === 'prereg.write' || e.op === 'probe.land' || e.op === 'world.observe') && typeof e.data.pid === 'string') {
      return e.data.pid
    }
  }
  return undefined
}

function verdict(v: Verdict | undefined, rc: Recompute | undefined, used: Set<string>, id: string): Verdict {
  if (!v || !v.text.trim()) throw new JudgeError(`节点 ${id} 缺双栏判定`)
  return { mark: v.mark, text: interpolate(v.text, rc, used) }
}

/** 校验 annotations 与记录一致，并组装节点卡。不一致即抛 JudgeError。 */
export function judgeNodes(rec: ResearchRecord, ann: Annotations, rc: Recompute | undefined): JudgeNode[] {
  if (ann.journal_sha256 !== rec.journalSha256) {
    throw new JudgeError(`annotations 钉的 journal sha256 ${ann.journal_sha256.slice(0, 12)}… 与归档 ${rec.journalSha256.slice(0, 12)}… 不符`)
  }
  if (rec.integrity !== 'ok') throw new JudgeError(`journal 哈希链在第 ${rec.brokenAt} 行断开`)
  if (!rec.report || ann.report_sha256 !== rec.report.sha256) throw new JudgeError('annotations 钉的 REPORT sha256 与归档不符')
  const cycles = new Map(probeCycles(rec).map((c) => [c.pid, c]))
  const lastSeq = rec.events.at(-1)?.seq ?? 0
  return ann.nodes.map((n) => {
    const used = new Set<string>()
    if (n.seq) {
      if (n.seq[0] < 1 || n.seq[1] > lastSeq || n.seq[0] > n.seq[1]) throw new JudgeError(`节点 ${n.id} 的 seq 超出 journal`)
      const check = KIND_OPS[n.kind]
      if (check && !rec.events.some((e) => inRange(e.seq, n.seq) && check(e))) {
        throw new JudgeError(`节点 ${n.id} 标为 ${n.kind}，但第 ${n.seq[0]}–${n.seq[1]} 行没有对应事件`)
      }
    } else if (n.kind !== 'other') throw new JudgeError(`节点 ${n.id} 标为 ${n.kind} 却没有 seq`)
    if (n.key && !n.basis.length) throw new JudgeError(`关键节点 ${n.id} 缺依据`)
    const pid = ['refute', 'support', 'scope', 'prereg'].includes(n.kind) ? nodePid(rec, n) : undefined
    const cycle = pid ? cycles.get(pid) : undefined
    const auto = cycle ? probeFive(rec, ann, cycle) : []
    const five = FIVE_KEYS.map((k, i) => {
      const over = n.plain?.[k]
      if (over) return { label: FIVE_LABELS[i]!, text: interpolate(over, rc, used), audited: true }
      return { label: FIVE_LABELS[i]!, text: auto[i] ?? '', audited: false }
    })
    if (n.key && five.some((f) => !f.text.trim())) throw new JudgeError(`关键节点 ${n.id} 的五句话不全`)
    const sims = pid ? simsBefore(rec, pid) : undefined
    const rawSeqs = new Set<number>([...(sims?.seqs ?? []), ...(cycle?.observeSeq ? [cycle.observeSeq] : [])])
    for (const e of rec.events) if (inRange(e.seq, n.seq)) rawSeqs.add(e.seq)
    const derived: string[] = []
    if (pid && sims) {
      const all = simsBefore(rec, pid, { from: 1 })
      if (sims.values.length) {
        derived.push(`同协议候选仿真值（最近窗口）${fmtNum(sims.min!)}–${fmtNum(sims.max!)}，${sims.values.length} 次，第 ${sims.seqs.join('、')} 行；候选参数未记录，含参数差异`)
      }
      if (all.values.length) derived.push(`同协议候选仿真值（全程）${fmtNum(all.min!)}–${fmtNum(all.max!)}，${all.values.length} 次`)
      if (cycle?.metric !== undefined) {
        const bands = Object.entries(rec.preregs[pid]!.bands)
          .map(([h, [lo, hi]]) => `${h} [${fmtNum(lo)}, ${fmtNum(hi)}]${cycle.metric! >= lo && cycle.metric! <= hi ? ' ← 观测落在此' : ''}`)
        derived.push(`观测 ${fmtNum(cycle.metric)}（${cycle.reps} 次）对各预测区间：${bands.join('；')}`)
      }
    }
    const touched = new Set(
      rec.events.filter((e) => inRange(e.seq, n.seq) && e.op === 'claim.transition').map((e) => String(e.data.id)),
    )
    const reviewers = rec.events
      .filter((e) => e.op === 'attack.record' && (touched.has(String(e.data.target)) || inRange(e.seq, n.seq)))
      .map((e) => `${e.data.gid} → ${e.data.target}：${ann.attacks_by?.[String(e.data.gid)] ?? '作者未记录'}`)
    const node: JudgeNode = {
      id: n.id,
      seq: n.seq,
      kind: n.kind,
      layer: n.layer,
      key: n.key,
      title: interpolate(n.title_plain, rc, used),
      pid,
      five,
      atTime: verdict(n.at_time, rc, used, n.id),
      hindsight: verdict(n.hindsight, rc, used, n.id),
      basis: n.basis.map((b) => ({ text: interpolate(b.text, rc, used), ref: b.ref })),
      options: (n.options_at_time ?? []).map((o) => interpolate(o, rc, used)),
      rawLines: [...rawSeqs].sort((a, b) => a - b).map((seq) => ({ seq, raw: rec.events[seq - 1]!.raw })),
      derived,
      recomputeKeys: [],
      reviewers: reviewers.length ? reviewers : ['无（本节点没有对应的攻击记录）'],
      unreviewed: Boolean(n.unreviewed),
    }
    node.recomputeKeys = [...used].sort()
    return node
  })
}

/** 首屏四问：怎么做的默认由记录推出 */
export function caseAnswers(rec: ResearchRecord, ann: Annotations, rc: Recompute | undefined): { label: string; text: string }[] {
  const cycles = probeCycles(rec)
  const failed = cycles.filter((c) => c.landSeq !== undefined && c.exitCode !== 0).length
  const spent = cycles.reduce((s, c) => s + (c.cost ?? 0), 0)
  const sims = rec.events.filter((e) => e.op === 'world.simulate').length
  const how =
    ann.case.how_plain ??
    `先写下预测和判定规则再做真实测量：${cycles.length} 组实验${failed ? `（${failed} 组测量失败）` : ''}，用掉 ${spent}/${ann.case.budget_total} 次测量，另跑了 ${sims} 次免费仿真。`
  const answers = [
    { label: '研究什么', text: interpolate(ann.case.task_plain, rc) },
    { label: '怎么做的', text: interpolate(how, rc) },
    { label: '结果改变了什么', text: interpolate(ann.case.changed_plain, rc) },
    { label: '下一步是什么', text: interpolate(ann.case.next_plain, rc) },
  ]
  for (const a of answers) {
    if ([...a.text].length > 80) throw new JudgeError(`首屏"${a.label}"超过 80 字`)
    const bad = firstScreenViolations(a.text)
    if (bad.length) throw new JudgeError(`首屏"${a.label}"含原词 ${bad.join('、')}`)
  }
  const head = firstScreenViolations(ann.case.headline_plain + ann.case.title)
  if (head.length) throw new JudgeError(`首屏标题含原词 ${head.join('、')}`)
  return answers
}

/** 原结论与修正：原句必须逐字出现在 REPORT 那一行 */
export function corrections(rec: ResearchRecord, ann: Annotations, rc: Recompute | undefined) {
  return ann.corrections.map((c) => {
    const m = /^REPORT\.md:(\d+)$/.exec(c.quote_ref)
    const line = m ? rec.report?.lines[Number(m[1]) - 1] : undefined
    if (line === undefined || !line.includes(c.quote)) {
      throw new JudgeError(`引文不在 ${c.quote_ref}：「${c.quote.slice(0, 30)}…」`)
    }
    return {
      ...c,
      later: interpolate(c.later, rc),
      correction: interpolate(c.correction, rc),
      basis: c.basis.map((b) => ({ text: interpolate(b.text, rc), ref: b.ref })),
    }
  })
}

/** 附录：每个探针周期一张五句话卡；没有被关键节点覆盖的标"未审" */
export function cycleCards(rec: ResearchRecord, ann: Annotations, nodes: JudgeNode[]) {
  return probeCycles(rec).map((c) => ({
    pid: c.pid,
    protocol: rec.preregs[c.pid]?.protocol ?? '',
    seq: [c.preregSeq, c.transitions.at(-1)?.seq ?? c.landSeq ?? c.preregSeq] as [number, number],
    five: probeFive(rec, ann, c).map((text, i) => ({ label: FIVE_LABELS[i]!, text })),
    reviewedBy: nodes.filter((n) => n.pid === c.pid && !n.unreviewed).map((n) => n.id),
    named: [...namedBy(rec, c.pid)],
  }))
}
