import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { K0_PENDING_REL, createK0IntakeExtension, readPendingK0, renderK0PendingBlock } from './pi-research-k0'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'k0-'))
  roots.push(cwd)
  return cwd
}

const DRAFT = 'status: pending_user\nmode: identify\npredicate: LIVE 收缩到 1 或写明等价类\ndepth: light\nforks: wait\n'

function writePending(cwd: string, text = DRAFT, mtimeMs = Date.now()): string {
  const path = join(cwd, K0_PENDING_REL)
  mkdirSync(join(cwd, '.research-pending'), { recursive: true })
  writeFileSync(path, text)
  utimesSync(path, mtimeMs / 1000, mtimeMs / 1000)
  return path
}

type Handler = (event: Record<string, unknown>, ctx?: unknown) => unknown

function install(cwd: string, userReplyAt: () => number): Record<string, Handler> {
  const handlers: Record<string, Handler> = {}
  const pi = { on: (event: string, h: Handler) => { handlers[event] = h } } as unknown as ExtensionAPI
  createK0IntakeExtension({ cwd, userReplyAt })(pi)
  return handlers
}

const top = { sessionManager: { getHeader: () => ({}) } }
const init = { toolName: 'mcp__proma-research__research_init', input: { run: 'r1' } }
const modeInit = { toolName: 'mcp__proma-research__research_init', input: { run: 'r1', mode: 'identify' } }

describe('K0 pending：持久化 + resume 回到同一次确认', () => {
  it('只有首个 status 行是 pending_user 才算待确认', () => {
    const cwd = workspace()
    expect(readPendingK0(cwd)).toBeUndefined()
    writePending(cwd, 'status: confirmed\nmode: open\n')
    expect(readPendingK0(cwd)).toBeUndefined()
    writePending(cwd)
    expect(readPendingK0(cwd)?.text).toContain('mode: identify')
  })

  it('每回合块原样带回草稿，说明回复才是确认、不回复不算批准', () => {
    const cwd = workspace()
    expect(renderK0PendingBlock(cwd)).toBe('')
    writePending(cwd)
    const block = renderK0PendingBlock(cwd)
    expect(block).toContain('<research_k0_pending>')
    expect(block).toContain('predicate: LIVE 收缩到 1 或写明等价类')
    expect(block).toContain('`research_init`')
    expect(block).toMatch(/never|永不/)
  })
})

