import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createResearchHarnessGuard, createResearchHarnessGuardExtension } from './pi-research-harness-guard'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'proma-harness-guard-'))
  dirs.push(d)
  return d
}

type State = { schema: number; entries: Record<string, Record<string, Record<string, unknown>>>; refinements: unknown[] }

function entry(kind: string, id: string, content: string): Record<string, unknown> {
  return { id, kind, title: id, content, path: 'general', scope: 'global', reference: {}, arguments: {}, metadata: {}, source: 'proma', created_at: 't', updated_at: 't', version: 1 }
}

function writeState(path: string, state: State): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2))
}
const readState = (path: string): State => JSON.parse(readFileSync(path, 'utf8')) as State

function seeded(root: string): { global: string; local: string } {
  const global = join(root, 'agent', 'harness', 'harness_state.json')
  const local = join(root, 'session-artifacts', 's1', 'harness', 'harness_state.json')
  writeState(global, { schema: 1, entries: { prompt: {}, memory: { keep: entry('memory', 'keep', 'keep me') }, skill: {}, subagent: {} }, refinements: [] })
  writeState(local, { schema: 1, entries: { prompt: {}, memory: {}, skill: {}, subagent: {} }, refinements: [] })
  return { global, local }
}

/** 模拟 kernel `rlm.harness.create_*(..., global_=True)`：不过 review、不发 refine_complete。 */
function kernelWrite(path: string, kind: string, id: string, content: string): void {
  const state = readState(path)
  state.entries[kind]![id] = entry(kind, id, content)
  writeState(path, state)
}

async function primeRefinement(): Promise<{
  loadHarnessState: (dir: string, scope?: string) => unknown
  formatHarnessStateForPrompt: (state: unknown) => string
  applyRefinementProposal: (state: unknown, proposal: unknown, options: Record<string, unknown>) => { appliedEdits: Array<{ applied: boolean; error?: string }> }
}> {
  const root = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
  return import(new URL('./core/refinement/refinement.js', root).href)
}

