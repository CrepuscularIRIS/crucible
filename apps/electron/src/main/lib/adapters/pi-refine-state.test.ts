/**
 * P0.5：refine 徽标数据源 —— 读真实写出的文件，不读 Prime 从不写的 refinements.jsonl。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { summarizePrimeRefineArtifacts } from './pi-refine-state'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'proma-refine-state-'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('refine 徽标数据源', () => {
  it('harness_state.json 分桶条目数 + 会话 JSONL custom 条目摘要（新→旧，含 kind 与 lastTs）', () => {
    const harnessDir = join(root, 'case-a', 'harness')
    mkdirSync(harnessDir, { recursive: true })
    writeFileSync(join(harnessDir, 'harness_state.json'), JSON.stringify({
      schema: 1,
      entries: {
        prompt: { p1: {}, p2: {} },
        memory: { m1: {} },
      },
      refinements: [],
    }))
    const sessionFile = join(root, 'case-a', 'session.jsonl')
    writeFileSync(sessionFile, [
      JSON.stringify({ type: 'custom', customType: 'prime-agent.refinement', ts: '2026-08-22T10:00:00Z', data: { summary: '第一次提炼', edits: [{ kind: 'prompt' }] } }),
      JSON.stringify({ type: 'message', ts: '2026-08-22T10:01:00Z', data: {} }),
      JSON.stringify({ type: 'custom', customType: 'prime-agent.refinement', ts: '2026-08-22T11:00:00Z', data: { summary: '第二次提炼：记忆用户偏好', edits: [{ kind: 'memory' }] } }),
    ].join('\n'))

    const summary = summarizePrimeRefineArtifacts(harnessDir, sessionFile)
    expect(summary.entries).toBe(3)
    expect(summary.lastTs).toBe('2026-08-22T11:00:00Z')
    expect(summary.recent).toHaveLength(2)
    expect(summary.recent[0]?.summary).toContain('第二次提炼')
    expect(summary.recent[0]?.kind).toBe('memory')
    expect(summary.recent[1]?.kind).toBe('prompt')
  })

  it('反向验证：只有 Prime 从不写的 refinements.jsonl 时读不到任何记录', () => {
    const harnessDir = join(root, 'case-b', 'harness')
    mkdirSync(harnessDir, { recursive: true })
    writeFileSync(join(harnessDir, 'refinements.jsonl'), JSON.stringify({ summary: '幽灵记录' }) + '\n')
    const summary = summarizePrimeRefineArtifacts(harnessDir, undefined)
    expect(summary.entries).toBe(0)
    expect(summary.recent).toHaveLength(0)
    expect(summary.lastTs).toBeUndefined()
  })

  it('文件缺失或损坏时安静地返回空而不是抛错', () => {
    const harnessDir = join(root, 'case-c', 'harness')
    mkdirSync(harnessDir, { recursive: true })
    writeFileSync(join(harnessDir, 'harness_state.json'), '{not-json')
    const sessionFile = join(root, 'case-c', 'session.jsonl')
    writeFileSync(sessionFile, 'not-json-line\n{"type":"custom","customType":"other"}\n')
    const summary = summarizePrimeRefineArtifacts(harnessDir, sessionFile)
    expect(summary.entries).toBe(0)
    expect(summary.recent).toHaveLength(0)
  })
})
