/**
 * 研究记录服务（04 §2 / §3.7，轨道 R1）：主进程读 run 目录这一捆文件、轮询推快照、记人的干预。
 *
 * - 一份记录 = `<cwd>/.proma-research/<run>/` + RULINGS + 子任务作业目录；live 布局在这里归一成归档布局
 *   （作业目录压平成 `child-jobs/<job_name>/`），消费方只认一种形状。
 * - 宿主绝不写 journal：MCP 对 journal 做基线比对，会话外追加一行即封死整个 run。
 *   宿主只写旁挂的 `interventions.jsonl`（自带哈希链，钉 journal 行号 + 链头）与 `pending/fork-F#.json`。
 * - 主进程不发消息：intervene 只记录、翻闸门、返回发送计划，由渲染层走现有发送路径。
 * - 依赖经 configureResearchRecord 注入（不 import agent-service / electron），测试可在 bun 里直接跑。
 */

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, delimiter, isAbsolute, join, resolve, sep } from 'node:path'
import type { AgentStreamPayload, AskUserRequest } from '@proma/shared'
import { childJobs, verifyInterventions } from '@proma/shared/research-record'
import { renderJudgeReport } from '../../../../../research/report/judge-report'
import { readStageDocAt, readWorkdir } from './research-stage-docs'
import { isPendingK0, K0_PENDING_REL } from './adapters/pi-research-k0'
import {
  controlState,
  getResearchChildCanceller,
  isWired,
  lastControl,
  planIntervention,
  setAttachHook,
  syncGate,
} from './research-control'
import type {
  ResearchArchiveEntry,
  ResearchChildJob,
  ResearchControlKind,
  ResearchControlView,
  ResearchFork,
  ResearchForksMode,
  ResearchInterveneInput,
  ResearchInterveneResult,
  ResearchIntervention,
  ResearchJudgeReportInput,
  ResearchJudgeReportResult,
  ResearchRecordSnapshot,
  ResearchStageDocInput,
  ResearchStageDocResult,
  ResearchWorkdir,
} from '../../types/research-record'

export interface ResearchRecordDeps {
  resolveCwd(sessionId: string): string | undefined
  isRunning(sessionId: string): boolean
  push(sessionId: string, snapshot: ResearchRecordSnapshot | null): void
  /** 额外的归档根（如仓库的 research/campaigns）；另加 PROMA_RESEARCH_ARCHIVE_ROOTS 与会话 cwd */
  archiveRoots?: string[]
  env?: NodeJS.ProcessEnv
}

let deps: ResearchRecordDeps = {
  resolveCwd: () => undefined,
  isRunning: () => false,
  push: () => {},
}

export function configureResearchRecord(next: ResearchRecordDeps): void {
  deps = next
  setAttachHook((sessionId, cwd) => refreshGate(sessionId, cwd ?? deps.resolveCwd(sessionId)))
}

// ===== 读：文件捆 =====

const TOP_FILES = ['journal.jsonl', 'REPORT.md', 'register.json', 'interventions.jsonl', 'K0-intake.md', 'annotations.json', 'recompute.json', 'rejections.jsonl']
const JSON_DIRS = ['prereg', 'pending']

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

function dirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  } catch {
    return []
  }
}

function files(path: string, ext: RegExp): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isFile() && ext.test(d.name)).map((d) => d.name).sort()
  } catch {
    return []
  }
}

type PathPair = [key: string, abs: string]

function runDirPaths(dir: string): PathPair[] {
  const out: PathPair[] = TOP_FILES.map((f) => [f, join(dir, f)] as PathPair).filter(([, abs]) => existsSync(abs))
  for (const sub of JSON_DIRS) {
    for (const f of files(join(dir, sub), /\.json$/)) out.push([`${sub}/${f}`, join(dir, sub, f)])
  }
  return out
}

