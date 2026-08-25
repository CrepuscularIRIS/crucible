import type { AgentStreamEvent } from '@proma/shared'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** IPC / WebSocket 是运行时边界；不能让类型声明之外的空 sessionId 污染 Jotai family。 */
export function isValidAgentStreamEvent(value: unknown): value is AgentStreamEvent {
  if (!isRecord(value)) return false
  return typeof value.sessionId === 'string'
    && value.sessionId.trim().length > 0
    && isRecord(value.payload)
    && typeof value.payload.kind === 'string'
}
