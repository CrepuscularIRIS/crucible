import { describe, expect, it } from 'bun:test'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { createResearchIsolationExtension } from './pi-research-isolation-extension'

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
})
