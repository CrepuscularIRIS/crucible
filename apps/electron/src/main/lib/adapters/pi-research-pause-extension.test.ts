import { describe, expect, it } from 'bun:test'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { createResearchPauseExtension, type ForkCandidate } from './pi-research-pause-extension'
import type { ResearchPauseGate } from '../research-control'

type Handler = (event: { toolName: string; input: Record<string, unknown> }, ctx: unknown) => unknown

function install(getGate: () => ResearchPauseGate, forkCandidate?: (input: Record<string, unknown>) => ForkCandidate | null): Handler {
  let handler: Handler | undefined
  const pi = {
    on(event: string, next: Handler) {
      expect(event).toBe('tool_call')
      handler = next
    },
  } as unknown as ExtensionAPI
  createResearchPauseExtension(getGate, { forkCandidate })(pi)
  return handler!
}

const at = (rlmDepth?: number) => ({ sessionManager: { getHeader: () => ({ rlmDepth }) } })
const paused: ResearchPauseGate = { readOnly: true, stopAtTurn: true, forks: 'auto', reason: 'U3' }
const open: ResearchPauseGate = { readOnly: false, stopAtTurn: false, forks: 'auto' }

describe('研究暂停扩展：只读闸门', () => {
  it('只读时拦 prereg_write / ipython / bash / edit，reason 带 U# 并说明只能用什么', async () => {
    const handler = install(() => paused)
    for (const toolName of ['mcp__proma-research__prereg_write', 'ipython', 'bash', 'edit']) {
      const res = await handler({ toolName, input: {} }, at()) as { block: boolean; reason: string }
      expect(res.block).toBe(true)
      expect(res.reason).toContain('研究已被用户暂停（U3）')
      expect(res.reason).toContain('research_state')
    }
  })
  it('只读时只放 Prime 真实存在的只读工具：research MCP 只读面 / AskUserQuestion / CompactContext', async () => {
    const handler = install(() => paused)
    for (const toolName of ['mcp__proma-research__research_state', 'mcp__research__metric_recompute', 'AskUserQuestion', 'CompactContext']) {
      expect(await handler({ toolName, input: {} }, at())).toBeUndefined()
    }
  })
  it('只读时不放 Prime 里不存在的名字，也不放非 research 服务的同名工具', async () => {
    const handler = install(() => paused)
    for (const toolName of ['Read', 'read', 'grep', 'glob', 'find', 'ls', 'research_state', 'mcp__other__research_state']) {
      expect(await handler({ toolName, input: {} }, at())).toMatchObject({ block: true })
    }
  })
  it('rlmDepth ≥ 1 的子会话不受影响', async () => {
    const handler = install(() => paused)
    expect(await handler({ toolName: 'ipython', input: {} }, at(1))).toBeUndefined()
  })
  it('闸门打开时什么都不拦（未接线 = getGate 永远返回打开 → 无操作）', async () => {
    const handler = install(() => open)
    expect(await handler({ toolName: 'bash', input: { command: 'ls' } }, at())).toBeUndefined()
  })
})

describe('研究暂停扩展：F-a 分叉（forks=wait）', () => {
  // ONE:67 形状：只凭 P2 的 1 次测量否定 H5
  const one67 = { run: 'r', id: 'H5', to: 'REFUTED', byProbe: 'P2', note: 'P2 观测 13.0 落入冻结带' }
  const candidate = (input: Record<string, unknown>): ForkCandidate | null =>
    input.to === 'REFUTED' ? { hid: String(input.id), pid: String(input.byProbe), reps: 1 } : null

  it('wait 时拦第一次，reason 指示单独调用 AskUserQuestion；同一假设第二次放行', async () => {
    const handler = install(() => ({ ...open, forks: 'wait' }), candidate)
    const first = await handler({ toolName: 'mcp__research__claim_transition', input: one67 }, at()) as { block: boolean; reason: string }
    expect(first.block).toBe(true)
    expect(first.reason).toContain('研究分叉 F-a')
    expect(first.reason).toContain('只凭 P2 的 1 次测量否定 H5')
    expect(first.reason).toContain('AskUserQuestion')
    expect(await handler({ toolName: 'mcp__research__claim_transition', input: one67 }, at())).toBeUndefined()
  })
  it('每个 run 最多问 2 次', async () => {
    const handler = install(() => ({ ...open, forks: 'wait' }), candidate)
    for (const id of ['H1', 'H2']) {
      expect(await handler({ toolName: 'claim_transition', input: { ...one67, id } }, at())).toMatchObject({ block: true })
    }
    expect(await handler({ toolName: 'claim_transition', input: { ...one67, id: 'H3' } }, at())).toBeUndefined()
  })
  it('auto 模式、没有判定函数、或非 REFUTED 都放行', async () => {
    expect(await install(() => open, candidate)({ toolName: 'claim_transition', input: one67 }, at())).toBeUndefined()
    expect(await install(() => ({ ...open, forks: 'wait' }))({ toolName: 'claim_transition', input: one67 }, at())).toBeUndefined()
    expect(await install(() => ({ ...open, forks: 'wait' }), candidate)({ toolName: 'claim_transition', input: { ...one67, to: 'SUPPORTED' } }, at())).toBeUndefined()
  })
})
