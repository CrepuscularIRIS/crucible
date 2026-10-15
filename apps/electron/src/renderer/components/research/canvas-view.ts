/**
 * canvas-view — 研究画布的纯视图模型（04 §3，轨道 U1）
 *
 * 输入 = J1 投影模块解析出的 ResearchRecord（实时快照或归档）；输出 = 组件直接渲染的字符串与结构。
 * 不依赖 DOM / React。回放到第 seq 行 = 先把记录截到第 seq 行，再用同一套投影函数。
 */

import {
  branchHit,
  budgetFromK0,
  claimsAt,
  derivation,
  evidenceCells,
  feedbackChange,
  flags as recordFlags,
  fmtTime,
  focusAt,
  namedBy,
  PHASE_LABEL,
  runStatus,
  probeCycles,
  simsBefore,
  stageReport,
  workbench,
  type Annotations,
  type CellMark,
  type ClaimState,
  type Flag,
  type FocusKind,
  type JournalEvent,
  type Mark,
  type ResearchRecord,
} from '@proma/shared/research-record'
import type { ResearchWorkdir } from '@/types/research-record'
import { probeHeading, type WorkbenchView } from './workbench-view'
import { controlBar, forkOptionView, type ControlBarView, type ControlStateName, type ForkOptionView } from './controls-view'

export interface CanvasControl {
  state: ControlStateName
  wired: boolean
  canCancelChildren: boolean
  waitingOn?: string
}

export interface CanvasOptions {
  seq?: number
  mode: 'live' | 'replay'
  /** 回放时显示的归档路径 */
  source?: string
  /** 主进程是否提供研究控制接口（轨道 R1） */
  bridge: boolean
  control?: CanvasControl | null
  annotations?: Annotations | null
  /** 主进程（R1）对快照两条哈希链的校验：null = 完好，字符串 = 第一处断链（快照 integrity 字段） */
  hostIntegrity?: { journal: string | null; interventions: string | null } | null
  /** 工作目录 research-work/<run>/（快照 workdir）：阶段文档列表；实时模式下也用来推阶段 */
  workdir?: ResearchWorkdir | null
  /** 世界计量总预算（快照 budgetTotal）；缺省依次取注记、K0 的 budget 行 */
  budgetTotal?: number
  /** K0-intake.md 原文 */
  k0?: string
}

/** 状态条（全部从 journal + 工作目录时间推出，不读 agent 写的 ledger.md） */
export interface StatusView { phase: string; budget: string; counts: string; latest?: string; next?: string }
export interface DocItem { path: string; time: string; newest: boolean }

export interface Cell { label: string; text: string }
export interface Warning { code: Flag['code']; pid?: string; text: string }
export interface FocusView {
  kind: FocusKind
  title: string
  lines: string[]
  warnings: Warning[]
  options?: ForkOptionView[]
}
export interface ClaimRow {
  id: string
  name: string
  statement: string
  state: ClaimState
  stateLabel: string
  depth: number
  verdicts: { node: string; title: string; atTime: string; hindsight: string }[]
}
export interface MatrixCell { pid: string; mark: CellMark; label: string; judgmentSeq?: number }
export interface CanvasView {
  /** 三栏工作台的数据适配口；投影未接入时显示空状态，不合成实验或版本。 */
  workbench?: WorkbenchView
  title: string
  modeLabel: string
  seq: number
  maxSeq: number
  integrityNote?: string
  cells: Cell[]
  focus: FocusView
  claims: ClaimRow[]
  derivationNote?: string
  matrix: { columns: { pid: string; label: string }[]; rows: { hid: string; cells: MatrixCell[] }[] }
  feedback: string[] | null
  stage: { known: string[]; unknown: string[]; next: string[] }
  children: { name: string; statusLabel: string; detail?: string }[]
  interventions: { id: string; kind: string; text: string; status: string }[]
  timeline: { id: string; seq: number; title: string; atTime: string; hindsight: string }[]
  flags: Flag[]
  controls: ControlBarView
  status: StatusView
  docs: DocItem[]
}

