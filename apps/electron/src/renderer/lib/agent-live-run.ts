import type { useStore } from 'jotai'
import type { AgentLiveRunSnapshot, SDKMessage } from '@proma/shared'
import { agentSessionStreamingStateAtomFamily, liveMessagesMapAtom } from '@/atoms/agent-atoms'
import { createQueuedAgentStreamState } from './agent-message-queue'

type JotaiStore = ReturnType<typeof useStore>

const uuidOf = (message: SDKMessage) => (message as { uuid?: unknown }).uuid

/**
 * 页面在 run 中途打开 / 重载：本页错过了 run_started 与之前的推送，
 * 用主进程内存里的本轮快照恢复运行态与已产出的消息，之后的推送照常追加。
 */
export function attachLiveRun(store: JotaiStore, sessionId: string, run: AgentLiveRunSnapshot): void {
  const current = store.get(agentSessionStreamingStateAtomFamily(sessionId))
  // 本页已在跟踪这一轮（或更新的一轮）：推送已在累积，不覆盖
  if (current?.startedAt != null && current.startedAt >= run.startedAt) return
  const mark = (message: SDKMessage): SDKMessage => ({ ...message, _promaLiveRunStartedAt: run.startedAt } as SDKMessage)
  store.set(agentSessionStreamingStateAtomFamily(sessionId), current?.running
    ? { ...current, startedAt: run.startedAt }
    : createQueuedAgentStreamState(current, run.startedAt))
  store.set(liveMessagesMapAtom, (prev) => {
    // 快照之前已到达的推送（无标记或标记为本轮）接在快照后面；旧轮残留丢弃
    const arrived = (prev.get(sessionId) ?? []).filter((message) => {
      const tag = (message as { _promaLiveRunStartedAt?: number })._promaLiveRunStartedAt
      return tag == null || tag === run.startedAt
    })
    const seen = new Set<unknown>(run.messages.map(uuidOf).filter((uuid) => uuid != null))
    const map = new Map(prev)
    map.set(sessionId, [...run.messages, ...arrived.filter((message) => !seen.has(uuidOf(message)))].map(mark))
    return map
  })
}
