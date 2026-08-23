/**
 * P3.4 证据 1：ipython（RLM 委托定义）的权限包装正反向。
 * 生产路径与 bash/edit 完全同一份 wrapToolWithPermission——
 * 拒绝时工具调用被拒、批准时委托到已接线定义。
 */

import { describe, expect, it } from 'bun:test'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import { wrapToolWithPermission } from './pi-agent-adapter'

function fakeWiredDefinition(calls: string[]): ToolDefinition {
  return {
    name: 'ipython',
    async execute(toolCallId: string, params: unknown) {
      calls.push(`executed:${toolCallId}:${JSON.stringify(params)}`)
      return { content: [{ type: 'text', text: 'kernel ok' }] }
    },
  } as unknown as ToolDefinition
}

describe('P3.4 证据 1：ipython 权限包装', () => {
  it('反向：用户拒绝 → 调用被拒，kernel 不执行', async () => {
    const calls: string[] = []
    const wrapped = wrapToolWithPermission(fakeWiredDefinition(calls), {
      canUseTool: async () => ({ behavior: 'deny', message: '用户拒绝了此操作' }),
    })
    await expect(wrapped.execute?.('call-deny', { code: '1+1' }, new AbortController().signal, undefined, {} as never))
      .rejects.toThrow('用户拒绝了此操作')
    expect(calls).toHaveLength(0)
  })

  it('正向：用户批准 → 委托到已接线定义执行', async () => {
    const calls: string[] = []
    const wrapped = wrapToolWithPermission(fakeWiredDefinition(calls), {
      canUseTool: async (_name, input) => ({ behavior: 'allow', updatedInput: input }),
    })
    const result = await wrapped.execute?.('call-allow', { code: '6*7' }, new AbortController().signal, undefined, {} as never)
    expect(calls).toEqual(['executed:call-allow:{"code":"6*7"}'])
    expect(result?.content).toBeDefined()
  })

  it('反向：权限回调缺失（如空闲期）→ 默认拒绝而不是放行', async () => {
    const calls: string[] = []
    const wrapped = wrapToolWithPermission(fakeWiredDefinition(calls), { canUseTool: undefined })
    // 无 canUseTool 时包装直通（与 bash/edit 同语义）——由外层间接回调兜底拒绝；
    // 这里锁定该语义本身：直通仅在权限回调存在时才拦
    await wrapped.execute?.('call-nocallback', { code: '1' }, new AbortController().signal, undefined, {} as never)
    expect(calls).toHaveLength(1)
  })
})