export const STATE_LABEL: Record<ClaimState, string> = {
  LIVE: '○ 未定', SUPPORTED: '✓ 得到支持', REFUTED: '✕ 被否定', SCOPED: '◐ 收窄', CONTESTED: '? 有争议',
}
const CELL_LABEL: Record<CellMark, string> = {
  support: '✓ 支持（带内）', kill: '✕ 否定（带内）', scope: '◐ 收窄', outside: '· 带外',
  unbanded: '— 未登记带', pending: '◌ 待测', failed: '✗ 测量失败',
}
const ACTION_LABEL: Record<string, string> = { kill: '否定', support: '支持', scope: '收窄' }
const ACTION_TO: Record<string, ClaimState> = { kill: 'REFUTED', support: 'SUPPORTED', scope: 'SCOPED' }
const MARK_ICON: Record<Mark, string> = { yes: '✓', no: '✕', partial: '◐' }
const CONTROL_LABEL: Record<ControlStateName, string> = {
  IDLE: '○ 空闲', RUNNING: '● 运行中', AWAIT_USER: '● 等你回答', PAUSING: '◐ 暂停中', PAUSED: '‖ 已暂停', ASKING: '◐ 询问中', DONE: '✓ 已结束',
}

export const fmt = (n: number): string => String(Math.round(n * 100) / 100)
/** "MM-DD HH:MM"（UTC+08:00，与评委报告 fmtTime 同口径） */
const shortTime = (iso: string): string => fmtTime(iso).slice(5, 16)

function statusView(rec: ResearchRecord, opts: CanvasOptions): StatusView {
  const budgetTotal = opts.budgetTotal ?? opts.annotations?.case?.budget_total
  const s = runStatus(rec, {
    ...(opts.k0 !== undefined ? { k0: opts.k0 } : {}),
    ...(budgetTotal !== undefined ? { budgetTotal } : {}),
    // 回放到过去某行时，"现在"的工作目录不代表当时在做什么
    ...(opts.mode === 'live' && opts.workdir ? { activity: opts.workdir } : {}),
  })
  return {
    phase: PHASE_LABEL[s.phase],
    budget: s.budget.total === undefined ? String(s.budget.spent) : `${s.budget.spent} / ${s.budget.total}`,
    counts: `LIVE ${s.counts.LIVE} · CONTESTED ${s.counts.CONTESTED} · REFUTED ${s.counts.REFUTED}${s.counts.SUPPORTED ? ` · SUPPORTED ${s.counts.SUPPORTED}` : ''}`,
    ...(s.latest ? { latest: `第 ${s.latest.seq} 行 · ${shortTime(s.latest.ts)} · ${s.latest.summary}` } : {}),
    ...(s.next ? { next: s.next } : {}),
  }
}

/** 阶段文档的只读渲染方式：md 走 markdown（不渲染原始 HTML），json 缩进，坏 JSON 显示原文 */
export function stageDocView(path: string, text: string): { kind: 'markdown' | 'json' | 'text'; text: string } {
  if (path.endsWith('.md')) return { kind: 'markdown', text }
  try {
    return { kind: 'json', text: JSON.stringify(JSON.parse(text), null, 2) }
  } catch {
    return { kind: 'text', text }
  }
}
const bandText = ([lo, hi]: [number, number]): string => `[${fmt(lo)}, ${fmt(hi)}]`
const inBand = (x: number, [lo, hi]: [number, number]): boolean => x >= lo && x <= hi

/** 记录截到第 seq 行：之后才登记的 prereg、才声明的报告、才发生的干预都不可见 */
export function sliceRecord(rec: ResearchRecord, seq: number): ResearchRecord {
  const events = rec.events.filter((e) => e.seq <= seq)
  const written = new Set(events.filter((e) => e.op === 'prereg.write').map((e) => String(e.data.pid)))
  return {
    ...rec,
    events,
    preregs: Object.fromEntries(Object.entries(rec.preregs).filter(([pid]) => written.has(pid))),
    report: events.some((e) => e.op === 'report.declare') ? rec.report : undefined,
    interventions: rec.interventions ? rec.interventions.filter((i) => i.journal_lines <= seq) : null,
  }
}

/** "同协议候选仿真值 a–b（n 次；候选参数未记录，含参数差异）"——不写噪声 / 散布（04 §2.4） */
export function simsLine(rec: ResearchRecord, pid: string, from?: number): string {
  const w = simsBefore(rec, pid, from === undefined ? {} : { from })
  if (!w.values.length) return '登记前没有同协议候选仿真'
  return `同协议候选仿真值 ${fmt(w.min!)}–${fmt(w.max!)}（${w.values.length} 次；候选参数未记录，含参数差异）`
}