function livePaths(cwd: string, runDir: string): PathPair[] {
  const out = runDirPaths(runDir)
  if (existsSync(join(cwd, 'RULINGS.md'))) out.push(['child-jobs/RULINGS.md', join(cwd, 'RULINGS.md')])
  const jobs = join(cwd, '.rlm-jobs', basename(runDir))
  if (existsSync(join(jobs, 'failures.jsonl'))) out.push(['child-jobs/failures.jsonl', join(jobs, 'failures.jsonl')])
  // `.rlm-jobs/<run>/<step>/<target>/<nonce>/` → job_name = `<step>-<target>-<nonce>`（KIT/jobs.py job_name）
  for (const step of dirs(jobs)) {
    for (const target of dirs(join(jobs, step))) {
      for (const nonce of dirs(join(jobs, step, target))) {
        const job = join(jobs, step, target, nonce)
        for (const f of files(job, /^(brief|out)\.md$/)) out.push([`child-jobs/${step}-${target}-${nonce}/${f}`, join(job, f)])
      }
    }
  }
  return out
}

function archivePaths(dir: string): PathPair[] {
  const out = runDirPaths(dir)
  const jobs = join(dir, 'child-jobs')
  for (const f of files(jobs, /\.(md|jsonl)$/)) out.push([`child-jobs/${f}`, join(jobs, f)])
  for (const name of dirs(jobs)) {
    for (const f of files(join(jobs, name), /\.(md|jsonl)$/)) out.push([`child-jobs/${name}/${f}`, join(jobs, name, f)])
  }
  return out
}

function readPairs(pairs: PathPair[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, abs] of pairs) {
    try {
      out[key] = readFileSync(abs, 'utf-8')
    } catch {
      // 读的瞬间被删（pending 回答、作业清理）：下一次快照会补齐
    }
  }
  return out
}

/**
 * 工作台版本链的草稿：工作目录顶层 _P*.json → `research-work/_P*.json`。agent 写的文件，走阶段文档同一套
 * 防护（逐段 lstat、O_NOFOLLOW、2 MB 上限）；变动由轮询签名里的 workdir 部分触发推送。
 */
function readDrafts(base: string, segs: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const d of readWorkdir(base, segs)?.docs ?? []) {
    if (!/^_P[^/]*\.json$/.test(d.path)) continue
    try {
      out[`research-work/${d.path}`] = readStageDocAt(base, segs, d.path).text
    } catch {
      // 读的瞬间被删 / 换成链接：下一次快照会补齐
    }
  }
  return out
}

export const readLiveBundle = (cwd: string, runDir: string) => ({ ...readPairs(livePaths(cwd, runDir)), ...readDrafts(cwd, liveWorkdirSegs(runDir)) })
export const readArchiveBundle = (dir: string) => ({ ...readPairs(archivePaths(dir)), ...readDrafts(dir, ARCHIVE_WORKDIR) })

const lines = (text: string | undefined): string[] => (text ?? '').split('\n').filter((l) => l.trim() !== '')

/**
 * 哈希链校验（与 MCP verifyJournalChain 同规则：prev = 上一行原文 sha256，首行对空串）。
 * strict=false：旧格式 journal 的链从第一条带 prev 的行开始；strict=true：每行都必须带 prev。
 */
export function verifyChain(text: string, strict: boolean): string | null {
  const all = lines(text)
  let started = false
  for (const [i, line] of all.entries()) {
    let prev: unknown
    try {
      prev = (JSON.parse(line) as { prev?: unknown }).prev
    } catch {
      return `第 ${i + 1} 行不是合法 JSON`
    }
    if (prev === undefined) {
      if (strict || started) return `第 ${i + 1} 行缺少 prev`
      continue
    }
    started = true
    if (prev !== sha256(i === 0 ? '' : all[i - 1]!)) return `第 ${i + 1} 行的 prev 与第 ${i} 行原文不符（此前内容被改动）`
  }
  return null
}

