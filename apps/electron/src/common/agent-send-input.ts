import type { AgentSendInput, PromaPermissionMode } from '@proma/shared'

const PERMISSION_MODES = new Set<PromaPermissionMode>([
  'bypassPermissions',
  'plan',
])
const TRIGGER_SOURCES = new Set<NonNullable<AgentSendInput['triggeredBy']>>([
  'user',
  'automation',
  'delegation',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireString(record: Record<string, unknown>, key: string, allowEmpty = false): string {
  const value = record[key]
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new Error(`Agent 发送参数无效：${key} 必须是${allowEmpty ? '' : '非空'}字符串`)
  }
  return value
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`Agent 发送参数无效：${key} 必须是字符串`)
  return value
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Agent 发送参数无效：${key} 必须是字符串数组`)
  }
  return value
}

/**
 * 将 SEND_MESSAGE IPC 的新对象协议和早期评测脚本使用的位置参数协议统一为一个对象。
 * 主进程仍会调用此函数，因此绕过 preload 直连 web-bridge 也不能注入空会话 ID。
 */
export function parseAgentSendIpcArguments(rawArgs: readonly unknown[]): AgentSendInput {
  const [first, legacyUserMessage, legacyChannelId, legacyModelId, legacyWorkspaceId] = rawArgs
  const candidate: unknown = typeof first === 'string'
    ? {
        sessionId: first,
        userMessage: legacyUserMessage,
        channelId: legacyChannelId,
        ...(legacyModelId !== undefined ? { modelId: legacyModelId } : {}),
        ...(legacyWorkspaceId !== undefined ? { workspaceId: legacyWorkspaceId } : {}),
      }
    : first

  if (!isRecord(candidate)) {
    throw new Error('Agent 发送参数无效：请传入 AgentSendInput 对象')
  }

  const sessionId = requireString(candidate, 'sessionId')
  const userMessage = requireString(candidate, 'userMessage', true)
  const channelId = requireString(candidate, 'channelId')
  const permissionModeOverride = optionalString(candidate, 'permissionModeOverride')
  if (permissionModeOverride !== undefined && !PERMISSION_MODES.has(permissionModeOverride as PromaPermissionMode)) {
    throw new Error('Agent 发送参数无效：permissionModeOverride 不受支持')
  }
  const triggeredBy = optionalString(candidate, 'triggeredBy')
  if (triggeredBy !== undefined && !TRIGGER_SOURCES.has(triggeredBy as NonNullable<AgentSendInput['triggeredBy']>)) {
    throw new Error('Agent 发送参数无效：triggeredBy 不受支持')
  }
  const startedAt = candidate.startedAt
  if (startedAt !== undefined && (typeof startedAt !== 'number' || !Number.isFinite(startedAt))) {
    throw new Error('Agent 发送参数无效：startedAt 必须是有限数字')
  }
  const rawUserMessage = optionalString(candidate, 'rawUserMessage')
  const userMessageUuid = optionalString(candidate, 'userMessageUuid')
  const modelId = optionalString(candidate, 'modelId')
  const workspaceId = optionalString(candidate, 'workspaceId')
  const additionalDirectories = optionalStringArray(candidate, 'additionalDirectories')
  const mentionedSkills = optionalStringArray(candidate, 'mentionedSkills')
  const mentionedMcpServers = optionalStringArray(candidate, 'mentionedMcpServers')
  const mentionedSessionIds = optionalStringArray(candidate, 'mentionedSessionIds')
  const mentionedTodoIds = optionalStringArray(candidate, 'mentionedTodoIds')
  const mentionedCalendarEventIds = optionalStringArray(candidate, 'mentionedCalendarEventIds')
  const retryOfErrorUuid = optionalString(candidate, 'retryOfErrorUuid')
  const automationContext = optionalString(candidate, 'automationContext')

  return {
    sessionId,
    userMessage,
    channelId,
    ...(rawUserMessage !== undefined && { rawUserMessage }),
    ...(userMessageUuid !== undefined && { userMessageUuid }),
    ...(modelId !== undefined && { modelId }),
    ...(workspaceId !== undefined && { workspaceId }),
    ...(additionalDirectories !== undefined && { additionalDirectories }),
    ...(permissionModeOverride !== undefined && { permissionModeOverride: permissionModeOverride as PromaPermissionMode }),
    ...(mentionedSkills !== undefined && { mentionedSkills }),
    ...(mentionedMcpServers !== undefined && { mentionedMcpServers }),
    ...(mentionedSessionIds !== undefined && { mentionedSessionIds }),
    ...(mentionedTodoIds !== undefined && { mentionedTodoIds }),
    ...(mentionedCalendarEventIds !== undefined && { mentionedCalendarEventIds }),
    ...(startedAt !== undefined && { startedAt }),
    ...(retryOfErrorUuid !== undefined && { retryOfErrorUuid }),
    ...(triggeredBy !== undefined && { triggeredBy: triggeredBy as NonNullable<AgentSendInput['triggeredBy']> }),
    ...(automationContext !== undefined && { automationContext }),
  }
}