/** 等待测量时的前瞻标记：只测 ≤2 次却要分清多种解释（M-reps，画布只打标） */
function awaitingWarnings(rec: ResearchRecord, pids: string[]): Warning[] {
  return pids.flatMap((pid) => {
    const p = rec.preregs[pid]
    if (!p || p.reps > 2) return []
    const k = Object.keys(p.bands).length
    return [{ code: 'M-reps' as const, pid, text: k >= 2 ? `只测 ${p.reps} 次就要分清 ${k} 种解释` : `只测 ${p.reps} 次` }]
  })
}

function branchPhrases(rec: ResearchRecord, pid: string, metric: number): string[] {
  return [...namedBy(rec, pid)].flatMap((hid) => {
    const hit = branchHit(rec, pid, hid, metric)
    return hit ? [`${ACTION_LABEL[hit]} ${hid}`] : []
  })
}

function focusView(rec: ResearchRecord, seq: number, opts: CanvasOptions): FocusView {
  const f = focusAt(rec, seq, opts.control ? { controlState: opts.control.state } : {})
  const base = { kind: f.kind, title: f.title }
  const cycles = probeCycles(rec)
  switch (f.kind) {
    case 'awaiting':
      return {
        ...base,
        lines: f.pids.flatMap((pid) => {
          const p = rec.preregs[pid]
          return p ? [`${pid}：${p.question}`, `协议：${p.protocol} · 重复 ${p.reps} 次`, simsLine(rec, pid)] : [pid]
        }),
        warnings: awaitingWarnings(rec, f.pids),
      }
    case 'interpret': {
      const pid = f.pids[0]!
      const c = cycles.find((x) => x.pid === pid)!
      const p = rec.preregs[pid]
      const landed = Object.entries(p?.bands ?? {}).filter(([, b]) => inBand(c.metric!, b)).map(([hid, b]) => `${hid} 的预测区间 ${bandText(b)}`)
      const branches = branchPhrases(rec, pid, c.metric!)
      return {
        ...base,
        lines: [
          `观测 ${fmt(c.metric!)}（${c.reps} 次），${landed.length ? `落在 ${landed.join('、')}` : '不在任何预测区间内'}`,
          branches.length ? `预登记分支：${branches.join('、')}` : '预登记分支：没有命中的分支',
        ],
        warnings: [],
      }
    }
    case 'failed': {
      const pid = f.pids[0]!
      const land = rec.events.findLast((e) => e.op === 'probe.land' && e.data.pid === pid)
      const reason = rec.events.find((e) => land && e.seq > land.seq && (e.op === 'attack.record' || e.op === 'claim.transition'))
      return {
        ...base,
        lines: [
          `这次测量没有成功（exit_code ${String(land?.data.exit_code)}）；是否扣预算以运行记录为准`,
          reason ? `之后的说明（第 ${reason.seq} 行）：${String(reason.data.text ?? reason.data.note ?? '')}` : '记录里没有失败原因',
        ],
        warnings: [],
      }
    }
    case 'fork': {
      const open = (rec.interventions ?? []).findLast((i) => i.kind === 'fork_open')
      const pending = opts.control?.state === 'AWAIT_USER' || opts.control?.state === 'PAUSING'
      const note = opts.mode !== 'live' ? [] : pending ? ['请在对话里的提问横幅作答（宿主从不代答）'] : ['原提问已失效，作答将作为改方向消息发出']
      return {
        ...base,
        lines: [open?.fork?.question ?? '', ...note].filter(Boolean),
        warnings: [],
        options: (open?.fork?.options ?? []).map((o) => forkOptionView(o as Parameters<typeof forkOptionView>[0])),
      }
    }
    case 'paused': {
      const last = (rec.interventions ?? []).findLast((i) => i.kind === 'pause' || i.kind === 'ask')
      const running = rec.childJobs.filter((j) => j.status === 'running').map((j) => j.name)
      return {
        ...base,
        lines: [
          last ? `原因（${last.id}）：${last.text ?? ''}` : '原因未记录',
          running.length ? `在途子任务：${running.join('、')}（暂停不停止它们）` : '没有在途子任务',
          ...(opts.control?.waitingOn ? [`等待：${opts.control.waitingOn}`] : []),
        ],
        warnings: [],
      }
    }
    case 'done': {
      const s = stageReport(rec, seq)
      return { ...base, lines: [`已知：${s.known.join('；') || '暂无记录'}`, `未知：${s.unknown.join('；') || '记录未列出未决项，不代表没有不确定性'}`], warnings: [] }
    }
    case 'next': {
      const open = [...claimsAt(rec).values()].filter((c) => c.state === 'LIVE' || c.state === 'CONTESTED')
      return { ...base, lines: [open.length ? `待判假设：${open.map((c) => `${c.id} ${STATE_LABEL[c.state]}`).join('、')}` : '没有待判假设'], warnings: [] }
    }
  }
}