function parseInterventions(text: string | undefined): ResearchIntervention[] {
  const out: ResearchIntervention[] = []
  for (const line of lines(text)) {
    try {
      out.push(JSON.parse(line) as ResearchIntervention)
    } catch {
      // 坏行由 integrity.interventions 报出
    }
  }
  return out
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return undefined
  }
}

/** 子任务卡：与渲染层 parseBundle 同一份规则（无 out.md = 运行中；末行不合 STATUS 契约 = nonconforming）。 */
export function childJobsFrom(bundle: Record<string, string>): ResearchChildJob[] {
  return childJobs(bundle).map(({ name, status }) => ({ name, status }))
}

function declaredIn(journal: string | undefined): boolean {
  return lines(journal).some((l) => {
    try {
      return (JSON.parse(l) as { op?: unknown }).op === 'gate.verdict'
    } catch {
      return false
    }
  })
}

/** 会话 cwd 下最近活动的 run（journal mtime 最新）；research_init 之前不存在。 */
export function findLiveRunDir(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined
  const root = join(cwd, '.proma-research')
  let best: { dir: string; mtime: number } | undefined
  for (const name of dirs(root)) {
    const journal = join(root, name, 'journal.jsonl')
    if (!existsSync(journal)) continue
    const mtime = statSync(journal).mtimeMs
    if (!best || mtime > best.mtime) best = { dir: join(root, name), mtime }
  }
  return best?.dir
}

function readForksMode(k0: string | undefined): ResearchForksMode {
  return /^\s*forks:\s*wait\b/m.test(k0 ?? '') ? 'wait' : 'auto'
}

// ===== 控制态 =====

const askPending = new Map<string, string>()

function controlView(sessionId: string, bundle: Record<string, string>, events: ResearchIntervention[]): ResearchControlView {
  return controlState({
    lastControl: lastControl(events),
    agentRunning: deps.isRunning(sessionId),
    askPending: askPending.has(sessionId),
    declared: declaredIn(bundle['journal.jsonl']),
    wired: isWired(sessionId),
    canCancelChildren: getResearchChildCanceller() !== undefined,
    forks: readForksMode(bundle['K0-intake.md']),
  })
}

function lastControlEvent(events: ResearchIntervention[]): { kind: ResearchControlKind; id: string } | undefined {
  const kind = lastControl(events)
  if (!kind) return undefined
  const event = [...events].reverse().find((e) => e.kind === kind)!
  return { kind, id: event.id }
}

function refreshGate(sessionId: string, cwd: string | undefined): void {
  const runDir = findLiveRunDir(cwd)
  if (!runDir) return syncGate(sessionId, undefined, 'auto')
  const events = parseInterventions(readText(join(runDir, 'interventions.jsonl')))
  syncGate(sessionId, lastControlEvent(events), readForksMode(readText(join(runDir, 'K0-intake.md'))))
}

interface LiveContext {
  cwd: string
  runDir: string
  bundle: Record<string, string>
  events: ResearchIntervention[]
  view: ResearchControlView
}

function liveContext(sessionId: string): LiveContext | undefined {
  const cwd = deps.resolveCwd(sessionId)
  const runDir = findLiveRunDir(cwd)
  if (!cwd || !runDir) return undefined
  const bundle = readLiveBundle(cwd, runDir)
  const events = parseInterventions(bundle['interventions.jsonl'])
  syncGate(sessionId, lastControlEvent(events), readForksMode(bundle['K0-intake.md']))
  return { cwd, runDir, bundle, events, view: controlView(sessionId, bundle, events) }
}

/** 工作目录 `<cwd>/research-work/<run>/`（K0 副作用信封；run = run 目录名） */
const liveWorkdirSegs = (runDir: string) => ['research-work', basename(runDir)]
const ARCHIVE_WORKDIR = ['research-work']

