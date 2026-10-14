/**
 * SE2b · 研究会话里 harness 对模型只读（02-自进化设计 §3.5）。
 *
 * 宿主持有"上次授权状态"作基线：只在 Prime refine 路径落定（refine_complete，含回滚）
 * 与 rebaseline（seed 之后）时更新。每个 turn_end 按条目对照 local/global
 * `harness_state.json`，未授权的条目写回基线版本——kernel 直写
 * `rlm.harness.create_* / update_* / delete_*`（不过 review、不发 refine_complete）
 * 和两个 turn 之间 child 的写入都在这里被抓到。kernel 按 mtime 自动重载
 * （PR harness.py `_sync_from_disk`）；Prime 的提示词每次重建都重读文件，所以不强制 reload
 * （`AgentSession.reload()` 会发 session_shutdown，turn 中途不安全，§3.5 L5）。
 *
 * refine 路径是否授权（批准令牌、global 一律回滚）归 refine runtime（轨道 A）管：
 * 这里只认"refine 改的那几条"，同一 turn 里别的条目照样恢复。
 * ponytail: global 文件被所有会话共享；同一窗口内非研究会话合法的 global 写入会被误恢复
 * （§3.5 [INF，罕见]）。升级路径：每次授权写入带 session id，真出现误恢复再做。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { writeTextFileAtomic } from '../safe-file'

export interface HarnessRestore {
  path: string
  /** harness 条目的 kind；宿主钉住的文件为 'file'。 */
  kind: string
  id: string
  change: 'added' | 'changed' | 'removed'
}

export interface ResearchHarnessGuardOptions {
  /** 受保护的 harness_state.json（local 的 sessionId 在会话创建后才有，故惰性）。 */
  statePaths: () => string[]
  /** 宿主写的只读文件（research-roles）：路径 → 应有的字节。 */
  pinnedFiles?: () => Record<string, string>
}

export interface ResearchHarnessGuard {
  /** 以磁盘现状为授权基线（会话创建后、受管 seed 之后调用）。 */
  rebaseline(): void
  /** Prime refine 落定（含 rollbackOf）：只把它改的条目并入基线。 */
  acceptRefinement(result: {
    /** refinement id：它追加的 refinements 事件一并并入基线。 */
    id?: string
    harnessStatePath?: string
    appliedEdits: ReadonlyArray<{ kind?: string; id?: string; applied?: boolean }>
  }): void
  /** turn_end：恢复未授权写入，返回恢复清单；读不到/写了一半时跳过，不抛。 */
  check(): HarnessRestore[]
}

type Entries = Record<string, Record<string, unknown>>
type RawState = Record<string, unknown> & { entries?: Record<string, unknown> }

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v)
}

/** 缺文件 = 空状态；JSON 坏（kernel 非原子写到一半）= undefined。 */
function readRaw(path: string): RawState | undefined {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RawState : undefined
  } catch {
    return undefined
  }
}

type Baseline = { entries: Entries; refinements: unknown[] }

const refinementsOf = (raw: RawState): unknown[] => (Array.isArray(raw.refinements) ? raw.refinements : [])

function entriesOf(raw: RawState): Entries {
  const out: Entries = {}
  for (const [kind, bucket] of Object.entries(raw.entries ?? {})) {
    if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) out[kind] = { ...(bucket as Record<string, unknown>) }
  }
  return out
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const stripScope = (id: string): string => id.replace(/^(local|global):/, '')