function statusCells(rec: ResearchRecord, budgetTotal?: number): Cell[] {
  const cycles = probeCycles(rec).filter((c) => c.landSeq !== undefined)
  const spent = cycles.reduce((s, c) => s + (c.cost ?? 0), 0)
  const gate = rec.events.findLast((e) => e.op === 'gate.verdict')
  const ledger = rec.integrity === 'broken'
    ? `记录链断裂（第 ${rec.brokenAt} 行）`
    : !gate ? '未声明' : gate.data.passed === true ? '通过（只说明记录前后一致，不说明结论正确）' : '未通过'
  const declared = rec.events.some((e) => e.op === 'report.declare')
  const claims = [...claimsAt(rec).values()]
  const verdict = (s: ClaimState) => claims.filter((c) => c.state === s).map((c) => c.id).join('、')
  const science = !declared
    ? '尚无定论'
    : [verdict('SUPPORTED') && `${verdict('SUPPORTED')} 得到支持`, verdict('REFUTED') && `${verdict('REFUTED')} 被否定`].filter(Boolean).join('；') || '已声明，无支持或否定'
  return [
    { label: '进度', text: `已测 ${cycles.length} 次 · 预算已用 ${spent}${budgetTotal === undefined ? '' : ` / ${budgetTotal}`}` },
    { label: '账本检查', text: ledger },
    { label: '科学结论', text: science },
  ]
}

const VERDICT_TO: Record<string, string> = { refute: 'REFUTED', support: 'SUPPORTED', scope: 'SCOPED' }

function claimRows(rec: ResearchRecord, seq: number, annotations?: Annotations | null): { rows: ClaimRow[]; note?: string } {
  const claims = [...claimsAt(rec).values()]
  const d = derivation(rec, annotations?.parents)
  const happened = (annotations?.nodes ?? []).filter((n) => n.seq && n.seq[1] <= seq)
  const verdicts = (id: string) => happened
    .filter((n) => rec.events.some((e) => e.data.id === id && e.seq >= n.seq![0] && e.seq <= n.seq![1] &&
      (n.kind === 'propose' ? e.op === 'claim.propose' : e.op === 'claim.transition' && (!VERDICT_TO[n.kind] || e.data.to === VERDICT_TO[n.kind]))))
    .map((n) => ({ node: n.id, title: n.title_plain, atTime: MARK_ICON[n.at_time.mark], hindsight: MARK_ICON[n.hindsight.mark] }))
  const row = (id: string, depth: number): ClaimRow => {
    const c = claims.find((x) => x.id === id)!
    return {
      id, depth, verdicts: verdicts(id), statement: c.statement, state: c.state, stateLabel: STATE_LABEL[c.state],
      name: annotations?.names?.[id] ?? (c.statement.length > 24 ? `${c.statement.slice(0, 24)}…` : c.statement),
    }
  }
  // 树序：根在前，子节点紧随父节点；父不在记录里时当根
  const ids = new Set(claims.map((c) => c.id))
  const rows: ClaimRow[] = []
  const visit = (id: string, depth: number): void => {
    rows.push(row(id, depth))
    claims.filter((c) => d.parents[c.id] === id).forEach((c) => visit(c.id, depth + 1))
  }
  claims.filter((c) => !d.parents[c.id] || !ids.has(d.parents[c.id]!)).forEach((c) => visit(c.id, 0))
  const note = d.status === 'unrecorded' ? '派生关系未记录' : d.status === 'annotated' ? '派生关系来自审计注记（记录里未写 parent）' : undefined
  return { rows, ...(note ? { note } : {}) }
}