/** 与 MCP 同一口径：PROMA_EVAL_BUDGET，缺省 8（packages/research-mcp/src/server.ts EVAL_BUDGET） */
function evalBudget(): number | undefined {
  const v = Number((deps.env ?? process.env).PROMA_EVAL_BUDGET?.trim() || 8)
  return Number.isInteger(v) && v > 0 ? v : undefined
}

function snapshotOf(
  source: 'live' | 'archive',
  root: string,
  bundle: Record<string, string>,
  control: ResearchControlView | null,
  workdir: ResearchWorkdir | null,
  sessionId?: string,
): ResearchRecordSnapshot {
  const budgetTotal = source === 'live' ? evalBudget() : undefined
  return {
    source,
    ...(sessionId ? { sessionId } : {}),
    root,
    run: basename(root),
    files: bundle,
    integrity: {
      journal: verifyChain(bundle['journal.jsonl'] ?? '', false),
      // 链 + journal_head（钉的 journal 行事后被改写或截短也报）
      interventions: bundle['interventions.jsonl'] === undefined
        ? null
        : verifyInterventions(bundle['interventions.jsonl'], bundle['journal.jsonl'] ?? '', sha256)?.note ?? null,
    },
    control,
    workdir,
    ...(budgetTotal !== undefined ? { budgetTotal } : {}),
  }
}

function liveSnapshot(sessionId: string): ResearchRecordSnapshot | null {
  const ctx = liveContext(sessionId)
  return ctx ? snapshotOf('live', ctx.runDir, ctx.bundle, ctx.view, readWorkdir(ctx.cwd, liveWorkdirSegs(ctx.runDir)), sessionId) : null
}

// ===== 推送：轮询签名 =====

const POLL_MS = 50

const statSig = (abs: string): string => {
  try {
    const s = statSync(abs)
    return `${s.size}:${s.mtimeMs}`
  } catch {
    return '-'
  }
}
const MAX_WATCHES = 4
const watches = new Map<string, { timer: ReturnType<typeof setInterval>; sig: string }>()

/** 文件 stat + 不落盘的控制输入；变了才读全量、推快照。 */
function signature(sessionId: string): string {
  const cwd = deps.resolveCwd(sessionId)
  const runDir = findLiveRunDir(cwd)
  if (!cwd) return 'none'
  // 还没有 run：K0 草稿出现 / 改写也变签名 → 推一次 null，画布据此重读草稿（getPendingIntake）
  if (!runDir) return `none|${statSig(join(cwd, K0_PENDING_REL))}`
  const stats = livePaths(cwd, runDir).map(([key, abs]) => `${key}:${statSig(abs)}`)
  const workdir = readWorkdir(cwd, liveWorkdirSegs(runDir))
  const work = workdir ? [workdir.simMtimeMs, workdir.recallMtimeMs, ...workdir.docs.map((d) => `${d.path}:${d.size}:${d.mtimeMs}`)].join(',') : '-'
  return [runDir, ...stats, work, deps.isRunning(sessionId), askPending.has(sessionId), isWired(sessionId), getResearchChildCanceller() !== undefined].join('|')
}

/**
 * ponytail: 轮询 stat 而不是 fs.watch——作业目录在 cwd 别处、容器卷上 fs.watch 不可靠；
 * 天花板是每 50 ms 一次 stat 十几个文件 × 最多 4 个会话。需要更多时换 fs.watch + 慢轮询兜底。
 */
function watch(sessionId: string): void {
  const existing = watches.get(sessionId)
  if (existing) {
    watches.delete(sessionId)
    watches.set(sessionId, existing) // LRU：最近请求的放到末尾
    return
  }
  if (watches.size >= MAX_WATCHES) {
    const [oldest, entry] = watches.entries().next().value!
    clearInterval(entry.timer)
    watches.delete(oldest)
  }
  const entry = { sig: signature(sessionId), timer: setInterval(() => {
    const sig = signature(sessionId)
    if (sig === entry.sig) return
    entry.sig = sig
    deps.push(sessionId, liveSnapshot(sessionId))
  }, POLL_MS) }
  entry.timer.unref?.()
  watches.set(sessionId, entry)
}