describe('K0 闸：永不静默批准（research_init 必须晚于用户回复）', () => {
  it('pending 写在本轮用户回复之后 → research_init 被拦，reason 给出合法出口', async () => {
    const cwd = workspace()
    const replyAt = Date.now() - 60_000
    writePending(cwd, DRAFT, Date.now())
    const res = await install(cwd, () => replyAt).tool_call!(init, top) as { block: boolean; reason: string }
    expect(res.block).toBe(true)
    expect(res.reason).toContain('K0')
    expect(res.reason).toContain('AskUserQuestion')
  })

  it('用户回复晚于 pending（resume 后的新一轮）→ 放行', async () => {
    const cwd = workspace()
    writePending(cwd, DRAFT, Date.now() - 60_000)
    expect(await install(cwd, () => Date.now()).tool_call!(init, top)).toBeUndefined()
  })

  it('同一轮里 AskUserQuestion 回答之后 → 放行', async () => {
    const cwd = workspace()
    writePending(cwd, DRAFT, Date.now() - 1000)
    const h = install(cwd, () => Date.now() - 60_000)
    expect(await h.tool_call!(init, top)).toMatchObject({ block: true })
    await h.tool_call!({ toolName: 'AskUserQuestion', toolCallId: 'q1', input: {} }, top)
    await h.tool_result!({ toolName: 'AskUserQuestion', toolCallId: 'q1', input: {}, content: [], isError: false }, top)
    expect(await h.tool_call!(init, top)).toBeUndefined()
  })

  it('草稿写之前问过、答过的 AskUserQuestion 不算 K0 的回答（LOW：任意问答都放行）', async () => {
    const cwd = workspace()
    const h = install(cwd, () => Date.now() - 60_000)
    // 问题在草稿存在之前就发出（与 K0 无关），回答落在草稿之后
    await h.tool_call!({ toolName: 'AskUserQuestion', toolCallId: 'q0', input: {} }, top)
    writePending(cwd, DRAFT, Date.now() - 500)
    await h.tool_result!({ toolName: 'AskUserQuestion', toolCallId: 'q0', input: {}, content: [], isError: false }, top)
    expect(await h.tool_call!(modeInit, top)).toMatchObject({ block: true })
  })

  it('回答之后草稿又被改写 → 改写后的草稿用户没看过，再拦', async () => {
    const cwd = workspace()
    writePending(cwd, DRAFT, Date.now() - 5000)
    const h = install(cwd, () => Date.now() - 60_000)
    await h.tool_call!({ toolName: 'AskUserQuestion', toolCallId: 'q1', input: {} }, top)
    await h.tool_result!({ toolName: 'AskUserQuestion', toolCallId: 'q1', input: {}, content: [], isError: false }, top)
    writePending(cwd, DRAFT.replace('depth: light', 'depth: full'), Date.now() + 1000)
    expect(await h.tool_call!(modeInit, top)).toMatchObject({ block: true })
  })

  it('带 mode 的 research_init 没有 K0 草稿 → 拦（M1：不写草稿就跳不过 K0），reason 告诉怎么写、问一次', async () => {
    const cwd = workspace()
    const res = await install(cwd, () => Date.now()).tool_call!(modeInit, top) as { block: boolean; reason: string }
    expect(res.block).toBe(true)
    expect(res.reason).toContain('.research-pending/K0-intake.md')
    expect(res.reason).toContain('status: pending_user')
    expect(res.reason).toMatch(/一次|once/)
  })

  it('两种拦截的 reason 与每回合块都说清：用户回复后别改草稿（含 status 行），直接 research_init（审计 D1）', async () => {
    const cwd = workspace()
    // agent 自己把首行改成 confirmed：pending 不再算数，带 mode 的 init 落到 NO_DRAFT
    writePending(cwd, DRAFT.replace('pending_user', 'confirmed'))
    const noDraft = await install(cwd, () => Date.now()).tool_call!(modeInit, top) as { reason: string }
    expect(noDraft.reason).toContain('不要改')
    expect(noDraft.reason).toContain('status')
    // 改回 pending_user：mtime 晚于回复，落到 UNANSWERED
    writePending(cwd, DRAFT, Date.now())
    const unanswered = await install(cwd, () => Date.now() - 60_000).tool_call!(modeInit, top) as { reason: string }
    expect(unanswered.reason).toContain('不要改')
    expect(renderK0PendingBlock(cwd)).toMatch(/do not edit/i)
  })

  it('带 mode、用户已回复过的草稿 → 放行；run 里已有 K0-intake.md（重开）→ 放行', async () => {
    const cwd = workspace()
    writePending(cwd, DRAFT, Date.now() - 60_000)
    expect(await install(cwd, () => Date.now()).tool_call!(modeInit, top)).toBeUndefined()
    const other = workspace()
    mkdirSync(join(other, '.proma-research', 'r1'), { recursive: true })
    writeFileSync(join(other, '.proma-research', 'r1', 'K0-intake.md'), 'status: confirmed\nmode: identify\n')
    expect(await install(other, () => Date.now()).tool_call!(modeInit, top)).toBeUndefined()
  })

  it('不带 mode 只放行续跑已有 run；新 run 不带 mode 同样要先写 K0（否则绕过 K0 与全部封顶）', async () => {
    const cwd = workspace()
    const h = install(cwd, () => 0)
    expect((await h.tool_call!(init, top) as { block?: boolean } | undefined)?.block).toBe(true)
    mkdirSync(join(cwd, '.proma-research', 'r1'), { recursive: true })
    expect(await h.tool_call!(init, top)).toBeUndefined()
  })

  it('别的工具、非 research 服务、或 child 会话：一律不管', async () => {
    const cwd = workspace()
    const h = install(cwd, () => 0)
    writePending(cwd)
    expect(await h.tool_call!({ toolName: 'mcp__proma-research__research_state', input: {} }, top)).toBeUndefined()
    expect(await h.tool_call!({ toolName: 'mcp__other__research_init', input: {} }, top)).toBeUndefined()
    expect(await h.tool_call!(init, { sessionManager: { getHeader: () => ({ rlmDepth: 1 }) } })).toBeUndefined()
    expect(await h.tool_call!(modeInit, { sessionManager: { getHeader: () => ({ rlmDepth: 1 }) } })).toBeUndefined()
  })
})