function integrityNote(full: ResearchRecord, host: CanvasOptions['hostIntegrity']): { integrityNote?: string } {
  const notes = [
    full.integrity === 'broken'
      ? `运行记录哈希链在第 ${full.brokenAt} 行断开，内容可能被改过`
      : host?.journal ? `运行记录哈希链校验失败：${host.journal}` : '',
    host?.interventions ? `干预记录（interventions.jsonl）校验失败：${host.interventions}，人的干预列表可能不全或被改过` : '',
  ].filter(Boolean)
  return notes.length ? { integrityNote: notes.join('；') } : {}
}

export function canvasView(full: ResearchRecord, opts: CanvasOptions): CanvasView {
  // 中间写坏的行被跳过，events.length 会小于末行行号
  const maxSeq = full.events.at(-1)?.seq ?? 0
  const seq = maxSeq === 0 ? 0 : Math.max(1, Math.min(opts.seq ?? maxSeq, maxSeq))
  const rec = sliceRecord(full, seq)
  const wb = workbench(full, seq)
  const budgetTotal = opts.budgetTotal ?? opts.annotations?.case?.budget_total ?? budgetFromK0(opts.k0)
  const declared = rec.events.some((e) => e.op === 'report.declare')
  const { rows, note } = claimRows(rec, seq, opts.annotations)
  const cycles = probeCycles(rec)
  const cells = evidenceCells(rec)
  const fb = feedbackChange(rec)
  const control = opts.control
  const modeLabel = opts.mode === 'replay'
    ? `回放 · 只读${opts.source ? ` · ${opts.source}` : ''}`
    : control ? CONTROL_LABEL[control.state] : '实时 · 只读'
  return {
    title: [full.run || '研究', full.world && full.world !== full.run ? full.world : ''].filter(Boolean).join(' · '),
    modeLabel,
    seq,
    maxSeq,
    workbench: { events: wb.timeline, probes: wb.probeCards.map((p, i, all) => ({ ...p, closed: declared || i < all.length - 1 })), versions: wb.versionChains },
    ...integrityNote(full, opts.hostIntegrity),
    cells: statusCells(rec, budgetTotal),
    focus: focusView(rec, seq, opts),
    claims: rows,
    ...(note ? { derivationNote: note } : {}),
    matrix: {
      columns: cycles.map((c) => ({ pid: c.pid, label: `${c.pid}（${c.reps} 次）` })),
      rows: rows.map((r) => ({
        hid: r.id,
        cells: cycles.map((c) => {
          const cell = cells.find((x) => x.pid === c.pid && x.hid === r.id)!
          const label = cell.judgmentSeq ? `${CELL_LABEL[cell.mark]} · 判断，非测量（第 ${cell.judgmentSeq} 行）` : CELL_LABEL[cell.mark]
          return { pid: c.pid, mark: cell.mark, label, ...(cell.judgmentSeq ? { judgmentSeq: cell.judgmentSeq } : {}) }
        }),
      })),
    },
    feedback: fb && [
      `${fb.from} → ${fb.to}`,
      `原协议：${fb.fromProtocol}；实测 ${fmt(fb.observed)}（${fb.reps} 次）${fb.landedIn.length ? `，落在 ${fb.landedIn.join('、')} 的预测区间` : ''}`,
      `因此：${fb.transitions.map((t) => `${t.id} → ${STATE_LABEL[t.to as ClaimState] ?? t.to}`).join('、') || '无状态变化'}`,
      `新协议：${fb.toProtocol}；目的：${fb.toQuestion}`,
    ],
    stage: stageReport(rec, seq),
    children: full.childJobs.map((j) => ({
      name: j.name,
      statusLabel: j.status === 'nonconforming' ? '未按契约结束' : j.status === 'running' ? '运行中' : j.status,
      ...(j.status === 'nonconforming' ? { detail: (j.lastLine ?? '').slice(0, 80) } : j.path ? { detail: j.path } : {}),
    })),
    interventions: (rec.interventions ?? []).map((i) => ({
      id: i.id,
      kind: i.kind,
      text: i.text ?? i.fork?.question ?? '',
      status: rec.rulings.some((l) => l.trim().startsWith(`${i.id}:`)) ? 'agent 已确认' : '已送达，agent 未确认',
    })),
    timeline: (opts.annotations?.nodes ?? [])
      .filter((n) => n.seq && n.seq[0] <= seq)
      .sort((a, b) => a.seq![0] - b.seq![0])
      .map((n) => ({ id: n.id, seq: n.seq![0], title: n.title_plain, atTime: MARK_ICON[n.at_time.mark], hindsight: MARK_ICON[n.hindsight.mark] })),
    flags: recordFlags(rec, budgetTotal === undefined ? {} : { budgetTotal }),
    controls: controlBar({
      mode: opts.mode,
      bridge: opts.bridge && !!control,
      state: control?.state ?? 'IDLE',
      wired: control?.wired ?? false,
      canCancelChildren: control?.canCancelChildren ?? false,
    }),
    status: statusView(rec, opts),
    docs: (opts.workdir?.docs ?? []).map((d, i) => ({ path: d.path, time: shortTime(new Date(d.mtimeMs).toISOString()), newest: i === 0 })),
  }
}

