/**
 * run 目录这一捆文件 → ResearchRecord（04 §2.1/§2.4）。两种布局都认：
 * - 归档（含主进程压平后的 live 快照）：`child-jobs/<job_name>/{brief,out}.md`、`child-jobs/RULINGS.md`
 * - 运行中：`.rlm-jobs/[<run>/]<step>/<target>/<nonce>/{brief,out}.md`、`RULINGS.md`
 * 路径一律相对 run 目录（调用方把 `<cwd>/.rlm-jobs/<run>`、`<cwd>/RULINGS.md` 映射进来）。
 */
import type {
  BranchAction,
  ChildJob,
  Intervention,
  JournalEvent,
  Prereg,
  ResearchRecord,
} from './types.ts'

export interface LoadOptions {
  sha256: (text: string) => string
}

const STATUS_RE = /STATUS:\s*(ok|blocked|failed)(\s+SELF_REVIEWED)?\s+PATH:\s*(\S+)/i
const ARCHIVE_JOB = /^child-jobs\/([^/]+)\/(brief|out)\.md$/
const LIVE_JOB = /^\.rlm-jobs\/(?:[^/]+\/)?([^/]+)\/([^/]+)\/([^/]+)\/(brief|out)\.md$/

function lines(text: string): string[] {
  const out = text.split('\n')
  if (out.at(-1) === '') out.pop()
  return out
}

function parseJournal(text: string, sha256: LoadOptions['sha256']): {
  events: JournalEvent[]
  brokenAt?: number
} {
  const raw = lines(text)
  const events: JournalEvent[] = []
  let brokenAt: number | undefined
  let started = false
  raw.forEach((line, i) => {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(line) as Record<string, unknown>
    } catch {
      brokenAt ??= i + 1
      return
    }
    const prev = data.prev
    if (prev === undefined) {
      if (started) brokenAt ??= i + 1
    } else {
      started = true
      if (prev !== sha256(i === 0 ? '' : (raw[i - 1] ?? ''))) brokenAt ??= i + 1
    }
    events.push({ seq: i + 1, ts: String(data.ts ?? ''), op: String(data.op ?? ''), raw: line, data })
  })
  return { events, brokenAt }
}

function parsePrereg(text: string, sha256: LoadOptions['sha256']): Prereg {
  const d = JSON.parse(text) as Record<string, any>
  const observe = (d.observe ?? {}) as Record<string, unknown>
  return {
    pid: String(d.pid),
    question: String(d.question ?? ''),
    protocol: String(observe.protocol ?? ''),
    reps: Number(observe.reps ?? 1),
    bands: (d.bands ?? {}) as Prereg['bands'],
    branches: ((d.branches ?? []) as any[]).map((b) => ({
      band: b.band,
      action: b.action as BranchAction,
      target: String(b.target),
      scopeNote: b.scopeNote,
    })),
    frozenAt: d.frozenAt,
    fileSha256: sha256(text),
  }
}

