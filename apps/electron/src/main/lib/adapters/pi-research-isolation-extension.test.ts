import { describe, expect, it } from 'bun:test'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { createResearchIsolationExtension, createRlmChildToolGuardExtension } from './pi-research-isolation-extension'

describe('Pi research 隔离扩展', () => {
  it('注册 execution-before tool_call 守卫并返回 block', async () => {
    let handler: ((event: {
      toolName: string
      input: Record<string, unknown>
    }) => unknown) | undefined
    const pi = {
      on(event: string, next: typeof handler) {
        expect(event).toBe('tool_call')
        handler = next
      },
    } as unknown as ExtensionAPI

    createResearchIsolationExtension({
      cwd: '/home/test/project',
      denyRoots: ['/home/test/oss/neuronbench'],
      stateRoots: ['/home/test/project/.proma-research'],
    })(pi)

    expect(handler).toBeDefined()
    expect(await handler?.({
      toolName: 'bash',
      input: { command: 'kill 262267' },
    })).toEqual({
      block: true,
      reason: expect.stringContaining('world_* MCP'),
    })
  })

  it('observer 旁路记录拒绝与 bash/ipython 的通过（审计 F1：通过 = 验证分母）', async () => {
    let handler: ((event: { toolName: string; input: Record<string, unknown> }) => unknown) | undefined
    const pi = {
      on(_event: string, next: typeof handler) {
        handler = next
      },
    } as unknown as ExtensionAPI
    const denied: Array<{ tool: string; reason: string }> = []
    const allowed: string[] = []

    createResearchIsolationExtension({
      cwd: '/home/test/project',
      denyRoots: ['/home/test/oss/neuronbench'],
      stateRoots: ['/home/test/project/.proma-research'],
    }, {
      onDenied: (toolName, reason) => denied.push({ tool: toolName, reason }),
      onAllowed: (toolName) => allowed.push(toolName),
    })(pi)

    expect(await handler?.({
      toolName: 'bash',
      input: { command: 'cat /home/test/oss/neuronbench/worlds.py' },
    })).toMatchObject({ block: true })
    expect(await handler?.({ toolName: 'ipython', input: { code: 'result = 6 * 7' } })).toBeUndefined()
    // 非 guard 管辖的工具通过不产生 success 噪音
    expect(await handler?.({ toolName: 'read', input: { path: '/tmp/x' } })).toBeUndefined()

    expect(denied).toHaveLength(1)
    expect(denied[0]?.tool).toBe('bash')
    expect(allowed).toEqual(['ipython'])
  })
  it('edit 按 path 参数分类：改 journal.jsonl 被拒并记 guard residual，放行也通知 observer（SE2a）', async () => {
    let handler: ((event: { toolName: string; input: Record<string, unknown> }) => unknown) | undefined
    const pi = {
      on(_event: string, next: typeof handler) {
        handler = next
      },
    } as unknown as ExtensionAPI
    const denied: Array<{ tool: string; reason: string }> = []
    const allowed: string[] = []
    createResearchIsolationExtension({
      cwd: '/home/test/project',
      denyRoots: ['/home/test/oss/neuronbench'],
      stateRoots: ['/home/test/project/.proma-research'],
    }, {
      onDenied: (toolName, reason) => denied.push({ tool: toolName, reason }),
      onAllowed: (toolName) => allowed.push(toolName),
    })(pi)

    expect(await handler?.({
      toolName: 'edit',
      input: { path: '.proma-research/r1/journal.jsonl', edits: [{ oldText: 'a', newText: 'b' }] },
    })).toMatchObject({ block: true })
    expect(await handler?.({
      toolName: 'edit',
      input: { path: 'research-work/r1/REPORT.md', edits: [{ oldText: 'a', newText: 'b' }] },
    })).toBeUndefined()

    expect(denied).toEqual([{ tool: 'edit', reason: expect.stringContaining('world_* MCP') }])
    expect(allowed).toEqual(['edit'])
  })
})

describe('rlm child 的 MCP 只读守卫（P0 检查 ②，与 PROMA_RESEARCH_DENY 无关）', () => {
  type Handler = (event: { toolName: string; input: Record<string, unknown> }, ctx: unknown) => unknown
  const ctxAt = (rlmDepth: number | undefined) => ({ sessionManager: { getHeader: () => ({ rlmDepth }) } })

  it('从 ctx 的 session header 取 rlmDepth：depth 1 拒绝研究写工具，depth 0 放行', async () => {
    let handler: Handler | undefined
    const pi = {
      on(event: string, next: Handler) {
        expect(event).toBe('tool_call')
        handler = next
      },
    } as unknown as ExtensionAPI
    createRlmChildToolGuardExtension()(pi)

    const call = { toolName: 'mcp__research__attack_record', input: {} }
    expect(await handler?.(call, ctxAt(1))).toMatchObject({ block: true, reason: expect.stringContaining('out.md') })
    expect(await handler?.(call, ctxAt(0))).toBeUndefined()
    expect(await handler?.(call, ctxAt(undefined))).toBeUndefined()
    expect(await handler?.(call, { sessionManager: { getHeader: () => null } })).toBeUndefined()
    expect(await handler?.({ toolName: 'ipython', input: { code: 'x = 1' } }, ctxAt(1))).toBeUndefined()
  })
})
