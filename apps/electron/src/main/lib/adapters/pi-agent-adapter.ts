/**
 * Pi Agent SDK 适配器
 *
 * Proma 内部继续使用 SDKMessage 兼容协议，避免渲染层、Jotai 状态、
 * JSONL 持久化和历史会话展示在 SDK 迁移时一起改名。
 */

import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { Dispatcher } from 'undici'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type {
  AgentThinkingLevel,
  AgentProviderAdapter,
  CodexOAuthCredentials,
  XaiOAuthCredentials,
  AgentQueryInput,
  JsonSchemaOutputFormat,
  PromaPermissionMode,
  ProviderType,
  SendQueuedMessageOptions,
  SDKMessage,
  AgentAssistantDelta,
  AgentToolCallDelta,
  SDKUserMessageInput,
  SkillActivation,
} from '@proma/shared'
import {
  calculatePiAutoCompactionReserveTokens,
  inferReasoningTransport,
  isCodexFastModeSupportedModel,
  resolveReasoningProfile,
  createSkillActivationFromPath,
} from '@proma/shared'
import type { CanUseToolOptions, PermissionResult } from '../agent-permission-service'
import { isPromptTooLongError } from '../agent-error-utils'

import type {
  AgentSession,
  AgentSessionEvent,
  ResourceLoader,
  Skill,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent'
import type { Transport as PiAgentTransport } from '@earendil-works/pi-ai'
import type { AssistantMessageEvent } from '@earendil-works/pi-ai'
import type { AgentToolResult, AgentToolUpdateCallback } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { Type, type TSchema } from 'typebox'
import {
  appendOutputFormatInstruction,
  createAgentRuntimeGuard,
  type AgentRuntimeGuard,
} from '../agent-runtime-guards'
import {
  createPromaManagedResourceLoaderOptions,
  createPromaProjectInstructionFilesOverride,
  type PromaProjectInstructionFile,
} from './pi-resource-loader-overrides'
import { ProjectInstructionScopeController } from './pi-project-instruction-scope'
import type { ProjectInstructionSource } from '../project-instruction-resolver'
import { createCodexFastModeExtension, withCodexFastModeServiceTier } from './pi-codex-request-settings'
import { createDeepSeekReasoningRequestExtension } from './pi-deepseek-reasoning-request-settings'
import { createOpenAIReasoningRequestExtension } from './pi-openai-reasoning-request-settings'
import { createResearchIsolationExtension } from './pi-research-isolation-extension'
import {
  createResearchRefineRuntime,
  installResearchRefineToolTap,
  researchRefineArtifactDir,
  type ResearchRefineRuntime,
} from './pi-research-refine-runtime'
import type { ResearchRefineMode } from './pi-research-refine-types'
import type { ResearchIsolationConfig } from '../research-isolation-guard'
import { mergeRuntimeEnv, type AgentRuntimeEnv } from '../agent-runtime-env'
import { sanitizePiMessageImageContent, sanitizeToolResultImageContent } from '../image-content-validation'
import {
  convertPiMessage,
  convertResultMessage,
  displayToolName,
  dropTrailingAbortedAssistant,
  hasToolResult,
  isAbortedAssistantMessage,
  isAssistantPiMessage,
  normalizePermissionInput,
  restorePiInput,
} from './pi-message-adapter'
import { DEFAULT_CONTEXT_WINDOW, buildModel } from './pi-model-registry'
import { computeResidencyKey, ResidentSessionRegistry } from './pi-session-residency'
import {
  createRlmSessionActivationOptions,
  detectIpythonKernelSupply,
  installSessionIpythonPermission,
} from './pi-ipython-rlm'
import { mergePromaManagedSkillPaths, resolvePrimeNativeSkillPaths } from './pi-managed-skills'
import { summarizePrimeRefineArtifacts } from './pi-refine-state'
import type { AgentRefineEntrySummary, AgentRefineNowResult, AgentRefineState } from '@proma/shared'
import { PendingPromptSkillActivationTracker } from './pi-skill-activation-tracker'
import { createPiRetryTerminalGate, mapPiNativeRetryEvent } from './pi-retry-control'
import {
  closePiRequestProxyDispatcher,
  createPiRequestProxyDispatcher,
  installPiRequestProxyFetch,
  runWithPiRequestProxy,
} from './pi-request-proxy'

type PiSdk = typeof import('@earendil-works/pi-coding-agent')

/** 每 query 可变槽位：常驻会话上的一次性 hooks 经它读取当前轮的守卫/代理/权限。 */
export interface PiResidentHookSlots {
  runtimeGuard?: AgentRuntimeGuard
  requestDispatcher?: Dispatcher
  compactionRequestRef?: { value: boolean }
  canUseTool?: PiAgentQueryOptions['canUseTool']
}

/** 常驻会话：同一会话跨 query 复用 AgentSession（Track B #1），空闲超时后释放。 */
export interface PiResidentSession {
  key: string
  session: AgentSession
  sessionManager: ReturnType<PiSdk['SessionManager']['open']>
  resourceLoader: ResourceLoader
  model: Awaited<ReturnType<typeof buildModel>>['model']
  hooks: PiResidentHookSlots
  /** Prime 写经验教训的 harness 目录（session-artifacts/<id>/harness） */
  harnessDir: string
  /** 会话内生效的 auto-refine 设置（只读摘要，供 UI 显示） */
  autoRefine: { enabled: boolean; turnInterval: number }
  /** research refine 循环（learning 臂）；off/frozen 时为 undefined。 */
  researchRefineRuntime?: ResearchRefineRuntime
  /** research refine 实验臂；refineNow 按 臂 放行/拒绝。 */
  researchRefineMode?: ResearchRefineMode
  dispose(): Promise<void>
}

/** 空闲多久后释放常驻会话；auto-refine 的轮数计数在驻留期间持续累计。 */
const PI_RESIDENT_SESSION_IDLE_MS = 10 * 60_000

/** 从 SettingsManager 安全读取 auto-refine 摘要（未配置时用 Prime 默认值）。 */
function readAutoRefineSettings(
  settingsManager: { getSettings?: () => unknown },
): { enabled: boolean; turnInterval: number } {
  try {
    const raw = (settingsManager as { getSettings?: () => { autoRefine?: { enabled?: boolean; turnInterval?: number } } })
      .getSettings?.()?.autoRefine
    return {
      enabled: raw?.enabled ?? true,
      turnInterval: raw?.turnInterval ?? 25,
    }
  } catch {
    return { enabled: true, turnInterval: 25 }
  }
}

/**
 * Research 会话的 auto-refine 配置（RESEARCH-REFINE-PLAN §4）。
 *
 * `learning`：启用 native auto-refine 并安装确定性 reviewer（C2），
 * native 默认 turn interval 作采样时钟；`off`/`frozen` 关闭自动触发，
 * 且 research 会话的 `refineNow` 在这两个臂被拒绝（手动 refine 会污染实验臂，
 * 见 refineNow）。learning 臂的 refineNow 仍可用：过 C3 lint，但不归因、
 * 不入 PENDING（untracked，见 handleRefineComplete）。
 * 非 research 会话不覆盖（undefined = 沿用 SettingsManager 默认）。
 */
export function resolvePiAutoRefineOverride(
  mode: ResearchRefineMode | undefined,
): { enabled: boolean } | undefined {
  if (!mode) return undefined
  return { enabled: mode === 'learning' }
}
type BashOperations = import('@earendil-works/pi-coding-agent').BashOperations
type BashToolOptions = import('@earendil-works/pi-coding-agent').BashToolOptions
type SkillLoadResult = ReturnType<ResourceLoader['getSkills']>

const PI_NATIVE_MAX_RETRIES = 8
const PI_NATIVE_RETRY_BASE_DELAY_MS = 1_000
const MAX_AUTOMATIC_COMPACTION_CONTINUATIONS = 20

export function shouldMarkCompactionAfterCompletedTurn(
  terminalResult: SDKMessage | undefined,
  requiresOriginalTaskContinuation: boolean,
): boolean {
  return terminalResult?.type === 'result'
    && terminalResult.subtype === 'success'
    && !requiresOriginalTaskContinuation
}

/** Pi SDK 查询选项（扩展通用 AgentQueryInput） */
export interface PiAgentQueryOptions extends AgentQueryInput {
  apiKey: string
  baseUrl?: string
  provider: ProviderType
  /** OAuth credential coordination key; equals the selected Proma channel id. */
  channelId?: string
  channelName?: string
  maxTurns?: number
  permissionMode: PromaPermissionMode
  canUseTool?: (
    toolName: string,
    input: Record<string, unknown>,
    options: CanUseToolOptions,
  ) => Promise<PermissionResult>
  systemPrompt: string
  /** Proma 已验证的项目根 instruction files；不触发 Pi 的磁盘自动发现。 */
  projectInstructionFiles?: PromaProjectInstructionFile[]
  /** 用于 typed 文件工具的会话级子目录指令激活；不会解析 Bash。 */
  projectInstructionScope?: {
    projectRoot: string
    initialSources: ProjectInstructionSource[]
  }
  resumeSessionId?: string
  piAgentDir: string
  piSessionDir: string
  customTools?: ToolDefinition[]
  onSessionId?: (sdkSessionId: string, sessionFile?: string) => void
  /** Pi final assistant UI UUID → 持久树状 session entry ID。 */
  onPiEntryBindings?: (bindings: Record<string, string>) => void
  onModelResolved?: (model: string) => void
  onContextWindow?: (contextWindow: number) => void
  onRetry?: (update: import('./pi-retry-control').PiRetryUpdate) => void
  /** 渲染进程创建的本轮流式开始时间，用于隔离迟到的 native retry 事件。 */
  retryRunStartedAt?: number
  thinkingLevel?: AgentThinkingLevel
  maxBudgetUsd?: number
  outputFormat?: JsonSchemaOutputFormat
  /** Proma 聚合的附加目录；Pi 内置工具 factory 不接收多 root 参数，编排层会把它们注入 systemPrompt。 */
  additionalDirectories?: string[]
  additionalSkillPaths?: string[]
  /** 当前用户输入显式引用的 Skill name（兼容历史 slug 已在编排层归一化） */
  skillMentions?: string[]
  /** Persisted user-message UUID for turn-scoped Skill attribution. */
  initialUserMessageUuid?: string
  /** Workspace that owns `additionalSkillPaths`, used for relocatable Skill previews. */
  skillWorkspaceSlug?: string
  /** Skill 成功加载并注入 prompt 后回调。 */
  onSkillActivated?: (activations: SkillActivation[], userMessageUuid: string) => void
  proxyUrl?: string
  /** Pi 模型请求传输策略：auto / sse / websocket / websocket-cached */
  transport?: PiAgentTransport
  /** HTTP 头/响应体空闲超时，单位毫秒；0 表示交给 Pi SDK 禁用超时 */
  httpIdleTimeoutMs?: number
  /** WebSocket 建连超时，单位毫秒；0 表示交给 Pi SDK 禁用超时 */
  websocketConnectTimeoutMs?: number
  runtimeEnv?: AgentRuntimeEnv
  /** workspace research MCP 显式启用的工具执行隔离边界。 */
  researchIsolation?: ResearchIsolationConfig
  /** research refine 实验臂（off/frozen/learning）；research 会话缺省 learning。 */
  researchRefine?: { mode: ResearchRefineMode; run?: string }
  /** 手动压缩请求：走 pi 原生 session.compact()，而非把 /compact 当普通 prompt 发给模型 */
  compactRequest?: boolean
  /** ChatGPT Codex Fast Mode；仅 openai-codex 的受支持模型实际注入 priority service tier。 */
  codexFastMode?: boolean
  /** Pi 的 OAuth credential store 使用真实 expires 和 refresh，不读取 ~/.pi。 */
  codexOAuthCredentials?: CodexOAuthCredentials
  /** Pi 运行中刷新 OAuth 后，将新凭据回写到 Proma 渠道存储。 */
  onCodexOAuthCredentialsRefreshed?: (credentials: CodexOAuthCredentials) => void | Promise<void>
  /** xAI OAuth credential store 使用真实 expires 和 refresh，不读取 ~/.pi。 */
  xaiOAuthCredentials?: XaiOAuthCredentials
  /** Pi 运行中刷新 xAI OAuth 后，将新凭据回写到 Proma 渠道存储。 */
  onXaiOAuthCredentialsRefreshed?: (credentials: XaiOAuthCredentials) => void | Promise<void>
  /** 会话级 OpenAI（Codex OAuth / Responses API）思考深度。 */
  openAIThinkingLevel?: AgentThinkingLevel
}

interface ActivePiSession {
  session?: AgentSession
  resourceLoader?: ResourceLoader
  ready: Promise<AgentSession>
  resolveReady: (session: AgentSession) => void
  rejectReady: (error: unknown) => void
  finished: Promise<void>
  resolveFinished: () => void
  finishedSettled: boolean
  abortRequested: boolean
  interrupting: boolean
  pendingInterruptPrompts: PendingInterruptPrompt[]
  interruptAbortPromise?: Promise<void>
  readySettled: boolean
  disposed: boolean
  runtimeGuard?: AgentRuntimeGuard
  skillWorkspaceSlug?: string
  pendingSkillActivations: PendingPromptSkillActivationTracker
  onSkillActivated?: (activations: SkillActivation[], userMessageUuid: string) => void
}

interface PendingInterruptPrompt {
  content: string
  skillActivationId?: number
  resolveAccepted: () => void
  rejectAccepted: (error: unknown) => void
}

interface PromaTaskItem {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled' | 'error' | 'deleted'
  description?: string
  activeForm?: string
  blocks?: string[]
}

interface AssistantMessageState {
  uuid?: string
}

/**
 * 同一 assistant 流在 Pi native retry 前后必须复用 UUID：renderer 才能用恢复后的
 * partial/final frame 原地替换断流前的 partial，而不是把两段回答并排追加。
 */
export function createPiAssistantUuidTracker(createUuid: () => string = randomUUID): {
  get: () => string
  reset: () => void
} {
  let state: AssistantMessageState = {}

  return {
    get: () => {
      if (!state.uuid) state = { uuid: createUuid() }
      if (!state.uuid) throw new Error('Pi assistant message uuid 初始化失败')
      return state.uuid
    },
    reset: () => { state = {} },
  }
}

function toolCallDeltaFromPartial(event: Extract<AssistantMessageEvent, { type: 'toolcall_start' | 'toolcall_delta' }>): AgentToolCallDelta | undefined {
  const block = event.partial.content[event.contentIndex]
  if (!block || block.type !== 'toolCall') return undefined
  return {
    id: block.id,
    name: displayToolName(block.name, block.arguments as Record<string, unknown>),
    ...(event.type === 'toolcall_delta' ? {} : { arguments: {} }),
  }
}

/** Extract only the small structured delta from Pi's cumulative message_update event. */
export function serializePiAssistantDelta(event: AssistantMessageEvent): AgentAssistantDelta | undefined {
  switch (event.type) {
    case 'start': return { type: 'start' }
    case 'text_start': return { type: 'text_start', contentIndex: event.contentIndex }
    case 'text_delta': return { type: 'text_delta', contentIndex: event.contentIndex, delta: event.delta }
    case 'text_end': return { type: 'text_end', contentIndex: event.contentIndex, content: event.content }
    case 'thinking_start': return { type: 'thinking_start', contentIndex: event.contentIndex }
    case 'thinking_delta': return { type: 'thinking_delta', contentIndex: event.contentIndex, delta: event.delta }
    case 'thinking_end': return { type: 'thinking_end', contentIndex: event.contentIndex, content: event.content }
    case 'toolcall_start': {
      const toolCall = toolCallDeltaFromPartial(event)
      return { type: 'toolcall_start', contentIndex: event.contentIndex, ...(toolCall ? { toolCall } : {}) }
    }
    case 'toolcall_delta': {
      const toolCall = toolCallDeltaFromPartial(event)
      return { type: 'toolcall_delta', contentIndex: event.contentIndex, delta: event.delta, ...(toolCall ? { toolCall } : {}) }
    }
    case 'toolcall_end':
      return {
        type: 'toolcall_end',
        contentIndex: event.contentIndex,
        toolCall: {
          id: event.toolCall.id,
          name: displayToolName(event.toolCall.name, event.toolCall.arguments as Record<string, unknown>),
          arguments: event.toolCall.arguments as Record<string, unknown>,
        },
      }
    default:
      return undefined
  }
}

export interface PiRemoteConnectionSettings {
  httpProxy?: string
  transport?: PiAgentTransport
  httpIdleTimeoutMs?: number
  websocketConnectTimeoutMs?: number
}

interface AsyncQueue<T> {
  push: (value: T) => void
  fail: (error: unknown) => void
  close: () => void
  next: () => Promise<IteratorResult<T>>
}

function getCaseInsensitiveRuntimeEnvValue(env: Record<string, string> | undefined, key: string): string | undefined {
  if (!env) return undefined
  const exact = env[key]
  if (exact) return exact
  const foundKey = Object.keys(env).find((name) => name.toLowerCase() === key.toLowerCase())
  const value = foundKey ? env[foundKey] : undefined
  return value || undefined
}

function normalizeProxyUrl(proxyUrl: string | undefined): string | undefined {
  const trimmed = proxyUrl?.trim()
  return trimmed ? trimmed : undefined
}

function resolvePiHttpProxy(input: Pick<PiAgentQueryOptions, 'proxyUrl' | 'runtimeEnv'>): string | undefined {
  return normalizeProxyUrl(input.proxyUrl)
    ?? normalizeProxyUrl(getCaseInsensitiveRuntimeEnvValue(input.runtimeEnv?.env, 'HTTPS_PROXY'))
    ?? normalizeProxyUrl(getCaseInsensitiveRuntimeEnvValue(input.runtimeEnv?.env, 'HTTP_PROXY'))
    ?? normalizeProxyUrl(getCaseInsensitiveRuntimeEnvValue(input.runtimeEnv?.env, 'ALL_PROXY'))
}

function isNonNegativeFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0
}

