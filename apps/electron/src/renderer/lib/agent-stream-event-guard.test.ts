import { describe, expect, test } from 'bun:test'
import { isValidAgentStreamEvent } from './agent-stream-event-guard'

describe('Agent 流事件边界', () => {
  test('given 合法会话事件 when 校验 then 允许进入状态树', () => {
    expect(isValidAgentStreamEvent({
      sessionId: 'session-1',
      payload: { kind: 'proma_event', event: { type: 'run_started', startedAt: 1 } },
    })).toBe(true)
  })

  test('given undefined 会话或空 payload when 校验 then 拒绝状态污染', () => {
    expect(isValidAgentStreamEvent({ sessionId: undefined, payload: { kind: 'proma_event' } })).toBe(false)
    expect(isValidAgentStreamEvent({ sessionId: '', payload: { kind: 'proma_event' } })).toBe(false)
    expect(isValidAgentStreamEvent({ sessionId: 'session-1', payload: undefined })).toBe(false)
  })
})