// ===== 节点详情（04 §3.5） =====

export type NodeSelection = { kind: 'prereg' | 'claim' | 'attack' | 'intervention' | 'child'; id: string }
export interface NodeDetailView {
  title: string
  sections: { heading: string; rows: string[] }[]
  rawLines: { seq: number; raw: string }[]
}

const raw = (events: JournalEvent[]) => events.sort((a, b) => a.seq - b.seq).map((e) => ({ seq: e.seq, raw: e.raw }))

export function nodeDetail(full: ResearchRecord, sel: NodeSelection, seq: number, annotations?: Annotations | null): NodeDetailView | null {
  const rec = sliceRecord(full, seq)
  const author = (gid: string) => annotations?.attacks_by?.[gid] ?? '作者未记录'
  if (sel.kind === 'prereg') return preregDetail(rec, sel.id)
  if (sel.kind === 'claim') {
    const c = claimsAt(rec).get(sel.id)
    if (!c) return null
    const propose = rec.events.find((e) => e.op === 'claim.propose' && e.data.id === sel.id)!
    const attacks = rec.events.filter((e) => e.op === 'attack.record' && e.data.target === sel.id)
    const predicts = Array.isArray(propose.data.predicts) ? (propose.data.predicts as unknown[]).map(String) : []
    return {
      title: `${c.id} · ${STATE_LABEL[c.state]}`,
      sections: [
        { heading: '陈述', rows: [c.statement] },
        { heading: '预测', rows: predicts.length ? predicts : ['未写'] },
        { heading: '状态历史', rows: c.history.length ? c.history.map((h) => `第 ${h.seq} 行 → ${h.to}（${h.byProbe ? `依据 ${h.byProbe}` : '无探针：判断，非测量'}）：${h.note}`) : ['尚无迁移'] },
        { heading: '针对它的攻击', rows: attacks.length ? attacks.map((a) => `${String(a.data.gid)}（${author(String(a.data.gid))}）：${String(a.data.text ?? '')}`) : ['无'] },
        { heading: 'RULINGS', rows: rec.rulings.filter((l) => l.includes(sel.id)).length ? rec.rulings.filter((l) => l.includes(sel.id)) : ['无'] },
        { heading: '影响它的干预', rows: (rec.interventions ?? []).filter((i) => i.affects?.includes(sel.id)).map((i) => `${i.id} ${i.kind}：${i.text ?? ''}`) },
      ].filter((s) => s.rows.length),
      rawLines: raw(rec.events.filter((e) => (e.op.startsWith('claim.') && e.data.id === sel.id) || (e.op === 'attack.record' && e.data.target === sel.id))),
    }
  }
  if (sel.kind === 'attack') {
    const a = rec.events.find((e) => e.op === 'attack.record' && e.data.gid === sel.id)
    if (!a) return null
    const target = String(a.data.target)
    const later = rec.events.filter((e) => e.op === 'claim.transition' && e.data.id === target && e.seq > a.seq)
    return {
      title: `${sel.id} → ${target}`,
      sections: [
        { heading: '原文', rows: [String(a.data.text ?? '')] },
        { heading: '作者', rows: [author(sel.id)] },
        { heading: '之后的处理', rows: later.length ? later.map((e) => `第 ${e.seq} 行 ${target} → ${String(e.data.to)}`) : ['之后没有针对该假设的迁移'] },
      ],
      rawLines: raw([a]),
    }
  }
  if (sel.kind === 'intervention') {
    const i = (rec.interventions ?? []).find((x) => x.id === sel.id)
    if (!i) return null
    return {
      title: `${i.id} · ${i.kind}`,
      sections: [
        { heading: '内容', rows: [i.text ?? '', `${i.actor} · ${i.ts} · 第 ${i.journal_lines} 行之后`, `状态 ${i.state_before ?? '?'} → ${i.state_after ?? '?'} · ${i.wired ? '机制保证' : '软（靠 agent 自觉）'}`] },
        ...(i.fork ? [{ heading: '分叉选项', rows: i.fork.options.map((o) => `${o.label === i.fork!.chosen ? '● ' : '○ '}${o.label}`) }] : []),
      ],
      rawLines: [],
    }
  }
  const j = full.childJobs.find((x) => x.name === sel.id)
  return j ? { title: j.name, sections: [{ heading: '状态', rows: [j.status, j.lastLine ?? '', j.path ?? ''].filter(Boolean) }], rawLines: [] } : null
}