describe('K0 落地：research_init 成功后宿主把 pending 移进 run（agent 永不写状态根）', () => {
  function initRun(cwd: string, run = 'r1'): string {
    const runDir = join(cwd, '.proma-research', run)
    mkdirSync(runDir, { recursive: true })
    writeFileSync(join(runDir, 'journal.jsonl'), '{"op":"run.init"}\n')
    return runDir
  }

  it('成功 → <run>/K0-intake.md（status 改 confirmed，forks 行原样），pending 删除', async () => {
    const cwd = workspace()
    const pending = writePending(cwd, DRAFT, Date.now() - 1000)
    const runDir = initRun(cwd)
    await install(cwd, () => Date.now()).tool_result!({ ...init, content: [], isError: false }, top)
    expect(existsSync(pending)).toBe(false)
    const moved = readFileSync(join(runDir, 'K0-intake.md'), 'utf-8')
    expect(moved).toMatch(/^status: confirmed/m)
    expect(moved).not.toContain('pending_user')
    expect(moved).toMatch(/^forks: wait$/m)
  })

  it('research_init 失败 → 什么都不动', async () => {
    const cwd = workspace()
    const pending = writePending(cwd)
    initRun(cwd)
    await install(cwd, () => Date.now()).tool_result!({ ...init, content: [], isError: true }, top)
    expect(existsSync(pending)).toBe(true)
  })

  it('run 里已有 K0-intake.md（重开同一 run，mode 已冻结）→ 不覆盖；新草稿留档不静默删，结果里告诉 agent', async () => {
    const cwd = workspace()
    const pending = writePending(cwd)
    const runDir = initRun(cwd)
    writeFileSync(join(runDir, 'K0-intake.md'), 'status: confirmed\nmode: open\n')
    const res = await install(cwd, () => Date.now()).tool_result!({ ...init, content: [{ type: 'text', text: 'ok' }], isError: false }, top) as
      { content: { type: string; text: string }[] }
    expect(readFileSync(join(runDir, 'K0-intake.md'), 'utf-8')).toContain('mode: open')
    expect(readPendingK0(cwd)).toBeUndefined()
    const kept = readdirSync(join(cwd, '.research-pending')).filter((f) => f.includes('unapplied'))
    expect(kept).toHaveLength(1)
    const keptText = readFileSync(join(cwd, '.research-pending', kept[0]!), 'utf-8')
    expect(keptText).toMatch(/^status: unapplied/m)
    expect(keptText).toContain('mode: identify')
    expect(existsSync(pending)).toBe(false)
    expect(res.content[0]!.text).toBe('ok')
    expect(res.content.at(-1)!.text).toContain(kept[0]!)
  })

  it('移入 research_init 入参里的 run，不是 journal 最新的那个（M3）', async () => {
    const cwd = workspace()
    writePending(cwd, DRAFT, Date.now() - 1000)
    const r1 = initRun(cwd, 'r1')
    const r2 = initRun(cwd, 'r2')
    const future = (Date.now() + 60_000) / 1000
    utimesSync(join(r2, 'journal.jsonl'), future, future)
    await install(cwd, () => Date.now()).tool_result!({ ...init, content: [], isError: false }, top)
    expect(existsSync(join(r1, 'K0-intake.md'))).toBe(true)
    expect(existsSync(join(r2, 'K0-intake.md'))).toBe(false)
  })

  it('入参 run 名按 MCP 的 sanitize 规则落盘（a/b → a-b）', async () => {
    const cwd = workspace()
    writePending(cwd, DRAFT, Date.now() - 1000)
    const runDir = initRun(cwd, 'a-b')
    await install(cwd, () => Date.now()).tool_result!({ ...init, input: { run: 'a/b' }, content: [], isError: false }, top)
    expect(existsSync(join(runDir, 'K0-intake.md'))).toBe(true)
  })
})
