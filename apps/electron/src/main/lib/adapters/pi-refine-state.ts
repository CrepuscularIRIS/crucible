/**
 * P0.5：refine 徽标的真实数据源解析。
 *
 * Prime local scope 从不写 refinements.jsonl（那是 global scope 的历史文件），
 * 因此徽标改为读两处真实产物：
 * - harness_state.json：entries 按 kind 分桶的条目表 → 条目数；
 * - 会话 JSONL：`prime-agent.refinement` custom 条目（两种 scope 每次都写）→ 最近摘要。
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { AgentRefineArm, AgentRefineEntrySummary } from '@proma/shared'

export interface PrimeRefineArtifactsSummary {
  /** harness 条目总数（prompt/memory/skill/subagent 之和） */
  entries: number
  /** 最近一次 refine 时间（来自会话 JSONL custom 条目） */
  lastTs?: string
  /** 最近若干条摘要（新→旧） */
  recent: AgentRefineEntrySummary[]
  /** 研究会话的自进化臂（`session-artifacts/<id>/research-refine/k0-host.json`） */
  arm?: AgentRefineArm
}

/** harness_state.json 的 entries 分桶形状（Prime refinement.js HarnessState）。 */
interface HarnessStateFileShape {
  entries?: Record<string, Record<string, unknown> | undefined>
}

/** 会话 JSONL 里 prime-agent.refinement custom 条目的 data 载荷。 */
interface RefinementEntryData {
  summary?: unknown
  rationale?: unknown
  edits?: RefinementEdit[]
  appliedEdits?: RefinementEdit[]
}

interface RefinementEdit { action?: unknown; kind?: unknown; id?: unknown; title?: unknown }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

function editSummary(e: RefinementEdit): NonNullable<AgentRefineEntrySummary['edits']>[number] {
  const action = str(e.action), id = str(e.id), title = str(e.title)
  return { ...(action ? { action } : {}), kind: String(e.kind ?? 'unknown'), ...(id ? { id } : {}), ...(title ? { title: title.slice(0, 120) } : {}) }
}

/** sessions/<id>.jsonl → session-artifacts/<id>/research-refine/k0-host.json 的 arm 行 */
function readArm(sessionFile: string): AgentRefineArm | undefined {
  const file = join(dirname(dirname(sessionFile)), 'session-artifacts', basename(sessionFile, '.jsonl'), 'research-refine', 'k0-host.json')
  try {
    const arm = (JSON.parse(readFileSync(file, 'utf-8')) as { arm?: Record<string, unknown> }).arm
    const mode = str(arm?.mode)
    if (!mode) return undefined
    const source = str(arm?.source)
    return { mode, ...(source ? { source } : {}), ...(typeof arm?.contaminated === 'boolean' ? { contaminated: arm.contaminated } : {}) }
  } catch { return undefined }
}

export function summarizePrimeRefineArtifacts(
  harnessDir: string,
  sessionFile: string | undefined,
): PrimeRefineArtifactsSummary {
  let entries = 0
  try {
    const harnessStatePath = join(harnessDir, 'harness_state.json')
    if (existsSync(harnessStatePath)) {
      const parsed = JSON.parse(readFileSync(harnessStatePath, 'utf-8')) as HarnessStateFileShape
      for (const bucket of Object.values(parsed.entries ?? {})) {
        entries += Object.keys(bucket ?? {}).length
      }
    }
  } catch { /* 读取失败按 0 条处理 */ }

  const recent: AgentRefineEntrySummary[] = []
  let lastTs: string | undefined
  if (sessionFile && existsSync(sessionFile)) {
    try {
      const lines = readFileSync(sessionFile, 'utf-8').split('\n').filter(Boolean)
      for (const line of lines.reverse()) {
        if (recent.length >= 5) break
        let entry: Record<string, unknown>
        try {
          entry = JSON.parse(line) as Record<string, unknown>
        } catch { continue }
        if (entry.type !== 'custom' || entry.customType !== 'prime-agent.refinement') continue
        const data = (entry.data ?? {}) as RefinementEntryData
        // Prime 写 timestamp；ts 是旧测试夹具的写法
        const ts = str(entry.timestamp) ?? str(entry.ts) ?? ''
        const edits = (data.appliedEdits ?? data.edits ?? []).slice(0, 6).map(editSummary)
        const kind = edits[0]?.kind ?? 'unknown'
        const summary = String(data.summary ?? '').slice(0, 240)
        const rationale = str(data.rationale)?.slice(0, 600)
        if (!lastTs && ts) lastTs = ts
        recent.push({ ts, kind, summary, ...(rationale ? { rationale } : {}), ...(edits.length ? { edits } : {}) })
      }
    } catch { /* 读取失败按无摘要处理 */ }
  }

  const arm = sessionFile ? readArm(sessionFile) : undefined
  return { entries, ...(lastTs ? { lastTs } : {}), recent, ...(arm ? { arm } : {}) }
}