export function buildPiRemoteConnectionSettings(
  input: Pick<
    PiAgentQueryOptions,
    'provider' | 'proxyUrl' | 'runtimeEnv' | 'transport' | 'httpIdleTimeoutMs' | 'websocketConnectTimeoutMs'
  >,
): PiRemoteConnectionSettings {
  const httpProxy = resolvePiHttpProxy(input)
  // Node/Electron 的 WebSocket 不支持请求级 HTTP 代理注入；有代理的 Codex
  // 默认改走可由 undici dispatcher 承载的 SSE。用户显式选择 transport 时保留其意图。
  const transport = input.transport ?? (httpProxy && input.provider === 'openai-codex' ? 'sse' : undefined)
  return {
    ...(httpProxy ? { httpProxy } : {}),
    ...(transport ? { transport } : {}),
    ...(isNonNegativeFiniteNumber(input.httpIdleTimeoutMs) ? { httpIdleTimeoutMs: input.httpIdleTimeoutMs } : {}),
    ...(isNonNegativeFiniteNumber(input.websocketConnectTimeoutMs)
      ? { websocketConnectTimeoutMs: input.websocketConnectTimeoutMs }
      : {}),
  }
}

function createAsyncQueue<T>(): AsyncQueue<T> {
  const values: T[] = []
  const waiters: Array<(result: IteratorResult<T>) => void> = []
  let closed = false
  let failure: unknown

  const flush = (): void => {
    while (waiters.length > 0 && (values.length > 0 || closed || failure)) {
      const waiter = waiters.shift()!
      if (values.length > 0) {
        waiter({ value: values.shift()!, done: false })
      } else if (failure) {
        const err = failure
        failure = undefined
        Promise.resolve().then(() => { throw err }).catch(() => {})
        waiter(Promise.reject(err) as unknown as IteratorResult<T>)
      } else {
        waiter({ value: undefined, done: true })
      }
    }
  }

  return {
    push(value) {
      if (closed) return
      values.push(value)
      flush()
    },
    fail(error) {
      if (closed) return
      failure = error
      closed = true
      flush()
    },
    close() {
      closed = true
      flush()
    },
    next() {
      if (values.length > 0) {
        return Promise.resolve({ value: values.shift()!, done: false })
      }
      if (failure) {
        const err = failure
        failure = undefined
        return Promise.reject(err)
      }
      if (closed) {
        return Promise.resolve({ value: undefined, done: true })
      }
      return new Promise<IteratorResult<T>>((resolve) => waiters.push(resolve))
    },
  }
}

const SESSION_READY_TIMEOUT_MS = 60_000
const SKILL_COMMAND_PATTERN = /\/skill:([A-Za-z0-9][A-Za-z0-9._-]*)/g

function createActivePiSession(): ActivePiSession {
  let resolveReady!: (session: AgentSession) => void
  let rejectReady!: (error: unknown) => void
  const ready = new Promise<AgentSession>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  let resolveFinished!: () => void
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve })
  ready.catch(() => {})
  return {
    ready,
    resolveReady,
    rejectReady,
    finished,
    resolveFinished,
    finishedSettled: false,
    abortRequested: false,
    interrupting: false,
    pendingInterruptPrompts: [],
    pendingSkillActivations: new PendingPromptSkillActivationTracker(),
    readySettled: false,
    disposed: false,
  }
}

function finishActiveSession(active: ActivePiSession): void {
  if (active.finishedSettled) return
  active.finishedSettled = true
  active.resolveFinished()
}

function resolveActiveReady(active: ActivePiSession, session: AgentSession): void {
  if (active.readySettled) return
  active.readySettled = true
  active.resolveReady(session)
}

function rejectActiveReady(active: ActivePiSession, error: unknown): void {
  if (active.readySettled) return
  active.readySettled = true
  active.rejectReady(error)
}

function createAbortError(): Error {
  const error = new Error('Agent 执行已停止')
  error.name = 'AbortError'
  return error
}

function rejectPendingInterruptPrompts(active: ActivePiSession, error: unknown): void {
  const pending = active.pendingInterruptPrompts.splice(0)
  for (const prompt of pending) {
    active.pendingSkillActivations.discard(prompt.skillActivationId)
    prompt.rejectAccepted(error)
  }
}

async function waitForActiveSession(active: ActivePiSession): Promise<AgentSession> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      active.ready,
      new Promise<AgentSession>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Agent 会话初始化超时，请稍后重试')), SESSION_READY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function findSessionFile(sessionDir: string, sdkSessionId: string): string | undefined {
  if (!existsSync(sessionDir)) return undefined
  for (const entry of readdirSync(sessionDir)) {
    if (entry.endsWith('.jsonl') && entry.includes(sdkSessionId)) {
      return join(sessionDir, entry)
    }
  }
  return undefined
}

