/**
 * research-bridge — 研究画布与主进程（轨道 R1）的唯一接触面 + 渲染层离线解析
 *
 * R1 的 preload 方法缺失时（旧 preload / web 模式 / R 未合入）一律返回 undefined，
 * 画布据此降级为只读：只能回放归档和随应用打包的示例 run（04 §5.2"缺了就降级"）。
 */

import { parseBundle, type Annotations, type ResearchRecord } from '@proma/shared/research-record'
import type {
  ResearchArchiveEntry,
  ResearchInterveneInput,
  ResearchInterveneResult,
  ResearchJudgeReportInput,
  ResearchJudgeReportResult,
  ResearchRecordSnapshot,
  ResearchStageDocInput,
  ResearchStageDocResult,
} from '@/types/research-record'

export interface ResearchBridge {
  getResearchRecord: (sessionId: string) => Promise<ResearchRecordSnapshot | null>
  releaseResearchRecord: (sessionId: string) => Promise<void>
  listResearchArchives: (sessionId?: string) => Promise<ResearchArchiveEntry[]>
  openResearchArchive: (path: string, sessionId?: string) => Promise<ResearchRecordSnapshot>
  interveneResearch: (input: ResearchInterveneInput) => Promise<ResearchInterveneResult>
  onResearchRecordChanged: (cb: (event: { sessionId: string; snapshot: ResearchRecordSnapshot | null }) => void) => () => void
  readResearchStageDoc: (input: ResearchStageDocInput) => Promise<ResearchStageDocResult>
  getResearchJudgeReport: (input: ResearchJudgeReportInput) => Promise<ResearchJudgeReportResult>
  getResearchPendingIntake: (sessionId: string) => Promise<string | null>
}

/** preload 上可能缺任一方法；调用方逐个判断 typeof === 'function' */
export function researchBridge(): Partial<ResearchBridge> {
  const api = typeof window === 'undefined' ? undefined : (window as { electronAPI?: unknown }).electronAPI
  return (api ?? {}) as Partial<ResearchBridge>
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * J1 的 parseBundle 要同步哈希；渲染层只有异步的 WebCrypto。
 * 先把它会哈希的全部输入（空串、journal 每一行、每个文件原文）算好，再给一个查表函数。
 * ponytail: 若 load.ts 将来哈希别的字符串，查不到返回 ''，记录会显示"链断裂"——届时把那类输入加进来。
 */
export async function recordFromFiles(files: Record<string, string>): Promise<ResearchRecord> {
  const inputs = new Set<string>(['', ...Object.values(files), ...['journal.jsonl', 'interventions.jsonl'].flatMap((f) => (files[f] ?? '').split('\n'))])
  const table = new Map(await Promise.all([...inputs].map(async (s) => [s, await sha256Hex(s)] as const)))
  return parseBundle(files, { sha256: (s) => table.get(s) ?? '' })
}

/** 归档里的 annotations.json（只读叠加双栏判定）；坏文件当作没有 */
export function annotationsFromFiles(files: Record<string, string>): Annotations | null {
  const text = files['annotations.json']
  if (!text) return null
  try {
    return JSON.parse(text) as Annotations
  } catch {
    return null
  }
}

/**
 * 异步解析的"取最新"：每次 next() 发一张票，之后再 next() 就作废之前的票。
 * 快照推送的哈希是异步的，旧快照晚算完时不能覆盖新快照（LOW：过期快照）。
 */
export function latestTicket(): () => () => boolean {
  let n = 0
  return () => {
    const mine = ++n
    return () => mine === n
  }
}