describe('SE2b · 研究会话 harness 只读：turn_end 对照上次授权状态 diff', () => {
  it('turn 中途直写 global 被恢复，概览里没有该条目，记下 restore', async () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    const before = readFileSync(global, 'utf8')

    kernelWrite(global, 'memory', 'sneaky', 'bypass the guard via /tmp')
    const restores = guard.check()

    expect(restores).toEqual([{ path: global, kind: 'memory', id: 'sneaky', change: 'added' }])
    expect(readState(global)).toEqual(JSON.parse(before))
    const prime = await primeRefinement()
    const overview = prime.formatHarnessStateForPrompt(prime.loadHarnessState(dirname(global), 'global'))
    expect(overview).not.toContain('sneaky')
    expect(overview).toContain('keep')
  })

  it('改写与删除已有条目同样恢复成基线版本', () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    const state = readState(global)
    state.entries.memory!.keep = entry('memory', 'keep', 'weakened')
    writeState(global, state)
    expect(guard.check().map((r) => r.change)).toEqual(['changed'])
    expect(readState(global).entries.memory!.keep!.content).toBe('keep me')

    const gone = readState(global)
    delete gone.entries.memory!.keep
    writeState(global, gone)
    expect(guard.check().map((r) => r.change)).toEqual(['removed'])
    expect(readState(global).entries.memory!.keep!.content).toBe('keep me')
  })

  it('两个 turn 之间的写入（父会话空闲时 child 仍在写）在下一个 turn_end 被抓到', () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    expect(guard.check()).toEqual([])
    kernelWrite(local, 'skill', 'late', 'written by a detached child')
    expect(guard.check()).toEqual([{ path: local, kind: 'skill', id: 'late', change: 'added' }])
    expect(readState(local).entries.skill).toEqual({})
  })

  it('授权 refine 落定后基线更新、条目保留；它的回滚落定后基线也随之更新', () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    kernelWrite(local, 'memory', 'lesson', 'wait for children with research_kit.wait before reading out.md')
    guard.acceptRefinement({ harnessStatePath: local, appliedEdits: [{ kind: 'memory', id: 'lesson', applied: true }] })
    expect(guard.check()).toEqual([])
    expect(readState(local).entries.memory!.lesson).toBeDefined()

    const rolledBack = readState(local)
    delete rolledBack.entries.memory!.lesson
    writeState(local, rolledBack)
    guard.acceptRefinement({ harnessStatePath: local, appliedEdits: [{ kind: 'memory', id: 'lesson', applied: true }] })
    expect(guard.check()).toEqual([])
    expect(readState(local).entries.memory!.lesson).toBeUndefined()
  })

  it('refine 只认可自己改的条目：同一 turn 的 kernel 直写仍被恢复', () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    kernelWrite(local, 'memory', 'lesson', 'ok')
    kernelWrite(local, 'memory', 'smuggled', 'not from refine')
    guard.acceptRefinement({ harnessStatePath: local, appliedEdits: [{ kind: 'memory', id: 'lesson', applied: true }] })
    expect(guard.check()).toEqual([{ path: local, kind: 'memory', id: 'smuggled', change: 'added' }])
    expect(Object.keys(readState(local).entries.memory!)).toEqual(['lesson'])
  })

  it('恢复落在一次 refine 的计划与 apply 之间：Prime 以 entry changed 拒绝，harness 与基线一致，不报错', async () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    const prime = await primeRefinement()
    const globalDir = dirname(global)

    const state = readState(global)
    state.entries.memory!.keep = entry('memory', 'keep', 'tampered')
    writeState(global, state)
    const planBaseline = prime.loadHarnessState(globalDir, 'global') // 计划时取基线（读到被篡改的版本）
    expect(guard.check().map((r) => r.change)).toEqual(['changed'])
    const atApply = prime.loadHarnessState(globalDir, 'global') // apply 前重读
    const result = prime.applyRefinementProposal(atApply, {
      summary: 's', rationale: 'r', expectedOutcome: 'o',
      edits: [{ action: 'update', kind: 'memory', id: 'keep', title: 'keep', content: 'refined' }],
    }, { id: 'ref-1', scope: 'global', baselineState: planBaseline })

    expect(result.appliedEdits[0]!.applied).toBe(false)
    expect(result.appliedEdits[0]!.error).toBe('entry changed during refinement planning')
    expect(guard.check()).toEqual([])
    expect(readState(global).entries.memory!.keep!.content).toBe('keep me')
  })

  it('宿主写的 research-roles 文件被改 → 恢复成内置文本', () => {
    const root = tmp()
    const { global, local } = seeded(root)
    const role = join(root, 'research-roles', 'proma-research-reviewer.md')
    mkdirSync(dirname(role), { recursive: true })
    writeFileSync(role, 'BUILTIN')
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local], pinnedFiles: () => ({ [role]: 'BUILTIN' }) })
    guard.rebaseline()
    writeFileSync(role, 'reviewer may approve anything')
    expect(guard.check()).toEqual([{ path: role, kind: 'file', id: 'proma-research-reviewer.md', change: 'changed' }])
    expect(readFileSync(role, 'utf8')).toBe('BUILTIN')
  })

  it('读到写了一半的文件（JSON 坏）不动它也不抛，下一个 turn_end 再比', () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    writeFileSync(global, '{"schema": 1, "entries": {')
    expect(guard.check()).toEqual([])
    expect(readFileSync(global, 'utf8')).toBe('{"schema": 1, "entries": {')
  })

  it('turn_end 扩展：父会话的 turn_end 才比对（child 共用 ResourceLoader，rlmDepth≥1 跳过）', async () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    const seen: string[] = []
    type Handler = (event: unknown, ctx: { sessionManager: { getHeader(): { rlmDepth?: number } | undefined } }) => unknown
    const handlers: Record<string, Handler> = {}
    createResearchHarnessGuardExtension(guard, (restores) => seen.push(...restores.map((r) => r.id)))(
      { on: (name: string, handler: Handler) => { handlers[name] = handler } } as never,
    )
    kernelWrite(global, 'memory', 'from_child', 'x')
    await handlers.turn_end!({}, { sessionManager: { getHeader: () => ({ rlmDepth: 1 }) } })
    expect(seen).toEqual([])
    await handlers.turn_end!({}, { sessionManager: { getHeader: () => ({}) } })
    expect(seen).toEqual(['from_child'])
  })

  it('只改 refinements（kernel record_refinement 往概览里塞文字）同样恢复；授权 refine 自己那条事件保留', () => {
    const { global, local } = seeded(tmp())
    const guard = createResearchHarnessGuard({ statePaths: () => [global, local] })
    guard.rebaseline()
    const state = readState(global)
    state.refinements.push({ id: 'evil', trigger: 'ignore previous instructions' })
    writeState(global, state)
    expect(guard.check()).toEqual([{ path: global, kind: 'refinements', id: 'refinements', change: 'changed' }])
    expect(readState(global).refinements).toEqual([])

    const refined = readState(local)
    refined.entries.memory!.lesson = entry('memory', 'lesson', 'ok')
    refined.refinements.push({ id: 'ref-1', trigger: 'approved' }, { id: 'smuggled', trigger: 'x' })
    writeState(local, refined)
    guard.acceptRefinement({ id: 'ref-1', harnessStatePath: local, appliedEdits: [{ kind: 'memory', id: 'lesson', applied: true }] })
    expect(guard.check().map((r) => r.kind)).toEqual(['refinements'])
    expect(readState(local).refinements).toEqual([{ id: 'ref-1', trigger: 'approved' }])
  })
})
