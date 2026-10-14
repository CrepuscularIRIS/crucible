import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { getSdkConfigDir } from './config-paths'
import { readJsonFileSafe, writeJsonFileAtomic, writeTextFileAtomic } from './safe-file'
import {
  MANAGED_RESEARCH_SUBAGENT_ROLES,
  buildResearchRlmSubagentSpec,
} from './research-subagent-roles'

export const MANAGED_RESEARCH_SUBAGENT_VERSION = '1.3.0'
const MANAGED_BY = 'proma-research'

interface HarnessEntry {
  id: string
  kind: 'subagent'
  title: string
  content: string
  path: string
  scope: 'global'
  reference: Record<string, unknown>
  arguments: Record<string, unknown>
  metadata: Record<string, unknown>
  source: string
  created_at: string
  updated_at: string
  version: number
}

interface HarnessState extends Record<string, unknown> {
  schema: number
  entries: Record<string, Record<string, unknown>>
  refinements: unknown[]
}

export interface ManagedResearchSubagentSeedResult {
  created: number
  upgraded: number
  preserved: number
  /** 研究模式（force）下被强制恢复成内置版本的条目数。 */
  restored: number
}

export interface ManagedResearchSubagentSeedOptions {
  /**
   * 研究模式（02 §3.5、§10 Q2 (a)）：digest 不符或同名非受管的条目一律恢复成内置版本并告警，
   * 不再 preserved——被审者不能改审稿人。
   */
  force?: boolean
  /** 另把内置 spec 逐字节写到 `<rolesDir>/proma-research-<role>.md`（child 的 brief 从这里读）。 */
  rolesDir?: string
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function normalizeHarnessState(raw: unknown): HarnessState {
  const root = objectRecord(raw) ?? {}
  const rawEntries = objectRecord(root.entries) ?? {}
  const entries: Record<string, Record<string, unknown>> = {}
  for (const [kind, bucket] of Object.entries(rawEntries)) {
    entries[kind] = objectRecord(bucket) ?? {}
  }
  for (const kind of ['prompt', 'memory', 'skill', 'subagent']) {
    entries[kind] ??= {}
  }
  return {
    ...root,
    schema: typeof root.schema === 'number' ? root.schema : 1,
    entries,
    refinements: Array.isArray(root.refinements) ? root.refinements : [],
  }
}

function managedEntryDigest(entry: Record<string, unknown>): string {
  return digest(JSON.stringify({
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    content: entry.content,
    path: entry.path,
    scope: entry.scope,
    reference: objectRecord(entry.reference) ?? {},
    arguments: objectRecord(entry.arguments) ?? {},
    source: entry.source,
  }))
}

function managedMetadata(entry: Record<string, unknown>): Record<string, unknown> {
  return {
    promaManagedBy: MANAGED_BY,
    promaManagedVersion: MANAGED_RESEARCH_SUBAGENT_VERSION,
    promaManagedDigest: managedEntryDigest(entry),
  }
}

function newManagedEntry(
  id: string,
  title: string,
  content: string,
  now: string,
): HarnessEntry {
  const entry: HarnessEntry = {
    id,
    kind: 'subagent',
    title,
    content,
    path: 'proma/research',
    scope: 'global',
    reference: {},
    arguments: {},
    metadata: {},
    source: 'proma',
    created_at: now,
    updated_at: now,
    version: 1,
  }
  entry.metadata = managedMetadata(entry as unknown as Record<string, unknown>)
  return entry
}

function canUpgradeManagedEntry(entry: Record<string, unknown>): boolean {
  const metadata = objectRecord(entry.metadata)
  if (metadata?.promaManagedBy !== MANAGED_BY) return false
  const recordedDigest = typeof metadata.promaManagedDigest === 'string'
    ? metadata.promaManagedDigest
    : undefined
  return recordedDigest !== undefined && recordedDigest === managedEntryDigest(entry)
}

/**
 * 必须与 Prime 读取的全局 harness 同一路径：`rlm.harness.get(..., global_=True)` 解析
 * RLM_GLOBAL_HARNESS_STATE_DIR ← getGlobalHarnessStateDir() ← getAgentDir()
 * （prime-agent `config.ts:getAgentDir/expandTildePath` · `core/refinement/refinement.ts`）。
 * 写到 Proma 的 sdk-config 下时 Prime 读到 None，research-grill 的 reviewer 委派当场失败。
 */
export function getManagedResearchSubagentHarnessPath(env: NodeJS.ProcessEnv = process.env): string {
  // 逐字对齐 Prime TS getAgentDir()：只认 PRIME_AGENT_CODING_AGENT_DIR，展开 ~，不 trim。
  // kernel 总拿到 TS 算出的 RLM_GLOBAL_HARNESS_STATE_DIR，Python 侧的 PI_ 回退在会话里不生效。
  const raw = env.PRIME_AGENT_CODING_AGENT_DIR
  const agentDir = !raw
    ? join(homedir(), '.prime', 'agent')
    : raw === '~' ? homedir() : raw.startsWith('~/') ? homedir() + raw.slice(1) : raw
  return join(agentDir, 'harness', 'harness_state.json')
}

/** 宿主写的受管角色 spec 目录：`<sdk-config>/research-roles/`（在 guard 的 state 根内，SE2a）。 */
export function getResearchRolesDir(sdkConfigDir: string = getSdkConfigDir()): string {
  return join(sdkConfigDir, 'research-roles')
}

function writeRoleFile(rolesDir: string, id: string, content: string): void {
  const path = join(rolesDir, `${id}.md`)
  try {
    if (readFileSync(path, 'utf8') === content) return
  } catch {
    // 缺文件：照写
  }
  mkdirSync(rolesDir, { recursive: true })
  writeTextFileAtomic(path, content)
}

export function seedManagedResearchSubagents(
  harnessStatePath: string = getManagedResearchSubagentHarnessPath(),
  now: string = new Date().toISOString(),
  options: ManagedResearchSubagentSeedOptions = {},
): ManagedResearchSubagentSeedResult {
  const state = normalizeHarnessState(readJsonFileSafe<unknown>(harnessStatePath))
  const subagents = state.entries.subagent!
  const result: ManagedResearchSubagentSeedResult = { created: 0, upgraded: 0, preserved: 0, restored: 0 }

  for (const role of MANAGED_RESEARCH_SUBAGENT_ROLES) {
    const id = `proma-research-${role}`
    const title = `Proma Research ${role}`
    const content = buildResearchRlmSubagentSpec(role)
    if (options.rolesDir) writeRoleFile(options.rolesDir, id, content)
    const existing = objectRecord(subagents[id])
    if (!existing) {
      subagents[id] = newManagedEntry(id, title, content, now)
      result.created += 1
      continue
    }
    if (!canUpgradeManagedEntry(existing)) {
      if (!options.force) {
        result.preserved += 1
        continue
      }
      // ponytail: 不作废验证账本里涉及该 id 的 PENDING/VALIDATED——seed 只在研究会话创建时跑，
      // 本会话账本此时还是空的；refine 改受管条目由 F1（lint）拦。跨会话账本出现后再补。
      console.warn(`[Research] 受管 spec ${id} 被改过（digest 不符或被同名非受管条目覆盖），研究模式下恢复为内置版本`)
      subagents[id] = newManagedEntry(id, title, content, now)
      result.restored += 1
      continue
    }
    const metadata = objectRecord(existing.metadata) ?? {}
    if (
      existing.content === content
      && metadata.promaManagedVersion === MANAGED_RESEARCH_SUBAGENT_VERSION
    ) {
      continue
    }
    const upgradedEntry: HarnessEntry = {
      ...existing,
      id,
      kind: 'subagent',
      title,
      content,
      path: 'proma/research',
      scope: 'global',
      reference: objectRecord(existing.reference) ?? {},
      arguments: objectRecord(existing.arguments) ?? {},
      metadata: { ...metadata },
      source: 'proma',
      created_at: typeof existing.created_at === 'string' ? existing.created_at : now,
      updated_at: now,
      version: typeof existing.version === 'number' ? existing.version + 1 : 1,
    }
    upgradedEntry.metadata = {
      ...metadata,
      ...managedMetadata(upgradedEntry as unknown as Record<string, unknown>),
    }
    subagents[id] = upgradedEntry as unknown as Record<string, unknown>
    result.upgraded += 1
  }

  if (result.created > 0 || result.upgraded > 0 || result.restored > 0) {
    mkdirSync(dirname(harnessStatePath), { recursive: true })
    writeJsonFileAtomic(harnessStatePath, state)
  }
  return result
}