/** research:release-record —— 画布卸载 / 退订时停掉该会话的轮询（否则只能等 LRU 挤掉）。 */
export function releaseRecord(sessionId: string): void {
  const entry = watches.get(sessionId)
  if (!entry) return
  clearInterval(entry.timer)
  watches.delete(sessionId)
}

export function stopAllRecordWatches(): void {
  for (const { timer } of watches.values()) clearInterval(timer)
  watches.clear()
}

/** research:get-record —— 返回当前快照并开始推送；会话还没有 run 目录时返回 null（之后出现会推送）。 */
export function getRecord(sessionId: string): ResearchRecordSnapshot | null {
  watch(sessionId)
  return liveSnapshot(sessionId)
}

/**
 * research:pending-intake —— run 记录建立之前，agent 写的 K0 草稿 `<cwd>/.research-pending/K0-intake.md`
 * 原文（画布只读显示）。只认这一个路径，走阶段文档同一套防护（逐段 lstat、O_NOFOLLOW、普通文件、2 MB 上限）；
 * 已有 run、首个 status 行不是 pending_user、读不到 → null。同 getRecord 开始轮询：草稿变动 / run 建立都会推送。
 * ponytail: 同一 cwd 已有旧 run 时新草稿不显示（findLiveRunDir 优先）；一个会话做第二个题目时再按 mtime 比较。
 */
export function getPendingIntake(sessionId: string): string | null {
  if (typeof sessionId !== 'string') throw new Error('research:pending-intake 参数不合法')
  watch(sessionId)
  const cwd = deps.resolveCwd(sessionId)
  if (!cwd || findLiveRunDir(cwd)) return null
  const [dir, name] = K0_PENDING_REL.split('/') as [string, string]
  try {
    const { text } = readStageDocAt(cwd, [dir], name)
    return isPendingK0(text) ? text : null
  } catch {
    return null
  }
}

// ===== 归档 =====

function archiveRoots(sessionId?: string): { listing: string[]; allowed: string[] } {
  const env = (deps.env ?? process.env).PROMA_RESEARCH_ARCHIVE_ROOTS
  const cwd = sessionId ? deps.resolveCwd(sessionId) : undefined
  const listing = [
    ...(deps.archiveRoots ?? []),
    ...(env ? env.split(delimiter).filter(Boolean) : []),
    ...(cwd ? [join(cwd, 'research', 'campaigns')] : []),
  ].filter((root) => isAbsolute(root) && existsSync(root))
  return { listing, allowed: [...listing, ...(cwd && existsSync(cwd) ? [cwd] : [])] }
}

export function listArchives(sessionId?: string): ResearchArchiveEntry[] {
  const out: ResearchArchiveEntry[] = []
  for (const root of archiveRoots(sessionId).listing) {
    for (const name of dirs(root)) {
      if (existsSync(join(root, name, 'journal.jsonl'))) out.push({ path: join(root, name), run: name })
    }
  }
  return out
}

/** 只认白名单根（realpath 比对，挡 .. 与符号链接逃逸），且必须是研究归档；返回 realpath。 */
function resolveArchive(path: string, sessionId?: string): string {
  const real = typeof path === 'string' && isAbsolute(path) && existsSync(path) ? realpathSync(path) : undefined
  const inside = real !== undefined && archiveRoots(sessionId).allowed.some((root) => {
    const r = realpathSync(root)
    return real === r || real.startsWith(r + sep)
  })
  if (!real || !inside) throw new Error(`归档路径不在白名单根内: ${path}`)
  if (!existsSync(join(real, 'journal.jsonl'))) throw new Error(`不是研究归档（缺 journal.jsonl）: ${path}`)
  return real
}

