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
      denyRoots: ['/home/test/oss/neuronbench'],
      stateRoot: '/home/test/project/.proma-research',
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
})