export function createResearchHarnessGuard(options: ResearchHarnessGuardOptions): ResearchHarnessGuard {
  const baselines = new Map<string, Baseline>()
  const paths = (): string[] => options.statePaths().map((p) => resolve(p))

  const snapshot = (path: string): void => {
    const raw = readRaw(path)
    if (raw) baselines.set(path, clone({ entries: entriesOf(raw), refinements: refinementsOf(raw) }))
  }

  return {
    rebaseline() {
      for (const path of paths()) snapshot(path)
    },

    acceptRefinement(result) {
      const targets = result.harnessStatePath
        ? [resolve(result.harnessStatePath)].filter((p) => baselines.has(p))
        : [...baselines.keys()]
      for (const path of targets) {
        const raw = readRaw(path)
        if (!raw) continue
        const disk = entriesOf(raw)
        const baseline = baselines.get(path)!
        const base = baseline.entries
        for (const event of refinementsOf(raw)) {
          const id = (event as { id?: unknown } | null)?.id
          if (result.id && id === result.id && !baseline.refinements.some((e) => canonical(e) === canonical(event))) {
            baseline.refinements.push(clone(event))
          }
        }
        for (const edit of result.appliedEdits) {
          if (!edit.kind || !edit.id || edit.applied === false) continue
          const id = stripScope(edit.id)
          const bucket = (base[edit.kind] ??= {})
          const now = disk[edit.kind]?.[id]
          if (now === undefined) delete bucket[id]
          else bucket[id] = clone(now)
        }
      }
    },

    check() {
      const restores: HarnessRestore[] = []
      for (const path of paths()) {
        const baseline = baselines.get(path)
        // ponytail: 会话开始时恰好读到写了一半的文件 → 首个能读的 turn_end 才取基线（窗口极窄）；
        // 不改成"恢复为空"，那会清掉 global 里别的会话的条目。
        if (!baseline) { snapshot(path); continue }
        const base = baseline.entries
        const raw = readRaw(path)
        if (!raw) continue
        const disk = entriesOf(raw)
        const restored = clone(disk)
        const found: HarnessRestore[] = []
        for (const kind of new Set([...Object.keys(base), ...Object.keys(disk)])) {
          const want = base[kind] ?? {}
          const have = disk[kind] ?? {}
          for (const id of new Set([...Object.keys(want), ...Object.keys(have)])) {
            if (canonical(want[id]) === canonical(have[id])) continue
            const bucket = (restored[kind] ??= {})
            if (want[id] === undefined) {
              delete bucket[id]
              found.push({ path, kind, id, change: 'added' })
            } else {
              bucket[id] = clone(want[id])
              found.push({ path, kind, id, change: have[id] === undefined ? 'removed' : 'changed' })
            }
          }
        }
        // kernel record_refinement 只改 refinements，而概览会打印最近的事件：同样恢复。
        if (canonical(refinementsOf(raw)) !== canonical(baseline.refinements)) {
          found.push({ path, kind: 'refinements', id: 'refinements', change: 'changed' })
        }
        if (found.length === 0) continue
        writeTextFileAtomic(path, `${JSON.stringify({ schema: 1, ...raw, entries: restored, refinements: clone(baseline.refinements) }, null, 2)}\n`)
        restores.push(...found)
      }
      for (const [path, content] of Object.entries(options.pinnedFiles?.() ?? {})) {
        let current: string | undefined
        try { current = readFileSync(path, 'utf8') } catch { current = undefined }
        if (current === content) continue
        mkdirSync(dirname(path), { recursive: true })
        writeTextFileAtomic(path, content)
        restores.push({ path, kind: 'file', id: basename(path), change: current === undefined ? 'removed' : 'changed' })
      }
      return restores
    },
  }
}

/**
 * pi `turn_end`（每条 assistant 消息结束，不是 agent_end）上跑 check。serialized 模式下
 * Prime 在 turn_end 之后的 shouldStopAfterTurn 才 apply refine，所以那次 refine 的落定
 * （acceptRefinement）总在下一个 turn_end 之前。ResourceLoader 供父/子会话共用：只在父会话比对。
 */
export function createResearchHarnessGuardExtension(
  guard: ResearchHarnessGuard,
  onRestore: (restores: HarnessRestore[]) => void,
): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.on('turn_end', (_event, ctx) => {
      if (ctx.sessionManager.getHeader()?.rlmDepth) return
      try {
        const restores = guard.check()
        if (restores.length > 0) onRestore(restores)
      } catch (error) {
        console.error('[Research] harness guard 比对/恢复失败:', error)
      }
    })
  }
}