/** research:open-archive —— 归档只读、无控制。 */
export function openArchive(path: string, sessionId?: string): ResearchRecordSnapshot {
  const real = resolveArchive(path, sessionId)
  return snapshotOf('archive', real, readArchiveBundle(real), null, readWorkdir(real, ARCHIVE_WORKDIR))
}

// ===== 阶段文档 / 评委报告 =====

/** 文档所在的 base + 工作目录段：归档 = <归档>/research-work，live = <cwd>/research-work/<run> */
function workdirOf(sessionId: string, archivePath?: string): [base: string, segs: string[]] {
  if (archivePath !== undefined) return [resolveArchive(archivePath, sessionId), ARCHIVE_WORKDIR]
  const cwd = deps.resolveCwd(sessionId)
  const runDir = findLiveRunDir(cwd)
  if (!cwd || !runDir) throw new Error('该会话没有实时研究记录')
  return [cwd, liveWorkdirSegs(runDir)]
}

const optString = (v: unknown) => v === undefined || typeof v === 'string'

/** research:read-stage-doc —— 只读；路径限定在工作目录内、不跟随符号链接（research-stage-docs.ts）。 */
export function readStageDoc(input: ResearchStageDocInput): ResearchStageDocResult {
  if (typeof input?.sessionId !== 'string' || typeof input.path !== 'string' || !optString(input.archivePath)) {
    throw new Error('research:read-stage-doc 参数不合法')
  }
  const [base, segs] = workdirOf(input.sessionId, input.archivePath)
  return readStageDocAt(base, segs, input.path)
}

/**
 * research:judge-report —— 与答辩页同一渲染（research/report/judge-report.ts renderJudgeReport），
 * 输入是画布同一份归档捆（readArchiveBundle：固定文件名集合，不遍历整棵目录）。
 * 报告需要审计注记 annotations.json，只有归档、补写注记之后才有；实时 run 与无注记归档返回原因，不抛。
 */
export function judgeReport(input: ResearchJudgeReportInput): ResearchJudgeReportResult {
  if (typeof input?.sessionId !== 'string' || !optString(input.archivePath)) throw new Error('research:judge-report 参数不合法')
  if (input.archivePath === undefined) {
    return { error: '实时 run 还没有审计注记（annotations.json）。评委报告要在 run 归档、补写注记后才能生成；可在「科研进度」里换一个有注记的归档。' }
  }
  const dir = resolveArchive(input.archivePath, input.sessionId)
  const files = readArchiveBundle(dir)
  if (files['annotations.json'] === undefined) {
    return { error: `${basename(dir)} 还没有审计注记（annotations.json）。评委报告要在 run 归档、补写注记后才能生成；可在「科研进度」里换一个有注记的归档。` }
  }
  try {
    return { html: renderJudgeReport(files, { archive: basename(dir) }) }
  } catch (e) {
    return { error: `评委报告生成失败：${e instanceof Error ? e.message : String(e)}` }
  }
}

// ===== 写：interventions.jsonl =====

type InterventionDraft = Omit<ResearchIntervention, 'id' | 'ts' | 'prev' | 'journal_lines' | 'journal_head' | 'state_after'>

function appendIntervention(ctx: LiveContext, sessionId: string, draft: InterventionDraft): ResearchIntervention {
  const file = join(ctx.runDir, 'interventions.jsonl')
  const prior = lines(readText(file))
  const journal = lines(readText(join(ctx.runDir, 'journal.jsonl')))
  const partial = { ...draft, id: `U${prior.length + 1}` }
  const stateAfter = controlView(sessionId, ctx.bundle, [...ctx.events, partial as ResearchIntervention]).state
  const entry: ResearchIntervention = {
    id: partial.id,
    ts: new Date().toISOString(),
    ...draft,
    state_after: stateAfter,
    journal_lines: journal.length,
    journal_head: sha256(journal.at(-1) ?? ''),
    prev: sha256(prior.at(-1) ?? ''),
  }
  appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf-8')
  ctx.events.push(entry)
  syncGate(sessionId, lastControlEvent(ctx.events), ctx.view.forks)
  return entry
}