/** out.md 末行 → 子任务状态；不合 `STATUS: ok|blocked|failed[ SELF_REVIEWED] PATH: …` 契约标 nonconforming。 */
export function parseChildOut(name: string, out: string | undefined): ChildJob {
  if (out === undefined) return { name, status: 'running' }
  const last = lines(out).filter((l) => l.trim() !== '').at(-1) ?? ''
  const m = STATUS_RE.exec(last.replace(/[`*]/g, ''))
  if (!m) return { name, status: 'nonconforming', lastLine: last }
  return {
    name,
    status: m[1]!.toLowerCase() as ChildJob['status'],
    selfReviewed: Boolean(m[2]),
    path: m[3]!.replace(/[.,;:!?)\]}>"']+$/, ''),
    lastLine: last,
  }
}

/** 子任务卡：只有 brief.md = 运行中（两种布局同一规则；主进程 childJobsFrom 也用它）。 */
export function childJobs(files: Record<string, string>): ChildJob[] {
  const jobs = new Map<string, string | undefined>()
  const add = (name: string, kind: string, text: string) => {
    if (kind === 'out') jobs.set(name, text)
    else if (!jobs.has(name)) jobs.set(name, undefined)
  }
  for (const [path, text] of Object.entries(files)) {
    const a = ARCHIVE_JOB.exec(path)
    if (a) add(a[1]!, a[2]!, text)
    const l = LIVE_JOB.exec(path)
    if (l) add(`${l[1]}-${l[2]}-${l[3]}`, l[4]!, text)
  }
  return [...jobs.keys()].sort().map((name) => parseChildOut(name, jobs.get(name)))
}

/**
 * interventions.jsonl 校验：每行合法 JSON、prev = 上一行原文 sha256（首行对空串，每行都必须带），
 * journal_head = 记录时 journal 第 journal_lines 行原文的 sha256（0 行对空串）——journal 事后被改写或截短即对不上。
 * 返回第一处问题（1 起算行号）；完好返回 null。
 */
export function verifyInterventions(
  text: string,
  journal: string,
  sha256: LoadOptions['sha256'],
): { line: number; note: string } | null {
  const rows = lines(text).filter((l) => l.trim() !== '')
  const journalRows = lines(journal)
  for (const [i, raw] of rows.entries()) {
    const line = i + 1
    let row: Partial<Intervention>
    try {
      row = JSON.parse(raw) as Partial<Intervention>
    } catch {
      return { line, note: `第 ${line} 行不是合法 JSON` }
    }
    if (row.prev === undefined) return { line, note: `第 ${line} 行缺少 prev` }
    if (row.prev !== sha256(i === 0 ? '' : rows[i - 1]!)) return { line, note: `第 ${line} 行的 prev 与第 ${i} 行原文不符（此前内容被改动）` }
    if (row.journal_head === undefined) continue
    const n = Number(row.journal_lines)
    const pinned = n === 0 ? '' : journalRows[n - 1]
    if (!Number.isInteger(n) || n < 0 || pinned === undefined || sha256(pinned) !== row.journal_head) {
      return { line, note: `第 ${line} 行的 journal_head 与 journal 第 ${row.journal_lines} 行对不上（journal 在这次干预之后被改写或截短）` }
    }
  }
  return null
}

function parseInterventions(text: string): Intervention[] {
  const out: Intervention[] = []
  for (const l of lines(text)) {
    if (l.trim() === '') continue
    try {
      out.push(JSON.parse(l) as Intervention)
    } catch {
      // 撕裂 / 坏行跳过：由 interventionsBroken 报出，不拖垮整张画布
    }
  }
  return out
}

export function parseBundle(files: Record<string, string>, opts: LoadOptions): ResearchRecord {
  const journal = files['journal.jsonl']
  if (journal === undefined) throw new Error('bundle 缺 journal.jsonl')
  const { events, brokenAt } = parseJournal(journal, opts.sha256)
  const init = events.find((e) => e.op === 'run.init')
  const info = events.find((e) => e.op === 'world.info' || e.op === 'world.observe')
  const preregs: ResearchRecord['preregs'] = {}
  for (const [path, text] of Object.entries(files)) {
    const m = /^prereg\/([^/]+)\.json$/.exec(path)
    if (m) preregs[m[1]!] = parsePrereg(text, opts.sha256)
  }
  const reportText = files['REPORT.md']
  const declare = events.findLast((e) => e.op === 'report.declare')
  const rulingsText = files['child-jobs/RULINGS.md'] ?? files['RULINGS.md'] ?? ''
  const interventionsText = files['interventions.jsonl']
  const interventionsBroken = interventionsText === undefined ? null : verifyInterventions(interventionsText, journal, opts.sha256)
  const fileSha256: Record<string, string> = {}
  for (const name of ['annotations.json', 'recompute.json', 'register.json']) {
    if (files[name] !== undefined) fileSha256[name] = opts.sha256(files[name]!)
  }
  return {
    run: String(init?.data.run ?? ''),
    world: info ? String(info.data.world) : undefined,
    seed: info && typeof info.data.seed === 'number' ? info.data.seed : undefined,
    events,
    journalSha256: opts.sha256(journal),
    integrity: brokenAt === undefined ? 'ok' : 'broken',
    brokenAt,
    preregs,
    report:
      reportText === undefined
        ? undefined
        : {
            text: reportText,
            lines: reportText.split('\n'),
            sha256: opts.sha256(reportText),
            declaredSha256: declare ? String(declare.data.sha256) : undefined,
          },
    childJobs: childJobs(files),
    rulings: lines(rulingsText).filter((l) => /^\s*(Ruling:|U\d+:)/.test(l)),
    interventions: interventionsText === undefined ? null : parseInterventions(interventionsText),
    ...(interventionsBroken ? { interventionsBroken } : {}),
    fileSha256,
  }
}