function isPathWithinRoot(path: string, root: string): boolean {
  if (path === root) return true
  const rel = relative(root, path)
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

function buildAllowedSkillRoots(additionalSkillPaths: string[] | undefined): string[] {
  return (additionalSkillPaths ?? [])
    .map((path) => resolveGuardedRealPath(path))
    .filter((path, index, arr) => arr.indexOf(path) === index)
}

function isPromaSkillPath(path: string | undefined, allowedRoots: string[]): boolean {
  if (!path || allowedRoots.length === 0) return false
  const guardedPath = resolveGuardedRealPath(path)
  return allowedRoots.some((root) => isPathWithinRoot(guardedPath, root))
}

function createPromaSkillsOverride(additionalSkillPaths: string[] | undefined): (base: SkillLoadResult) => SkillLoadResult {
  const allowedRoots = buildAllowedSkillRoots(additionalSkillPaths)
  return (base) => ({
    skills: base.skills.filter((skill) =>
      isPromaSkillPath(skill.filePath, allowedRoots) || isPromaSkillPath(skill.baseDir, allowedRoots)),
    diagnostics: base.diagnostics.filter((diagnostic) => isPromaSkillPath(diagnostic.path, allowedRoots)),
  })
}

function stripSkillFrontmatter(content: string): string {
  const normalized = content.replace(/^\uFEFF/, '')
  const frontmatter = normalized.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/)
  return frontmatter ? normalized.slice(frontmatter[0].length) : content
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function skillCommandAliases(skill: Skill): string[] {
  const aliases = [skill.name, basename(skill.baseDir), basename(dirname(skill.filePath))]
  return aliases.filter((alias, index, arr) => Boolean(alias) && arr.indexOf(alias) === index)
}

function extractSkillCommandNames(prompt: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const match of prompt.matchAll(SKILL_COMMAND_PATTERN)) {
    const name = match[1]?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

function buildSkillLookup(skills: Skill[]): Map<string, Skill> {
  const lookup = new Map<string, Skill>()
  for (const skill of skills) {
    for (const alias of skillCommandAliases(skill)) {
      if (!lookup.has(alias)) lookup.set(alias, skill)
    }
  }
  return lookup
}

function formatSkillForPrompt(skill: Skill): string | undefined {
  try {
    const body = stripSkillFrontmatter(readFileSync(skill.filePath, 'utf-8')).trim()
    return `<skill name="${escapeXmlAttribute(skill.name)}" location="${escapeXmlAttribute(skill.filePath)}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`
  } catch (error) {
    console.warn(`[Pi SDK] Skill 展开失败: ${skill.filePath}`, error)
    return undefined
  }
}

interface PreparedPromptWithSkills {
  content: string
  activations: SkillActivation[]
}

async function preparePromptWithPromaSkills(
  resourceLoader: ResourceLoader,
  prompt: string,
  explicitSkillNames?: string[],
  workspaceSlug?: string,
): Promise<PreparedPromptWithSkills> {
  await resourceLoader.reload()

  const requestedNames = explicitSkillNames?.length ? explicitSkillNames : extractSkillCommandNames(prompt)
  if (requestedNames.length === 0) return { content: prompt, activations: [] }

  const skillLookup = buildSkillLookup(resourceLoader.getSkills().skills)
  const blocks: string[] = []
  const activations: SkillActivation[] = []
  const injectedSkillNames = new Set<string>()

  for (const requestedName of requestedNames) {
    const skill = skillLookup.get(requestedName)
    if (!skill || injectedSkillNames.has(skill.name)) continue
    const block = formatSkillForPrompt(skill)
    if (!block) continue
    injectedSkillNames.add(skill.name)
    const activation = createSkillActivationFromPath(
      skill.filePath,
      'explicit',
      skill.name,
      workspaceSlug,
    )
    if (activation) activations.push(activation)
    blocks.push(block)
  }

  if (blocks.length === 0) return { content: prompt, activations: [] }
  return {
    content: `${blocks.join('\n\n')}\n\n${prompt}`,
    activations,
  }
}

function getPiUserMessageText(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined
  const userMessage = message as { role?: unknown; content?: unknown }
  if (userMessage.role !== 'user' || !Array.isArray(userMessage.content)) return undefined
  const text = userMessage.content
    .filter((block): block is { type: 'text'; text: string } => (
      Boolean(block)
      && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ))
    .map((block) => block.text)
    .join('')
  return text || undefined
}

function registerPromptSkillActivations(
  active: ActivePiSession,
  prompt: string,
  userMessageUuid: string | undefined,
  activations: SkillActivation[],
): number | undefined {
  if (!userMessageUuid) return undefined
  return active.pendingSkillActivations.register(prompt, userMessageUuid, activations)
}

function realpathIfExists(path: string): string | undefined {
  try {
    return realpathSync.native(path)
  } catch {
    return undefined
  }
}

function findNearestExistingPath(path: string): string | undefined {
  let current = path
  while (true) {
    try {
      lstatSync(current)
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return undefined
      current = parent
    }
  }
}

function resolveGuardedRealPath(path: string): string {
  const resolved = resolve(path)
  const exact = realpathIfExists(resolved)
  if (exact) return exact

  const nearestExisting = findNearestExistingPath(resolved)
  if (!nearestExisting) return resolved

  const nearestReal = realpathIfExists(nearestExisting)
  if (!nearestReal) return resolved

  const tail = relative(nearestExisting, resolved)
  return tail ? resolve(nearestReal, tail) : nearestReal
}

interface ToolWrapOptions {
  canUseTool?: PiAgentQueryOptions['canUseTool']
}

export function wrapToolWithPermission<TParams extends TSchema, TDetails, TState>(
  definition: ToolDefinition<TParams, TDetails, TState>,
  options: ToolWrapOptions,
): ToolDefinition<TParams, TDetails, TState> {
  const canUseTool = options.canUseTool
  const executionMode = 'sequential' as const
  if (!canUseTool) return { ...definition, executionMode }
  return {
    ...definition,
    executionMode,
    async execute(toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<TDetails>> {
      const rawInput = params as Record<string, unknown>
      let updatedParams = rawInput
      if (canUseTool) {
        const permission = await canUseTool(displayToolName(definition.name, rawInput), normalizePermissionInput(definition.name, rawInput), {
          signal: signal ?? new AbortController().signal,
          toolUseID: toolCallId,
          displayName: definition.label,
          description: definition.description,
        })
        if (permission.behavior === 'deny') {
          throw new Error(permission.message)
        }
        updatedParams = restorePiInput(definition.name, rawInput, permission.updatedInput)
      }
      return definition.execute(
        toolCallId,
        updatedParams as typeof params,
        signal,
        onUpdate as AgentToolUpdateCallback<TDetails> | undefined,
        ctx,
      ) as Promise<AgentToolResult<TDetails>>
    },
  }
}

function createJsonToolResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    details: payload,
  } as AgentToolResult<unknown>
}

function createTextToolResult(text: string, details?: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text }],
    details,
  } as AgentToolResult<unknown>
}

function createTerminatingJsonToolResult(payload: unknown): AgentToolResult<unknown> {
  return {
    ...createJsonToolResult(payload),
    // Compaction must run only after the active Pi agent loop has settled. Continuing
    // this turn would otherwise race with session.compact(), which aborts that loop.
    terminate: true,
  } as AgentToolResult<unknown>
}

export const PI_COMPACTION_CONTINUATION_PROMPT = `<proma_compaction_continuation>
当前会话上下文已经安全压缩。请依据压缩摘要、保留的最近上下文和已持久化的交接状态，继续完成原始用户任务。

- 不要重复已经完成或已提交的操作；先核验当前状态。
- 若仍有工作，立即执行下一项具体行动。
- 只有原始需求全部完成时才给出最终答复；若确实受阻，明确说明阻塞原因。
</proma_compaction_continuation>`

export function planPiCompactionContinuation(options: {
  continuationCount: number
  abortRequested: boolean
  runtimeLimitReached: boolean
}):
  | { shouldContinue: true; prompt: string }
  | { shouldContinue: false; reason: 'aborted' | 'runtime_limit' | 'continuation_limit' } {
  if (options.abortRequested) return { shouldContinue: false, reason: 'aborted' }
  if (options.runtimeLimitReached) return { shouldContinue: false, reason: 'runtime_limit' }
  if (options.continuationCount >= MAX_AUTOMATIC_COMPACTION_CONTINUATIONS) {
    return { shouldContinue: false, reason: 'continuation_limit' }
  }
  return { shouldContinue: true, prompt: PI_COMPACTION_CONTINUATION_PROMPT }
}

export function canRunCurrentSessionCompaction(toolNames: string[]): boolean {
  return toolNames.length === 1 && toolNames[0] === 'CompactContext'
}

/** AskUserQuestion 必须暂停整个工具批次，不能与后续动作混合执行。 */
export function shouldBlockToolForAskUserQuestion(toolNames: string[], toolName: string): boolean {
  return toolName !== 'AskUserQuestion'
    && toolNames.includes('AskUserQuestion')
    && toolNames.length > 1
}

/**
 * Pi emits `agent_end` before it decides whether an error needs overflow
 * compaction. Keep this one error class local until the matching compaction
 * lifecycle reaches a terminal state, otherwise the outer orchestrator can
 * dispose the session before Pi calls `agent.continue()`.
 */
function isPiContextOverflow(message: AssistantMessage, contextWindow: number | undefined): boolean {
  if (message.stopReason === 'error' && isPromptTooLongError(message.errorMessage)) return true

  if (contextWindow && message.stopReason === 'length' && message.usage?.output === 0) {
    const inputTokens = (message.usage.input ?? 0) + (message.usage.cacheRead ?? 0)
    return inputTokens >= contextWindow * 0.99
  }

  return false
}

export function shouldDeferPiOverflowTerminalMessage(
  message: AssistantMessage,
  contextWindow: number | undefined,
): boolean {
  return message.stopReason !== 'stop' && isPiContextOverflow(message, contextWindow)
}

export function shouldDeferPiOverflowTerminalError(
  message: AssistantMessage | undefined,
  contextWindow: number | undefined,
  willRetry: boolean,
  abortRequested: boolean,
): boolean {
  return !willRetry && !abortRequested && !!message && shouldDeferPiOverflowTerminalMessage(message, contextWindow)
}

function installCurrentSessionCompactionHooks(session: AgentSession): void {
  const previousBeforeToolCall = session.agent.beforeToolCall
  session.agent.beforeToolCall = async (context, signal) => {
    const previousResult = await previousBeforeToolCall?.(context, signal)
    if (previousResult?.block) return previousResult

    const toolNames = context.assistantMessage.content
      .filter((block) => block.type === 'toolCall')
      .map((block) => block.name)
    if (shouldBlockToolForAskUserQuestion(toolNames, context.toolCall.name)) {
      return {
        block: true,
        reason: 'AskUserQuestion 会暂停 Agent，不能与其他工具在同一批次执行。请在收到用户回答后再调用后续工具。',
      }
    }

    if (context.toolCall.name !== 'CompactContext') return previousResult
    if (canRunCurrentSessionCompaction(toolNames)) return previousResult

    // Pi only honors terminate when every tool in a batch is terminating. Rejecting
    // a mixed batch prevents more tool work or another model turn before compaction.
    return {
      block: true,
      reason: 'CompactContext 必须单独调用。请先完成当前工具批次，在下一回合仅调用 CompactContext。',
    }
  }
}

/**
 * Creates a session-scoped compaction control. The callback is closed over by one
 * query invocation, so a model cannot select or compact any other user session.
 */
export function buildCurrentSessionCompactionTool(
  sdk: PiSdk,
  requestCompaction: () => void,
  canUseTool: PiAgentQueryOptions['canUseTool'],
): ToolDefinition {
  const definition = sdk.defineTool({
    name: 'CompactContext',
    label: '压缩当前会话上下文',
    description: 'Compact only the current Pi Agent session after this turn finishes. Before calling, persist a durable handoff or checkpoint to the session workbench or project files as appropriate. Proma will compact the current session, then automatically continue the original task from the compacted context.',
    promptSnippet: 'CompactContext: after persisting a durable handoff/checkpoint, compact the current session context. Proma will automatically continue the original task after compaction.',
    parameters: Type.Object({}),
    async execute() {
      requestCompaction()
      return createTerminatingJsonToolResult({
        status: 'scheduled',
        message: '将在当前 Agent 回合安全结束后压缩当前会话上下文，并自动从已持久化的交接状态继续原始任务。',
      })
    },
  })

  return wrapToolWithPermission(
    definition as unknown as ToolDefinition<TSchema, unknown, unknown>,
    { canUseTool },
  ) as ToolDefinition
}

function isCompactionNoopError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /nothing to compact|already compacted/i.test(message)
}

function createCompactionNoopMessage(sessionId: string, error: unknown): SDKMessage {
  const message = error instanceof Error ? error.message : String(error)
  return {
    type: 'system',
    subtype: 'status',
    session_id: sessionId,
    compact_result: 'noop',
    message: /already compacted/i.test(message)
      ? '当前上下文已经压缩过，无需重复压缩。'
      : '当前上下文较小，暂时无需压缩。',
  } as unknown as SDKMessage
}

export async function compactCurrentSessionAfterTurn(
  session: Pick<AgentSession, 'compact' | 'sessionId'>,
  onNoop: (message: SDKMessage) => void,
): Promise<'compacted' | 'noop'> {
  try {
    await session.compact()
    return 'compacted'
  } catch (error) {
    if (!isCompactionNoopError(error)) throw error
    onNoop(createCompactionNoopMessage(session.sessionId, error))
    return 'noop'
  }
}

function createCompactionContinuationLimitResult(sessionId: string): SDKMessage {
  return {
    type: 'result',
    subtype: 'error_during_execution',
    terminal_reason: 'compaction_continuation_limit',
    errors: [`自动压缩续跑已达上限（${MAX_AUTOMATIC_COMPACTION_CONTINUATIONS} 次），任务未确认完成。请检查当前状态后继续。`],
    session_id: sessionId,
  } as unknown as SDKMessage
}

function stringFromInput(input: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return fallback
}

function normalizeTaskStatus(value: unknown, fallback: PromaTaskItem['status']): PromaTaskItem['status'] {
  if (
    value === 'pending' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'blocked' ||
    value === 'cancelled' ||
    value === 'error' ||
    value === 'deleted'
  ) {
    return value
  }
  return fallback
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.map((item) => String(item).trim()).filter(Boolean)
  return items.length > 0 ? items : undefined
}