function draftOf(ctx: LiveContext, sessionId: string, patch: Pick<ResearchIntervention, 'actor' | 'kind'> & Partial<InterventionDraft>): InterventionDraft {
  return {
    affects: [],
    state_before: ctx.view.state,
    wired: isWired(sessionId),
    children: childJobsFrom(ctx.bundle),
    fork: null,
    session_id: sessionId,
    ...patch,
  }
}

const pendingFile = (runDir: string, forkId: string) => join(runDir, 'pending', `fork-${forkId}.json`)

interface PendingFork {
  fork: ResearchFork
  intervention: string
  session_id: string
}

function findPendingFork(runDir: string, match: (p: PendingFork) => boolean): PendingFork | undefined {
  for (const f of files(join(runDir, 'pending'), /^fork-.*\.json$/)) {
    try {
      const p = JSON.parse(readFileSync(join(runDir, 'pending', f), 'utf-8')) as PendingFork
      if (match(p)) return p
    } catch {
      // 坏文件跳过：interventions.jsonl 里的 fork_open 仍是权威留痕
    }
  }
  return undefined
}

const INTERVENE_KINDS = new Set(['pause', 'resume', 'ask', 'steer', 'stop', 'fork_answer'])

/** IPC 是信任边界（web-bridge 下来自浏览器）：形状不对直接拒绝。 */
function assertInterveneInput(input: ResearchInterveneInput): void {
  const ok = typeof input?.sessionId === 'string'
    && INTERVENE_KINDS.has(input.kind)
    && (input.text === undefined || typeof input.text === 'string')
    && (input.affects === undefined || (Array.isArray(input.affects) && input.affects.every((a) => typeof a === 'string')))
    && (input.forkId === undefined || /^F\d+$/.test(input.forkId))
    && (input.chosen === undefined || typeof input.chosen === 'string')
  if (!ok) throw new Error('research:intervene 参数不合法')
}

/** research:intervene —— 记干预、翻闸门、返回发送计划。 */
export function intervene(input: ResearchInterveneInput): ResearchInterveneResult {
  assertInterveneInput(input)
  const ctx = liveContext(input.sessionId)
  if (!ctx) throw new Error('该会话没有实时研究记录（run 目录不存在，或这是归档回放）')
  const id = `U${lines(ctx.bundle['interventions.jsonl']).length + 1}`
  const now = childJobsFrom(ctx.bundle)
  const lastPause = [...ctx.events].reverse().find((e) => e.kind === 'pause')
  const doneChildren = (lastPause?.children ?? [])
    .filter((c) => c.status === 'running' && now.some((n) => n.name === c.name && n.status !== 'running'))
    .map((c) => c.name)
  const plan = planIntervention(input, { id, before: ctx.view, doneChildren })

  if (plan.record) {
    let fork: ResearchFork | null = null
    if (plan.record === 'fork_answer') {
      const pending = findPendingFork(ctx.runDir, (p) => p.fork.id === input.forkId)
      fork = { ...(pending?.fork ?? { id: input.forkId ?? '?', class: '?', question: '', options: [] }), chosen: input.chosen ?? input.text ?? '' }
      if (input.forkId) rmSync(pendingFile(ctx.runDir, input.forkId), { force: true })
    }
    appendIntervention(ctx, input.sessionId, draftOf(ctx, input.sessionId, {
      actor: 'user',
      kind: plan.record,
      ...(input.text?.trim() ? { text: input.text.trim() } : {}),
      affects: input.affects ?? [],
      fork,
    }))
  }
  // 终止（PAUSED，会话空闲）：IR-C3 在时取消全部子任务；缺则子任务继续（已写进 children）
  if (input.kind === 'stop' && !plan.stop) getResearchChildCanceller()?.(input.sessionId)

  return {
    ...(plan.record ? { id } : {}),
    control: controlView(input.sessionId, ctx.bundle, ctx.events),
    ...(plan.send ? { send: plan.send } : {}),
    ...(plan.askAfterPause ? { askAfterPause: true } : {}),
    ...(plan.stop ? { stop: true } : {}),
  }
}

