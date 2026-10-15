/**
 * 评委报告生成器（04 §4）：归档 run 目录 → 静态 HTML。只读文件，不调模型、不读网络、不读时钟。
 *
 *   bun research/report/judge-report.ts <归档 run 目录> --out <html> [--nav 标签=href ...] [--here 标签]
 *
 * annotations / recompute 与记录对不上（journal sha、seq 与事件类型、引文、{{键}}、关键节点依据）→ 拒绝生成，退出码 1。
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  caseAnswers,
  corrections,
  cycleCards,
  feedbackChange,
  fmtNum,
  hname,
  interpolate,
  judgeNodes,
  JudgeError,
  parseBundle,
  probeCycles,
  type Annotations,
  type Recompute,
  type ResearchRecord,
} from '../../packages/shared/src/research-record/index.ts'
import { renderReport, type ReportModel } from './template.ts'

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const TEXT = /\.(jsonl?|md)$/

/** 归档目录 → {相对路径: 原文}，按路径排序 */
export function readArchive(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (TEXT.test(name)) out[relative(dir, p).split('\\').join('/')] = readFileSync(p, 'utf8')
    }
  }
  walk(dir)
  return out
}

const STATE_WORD: Record<string, string> = { REFUTED: '被否定', SUPPORTED: '得到支持', SCOPED: '收窄', CONTESTED: '改为有争议' }

function feedback(rec: ResearchRecord, ann: Annotations): ReportModel['feedback'] {
  const fc = feedbackChange(rec)
  if (!fc) return null
  const p = rec.preregs[fc.from]!
  const cycle = probeCycles(rec).find((c) => c.pid === fc.from)!
  const toSeq = rec.events.find((e) => e.op === 'prereg.write' && e.data.pid === fc.to)!.seq
  const rawSeqs = [cycle.preregSeq, cycle.observeSeq, ...cycle.transitions.map((e) => e.seq), ...cycle.judgments.map((e) => e.seq), toSeq]
  return {
    from: fc.from,
    to: fc.to,
    fromProtocol: fc.fromProtocol,
    toProtocol: fc.toProtocol,
    prediction: Object.entries(p.bands)
      .map(([h, [lo, hi]]) => `${hname(ann, h)} 预计 ${fmtNum(lo)}–${fmtNum(hi)}`)
      .join('；'),
    observed: `测 ${fc.reps} 次平均 ${fmtNum(fc.observed)}，落在 ${fc.landedIn.map((h) => hname(ann, h)).join('、') || '没有任何假设'} 的预测区间；${fc.transitions.length
      ? `随后 ${fc.transitions.map((t) => `${t.id} ${STATE_WORD[t.to] ?? t.to}`).join('、')}`
      : '这次测量没有改变任何判断'}。`,
    why: fc.toQuestion,
    raw: rawSeqs.filter((s): s is number => s !== undefined).map((s) => `${s}: ${rec.events[s - 1]!.raw}`),
  }
}

export function buildReport(dir: string, opts: { archive?: string; nav?: ReportModel['nav'] } = {}): string {
  return renderJudgeReport(readArchive(dir), { archive: opts.archive ?? dir, ...(opts.nav ? { nav: opts.nav } : {}) })
}

/** 文件捆（相对路径 → 原文）→ 报告 HTML。Proma 主进程用它渲染自己读好的归档捆（不再走 readArchive）。 */
export function renderJudgeReport(files: Record<string, string>, opts: { archive: string; nav?: ReportModel['nav'] }): string {
  if (files['annotations.json'] === undefined) throw new JudgeError(`${opts.archive} 没有 annotations.json`)
  const rec = parseBundle(files, { sha256 })
  const ann = JSON.parse(files['annotations.json']) as Annotations
  if (ann.schema !== 'crucible.annotations/2') throw new JudgeError(`annotations schema ${ann.schema} 不认识`)
  const rc = files['recompute.json'] === undefined ? undefined : (JSON.parse(files['recompute.json']) as Recompute)
  const nodes = judgeNodes(rec, ann, rc)
  const shas: [string, string][] = [
    ['journal.jsonl', rec.journalSha256],
    ['REPORT.md', rec.report!.sha256],
    ...Object.keys(rec.preregs)
      .sort()
      .map((pid): [string, string] => [`prereg/${pid}.json`, rec.preregs[pid]!.fileSha256]),
    ...Object.entries(rec.fileSha256).filter(([k]) => k !== 'register.json'),
  ]
  const html = renderReport({
    rec,
    ann: { ...ann, unknowns: ann.unknowns.map((u) => interpolate(u, rc)) },
    archive: opts.archive,
    answers: caseAnswers(rec, ann, rc),
    nodes,
    feedback: feedback(rec, ann),
    corrections: corrections(rec, ann, rc),
    cycles: cycleCards(rec, ann, nodes),
    shas,
    nav: opts.nav ?? [],
    scriptRef: rc?.script ?? '',
  })
  // 兜底：任何没填上的 {{键}} 都拒绝出页（"仍不能确定"一节曾漏插值，页面带着占位符上线）。
  const left = html.match(/\{\{[^}]*\}\}/)
  if (left) throw new JudgeError(`页面里还有未填的占位符 ${left[0]}`)
  return html
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dir = args[0]
  const flag = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []))
  const out = flag('--out')[0]
  if (!dir || !out) {
    console.error('用法：bun research/report/judge-report.ts <归档 run 目录> --out <html> [--nav 标签=href ...] [--here 标签]')
    process.exit(2)
  }
  const here = flag('--here')[0]
  const nav = flag('--nav').map((s) => {
    const [label, href] = s.split('=') as [string, string]
    return { label, href, here: label === here }
  })
  try {
    // 相对仓库根，与运行时 cwd 无关（确定性）
    const archive = relative(join(import.meta.dir, '../..'), resolve(dir)).split('\\').join('/')
    writeFileSync(out, buildReport(dir, { archive, nav }))
    console.log(`wrote ${out}`)
  } catch (e) {
    if (e instanceof JudgeError) {
      console.error(`拒绝生成：${e.message}`)
      process.exit(1)
    }
    throw e
  }
}
