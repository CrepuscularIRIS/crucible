import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getSdkConfigDir } from './config-paths'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file'
import {
  MANAGED_RESEARCH_SUBAGENT_ROLES,
  buildResearchRlmSubagentSpec,
} from './research-subagent-roles'

export const MANAGED_RESEARCH_SUBAGENT_VERSION = '1.0.0'
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

export function getManagedResearchSubagentHarnessPath(): string {
  return join(getSdkConfigDir(), 'harness', 'harness_state.json')
}

export function seedManagedResearchSubagents(
  harnessStatePath: string = getManagedResearchSubagentHarnessPath(),
  now: string = new Date().toISOString(),
): ManagedResearchSubagentSeedResult {
  const state = normalizeHarnessState(readJsonFileSafe<unknown>(harnessStatePath))
  const subagents = state.entries.subagent!
  const result: ManagedResearchSubagentSeedResult = { created: 0, upgraded: 0, preserved: 0 }

  for (const role of MANAGED_RESEARCH_SUBAGENT_ROLES) {
    const id = `proma-research-${role}`
    const title = `Proma Research ${role}`
    const content = buildResearchRlmSubagentSpec(role)
    const existing = objectRecord(subagents[id])
    if (!existing) {
      subagents[id] = newManagedEntry(id, title, content, now)
      result.created += 1
      continue
    }
    if (!canUpgradeManagedEntry(existing)) {
      result.preserved += 1
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

  if (result.created > 0 || result.upgraded > 0) {
    mkdirSync(dirname(harnessStatePath), { recursive: true })
    writeJsonFileAtomic(harnessStatePath, state)
  }
  return result
}
