import { describe, expect, test } from 'bun:test'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { recoverPiEmptyStops } from './pi-empty-stop-recovery'

function emptyStop(label: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'thinking', thinking: label }],
    stopReason: 'stop',
    usage: { output: 0 },
  } as unknown as AssistantMessage
}

describe('recoverPiEmptyStops', () => {
  test('Given 首次空 stop When continue 产出有效终态 Then 只续跑一次且不重投 prompt', async () => {
    let pending: AssistantMessage | undefined = emptyStop('first')
    let continuations = 0
    const removed: AssistantMessage[] = []

    const result = await recoverPiEmptyStops({
      takePending: () => {
        const value = pending
        pending = undefined
        return value
      },
      removeFromActiveHistory: (message) => removed.push(message),
      continueAgent: async () => { continuations += 1 },
      isAborted: () => false,
      wait: async () => undefined,
    })

    expect(result).toBe('recovered')
    expect(continuations).toBe(1)
    expect(removed).toHaveLength(1)
  })

  test('Given 上游连续空 stop When 达到上限 Then 有限停止并返回 exhausted', async () => {
    let pending: AssistantMessage | undefined = emptyStop('initial')
    let continuations = 0

    const result = await recoverPiEmptyStops({
      takePending: () => {
        const value = pending
        pending = undefined
        return value
      },
      removeFromActiveHistory: () => undefined,
      continueAgent: async () => {
        continuations += 1
        pending = emptyStop(`retry-${continuations}`)
      },
      isAborted: () => false,
      wait: async () => undefined,
      maxRetries: 2,
    })

    expect(result).toBe('exhausted')
    expect(continuations).toBe(2)
  })

  test('Given 退避期间用户停止 When 尚未 continue Then 返回 aborted', async () => {
    let pending: AssistantMessage | undefined = emptyStop('initial')
    let aborted = false
    let continuations = 0

    const result = await recoverPiEmptyStops({
      takePending: () => {
        const value = pending
        pending = undefined
        return value
      },
      removeFromActiveHistory: () => undefined,
      continueAgent: async () => { continuations += 1 },
      isAborted: () => aborted,
      wait: async () => { aborted = true },
    })

    expect(result).toBe('aborted')
    expect(continuations).toBe(0)
  })
})
