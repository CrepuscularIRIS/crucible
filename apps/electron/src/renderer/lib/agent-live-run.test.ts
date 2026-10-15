import { describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import type { AgentLiveRunSnapshot, SDKMessage } from '@proma/shared'
import { agentSessionStreamingStateAtomFamily, liveMessagesMapAtom } from '@/atoms/agent-atoms'
import { attachLiveRun } from './agent-live-run'

const msg = (uuid: string, type = 'assistant'): SDKMessage => ({ type, uuid } as unknown as SDKMessage)
const run: AgentLiveRunSnapshot = { startedAt: 100, messages: [msg('a1'), msg('u1', 'user')] }
const marker = (m: SDKMessage) => (m as unknown as { _promaLiveRunStartedAt?: number })._promaLiveRunStartedAt

describe('页面在 run 中途打开：用主进程的本轮快照接上', () => {
  test('本页没有该会话的流状态 → 恢复 running + startedAt，已产出消息进 liveMessages 并带本轮标记', () => {
    const store = createStore()
    attachLiveRun(store, 's1', run)
    expect(store.get(agentSessionStreamingStateAtomFamily('s1'))).toMatchObject({ running: true, startedAt: 100 })
    const live = store.get(liveMessagesMapAtom).get('s1') ?? []
    expect(live.map((m) => (m as { uuid?: string }).uuid)).toEqual(['a1', 'u1'])
    expect(live.every((m) => marker(m) === 100)).toBe(true)
  })

  test('快照前已到达的推送（无 startedAt）排在快照之后、按 uuid 去重并补标记', () => {
    const store = createStore()
    store.set(agentSessionStreamingStateAtomFamily('s1'), { running: true, startedAt: undefined })
    store.set(liveMessagesMapAtom, new Map([['s1', [msg('u1', 'user'), msg('a2')]]]))
    attachLiveRun(store, 's1', run)
    expect(store.get(agentSessionStreamingStateAtomFamily('s1'))).toMatchObject({ running: true, startedAt: 100 })
    const live = store.get(liveMessagesMapAtom).get('s1') ?? []
    expect(live.map((m) => (m as { uuid?: string }).uuid)).toEqual(['a1', 'u1', 'a2'])
    expect(live.every((m) => marker(m) === 100)).toBe(true)
  })

  test('无流状态但已收到本轮 Delta 预览（带同一 runStartedAt）→ 保留预览，丢弃旧轮残留', () => {
    const store = createStore()
    const preview = { type: 'assistant', uuid: 'p1', _promaLiveRunStartedAt: 100 } as unknown as SDKMessage
    const stale = { type: 'assistant', uuid: 'old', _promaLiveRunStartedAt: 50 } as unknown as SDKMessage
    store.set(liveMessagesMapAtom, new Map([['s1', [stale, preview]]]))
    attachLiveRun(store, 's1', run)
    const live = store.get(liveMessagesMapAtom).get('s1') ?? []
    expect(live.map((m) => (m as { uuid?: string }).uuid)).toEqual(['a1', 'u1', 'p1'])
  })

  test('本地是更早一轮的结束态 → 接管为本轮', () => {
    const store = createStore()
    store.set(agentSessionStreamingStateAtomFamily('s1'), { running: false, startedAt: 50 })
    attachLiveRun(store, 's1', run)
    expect(store.get(agentSessionStreamingStateAtomFamily('s1'))).toMatchObject({ running: true, startedAt: 100 })
  })

  test('本页已在跟踪这一轮（自己发起的）→ 不动', () => {
    const store = createStore()
    const state = { running: true, startedAt: 100 }
    const live = new Map([['s1', [msg('x')]]])
    store.set(agentSessionStreamingStateAtomFamily('s1'), state)
    store.set(liveMessagesMapAtom, live)
    attachLiveRun(store, 's1', run)
    expect(store.get(agentSessionStreamingStateAtomFamily('s1'))).toBe(state)
    expect(store.get(liveMessagesMapAtom)).toBe(live)
  })
})