function buildPromaProductToolDefinitions(sdk: PiSdk, canUseTool: PiAgentQueryOptions['canUseTool']): ToolDefinition[] {
  const tasks = new Map<string, PromaTaskItem>()
  let nextTaskId = 1

  const definitions = [
    sdk.defineTool({
      name: 'EnterPlanMode',
      label: '进入计划模式',
      description: '进入 Proma 计划模式。进入后只能调研、整理计划，并等待用户批准后再执行写操作。',
      promptSnippet: '进入计划模式，先调研并输出计划，再等待用户确认。',
      parameters: Type.Object({
        reason: Type.Optional(Type.String({ description: '进入计划模式的原因。' })),
      }),
      async execute(_toolCallId, params) {
        return createTextToolResult('已进入计划模式。', { active: true, input: params })
      },
    }),
    sdk.defineTool({
      name: 'ExitPlanMode',
      label: '提交计划审批',
      description: '向用户提交计划并请求批准。用户批准后才能退出计划模式并继续执行。',
      promptSnippet: '提交计划审批，等待用户批准后继续执行。',
      parameters: Type.Object({
        plan: Type.Optional(Type.String({ description: '计划正文或摘要。' })),
        allowedPrompts: Type.Optional(Type.Array(Type.Object({
          tool: Type.String({ description: '批准后可执行的工具，通常为 Bash。' }),
          prompt: Type.String({ description: '批准后可执行的命令或操作描述。' }),
        }))),
      }),
      async execute(_toolCallId, params) {
        return createTextToolResult('计划已获批准，可以继续执行。', { approved: true, input: params })
      },
    }),
    sdk.defineTool({
      name: 'AskUserQuestion',
      label: '询问用户',
      description: '当需要用户选择、补充信息或确认偏好时调用，Proma 会展示可交互问答横幅。',
      promptSnippet: '向用户提出结构化问题并等待回答。',
      parameters: Type.Object({
        questions: Type.Array(Type.Object({
          question: Type.String({ description: '要询问用户的问题。' }),
          header: Type.Optional(Type.String({ description: '简短标题。' })),
          multiSelect: Type.Optional(Type.Boolean({ description: '是否允许多选。' })),
          options: Type.Optional(Type.Array(Type.Object({
            label: Type.String({ description: '选项标签。' }),
            description: Type.Optional(Type.String({ description: '选项说明。' })),
            preview: Type.Optional(Type.String({ description: '可选预览内容。' })),
          }))),
        })),
        answers: Type.Optional(Type.Record(Type.String(), Type.String())),
      }),
      async execute(_toolCallId, params) {
        const input = params as Record<string, unknown>
        return createJsonToolResult({ answers: input.answers ?? {} })
      },
    }),
    sdk.defineTool({
      name: 'TaskCreate',
      label: '创建任务',
      description: '创建一个可见进度任务，用于多步骤或长耗时工作。',
      promptSnippet: '创建一个可见进度任务。',
      parameters: Type.Object({
        subject: Type.String({ description: '任务标题。' }),
        description: Type.Optional(Type.String({ description: '任务说明。' })),
        activeForm: Type.Optional(Type.String({ description: '当前活动形态或阶段。' })),
        blocks: Type.Optional(Type.Array(Type.String({ description: '关联区块 ID。' }))),
      }),
      async execute(_toolCallId, params) {
        const input = params as Record<string, unknown>
        const id = stringFromInput(input, ['id', 'taskId', 'task_id'], String(nextTaskId++))
        const task: PromaTaskItem = {
          id,
          subject: stringFromInput(input, ['subject', 'title', 'name'], `任务 #${id}`),
          status: 'pending',
          description: typeof input.description === 'string' ? input.description : undefined,
          activeForm: typeof input.activeForm === 'string' ? input.activeForm : undefined,
          blocks: normalizeStringArray(input.blocks),
        }
        tasks.set(id, task)
        return createJsonToolResult({ task })
      },
    }),
    sdk.defineTool({
      name: 'TaskUpdate',
      label: '更新任务',
      description: '更新已有可见进度任务的状态、标题或说明。',
      promptSnippet: '更新可见进度任务。',
      parameters: Type.Object({
        taskId: Type.String({ description: '任务 ID。' }),
        status: Type.Optional(Type.Union([
          Type.Literal('pending'),
          Type.Literal('in_progress'),
          Type.Literal('completed'),
          Type.Literal('blocked'),
          Type.Literal('cancelled'),
          Type.Literal('error'),
          Type.Literal('deleted'),
        ])),
        subject: Type.Optional(Type.String({ description: '新的任务标题。' })),
        description: Type.Optional(Type.String({ description: '新的任务说明。' })),
        activeForm: Type.Optional(Type.String({ description: '当前活动形态或阶段。' })),
        blocks: Type.Optional(Type.Array(Type.String({ description: '关联区块 ID。' }))),
      }),
      async execute(_toolCallId, params) {
        const input = params as Record<string, unknown>
        const id = stringFromInput(input, ['taskId', 'task_id', 'id'])
        if (!id) throw new Error('taskId 必填')
        const existing = tasks.get(id)
        const task: PromaTaskItem = {
          id,
          subject: stringFromInput(input, ['subject', 'title', 'name'], existing?.subject ?? `任务 #${id}`),
          status: normalizeTaskStatus(input.status, existing?.status ?? 'pending'),
          description: typeof input.description === 'string' ? input.description : existing?.description,
          activeForm: typeof input.activeForm === 'string' ? input.activeForm : existing?.activeForm,
          blocks: normalizeStringArray(input.blocks) ?? existing?.blocks,
        }
        tasks.set(id, task)
        return createJsonToolResult({ task })
      },
    }),
    sdk.defineTool({
      name: 'TaskGet',
      label: '查看任务',
      description: '读取某个可见进度任务的当前状态。',
      promptSnippet: '查看可见进度任务。',
      parameters: Type.Object({
        taskId: Type.String({ description: '任务 ID。' }),
      }),
      async execute(_toolCallId, params) {
        const input = params as Record<string, unknown>
        const id = stringFromInput(input, ['taskId', 'task_id', 'id'])
        if (!id) throw new Error('taskId 必填')
        const task = tasks.get(id)
        if (!task) throw new Error(`任务不存在: ${id}`)
        return createJsonToolResult({ task })
      },
    }),
    sdk.defineTool({
      name: 'TaskList',
      label: '任务列表',
      description: '列出当前 turn 中已创建的可见进度任务。',
      promptSnippet: '列出可见进度任务。',
      parameters: Type.Object({
        reason: Type.Optional(Type.String({ description: '读取任务列表的原因。' })),
      }),
      async execute() {
        return createJsonToolResult({ tasks: [...tasks.values()].filter((task) => task.status !== 'deleted') })
      },
    }),
    sdk.defineTool({
      name: 'TodoRead',
      label: '读取待办',
      description: '读取当前 turn 的任务列表。兼容 Claude SDK 的 TodoRead。',
      promptSnippet: '读取当前待办列表。',
      parameters: Type.Object({}),
      async execute() {
        return createJsonToolResult({ todos: [...tasks.values()].filter((task) => task.status !== 'deleted') })
      },
    }),

  ] as unknown as ToolDefinition[]

  return definitions.map((tool) =>
    wrapToolWithPermission(tool as unknown as ToolDefinition<TSchema, unknown, unknown>, { canUseTool }) as ToolDefinition)
}

const WSL_EXPORT_ENV_KEYS = [
  'PROMA_CLI',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'PROMA_WINDOWS_SHELL',
  'PROMA_WSL_DISTRO',
] as const

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, String.raw`'\''`)}'`
}