function preregDetail(rec: ResearchRecord, pid: string): NodeDetailView | null {
  const p = rec.preregs[pid]
  if (!p) return null
  const write = rec.events.find((e) => e.op === 'prereg.write' && e.data.pid === pid)
  const c = probeCycles(rec).find((x) => x.pid === pid)
  const sections = [
    { heading: '登记', rows: [`协议：${p.protocol}`, `重复 ${p.reps} 次`, `冻结：${p.frozenAt ?? '未记录'}`, `spec sha256：${String(write?.data.spec_sha256 ?? '未记录')}`] },
    { heading: '预测区间', rows: Object.entries(p.bands).map(([hid, b]) => `${hid} ${bandText(b)}`) },
    { heading: '预登记分支', rows: p.branches.map((b) => `${bandText(b.band)} → ${ACTION_LABEL[b.action]} ${b.target}`) },
    { heading: '登记前的仿真', rows: [`最近：${simsLine(rec, pid)}`, `全程：${simsLine(rec, pid, 1)}`] },
  ]
  if (c?.landSeq !== undefined) {
    const ok = c.exitCode === 0 && c.metric !== undefined
    sections.push({ heading: '结果', rows: ok ? [`观测 ${fmt(c.metric!)}（${c.reps} 次，花费 ${c.cost ?? '?'}）`] : ['✗ 测量失败（是否扣预算以运行记录为准）'] })
    if (ok) {
      const expected = new Map([...namedBy(rec, pid)].flatMap((hid) => {
        const hit = branchHit(rec, pid, hid, c.metric!)
        return hit ? [[hid, ACTION_TO[hit]!] as const] : []
      }))
      const rows = [`按观测重算，预登记分支应为：${[...expected].map(([hid, to]) => `${hid} → ${to}`).join('、') || '无'}`]
      for (const t of c.transitions) {
        const want = expected.get(String(t.data.id))
        rows.push(`第 ${t.seq} 行 ${String(t.data.id)} → ${String(t.data.to)}：${want === t.data.to ? '与预登记分支一致' : '判断与预登记分支不一致'}`)
      }
      for (const j of c.judgments) rows.push(`第 ${j.seq} 行 ${String(j.data.id)} → ${String(j.data.to)}（无探针）：判断超出预登记分支`)
      sections.push({ heading: '宿主复核', rows })
    }
  } else {
    sections.push({ heading: '结果', rows: ['◌ 待测'] })
  }
  const related = rec.events.filter((e) =>
    (['prereg.write', 'probe.start', 'world.observe', 'probe.land'].includes(e.op) && e.data.pid === pid) ||
    c?.transitions.includes(e) || c?.judgments.includes(e))
  // 完整问题已在中间栏的展开里，检查器只给一行标题
  return { title: probeHeading({ pid, protocol: p.protocol, blockers: p.blockers }), sections, rawLines: raw(related) }
}

export type { ControlStateName }

/**
 * 归档选择器里示例 run 的来源（M-2）：主进程列出了同一个 run → 走归档（注记在运行时读，且列表不重复）；
 * 否则用随应用打包的无真相副本；两者都没有（docker 镜像）→ 不显示示例按钮。
 */
export function archivePickerView<A extends { path: string }>(
  archives: A[] | null,
  sample: { path: string; bundled: boolean },
): { sample: { kind: 'archive'; path: string } | { kind: 'sample' } | null; archives: A[] } {
  const same = (a: A) => a.path === sample.path || a.path.replaceAll('\\', '/').endsWith(`/${sample.path}`)
  const hit = archives?.find(same)
  return {
    sample: hit ? { kind: 'archive', path: hit.path } : sample.bundled ? { kind: 'sample' } : null,
    archives: (archives ?? []).filter((a) => !same(a)),
  }
}