// ===== eventBus / AskUser 回答 =====

const FORK_HEADER = /^研究分叉\s*(F-[a-z])?/

function forkOpen(sessionId: string, request: AskUserRequest): void {
  const q = request.questions.find((x) => FORK_HEADER.test(x.header ?? ''))
  if (!q) return
  const ctx = liveContext(sessionId)
  if (!ctx) return
  const fork: ResearchFork = {
    id: `F${ctx.events.filter((e) => e.kind === 'fork_open').length + 1}`,
    class: FORK_HEADER.exec(q.header ?? '')?.[1] ?? '?',
    question: q.question,
    options: q.options.map((o) => ({ label: o.label, ...(o.description ? { description: o.description } : {}) })),
    request_id: request.requestId,
  }
  // state_before 取 askPending 置位前的状态（RUNNING → AWAIT_USER）
  askPending.delete(sessionId)
  const before = controlView(sessionId, ctx.bundle, ctx.events)
  askPending.set(sessionId, request.requestId)
  const entry = appendIntervention(ctx, sessionId, draftOf({ ...ctx, view: before }, sessionId, { actor: 'host', kind: 'fork_open', fork }))
  mkdirSync(join(ctx.runDir, 'pending'), { recursive: true })
  writeFileSync(pendingFile(ctx.runDir, fork.id), `${JSON.stringify({ fork, intervention: entry.id, session_id: sessionId } satisfies PendingFork, null, 2)}\n`)
}

/** agentEventBus 订阅：AskUser 置 askPending / 记 fork_open；PAUSED 中新一轮开始 → 代记 resume（host）。 */
export function handleAgentEvent(sessionId: string, payload: AgentStreamPayload): void {
  if (payload.kind !== 'proma_event') return
  const event = payload.event
  if (event.type === 'ask_user_request') {
    askPending.set(sessionId, event.request.requestId)
    forkOpen(sessionId, event.request)
    return
  }
  if (event.type !== 'run_started') return
  askPending.delete(sessionId)
  const ctx = liveContext(sessionId)
  // 只有 pause 需要代记：ask / resume / steer 是画布自己发起的那一轮
  if (!ctx || lastControl(ctx.events) !== 'pause') return
  appendIntervention(ctx, sessionId, draftOf(ctx, sessionId, { actor: 'host', kind: 'resume', text: '暂停中用户直接发消息，视为继续' }))
}

/** ipc.ts ASK_USER_RESPOND handler 的一行回调：研究分叉 → 记 fork_answer（全部选项 + chosen）。宿主从不代答。 */
export function handleAskUserAnswered(sessionId: string, requestId: string, answers: Record<string, string>): void {
  if (askPending.get(sessionId) === requestId) askPending.delete(sessionId)
  try {
    recordForkAnswer(sessionId, requestId, answers)
  } catch (error) {
    // 留痕失败绝不能挡住 AskUser 回答本身
    console.warn('[研究记录] fork_answer 留痕失败:', error)
  }
}

function recordForkAnswer(sessionId: string, requestId: string, answers: Record<string, string>): void {
  const ctx = liveContext(sessionId)
  if (!ctx) return
  const pending = findPendingFork(ctx.runDir, (p) => p.fork.request_id === requestId)
  if (!pending) return
  const chosen = answers[pending.fork.question] ?? Object.values(answers).join(' / ')
  appendIntervention(ctx, sessionId, draftOf(ctx, sessionId, { actor: 'user', kind: 'fork_answer', fork: { ...pending.fork, chosen } }))
  rmSync(pendingFile(ctx.runDir, pending.fork.id), { force: true })
}