export function windowsPathToWslPath(value: string): string {
  const driveMatch = value.match(/^([A-Za-z]):[\\/](.*)$/)
  if (!driveMatch) return value
  const drive = driveMatch[1]!.toLowerCase()
  const rest = driveMatch[2]!.replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`
}

function buildWslCommand(command: string, env: NodeJS.ProcessEnv | undefined): string {
  const exportLines: string[] = []
  for (const key of WSL_EXPORT_ENV_KEYS) {
    const rawValue = env?.[key]
    if (!rawValue) continue
    const value = key === 'PROMA_CLI' ? windowsPathToWslPath(rawValue) : rawValue
    exportLines.push(`export ${key}=${shellQuote(value)}`)
  }

  return exportLines.length > 0
    ? `${exportLines.join('\n')}\n${command}`
    : command
}

export function buildWslBashArgs(
  runtimeEnv: Pick<AgentRuntimeEnv, 'wslDistro'>,
  cwd: string,
  command: string,
  env: NodeJS.ProcessEnv | undefined,
): string[] {
  return [
    ...(runtimeEnv.wslDistro ? ['--distribution', runtimeEnv.wslDistro] : []),
    '--cd',
    windowsPathToWslPath(cwd),
    '--exec',
    'bash',
    '-lc',
    buildWslCommand(command, env),
  ]
}

function createWslBashOperations(runtimeEnv: AgentRuntimeEnv): BashOperations {
  return {
    exec(command, cwd, options) {
      return new Promise((resolve, reject) => {
        const mergedEnv = mergeRuntimeEnv(process.env, options.env)
        const args = buildWslBashArgs(runtimeEnv, cwd, command, mergedEnv)
        const child = spawn(runtimeEnv.wslCommand ?? 'wsl.exe', args, {
          env: mergedEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        let settled = false
        let timedOut = false
        let timeoutHandle: NodeJS.Timeout | undefined

        const cleanup = (): void => {
          if (timeoutHandle) clearTimeout(timeoutHandle)
          options.signal?.removeEventListener('abort', onAbort)
        }
        const settle = (fn: () => void): void => {
          if (settled) return
          settled = true
          cleanup()
          fn()
        }
        const killChild = (): void => {
          if (!child.killed) child.kill('SIGTERM')
        }
        const onAbort = (): void => {
          killChild()
        }

        if (options.signal?.aborted) {
          killChild()
          settle(() => reject(new Error('aborted')))
          return
        }

        child.stdout?.on('data', options.onData)
        child.stderr?.on('data', options.onData)
        child.on('error', (error) => {
          settle(() => reject(error))
        })
        child.on('close', (code) => {
          if (options.signal?.aborted) {
            settle(() => reject(new Error('aborted')))
          } else if (timedOut) {
            settle(() => reject(new Error(`timeout:${options.timeout}`)))
          } else {
            settle(() => resolve({ exitCode: code }))
          }
        })

        if (options.timeout !== undefined && options.timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            killChild()
          }, options.timeout * 1000)
        }
        options.signal?.addEventListener('abort', onAbort, { once: true })
      })
    },
  }
}

function createPromaBashToolOptions(runtimeEnv: AgentRuntimeEnv | undefined): BashToolOptions | undefined {
  if (!runtimeEnv) return undefined

  const spawnHook: NonNullable<BashToolOptions['spawnHook']> = ({ command, cwd, env }) => ({
    command,
    cwd,
    env: mergeRuntimeEnv(env, runtimeEnv.env),
  })

  if (runtimeEnv.shellKind === 'wsl') {
    return {
      operations: createWslBashOperations(runtimeEnv),
      spawnHook,
    }
  }

  return {
    ...(runtimeEnv.shellPath && { shellPath: runtimeEnv.shellPath }),
    spawnHook,
  }
}

export function isPiBashToolAvailable(
  platform: NodeJS.Platform,
  runtimeEnv: Pick<AgentRuntimeEnv, 'shellKind'> | undefined,
): boolean {
  // Pi 的 Windows Bash 工具只能通过 Proma 配置的 Git Bash 或 WSL 执行。
  // 没有可用 Shell 时，基础 Agent 仍可使用文件与 Proma 工具，但不能暴露一个必然失败的 Bash 工具。
  return platform !== 'win32' || runtimeEnv?.shellKind === 'git-bash' || runtimeEnv?.shellKind === 'wsl'
}

/**
 * Prime fork 自带四条 session 斜杠命令：/compact /refine /goal /autonomous。
 * 它们会在 prompt 解析阶段被 Prime 截走，绕过 Proma 的整套语义：
 *
 * - `/goal` 会强行激活 ipython 工具。P0.1 起 RLM 可用时 ipython 已作为
 *   会话自有内置定义激活并经过权限 hook 管控，因此放行；
 *   RLM 供给缺失时 goal 无工具可用（Prime 直接抛错），仍需 shield。
 * - `/compact` 会被 Prime 吞掉且不发 agent_end，Proma 侧收不到终态，
 *   最后被判成「空回复」错误；Proma 自己有压缩入口，不该走这条。
 * - `/refine`、`/autonomous` 与 Proma 自有的 refine 入口/会话自治配置重叠，
 *   走 Prime 的旁路会让 UI 状态与实际运行脱节，保持 shield。
 *
 * Prime 的 parseSlashCommand 要求 text.startsWith('/') 且不做 trim，
 * 故前置一个空格即可彻底避开解析，对模型语义没有影响。
 * 只挡这四类，扩展命令（extensionCommands）仍照常工作。
 */
const PRIME_SESSION_COMMANDS = new Set(['compact', 'refine', 'autonomous'])

export function shieldPrimeSessionCommands(prompt: string): string {
  if (!prompt.startsWith('/')) return prompt
  const name = /^\/(\S+)/.exec(prompt)?.[1]
  if (!name) return prompt
  if (name === 'goal') {
    // RLM 就绪时 /goal 交由 Prime 处理（goal 状态 + kernel goal skill）；
    // 未就绪时强行激活的 ipython 不存在，Prime 会直接报错，仍以空格避开。
    return detectIpythonKernelSupply().available ? prompt : ` ${prompt}`
  }
  return PRIME_SESSION_COMMANDS.has(name) ? ` ${prompt}` : prompt
}

function buildBuiltinToolDefinitions(
  sdk: PiSdk,
  cwd: string,
  canUseTool: PiAgentQueryOptions['canUseTool'],
  runtimeEnv: AgentRuntimeEnv | undefined,
): ToolDefinition[] {
  // Prime 只内置 bash / edit / ipython 三个工具（RLM 哲学：读、搜、列目录走 shell
  // 或内核，而非独立结构化工具）。上游的 read/write/grep/find/ls 在 Prime 中不存在；
  // 模型经由 bash 完成同类操作。若需恢复结构化工具，应移植到 prime-agent 而非在此伪造。
  const definitions = [
    ...(isPiBashToolAvailable(process.platform, runtimeEnv)
      ? [sdk.createBashToolDefinition(cwd, createPromaBashToolOptions(runtimeEnv))]
      : []),
    sdk.createEditToolDefinition(cwd),
  ] as unknown as ToolDefinition[]

  return definitions.map((tool) =>
    wrapToolWithPermission(tool as unknown as ToolDefinition<TSchema, unknown, unknown>, { canUseTool }) as ToolDefinition)
}

function appendWindowsBaseModeInstruction(systemPrompt: string, runtimeEnv: AgentRuntimeEnv | undefined): string {
  if (process.platform !== 'win32' || isPiBashToolAvailable(process.platform, runtimeEnv)) {
    return systemPrompt
  }

  return `${systemPrompt}

<runtime_capabilities>
当前 Windows 设备未配置 Git Bash 或 WSL，因此 Bash 工具不可用。你仍可使用 Edit 工具（编辑文件）、ipython（如可用）及 Proma 提供的其他工具完成任务；不要声称已运行命令、测试或 Git 操作。若任务确实需要命令行，请默认调用 InstallWindowsShell 帮助用户安装 Git Bash；该工具会要求用户确认下载并打开官方安装程序。
</runtime_capabilities>`
}

function wrapCustomToolDefinitions(
  tools: ToolDefinition[] | undefined,
  canUseTool: PiAgentQueryOptions['canUseTool'],
): ToolDefinition[] {
  return (tools ?? []).map((tool) =>
    wrapToolWithPermission(tool as unknown as ToolDefinition<TSchema, unknown, unknown>, { canUseTool }) as ToolDefinition)
}

export function installRuntimeGuardHooks(
  session: AgentSession,
  getGuard: () => AgentRuntimeGuard | undefined,
): void {
  const previousAfterToolCall = session.agent.afterToolCall
  session.agent.afterToolCall = async (context, signal) => {
    const previousResult = await previousAfterToolCall?.(context, signal)
    const guard = getGuard()
    if (!guard) return previousResult
    const resultAfterPreviousHooks = {
      content: previousResult?.content ?? context.result.content,
      details: previousResult?.details ?? context.result.details,
      terminate: previousResult?.terminate ?? context.result.terminate,
    }
    const sanitizedContent = sanitizeToolResultImageContent(resultAfterPreviousHooks.content)
    const guardedResult = guard.applyToolResult({
      ...resultAfterPreviousHooks,
      content: sanitizedContent,
    })

    if (
      !previousResult
      && guardedResult.terminate === context.result.terminate
      && sanitizedContent === context.result.content
    ) {
      return undefined
    }

    return {
      ...previousResult,
      content: sanitizedContent,
      terminate: guardedResult.terminate,
    }
  }

  // Prime 用 shouldStopBeforeTurn 取代上游的 prepareNextTurnWithContext 前置钩子。
  // 语义保持不变：达到 Proma 上限时清空 steer/follow-up 队列，
  // 否则纯文本 turn 之后追加的队列消息会绕过 afterToolCall 继续进入下一轮。
  const previousShouldStopBeforeTurn = session.agent.shouldStopBeforeTurn
  session.agent.shouldStopBeforeTurn = () => {
    if (getGuard()?.shouldStopBeforeNextTurn()) {
      session.agent.clearAllQueues()
    }
    return previousShouldStopBeforeTurn?.() ?? false
  }
}

export class PiAgentAdapter implements AgentProviderAdapter {
  private activeSessions = new Map<string, ActivePiSession>()
  private residentSessions = new ResidentSessionRegistry<PiResidentSession>({
    idleMs: PI_RESIDENT_SESSION_IDLE_MS,
    onDispose: (key, reason) => console.log(`[Pi SDK] 常驻会话释放: ${key} (${reason})`),
  })

  async *query(input: PiAgentQueryOptions): AsyncIterable<SDKMessage> {
    const active = createActivePiSession()
    // 防御性代际屏障：正常入口由 orchestrator 拒绝并发；若外部调用绕过它，
    // 也必须等旧 query 完整清理后才能复用 resident AgentSession。
    const previousActive = this.activeSessions.get(input.sessionId)
    if (previousActive && !previousActive.disposed) {
      this.abort(input.sessionId)
      await previousActive.finished
    }
    this.activeSessions.set(input.sessionId, active)
    const queue = createAsyncQueue<SDKMessage>()
    const runtimeGuard = createAgentRuntimeGuard(input)
    // 同一 session 的新请求可能在旧 IPC 事件之后开始；所有 retry 生命周期均携带这一轮标识。
    const retryRunStartedAt = input.retryRunStartedAt ?? Date.now()
    active.runtimeGuard = runtimeGuard
    active.skillWorkspaceSlug = input.skillWorkspaceSlug
    active.onSkillActivated = input.onSkillActivated
    let unsubscribe: (() => void) | undefined
    let requestProxyDispatcher: Dispatcher | undefined

    const cleanupActiveSession = (): void => {
      try {
        unsubscribe?.()
        unsubscribe = undefined
        if (!active.disposed) {
          active.disposed = true
          rejectPendingInterruptPrompts(active, createAbortError())
          active.pendingSkillActivations.clear()
          // 会话驻留：不 dispose，交还登记表排空闲计时（owner 校验防误清新占有者）
          this.residentSessions.release(input.sessionId, active)
        }
        if (this.activeSessions.get(input.sessionId) === active) {
          this.activeSessions.delete(input.sessionId)
        }
      } finally {
        void closePiRequestProxyDispatcher(requestProxyDispatcher)
        requestProxyDispatcher = undefined
        finishActiveSession(active)
      }
    }

    try {
      installPiRequestProxyFetch()
      requestProxyDispatcher = createPiRequestProxyDispatcher({
        proxyUrl: resolvePiHttpProxy(input),
        noProxy: getCaseInsensitiveRuntimeEnvValue(input.runtimeEnv?.env, 'NO_PROXY'),
        httpIdleTimeoutMs: input.httpIdleTimeoutMs,
      })
      const sdk = await import('@earendil-works/pi-coding-agent')
      const piAi = input.codexFastMode && input.provider === 'openai-codex'
        ? await import('@earendil-works/pi-ai')
        : undefined
      if (active.abortRequested) throw createAbortError()

      // ── 会话驻留（Track B #1）：同一会话复用 AgentSession，空闲超时再释放 ──
      // 指纹任一分量变化（模型/思考级/系统提示/skill 路径/项目指令/工作目录）都重建，
      // 保守优先于复用率；resume 指向别的会话时同样重建。
      const residencyKey = computeResidencyKey({
        provider: input.provider,
        model: input.model ?? 'default',
        thinkingLevel: input.thinkingLevel ?? 'off',
        cwd: input.cwd ?? process.cwd(),
        agentDir: input.piAgentDir,
        sessionDir: input.piSessionDir,
        systemPrompt: input.systemPrompt,
        additionalSkillPaths: input.additionalSkillPaths ?? [],
        projectInstructionFiles: (input.projectInstructionFiles ?? []).map((f) => `${f.path}#${f.content.length}`),
        projectScope: input.projectInstructionScope
          ? `${input.projectInstructionScope.projectRoot}#${[...(input.projectInstructionScope.initialSources ?? [])].sort().join('|')}`
          : undefined,
        researchIsolation: input.researchIsolation
          ? {
              denyRoots: input.researchIsolation.denyRoots,
              stateRoots: input.researchIsolation.stateRoots,
            }
          : undefined,
        // refine 实验臂切换必须重建会话，否则复用旧臂的 reviewer/设置。
        researchRefineMode: input.researchIsolation
          ? (input.researchRefine?.mode ?? 'learning')
          : undefined,
      })
      const residentEntry = this.residentSessions.get(input.sessionId)
      if (residentEntry?.owner && residentEntry.owner !== active) {
        throw new Error('上一轮 Agent 仍在释放资源，请稍后重试')
      }
      const cachedEntry = this.residentSessions.acquire(input.sessionId, active)
      let resident = cachedEntry?.session
      if (resident && (
        resident.key !== residencyKey
        || (input.resumeSessionId != null && input.resumeSessionId !== resident.session.sessionId)
      )) {
        await this.residentSessions.evict(input.sessionId)
        resident = undefined
      }
      if (!resident) {
        resident = await this.createResidentSession(input, sdk, piAi, residencyKey, active)
      }
      // 本轮槽位：常驻 hooks 由此读取当前 query 的守卫/请求代理/权限/压缩请求。
      // 槽位以 active 为 owner，query 收尾 release，防止并发 query 误清新占有者。
      resident.hooks.runtimeGuard = runtimeGuard
      resident.hooks.requestDispatcher = requestProxyDispatcher
      resident.hooks.compactionRequestRef = { value: false }
      resident.hooks.canUseTool = input.canUseTool
      const compactionRequestRef = resident.hooks.compactionRequestRef
      const { session, sessionManager, resourceLoader, model } = resident
      let pendingCompactionContinuation: string | undefined
      let automaticCompactionContinuations = 0
      let pendingTerminalResult: SDKMessage | undefined
      /** 当前压缩是否紧随一个成功完成的主 Agent turn。 */
      let completedAgentTurnPendingCompaction = false
      active.resourceLoader = resourceLoader
      active.session = session
      resolveActiveReady(active, session)

      if (active.abortRequested) {
        await session.abort().catch(() => {})
        throw createAbortError()
      }

      input.onSessionId?.(session.sessionId, session.sessionFile)
      input.onModelResolved?.(session.model?.id ?? input.model ?? 'default')
      input.onContextWindow?.(model.contextWindow ?? DEFAULT_CONTEXT_WINDOW)

      queue.push({
        type: 'system',
        subtype: 'init',
        session_id: session.sessionId,
        model: session.model?.id ?? input.model,
      } as unknown as SDKMessage)

      const assistantUuidTracker = createPiAssistantUuidTracker()
      // Pi 会在 native retry 前先发出 error assistant，再以 agent_end.willRetry 标记。
      // 延迟向 orchestrator 透传该 error，避免它先触发外层重试而重放整个 prompt。
      const retryTerminalGate = createPiRetryTerminalGate<{
        assistantMessage: AssistantMessage
        sdkMessage: SDKMessage
        assistantUuid: string
      }>()
      let pendingNativeOverflowRecovery = false
      // message_end 发生在 Pi 落盘前；保留对象身份，待 prompt 完成后从
      // SessionManager entries 精确取得 Pi entry ID，绝不按文本猜测。
      const finalAssistantUuids = new Map<AssistantMessage, string>()

      const persistPiEntryBindings = (): void => {
        const bindings: Record<string, string> = {}
        for (const entry of sessionManager.getEntries()) {
          if (entry.type !== 'message' || entry.message.role !== 'assistant') continue
          const uuid = finalAssistantUuids.get(entry.message as AssistantMessage)
          if (uuid) bindings[uuid] = entry.id
        }
        if (Object.keys(bindings).length > 0) input.onPiEntryBindings?.(bindings)
      }

      const assistantUuidFor = (): string => assistantUuidTracker.get()
      const resetAssistantStream = (): void => {
        assistantUuidTracker.reset()
      }

      const emitTerminalRetryError = (terminalRetryError: {
        assistantMessage: AssistantMessage
        sdkMessage: SDKMessage
        assistantUuid: string
      }): void => {
        finalAssistantUuids.set(terminalRetryError.assistantMessage, terminalRetryError.assistantUuid)
        runtimeGuard.recordMessage(terminalRetryError.assistantMessage)
        queue.push(terminalRetryError.sdkMessage)
        resetAssistantStream()
      }

      unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        try {
          switch (event.type) {
            case 'message_start': {
              const prompt = getPiUserMessageText(event.message)
              if (!prompt) break
              const pending = active.pendingSkillActivations.consume(prompt)
              if (pending) active.onSkillActivated?.(pending.activations, pending.userMessageUuid)
              break
            }
            case 'message_update': {
              if (!isAssistantPiMessage(event.message)) break
              const assistantUuid = assistantUuidFor()
              const delta = serializePiAssistantDelta(event.assistantMessageEvent)
              if (delta) {
                queue.push({
                  type: 'assistant_delta',
                  uuid: assistantUuid,
                  delta,
                  session_id: session.sessionId,
                  ...(input.model && { _channelModelId: input.model }),
                } as unknown as SDKMessage)
              }
              break
            }
            case 'message_end': {
              if (active.interrupting && isAbortedAssistantMessage(event.message)) {
                const converted = convertPiMessage(event.message, session.sessionId, input.model, {
                  uuid: assistantUuidFor(),
                })
                if (converted?.type === 'assistant') queue.push(converted)
                resetAssistantStream()
                break
              }
              const isAssistant = isAssistantPiMessage(event.message)
              const assistantUuid = isAssistant ? assistantUuidFor() : undefined
              const converted = convertPiMessage(event.message, session.sessionId, input.model, {
                ...(assistantUuid && { uuid: assistantUuid }),
              })
              const shouldDeferNativeOverflow = isAssistant
                && shouldDeferPiOverflowTerminalMessage(event.message as AssistantMessage, model.contextWindow)
              const shouldDeferAssistantTerminal = isAssistant && (
                (event.message as AssistantMessage).stopReason === 'error' || shouldDeferNativeOverflow
              )
              if (shouldDeferAssistantTerminal && converted?.type === 'assistant' && assistantUuid) {
                // Native retry 会丢弃该失败 assistant；不应消耗 Proma 的 turn/budget 配额。
                // 关键：此处不能重置 UUID。retry 后的新 partial/final 必须原地替换此前
                // 已经展示的 partial，避免用户同时看到断流残片和恢复后的完整回答。
                retryTerminalGate.defer({
                  assistantMessage: event.message as AssistantMessage,
                  sdkMessage: converted,
                  assistantUuid,
                })
              } else {
                runtimeGuard.recordMessage(event.message)
                if (converted && (converted.type !== 'user' || hasToolResult(converted))) queue.push(converted)
                if (isAssistant && assistantUuid) {
                  finalAssistantUuids.set(event.message as AssistantMessage, assistantUuid)
                  resetAssistantStream()
                }
              }
              break
            }
            case 'agent_end':
              completedAgentTurnPendingCompaction = false
              if (active.abortRequested || (active.interrupting && active.pendingInterruptPrompts.length > 0)) {
                // 用户停止或插入新 prompt 时，当前 loop 的错误与 result 都不得泄漏到下一轮。
                retryTerminalGate.settle(true)
                pendingNativeOverflowRecovery = false
                pendingTerminalResult = undefined
                resetAssistantStream()
                break
              }
              // Prime 在**派发完 agent_end 之后**才判断是否重试
              //（agent-session 先 _emit(event)，再走 _handleRetryableError），
              // 所以此刻根本不知道会不会重试。
              //
              // 曾经在这里按「不重试」结算：第一次 429 就把错误交给上层，
              // orchestrator 据此 completeRun 并 dispose session，
              // 8 次原生重试全部落空 —— 一次瞬时故障就毁掉整轮任务。
              // 现在一律保持 deferred，等 prompt() 把整条重试链跑完再结算。
              const deferredRetryError = retryTerminalGate.peek()
              if (shouldDeferPiOverflowTerminalError(
                deferredRetryError?.assistantMessage,
                model.contextWindow,
                false,
                active.abortRequested,
              )) {
                pendingNativeOverflowRecovery = true
              }
              // Pi can start auto-compaction after agent_end but before session.prompt()
              // resolves. Defer the terminal result until then, otherwise the orchestrator's
              // result-drain timeout may dispose the session and abort compaction.
              const terminalResult = convertResultMessage(
                event.messages,
                session.sessionId,
                runtimeGuard.getResultOverride(event.messages),
              )
              pendingTerminalResult = terminalResult
              completedAgentTurnPendingCompaction = shouldMarkCompactionAfterCompletedTurn(
                terminalResult,
                compactionRequestRef?.value ?? false,
              )
              break
            case 'auto_retry_start':
            case 'auto_retry_end':
              for (const retry of mapPiNativeRetryEvent(event, { runStartedAt: retryRunStartedAt })) input.onRetry?.(retry)
              break
            case 'refine_complete': {
              // 回滚自身的 refine_complete（rollbackOf 置位）不是新 refinement，
              // 不能再进 C3 结算，否则回滚会触发伪造的 refined 入账。
              if (event.result.rollbackOf) break
              // C3 结算：lint 违规 → native 回滚 + lint_violation residual；否则 PENDING 入账。
              const runtime = resident.researchRefineRuntime
              if (runtime?.onRefineComplete) {
                void runtime.onRefineComplete(
                  { id: event.result.id, appliedEdits: event.result.appliedEdits, scope: event.result.scope },
                ).catch((error) => console.error('[Pi SDK] research refine 结算失败:', error))
              }
              break
            }
            case 'refine_failed':
              if (resident.researchRefineRuntime) {
                resident.researchRefineRuntime.onRefineFailed?.()
                console.warn(`[Pi SDK] research refine 失败: ${event.error}`)
              }
              break
            case 'tool_execution_update':
              queue.push({
                type: 'tool_progress',
                session_id: session.sessionId,
                tool_use_id: event.toolCallId,
                tool_name: displayToolName(event.toolName, event.args as Record<string, unknown> | undefined),
                parent_tool_use_id: null,
              } as unknown as SDKMessage)
              break
            case 'compaction_start': {
              const afterCompletedTurn = completedAgentTurnPendingCompaction
              completedAgentTurnPendingCompaction = false
              // 压缩开始（手动 /compact 或自动阈值/溢出触发）：发前端已识别的 compacting system 消息，
              // 展示「正在压缩上下文...」分隔符。此前迁移遗漏了该事件，导致自动压缩与手动压缩都无 UI。
              // 只有成功完成主 turn 后才进入可验收完成态；运行中压缩仍保持 running。
              queue.push({
                type: 'system',
                subtype: 'compacting',
                session_id: session.sessionId,
                afterCompletedTurn,
              } as unknown as SDKMessage)
              break
            }
            case 'compaction_end':
              if (pendingNativeOverflowRecovery && event.reason === 'overflow') {
                pendingNativeOverflowRecovery = false
                const recovered = !event.aborted && event.result !== undefined && event.willRetry
                const terminalRetryError = retryTerminalGate.settle(
                  recovered || active.abortRequested || active.interrupting,
                )
                if (terminalRetryError) emitTerminalRetryError(terminalRetryError)
              }
              // 所有压缩结果都必须有可识别的终态，确保 renderer 能结束底部进度追踪。
              if (!event.aborted && event.result) {
                queue.push({
                  type: 'system',
                  subtype: 'compact_boundary',
                  session_id: session.sessionId,
                  summary: event.result.summary,
                  // Prime 的 CompactionResult 没有 estimatedTokensAfter（上游 0.8x 字段），
                  // 手动压缩不再附带压缩后预估值。
                } as unknown as SDKMessage)
              } else if (event.aborted) {
                queue.push({
                  type: 'system',
                  subtype: 'status',
                  session_id: session.sessionId,
                  compact_result: 'failed',
                  compact_error: '上下文压缩已取消。',
                } as unknown as SDKMessage)
              } else if (event.errorMessage && !isCompactionNoopError(event.errorMessage)) {
                queue.push({
                  type: 'system',
                  subtype: 'status',
                  session_id: session.sessionId,
                  compact_result: 'failed',
                  compact_error: event.errorMessage,
                } as unknown as SDKMessage)
              }
              break
            // Prime 没有 agent_settled 事件（上游 0.8x 的收尾事件）；对应的
            // pendingNativeOverflowRecovery 防御逻辑已由 compaction_end 分支覆盖。
          }
        } catch (error) {
          queue.fail(error)
        }
      })

      if (input.compactRequest) {
        // 手动压缩：走 pi 原生 session.compact()，而非把 /compact 当普通 prompt 发给模型。
        // compaction_start/end 事件已在上面的 subscribe 中转成 compacting/compact_boundary system 消息；
        // compact() 不发 agent_end，故这里补一个合成 result 消息收束本轮（供 orchestrator 结束消费循环）。
        session.compact()
          .then(() => {
            queue.push({
              type: 'result',
              subtype: 'success',
              usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
              terminal_reason: 'completed',
              isSyntheticCompactionResult: true,
              session_id: session.sessionId,
            } as unknown as SDKMessage)
            queue.close()
          })
          .catch((error) => {
            // 「会话太小无需压缩」/「已压缩」是良性情况，不是执行错误：
            // pi 会抛 "Nothing to compact (session too small)" / "Already compacted"。
            // 这里不 fail 队列（否则前端弹通用「执行错误」），改为正常收尾并给出友好提示。
            if (isCompactionNoopError(error)) {
              queue.push(createCompactionNoopMessage(session.sessionId, error))
              queue.push({
                type: 'result',
                subtype: 'success',
                usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
                terminal_reason: 'completed',
                isSyntheticCompactionResult: true,
                session_id: session.sessionId,
              } as unknown as SDKMessage)
              queue.close()
            } else {
              queue.fail(error)
            }
          })
          .finally(cleanupActiveSession)
      } else {
        const runPromptChain = async (): Promise<void> => {
          let nextPrompt: {
            content: string
            skipSkillExpansion: boolean
            skillMentions?: string[]
            userMessageUuid?: string
          } | undefined = {
            content: appendOutputFormatInstruction(input.prompt, input.outputFormat),
            skipSkillExpansion: false,
            skillMentions: input.skillMentions,
            userMessageUuid: input.initialUserMessageUuid,
          }
          let nextInterrupt: PendingInterruptPrompt | undefined
          while (nextPrompt !== undefined) {
            const currentInterrupt = nextInterrupt
            nextInterrupt = undefined
            if (runtimeGuard.shouldStopBeforeNextTurn()) {
              currentInterrupt?.rejectAccepted(createAbortError())
              rejectPendingInterruptPrompts(active, createAbortError())
              return
            }
            const promptInput = nextPrompt
            let preparedPrompt: PreparedPromptWithSkills
            try {
              preparedPrompt = promptInput.skipSkillExpansion
                ? { content: promptInput.content, activations: [] }
                : await preparePromptWithPromaSkills(
                  resourceLoader,
                  promptInput.content,
                  promptInput.skillMentions,
                  input.skillWorkspaceSlug,
                )
            } catch (error) {
              currentInterrupt?.rejectAccepted(error)
              throw error
            }
            const prompt = preparedPrompt.content
            const skillActivationId = registerPromptSkillActivations(
              active,
              prompt,
              promptInput.userMessageUuid,
              preparedPrompt.activations,
            )
            nextPrompt = undefined
            try {
              if (active.abortRequested) {
                active.pendingSkillActivations.discard(skillActivationId)
                currentInterrupt?.rejectAccepted(createAbortError())
                rejectPendingInterruptPrompts(active, createAbortError())
                return
              }
              currentInterrupt?.resolveAccepted()
              await session.prompt(shieldPrimeSessionCommands(prompt), { source: 'rpc' })
              // Research outcome hook 只记账；native rollback 必须等 prompt 完整退出、
              // Agent 已静默后再执行。禁止在 afterToolCall 内调用公开 refine()，否则
              // refine.waitForIdle 与 toolResult 生成互相等待，整条会话会锁死。
              if (!active.abortRequested) {
                await resident.researchRefineRuntime?.flushPendingRollbacks?.(session)
              }
              persistPiEntryBindings()
              if (compactionRequestRef?.value) {
                try {
                  await compactCurrentSessionAfterTurn(session, (message) => queue.push(message))
                } catch (error) {
                  // 用户在压缩期间停止时，Pi 会取消 summarization；这是正常中止而不是运行错误。
                  if (active.abortRequested) return
                  throw error
                }
                if (compactionRequestRef) compactionRequestRef.value = false
                const continuation = planPiCompactionContinuation({
                  continuationCount: automaticCompactionContinuations,
                  abortRequested: active.abortRequested,
                  runtimeLimitReached: runtimeGuard.shouldStopBeforeNextTurn(),
                })
                if (continuation.shouldContinue) {
                  automaticCompactionContinuations += 1
                  pendingCompactionContinuation = appendOutputFormatInstruction(continuation.prompt, input.outputFormat)
                  // 当前终态仅表示为执行压缩而结束的内部 loop，不应让上层把原任务视为完成。
                  pendingTerminalResult = undefined
                } else if (continuation.reason === 'continuation_limit') {
                  pendingTerminalResult = createCompactionContinuationLimitResult(session.sessionId)
                }
              }
              if (active.abortRequested || active.interrupting) {
                // Cancellation can arrive while Pi is compacting, after its first agent_end.
                // Do not render that stale terminal result before the next interrupt prompt starts.
                retryTerminalGate.settle(true)
                pendingNativeOverflowRecovery = false
                pendingTerminalResult = undefined
              } else {
                // prompt() 已经 await 完整条重试链（Prime 的 directPrompt 策略
                // completionIncludesRetryChain=true），到这里才真正知道结局：
                // 仍挂着 deferred 错误 = 重试已耗尽或压根没重试，此时才呈现给上层。
                // 若还要为压缩续跑，则本轮不是终态，错误留到续跑结束再判。
                if (!pendingCompactionContinuation) {
                  const terminalRetryError = retryTerminalGate.settle(false)
                  pendingNativeOverflowRecovery = false
                  if (terminalRetryError) emitTerminalRetryError(terminalRetryError)
                }
                if (pendingTerminalResult) {
                  queue.push(pendingTerminalResult)
                  pendingTerminalResult = undefined
                }
              }
            } finally {
              if (active.interrupting) {
                session.agent.state.messages = dropTrailingAbortedAssistant(session.agent.state.messages)
              }
              active.interrupting = false
            }
            if (active.abortRequested) {
              rejectPendingInterruptPrompts(active, createAbortError())
              return
            }
            if (runtimeGuard.shouldStopBeforeNextTurn()) {
              rejectPendingInterruptPrompts(active, createAbortError())
              return
            }
            const pendingInterrupt = active.pendingInterruptPrompts.shift()
            nextInterrupt = pendingInterrupt
            if (pendingInterrupt) {
              nextPrompt = { content: pendingInterrupt.content, skipSkillExpansion: true }
            } else if (pendingCompactionContinuation) {
              nextPrompt = { content: pendingCompactionContinuation, skipSkillExpansion: true }
              pendingCompactionContinuation = undefined
            }
          }
        }

        runPromptChain()
          .then(() => queue.close())
          .catch((error) => queue.fail(error))
          .finally(cleanupActiveSession)
      }
    } catch (error) {
      rejectActiveReady(active, error)
      queue.fail(error)
    }

    try {
      while (true) {
        const next = await queue.next()
        if (next.done) break
        yield next.value
      }
    } finally {
      cleanupActiveSession()
    }
  }

  /**
   * 构建常驻会话（每个会话只执行一次；复用路径不进这里）。
   * 与 query 的全部耦合都走 PiResidentHookSlots：hooks 在每次 query 开始时装上、
   * 结束时卸下，因此这里安装的 agent 钩子/工具包装永不叠层。
   */
  private async createResidentSession(
    input: PiAgentQueryOptions,
    sdk: PiSdk,
    piAi: typeof import('@earendil-works/pi-ai') | undefined,
    residencyKey: string,
    owner: object,
  ): Promise<PiResidentSession> {
    const hooks: PiResidentHookSlots = {}
    // 空闲期理论上不会有工具执行；防御性拒绝而不是放行。
    const indirectCanUseTool: PiAgentQueryOptions['canUseTool'] = async (toolName, toolInput, options) => {
      const current = hooks.canUseTool
      if (!current) {
        return { behavior: 'deny', message: '会话空闲中，权限回调缺失；请在 Agent 运行期间调用工具。' }
      }
      return current(toolName, toolInput, options)
    }

    if (!existsSync(input.piSessionDir)) mkdirSync(input.piSessionDir, { recursive: true })
    const cwd = input.cwd ?? process.cwd()
    const sessionFile = input.resumeSessionId ? findSessionFile(input.piSessionDir, input.resumeSessionId) : undefined
    if (input.resumeSessionId && !sessionFile) {
      throw new Error(`No conversation found with session ID ${input.resumeSessionId}`)
    }
    const sessionManager = sessionFile
      ? sdk.SessionManager.open(sessionFile, input.piSessionDir, cwd)
      : sdk.SessionManager.create(cwd, input.piSessionDir)
    const { modelRuntime, model } = await buildModel(sdk, input)
    const autoCompactionReserveTokens = calculatePiAutoCompactionReserveTokens(
      model.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    )
    // RLM（P0.1 · P6.0/1.2 重接线）：kernel 供给就绪时激活会话自己的内置
    // ipython 定义，并在会话创建后原地做权限包装（installSessionIpythonPermission）。
    // 不再注册 'ipython' customTool——customTools 会被 Prime 按引用拷进 rlm 子代理，
    // 共享委托会把子代理的 ipython 落到父 kernel（信息不对称与深度守卫同时失效）。
    // 供给缺失时保持不激活，避免 Prime 在无 TTY 的主进程里走 readline 确认装 uv 而挂死。
    const rlmSupply = detectIpythonKernelSupply()
    if (!rlmSupply.available) {
      console.warn(`[Pi SDK] RLM 未启用：${rlmSupply.detail}。安装 uv 或设置 PRIME_AGENT_KERNEL_PYTHON 后可用。`)
    }
    const managedSkillPaths = mergePromaManagedSkillPaths(
      input.additionalSkillPaths ?? [],
      rlmSupply.available ? resolvePrimeNativeSkillPaths() : [],
    )
    const customTools = [
      buildCurrentSessionCompactionTool(
        sdk,
        () => { if (hooks.compactionRequestRef) hooks.compactionRequestRef.value = true },
        indirectCanUseTool,
      ),
      ...buildBuiltinToolDefinitions(
        sdk,
        cwd,
        indirectCanUseTool,
        input.runtimeEnv,
      ),
      ...buildPromaProductToolDefinitions(sdk, indirectCanUseTool),
      ...wrapCustomToolDefinitions(input.customTools, indirectCanUseTool),
    ]

    // Research refine 循环（RESEARCH-REFINE-PLAN）：reviewer 在会话创建前装配，
    // artifactDir 里的 sessionId 待创建后解析（runtime 内部惰性取值）。
    const sessionArtifactsRoot = join(dirname(input.piSessionDir), 'session-artifacts')
    const artifactSessionIdHolder: { value: string } = { value: '' }
    const researchRefineMode: ResearchRefineMode | undefined = input.researchIsolation
      ? (input.researchRefine?.mode ?? 'learning')
      : undefined
    const researchRefineRuntime: ResearchRefineRuntime | undefined = researchRefineMode
      ? createResearchRefineRuntime({
        mode: researchRefineMode,
        run: input.researchRefine?.run,
        artifactDir: () => researchRefineArtifactDir(sessionArtifactsRoot, artifactSessionIdHolder.value),
      })
      : undefined
    const autoRefineOverride = resolvePiAutoRefineOverride(researchRefineMode)
    const settingsManager = sdk.SettingsManager.inMemory({
      // 使用 Pi SDK 原生压缩策略：
      // - 手动压缩由 session.compact() 触发；
      // - 自动压缩在上下文达到模型窗口的约 80% 时触发；Pi 以 reserveTokens 表示预留空间。
      compaction: { enabled: true, reserveTokens: autoCompactionReserveTokens },
      // Pi 原生 retry 通过 agent.continue() 在同一 transcript 中恢复，能保留已完成的
      // tool_result；不能用外层重投原始 prompt 替代，否则会重复执行副作用工具。
      retry: {
        enabled: true,
        maxRetries: PI_NATIVE_MAX_RETRIES,
        baseDelayMs: PI_NATIVE_RETRY_BASE_DELAY_MS,
      },
      ...(autoRefineOverride ? { autoRefine: autoRefineOverride } : {}),
      ...buildPiRemoteConnectionSettings(input),
    })
    const openAIReasoningProfile = (input.provider === 'openai-codex' || input.provider === 'xai' || input.provider === 'openai-responses')
      ? resolveReasoningProfile({
        modelId: input.model,
        transport: inferReasoningTransport(input.provider),
      })
      : undefined
    const deepSeekReasoningProfile = input.provider === 'deepseek'
      ? resolveReasoningProfile({
        modelId: input.model,
        transport: 'anthropic-messages',
      })
      : undefined
    const projectInstructionScope = input.projectInstructionScope
      ? new ProjectInstructionScopeController({
        projectRoot: input.projectInstructionScope.projectRoot,
        cwd,
        initialSources: input.projectInstructionScope.initialSources,
      })
      : undefined
    const extensionFactories = [
      ...(projectInstructionScope ? [projectInstructionScope.createExtension()] : []),
      ...(input.researchIsolation
        ? [createResearchIsolationExtension(
          input.researchIsolation,
          researchRefineRuntime?.onToolOutcome
            ? {
              onDenied: (toolName, reason) => {
                // guard 拒绝不经 afterToolCall（工具未执行），从此处进 C1。
                void researchRefineRuntime.onToolOutcome?.(
                  { kind: 'residual', source: 'guard', tool: toolName, ruleId: 'isolation-guard', messageExcerpt: reason },
                ).catch((error) => console.error('[Pi SDK] research guard 拒绝结算失败:', error))
              },
              onAllowed: (toolName) => {
                // guard 通过 = guard 类 refinement 的验证分母（审计 F1）。
                void researchRefineRuntime.onToolOutcome?.(
                  { kind: 'success', source: 'guard', tool: toolName },
                ).catch((error) => console.error('[Pi SDK] research guard 成功结算失败:', error))
              },
            }
            : undefined,
        )]
        : []),
      ...(openAIReasoningProfile
        ? [createOpenAIReasoningRequestExtension({
          profile: openAIReasoningProfile,
          thinkingLevel: input.openAIThinkingLevel,
        })]
        : []),
      ...(deepSeekReasoningProfile?.encodings['anthropic-messages']?.kind === 'deepseek-output-effort'
        ? [createDeepSeekReasoningRequestExtension({
          profile: deepSeekReasoningProfile,
          thinkingLevel: input.thinkingLevel,
        })]
        : []),
      ...(input.provider === 'openai-codex' && input.codexFastMode
        ? [createCodexFastModeExtension({ fastMode: true })]
        : []),
    ]
    const resourceLoader = new sdk.DefaultResourceLoader({
      cwd,
      agentDir: input.piAgentDir,
      settingsManager,
      ...createPromaManagedResourceLoaderOptions(),
      agentsFilesOverride: createPromaProjectInstructionFilesOverride(input.projectInstructionFiles ?? []),
      additionalSkillPaths: managedSkillPaths,
      skillsOverride: createPromaSkillsOverride(managedSkillPaths),
      ...(extensionFactories.length > 0 && { extensionFactories }),
      // P0.2：不再整体替换系统提示。customPrompt（systemPromptOverride 的返回值）
      // 会让 buildSystemPrompt 走自定义分支，整段丢掉 buildRlmPrompt 与
      // buildSubagentGuidance——kernel 开了但模型不知道 rlm() 的契约。
      // Proma 的会话上下文改走 append 段，落在 Prime RLM 契约之后；基础提示
      // 保持 Prime 默认（含 RLM 学说、子代理指引、harness 状态注入）。
      appendSystemPromptOverride: () => [appendWindowsBaseModeInstruction(input.systemPrompt, input.runtimeEnv)].filter(Boolean),
    })
    await resourceLoader.reload()
    const skillDiagnostics = resourceLoader.getSkills().diagnostics
    for (const diagnostic of skillDiagnostics) {
      const level = diagnostic.type === 'error' ? 'error' : 'warn'
      console[level](`[Pi SDK] Skill 加载诊断: ${diagnostic.path ?? '(unknown)'} ${diagnostic.message}`)
    }

    const { session } = await sdk.createAgentSession({
      cwd,
      agentDir: input.piAgentDir,
      // Prime 把上游 modelRuntime 的职责拆成 authStorage（凭据）+ modelRegistry（目录）。
      // per-request 的 API key 解析由 AgentSession 内部经 modelRegistry 完成。
      authStorage: modelRuntime.authStorage,
      modelRegistry: modelRuntime.registry,
      settingsManager,
      resourceLoader,
      sessionManager,
      model,
      thinkingLevel: input.thinkingLevel ?? 'off',
      noTools: 'builtin',
      // RLM：供给可用时默认激活并预热会话自己的 ipython；同时开放
      // goal / compact 的 kernel host bridge。子代理继承活跃工具名，但各自
      // 构建独立 kernel，不共享父会话定义。
      ...createRlmSessionActivationOptions(rlmSupply),
      ...(researchRefineRuntime?.autoRefineReviewer && { autoRefineReviewer: researchRefineRuntime.autoRefineReviewer }),
      ...(researchRefineRuntime && { serializedRefine: researchRefineRuntime.serializedRefine }),
      customTools,
    })
    if (researchRefineRuntime) {
      artifactSessionIdHolder.value = session.sessionId
      installResearchRefineToolTap(session.agent, researchRefineRuntime)
    }
    if (rlmSupply.available) {
      // 父会话的 ipython 走 session-owned 执行 hook：Prime 重建工具表后仍有效，
      // 且 RLM child 创建自己的 Agent，不会继承父 hook 或共享同名 customTool。
      installSessionIpythonPermission(
        session,
        async ({ toolCallId, input: rawInput, signal, displayName: permissionDisplayName, description }) => {
          const permission = await indirectCanUseTool(
            displayToolName('ipython', rawInput),
            normalizePermissionInput('ipython', rawInput),
            {
              signal,
              toolUseID: toolCallId,
              displayName: permissionDisplayName,
              description,
            },
          )
          if (permission.behavior === 'deny') return permission
          return {
            behavior: 'allow',
            updatedInput: restorePiInput('ipython', rawInput, permission.updatedInput),
          }
        },
      )
    }
    session.agent.toolExecution = 'sequential'
    // Pi session artifact 可以来自旧版本，不能假设其历史 tool_result 已通过当前校验。
    // transformContext 在每个 provider 请求前执行，能隔离 resume 的坏图片而不篡改原 artifact。
    const previousTransformContext = session.agent.transformContext
    session.agent.transformContext = async (messages, signal) => sanitizePiMessageImageContent(
      await previousTransformContext?.(messages, signal) ?? messages,
    )
    if (projectInstructionScope) {
      // Prime 没有 prepareNextTurnWithContext（重写下一轮 context 的钩子）。
      // 等价做法：在 getContinuationMessages（每次 continuation 前触发）里把待注入的
      // 项目指令直接写进 agent.state.systemPrompt —— getSystemPrompt 每轮都会读取它。
      // 注意 AgentSession 在某些路径会重置为 base prompt；pending 指令只注入一次，
      // 与上游"下一轮生效"的语义一致。
      const previousGetContinuationMessages = session.agent.getContinuationMessages
      session.agent.getContinuationMessages = async (context, signal) => {
        const messages = await previousGetContinuationMessages?.(context, signal) ?? []
        const currentPrompt = session.agent.state.systemPrompt
        const systemPrompt = projectInstructionScope.appendPendingInstructions(currentPrompt)
        if (systemPrompt !== currentPrompt) {
          session.agent.state.systemPrompt = systemPrompt
        }
        return messages
      }
    }
    if (piAi && input.codexFastMode && input.provider === 'openai-codex' && isCodexFastModeSupportedModel(input.model)) {
      // Pi 的通用 streamSimple 会丢弃 provider 专属 serviceTier；这里直接走
      // provider stream，确保 request body 与 usage.cost 都使用 priority tier。
      session.agent.streamFn = async (requestModel, context, options) => {
        // Prime 的认证解析走 ModelRegistry.getApiKeyAndHeaders（含 OAuth 过期自动刷新）。
        // 上游的 provider env 注入与 http/websocket 空闲超时设置在 Prime 中不存在，
        // 超时统一由 retry.provider.timeoutMs 控制。
        const auth = await modelRuntime.registry.getApiKeyAndHeaders(requestModel)
        if (!auth.ok || !auth.apiKey) throw new Error('无法获取 ChatGPT (Codex) OAuth access token')

        const retrySettings = settingsManager.getProviderRetrySettings()
        return piAi.stream(requestModel, context, withCodexFastModeServiceTier({
          ...options,
          apiKey: auth.apiKey,
          timeoutMs: options?.timeoutMs ?? retrySettings.timeoutMs,
          maxRetries: options?.maxRetries ?? retrySettings.maxRetries,
          maxRetryDelayMs: options?.maxRetryDelayMs ?? retrySettings.maxRetryDelayMs,
          headers: { ...auth.headers, ...options?.headers },
        }))
      }
    }
    // 代理作用域必须只覆盖模型 provider stream：在整个 session.prompt() 链上设
    // AsyncLocalStorage 会把 MCP/产品工具等同一 Agent loop 中的 fetch 也错误地送进 Codex 代理。
    // 常驻会话上经槽位取当前 query 的 dispatcher；空闲（无 dispatcher）时直连。
    const providerStreamFn = session.agent.streamFn
    session.agent.streamFn = (requestModel, context, options) => {
      const dispatcher = hooks.requestDispatcher
      if (!dispatcher) return providerStreamFn(requestModel, context, options)
      return runWithPiRequestProxy(
        dispatcher,
        () => providerStreamFn(requestModel, context, options),
      )
    }
    installRuntimeGuardHooks(session, () => hooks.runtimeGuard)
    installCurrentSessionCompactionHooks(session)

    // Prime 的 session artifacts 与 sessions 目录同级：…/session-artifacts/<sdkSessionId>/harness
    const harnessDir = join(dirname(input.piSessionDir), 'session-artifacts', session.sessionId, 'harness')
    const resident: PiResidentSession = {
      key: residencyKey,
      session,
      sessionManager,
      resourceLoader,
      model,
      hooks,
      harnessDir,
      // settingsManager 未显式配置时沿用 Prime 默认值（见 prime refinement.ts）
      autoRefine: readAutoRefineSettings(settingsManager as unknown as { getSettings?: () => unknown }),
      ...(researchRefineRuntime?.mode === 'learning' && { researchRefineRuntime }),
      ...(researchRefineMode && { researchRefineMode }),
      // 审计 F2：learning 臂 dispose 前先排空 C5 promotion（VALIDATED → global），
      // 再交 Prime 销毁会话；失败也要 dispose，promotion 结果以事件流为准。
      dispose: async () => {
        try {
          await researchRefineRuntime?.beforeDispose?.(session)
        } catch (error) {
          console.error('[Pi SDK] research refine promotion 失败:', error)
        } finally {
          session.dispose()
        }
      },
    }
    await this.residentSessions.install(input.sessionId, resident, owner)
    return resident
  }

  /** Track B #3：手动"立即提炼"。/refine 斜杠命令仍被 shield，这里是 UI 动作直达。 */
  async refineNow(sessionId: string): Promise<AgentRefineNowResult> {
    const entry = this.residentSessions.get(sessionId)
    const resident = entry?.session
    if (!resident) {
      return { scheduled: false, reason: '会话未驻留（发送一条消息后再试，或等待空闲超时后重建）' }
    }
    if (entry?.owner) {
      return { scheduled: false, reason: '会话正在执行任务，请等本轮结束再提炼' }
    }
    // 审计 F3：off/frozen 臂的 research 会话不允许手动 refine（会污染实验臂，
    // 且这两臂没有 lint 接线）。
    if (resident.researchRefineMode && resident.researchRefineMode !== 'learning') {
      return { scheduled: false, reason: `research refine 实验臂为 ${resident.researchRefineMode}，手动提炼已被禁用` }
    }
    await resident.session.refine()
    return { scheduled: true }
  }

  /**
   * P0.5：读取真实 refine 数据源，供"经验已记录"徽标。
   *
   * 旧实现读 local `refinements.jsonl`，而 Prime 只在 **global** scope 写该文件
   * （Proma 调的是 local scope），徽标因此永远显示"尚无经验记录"。
   * 解析逻辑见 pi-refine-state.ts（harness_state.json + 会话 JSONL）。
   */
  getRefineState(sessionId: string): AgentRefineState {
    const resident = this.residentSessions.get(sessionId)?.session
    const state: AgentRefineState = {
      resident: resident != null,
      autoRefine: resident?.autoRefine ?? { enabled: true, turnInterval: 25 },
    }
    if (!resident) return state

    const sessionFile = resident.sessionManager.getSessionFile()
    const { entries, lastTs, recent } = summarizePrimeRefineArtifacts(resident.harnessDir, sessionFile)
    if (entries > 0 || recent.length > 0) {
      state.harness = { entries, ...(lastTs ? { lastTs } : {}), recent }
    }
    return state
  }

  abort(sessionId: string): void {
    const active = this.activeSessions.get(sessionId)
    if (!active) return
    active.abortRequested = true
    rejectPendingInterruptPrompts(active, createAbortError())
    if (!active.session) rejectActiveReady(active, createAbortError())
    active.session?.abortCompaction()
    active.session?.abort().catch(() => {})
  }

  async sendQueuedMessage(
    sessionId: string,
    message: SDKUserMessageInput,
    options?: SendQueuedMessageOptions,
  ): Promise<void> {
    const active = this.activeSessions.get(sessionId)
    if (!active) throw new Error('当前会话没有正在运行的 Agent')
    const session = await waitForActiveSession(active)
    if (active.abortRequested) throw createAbortError()
    if (active.runtimeGuard?.shouldStopBeforeNextTurn()) {
      session.agent.clearAllQueues()
      const stopOverride = active.runtimeGuard.getLimitResultOverride()
      throw new Error(stopOverride?.errors[0] ?? 'Agent 已达到运行限制，无法继续追加消息')
    }
    const preparedPrompt = active.resourceLoader
      ? await preparePromptWithPromaSkills(
        active.resourceLoader,
        message.message.content,
        options?.skillMentions,
        active.skillWorkspaceSlug,
      )
      : { content: message.message.content, activations: [] }
    const content = preparedPrompt.content
    const skillActivationId = registerPromptSkillActivations(
      active,
      content,
      message.uuid,
      preparedPrompt.activations,
    )
    if (active.runtimeGuard?.shouldStopBeforeNextTurn()) {
      active.pendingSkillActivations.discard(skillActivationId)
      session.agent.clearAllQueues()
      const stopOverride = active.runtimeGuard.getLimitResultOverride()
      throw new Error(stopOverride?.errors[0] ?? 'Agent 已达到运行限制，无法继续追加消息')
    }
    if (options?.interrupt) {
      const accepted = new Promise<void>((resolve, reject) => {
        active.pendingInterruptPrompts.push({
          content,
          skillActivationId,
          resolveAccepted: resolve,
          rejectAccepted: reject,
        })
      })
      accepted.catch(() => {})
      if (session.isStreaming) {
        // Pi 没有单独的 interrupt()；公开取消 API 是 abort()。
        // 这里把 abort 产生的内部 aborted 终态压住，再由 query 的 prompt chain 发送新消息。
        active.interrupting = true
        active.interruptAbortPromise ??= session.abort()
          .finally(() => {
            active.interruptAbortPromise = undefined
          })
        await active.interruptAbortPromise
      }
      await accepted
      options.onAccepted?.()
      return
    }
    try {
      if (message.priority === 'now') {
        await session.steer(content)
      } else {
        await session.followUp(content)
      }
    } catch (error) {
      active.pendingSkillActivations.discard(skillActivationId)
      throw error
    }
    options?.onAccepted?.()
  }

  async cancelQueuedMessage(_sessionId: string, _messageUuid: string): Promise<void> {
    // Pi 的公开 SDK 当前只暴露 clearQueue，不支持按消息 UUID 删除。
  }

  async setPermissionMode(_sessionId: string, _mode: string): Promise<void> {
    // Proma 权限由工具包装层实时读取 sessionPermissionModes，自身无需同步给 Pi。
  }

  async dispose(): Promise<void> {
    const aborts: Promise<void>[] = []
    const activeRuns = [...this.activeSessions.values()]
    for (const active of activeRuns) {
      if (!active.disposed) {
        active.disposed = true
        active.abortRequested = true
        rejectPendingInterruptPrompts(active, createAbortError())
        active.pendingSkillActivations.clear()
        if (active.session) aborts.push(active.session.abort().catch(() => {}))
      }
      rejectActiveReady(active, createAbortError())
    }
    this.activeSessions.clear()
    await Promise.allSettled(aborts)
    await this.residentSessions.disposeAll()
    for (const active of activeRuns) finishActiveSession(active)
  }
}
