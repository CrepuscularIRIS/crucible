/**
 * Pi Runtime 用户 MCP 工具桥接层
 *
 * Claude runtime 继续使用 Claude Agent SDK 原生 mcpServers；Pi SDK 当前没有等价
 * mcpServers 参数，因此 Proma 在主进程连接用户配置的 MCP server，并把 MCP tools
 * 映射成 Pi customTools。
 */

import { createHash } from 'node:crypto'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { AgentToolResult } from '@earendil-works/pi-agent-core'
import type { TextContent, ImageContent } from '@earendil-works/pi-ai'
import type { TSchema } from 'typebox'
import { Type } from 'typebox'
import { sanitizeToolResultImageContent } from '../image-content-validation'

const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 60_000
const DEFAULT_MCP_STARTUP_TIMEOUT_MS = 30_000
const HTTP_SESSION_REJECTION_PATTERN = /missing session id|no valid session id provided|mcp-session-id header is required/i

interface PiMcpServerConfig {
  type?: unknown
  command?: unknown
  args?: unknown
  env?: unknown
  url?: unknown
  headers?: unknown
  startup_timeout_sec?: unknown
  timeout?: unknown
  required?: unknown
}

type PiMcpServers = Record<string, Record<string, unknown>>

type McpToolInfo = Awaited<ReturnType<Client['listTools']>>['tools'][number]

type McpCallToolResult = Awaited<ReturnType<Client['callTool']>>

interface McpConnection {
  client: Client
  transport: Transport
  close: () => Promise<void>
  tools?: McpToolInfo[]
  toolsPromise?: Promise<McpToolInfo[]>
}

interface McpConnectionEntry {
  promise: Promise<McpConnection>
  activeLeases: number
  scopeOwners: Set<string>
  stale: boolean
  closed: boolean
}

interface McpConnectionLease {
  key: string
  entry: McpConnectionEntry
  connection: McpConnection
}

interface McpToolBinding {
  serverName: string
  originalToolName: string
  tool: McpToolInfo
  manager: PiMcpClientManager
  managerConfig: PiMcpServerConfig
  scopeId?: string
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`
}

function configHash(config: unknown): string {
  return createHash('sha256').update(stableStringify(config)).digest('hex').slice(0, 16)
}

function normalizeToolSegment(segment: string): string {
  const normalized = segment.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) return 'unnamed'
  return /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`
}

function mcpToolName(serverName: string, toolName: string): string {
  return `mcp__${normalizeToolSegment(serverName)}__${normalizeToolSegment(toolName)}`
}

function getHeaders(config: PiMcpServerConfig): Record<string, string> | undefined {
  if (!config.headers || typeof config.headers !== 'object') return undefined
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(config.headers as Record<string, unknown>)) {
    if (typeof value === 'string') headers[key] = value
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}

function getTimeoutMs(config: PiMcpServerConfig): number {
  const timeoutSec = typeof config.startup_timeout_sec === 'number'
    ? config.startup_timeout_sec
    : typeof config.timeout === 'number'
      ? config.timeout
      : undefined
  if (!timeoutSec || !Number.isFinite(timeoutSec) || timeoutSec <= 0) return DEFAULT_MCP_STARTUP_TIMEOUT_MS
  return timeoutSec * 1000
}

function createTransport(name: string, config: PiMcpServerConfig): Transport | undefined {
  const type = config.type
  if (type === 'stdio') {
    if (typeof config.command !== 'string' || !config.command.trim()) {
      console.warn(`[Pi MCP] MCP 服务器 ${name} 缺少 command，已跳过`)
      return undefined
    }
    const env = typeof config.env === 'object' && config.env
      ? Object.fromEntries(Object.entries(config.env as Record<string, unknown>).filter(([, value]) => typeof value === 'string')) as Record<string, string>
      : undefined
    return new StdioClientTransport({
      command: config.command,
      args: Array.isArray(config.args) ? config.args.filter((arg): arg is string => typeof arg === 'string') : undefined,
      env,
      stderr: 'inherit',
    })
  }

  if (type === 'http') {
    if (typeof config.url !== 'string' || !config.url.trim()) {
      console.warn(`[Pi MCP] MCP 服务器 ${name} 缺少 url，已跳过`)
      return undefined
    }
    const headers = getHeaders(config)
    return new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: headers ? { headers } : undefined,
    })
  }

  if (type === 'sse') {
    if (typeof config.url !== 'string' || !config.url.trim()) {
      console.warn(`[Pi MCP] MCP 服务器 ${name} 缺少 url，已跳过`)
      return undefined
    }
    const headers = getHeaders(config)
    return new SSEClientTransport(new URL(config.url), {
      requestInit: headers ? { headers } : undefined,
      eventSourceInit: headers
        ? ({
          fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
            ...init,
            headers: {
              ...(init?.headers as Record<string, string> | undefined),
              ...headers,
            },
          }),
        } as any)
        : undefined,
    })
  }

  console.warn(`[Pi MCP] MCP 服务器 ${name} 使用暂不支持的类型 ${String(type)}，已跳过`)
  return undefined
}

function isObjectSchema(schema: unknown): schema is Record<string, unknown> {
  return !!schema && typeof schema === 'object' && !Array.isArray(schema)
}

function toTypeBoxSchema(schema: unknown): TSchema {
  if (!isObjectSchema(schema)) return Type.Object({})
  if (schema.type !== 'object') return Type.Object({})
  return Type.Unsafe(schema)
}

function stringifyForTool(content: unknown): string {
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

function convertMcpResult(result: McpCallToolResult): AgentToolResult<unknown> {
  const content: Array<TextContent | ImageContent> = []

  if ('content' in result && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block.type === 'text') {
        content.push({ type: 'text', text: block.text })
      } else if (block.type === 'image') {
        content.push({ type: 'image', data: block.data, mimeType: block.mimeType })
      } else {
        content.push({ type: 'text', text: stringifyForTool(block) })
      }
    }
  } else if ('toolResult' in result) {
    content.push({ type: 'text', text: stringifyForTool(result.toolResult) })
  }

  if ('structuredContent' in result && result.structuredContent !== undefined) {
    content.push({ type: 'text', text: `structuredContent:\n${stringifyForTool(result.structuredContent)}` })
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: stringifyForTool(result) })
  }

  return {
    content: sanitizeToolResultImageContent(content),
    details: result,
  } as AgentToolResult<unknown>
}

function mcpToolErrorMessage(result: McpCallToolResult): string | undefined {
  if (!('isError' in result) || result.isError !== true) return undefined
  const converted = convertMcpResult(result)
  const text = converted.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')
  return text || 'MCP 工具返回错误'
}

/**
 * Optional MCP 服务首次连接在后台继续；首轮消息为它等待的时间与
 * `startup_timeout_sec`（设置项，默认 30s）一致——这是设置界面承诺的
 * 启动窗口，此前硬编码 500ms 让 npx 起的 stdio server 在每个会话的
 * 第一条消息里必然超时，用户配置的 30s 被完全绕开。
 * 连接完成后 manager 缓存 tools，后续回合直接复用。
 */
async function listOptionalMcpTools(
  manager: PiMcpClientManager,
  serverName: string,
  config: PiMcpServerConfig,
  scopeId?: string,
): Promise<McpToolInfo[] | undefined> {
  const toolsPromise = manager.listTools(serverName, config, scopeId)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      toolsPromise,
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => {
          console.info(`[Pi MCP] 可选 MCP 服务器 ${serverName} 在启动窗口（${getTimeoutMs(config)}ms）内未就绪，本回合跳过`)
          resolve(undefined)
        }, getTimeoutMs(config))
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

class PiMcpClientManager {
  private readonly connections = new Map<string, McpConnectionEntry>()
  private readonly activeScopes = new Set<string>()
  private lifecycleGeneration = 0

  /**
   * 关闭所有活跃的 MCP 连接，释放 stdio 子进程和网络资源。
   * 应在 app quit 或 agent session 结束时调用。
   */
  async dispose(): Promise<void> {
    this.lifecycleGeneration += 1
    this.activeScopes.clear()
    const entries = [...this.connections.values()]
    this.connections.clear()
    await Promise.allSettled(
      entries.map(async (entry) => {
        try {
          const conn = await entry.promise
          await conn.close()
        } catch {
          // 连接本身就失败了，忽略
        }
      }),
    )
  }

  activateScope(scopeId: string): void {
    this.activeScopes.add(scopeId)
  }

  async listTools(serverName: string, config: PiMcpServerConfig, scopeId?: string): Promise<McpToolInfo[]> {
    return this.executeWithSessionRecovery(serverName, config, undefined, scopeId, async (connection) => {
      if (connection.tools) return connection.tools
      if (!connection.toolsPromise) {
        connection.toolsPromise = connection.client.listTools(undefined, { timeout: DEFAULT_MCP_REQUEST_TIMEOUT_MS })
          .then((result) => {
            connection.tools = result.tools
            return result.tools
          })
          .catch((error) => {
            connection.toolsPromise = undefined
            throw error
          })
      }
      return connection.toolsPromise
    })
  }

  async callTool(
    serverName: string,
    config: PiMcpServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    scopeId?: string,
  ): Promise<McpCallToolResult> {
    return this.executeWithSessionRecovery(serverName, config, signal, scopeId, (connection) =>
      connection.client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { signal, timeout: DEFAULT_MCP_REQUEST_TIMEOUT_MS, resetTimeoutOnProgress: true },
      ))
  }

  private async executeWithSessionRecovery<T>(
    serverName: string,
    config: PiMcpServerConfig,
    signal: AbortSignal | undefined,
    scopeId: string | undefined,
    operation: (connection: McpConnection) => Promise<T>,
  ): Promise<T> {
    const lifecycleGeneration = this.lifecycleGeneration
    const lease = await this.acquireConnection(serverName, config, scopeId)
    let leaseReleased = false
    try {
      try {
        return await operation(lease.connection)
      } catch (error) {
        if (!this.isRejectedHttpSession(error, lease.connection)) {
          throw error
        }

        this.markConnectionStale(lease)
        await this.releaseConnection(lease)
        leaseReleased = true
        if (signal?.aborted || this.lifecycleGeneration !== lifecycleGeneration) throw error

        console.info(`[Pi MCP] MCP 服务器 ${serverName} Session 已失效，正在重新握手`)

        const replacement = await this.acquireConnection(serverName, config, scopeId)
        try {
          try {
            return await operation(replacement.connection)
          } catch (retryError) {
            if (this.isRejectedHttpSession(retryError, replacement.connection)) {
              this.markConnectionStale(replacement)
            }
            throw retryError
          }
        } finally {
          await this.releaseConnection(replacement)
        }
      }
    } finally {
      if (!leaseReleased) {
        await this.releaseConnection(lease)
      }
    }
  }

  private isRejectedHttpSession(error: unknown, connection: McpConnection): boolean {
    if (!(connection.transport instanceof StreamableHTTPClientTransport)) return false
    if (connection.transport.sessionId === undefined) return false
    if (!(error instanceof StreamableHTTPError)) return false
    if (error.code === 404) return true
    return error.code === 400 && HTTP_SESSION_REJECTION_PATTERN.test(error.message)
  }

  private async acquireConnection(
    serverName: string,
    config: PiMcpServerConfig,
    scopeId?: string,
  ): Promise<McpConnectionLease> {
    const key = `${serverName}:${configHash(config)}`
    let entry = this.connections.get(key)

    if (!entry) {
      let createdEntry!: McpConnectionEntry
      const promise = this.createConnection(serverName, config, () => {
        createdEntry.stale = true
        createdEntry.closed = true
        if (this.connections.get(key) === createdEntry) {
          this.connections.delete(key)
        }
      }).catch((error) => {
        createdEntry.stale = true
        if (this.connections.get(key) === createdEntry) {
          this.connections.delete(key)
        }
        throw error
      })
      createdEntry = {
        promise,
        activeLeases: 0,
        scopeOwners: new Set<string>(),
        stale: false,
        closed: false,
      }
      entry = createdEntry
      this.connections.set(key, entry)
    }

    entry.activeLeases += 1
    if (scopeId && this.activeScopes.has(scopeId)) {
      entry.scopeOwners.add(scopeId)
    } else if (scopeId && entry.scopeOwners.size === 0) {
      // 父 turn 已结束后，后台 RLM 子会话仍可能持有旧 ToolDefinition。
      // 这类调用允许完成，但连接不得重新进入常驻缓存。
      entry.stale = true
      if (this.connections.get(key) === entry) this.connections.delete(key)
    }
    try {
      return {
        key,
        entry,
        connection: await entry.promise,
      }
    } catch (error) {
      entry.activeLeases -= 1
      throw error
    }
  }

  private markConnectionStale(lease: McpConnectionLease): void {
    lease.entry.stale = true
    if (this.connections.get(lease.key) === lease.entry) {
      this.connections.delete(lease.key)
    }
  }

  private async releaseConnection(lease: McpConnectionLease): Promise<void> {
    lease.entry.activeLeases -= 1
    if (!lease.entry.stale || lease.entry.closed || lease.entry.activeLeases > 0) return
    lease.entry.closed = true
    try {
      await lease.connection.close()
    } catch {
      // Session 已由服务端终止，关闭旧 transport 失败不影响重新握手。
    }
  }

  /**
   * 释放一次 Agent 运行持有的连接。相同配置若仍被其他并发运行持有，连接继续复用；
   * 最后一个 owner 退出后立即淘汰，避免不同 cwd 的 Research stdio 子进程常驻。
   */
  async disposeScope(scopeId: string): Promise<void> {
    this.activeScopes.delete(scopeId)
    const entriesToClose: McpConnectionEntry[] = []
    for (const [key, entry] of this.connections) {
      if (!entry.scopeOwners.delete(scopeId) || entry.scopeOwners.size > 0) continue
      entry.stale = true
      if (this.connections.get(key) === entry) this.connections.delete(key)
      if (entry.activeLeases === 0 && !entry.closed) {
        entry.closed = true
        entriesToClose.push(entry)
      }
    }
    await Promise.allSettled(entriesToClose.map(async (entry) => {
      try {
        const connection = await entry.promise
        await connection.close()
      } catch {
        // 连接启动本身失败时没有需要回收的资源。
      }
    }))
  }

  private async createConnection(
    serverName: string,
    config: PiMcpServerConfig,
    onClose: () => void,
  ): Promise<McpConnection> {
    const transport = createTransport(serverName, config)
    if (!transport) throw new Error(`无法创建 MCP transport: ${serverName}`)

    const client = new Client({ name: 'proma-pi-agent-mcp-bridge', version: '0.1.0' }, { capabilities: {} })
    await client.connect(transport, { timeout: getTimeoutMs(config) })

    let closing = false

    const previousOnError = transport.onerror
    transport.onerror = (error) => {
      previousOnError?.(error)
      if (!closing) {
        console.warn(`[Pi MCP] MCP 服务器 ${serverName} transport error:`, error)
      }
    }
    const previousOnClose = transport.onclose
    transport.onclose = () => {
      closing = true
      previousOnClose?.()
      onClose()
    }

    return {
      client,
      transport,
      close: async () => {
        closing = true
        await transport.close()
      },
    }
  }
}

const manager = new PiMcpClientManager()

function createPiMcpToolDefinition(binding: McpToolBinding): ToolDefinition {
  const toolName = mcpToolName(binding.serverName, binding.originalToolName)
  const description = binding.tool.description || `Call MCP tool ${binding.originalToolName} from server ${binding.serverName}`

  return {
    name: toolName,
    label: toolName,
    description,
    promptSnippet: `${toolName}: ${description}`,
    parameters: toTypeBoxSchema(binding.tool.inputSchema),
    async execute(_toolCallId, params, signal) {
      const args = isObjectSchema(params) ? params as Record<string, unknown> : {}
      const result = await binding.manager.callTool(
        binding.serverName,
        binding.managerConfig,
        binding.originalToolName,
        args,
        signal,
        binding.scopeId,
      )
      const errorMessage = mcpToolErrorMessage(result)
      // Prime AgentTool 契约要求失败必须 throw；把 isError 只塞进 details 会被
      // agent-loop 固定标成成功，进而让模型与 continual-refine 都误判。
      if (errorMessage) throw new Error(errorMessage)
      return convertMcpResult(result)
    },
  } as ToolDefinition
}

/**
 * 将 Proma 已构建的 MCP server 配置转换为 Pi customTools。
 *
 * 注意：本函数仅供 Pi runtime 使用；Claude runtime 仍直接把 mcpServers 交给
 * Claude Agent SDK，不经过这里。
 */
export async function buildPiMcpTools(mcpServers: PiMcpServers, scopeId?: string): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = []
  const seenToolNames = new Set<string>()
  if (scopeId) manager.activateScope(scopeId)

  // 并行连接所有 MCP 服务器，避免串行等待导致启动慢
  const entries = Object.entries(mcpServers).filter(([, rawConfig]) => {
    const type = (rawConfig as PiMcpServerConfig).type
    return type === 'stdio' || type === 'http' || type === 'sse'
  })

  const results = await Promise.allSettled(
    entries.map(async ([serverName, rawConfig]) => {
      const config = rawConfig as PiMcpServerConfig
      const mcpTools = config.required === false
        ? await listOptionalMcpTools(manager, serverName, config, scopeId)
        : await manager.listTools(serverName, config, scopeId)
      if (!mcpTools) {
        console.info(`[Pi MCP] 可选 MCP 服务器 ${serverName} 尚在后台启动，本回合跳过`)
        return { serverName, config, mcpTools: [] }
      }
      return { serverName, config, mcpTools }
    }),
  )

  const requiredFailures: string[] = []
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      const entry = entries[index]
      if (!entry) continue
      const [serverName, rawConfig] = entry
      if ((rawConfig as PiMcpServerConfig).required !== false) {
        const detail = result.reason instanceof Error ? result.reason.message : String(result.reason)
        requiredFailures.push(`${serverName}: ${detail}`)
      } else {
        console.warn(`[Pi MCP] 可选 MCP 服务器 ${serverName} 连接失败，已跳过:`, result.reason)
      }
      continue
    }
    const { serverName, config, mcpTools } = result.value
    for (const tool of mcpTools) {
      const piToolName = mcpToolName(serverName, tool.name)
      if (seenToolNames.has(piToolName)) {
        console.warn(`[Pi MCP] 工具名冲突 ${piToolName}，已跳过 ${serverName}/${tool.name}`)
        continue
      }
      seenToolNames.add(piToolName)
      tools.push(createPiMcpToolDefinition({
        serverName,
        originalToolName: tool.name,
        tool,
        manager,
        managerConfig: config,
        scopeId,
      }))
    }
  }

  if (requiredFailures.length > 0) {
    throw new Error(`必需 MCP 服务器启动失败：${requiredFailures.join('; ')}`)
  }

  if (tools.length > 0) {
    console.log(`[Pi MCP] 已桥接 ${tools.length} 个用户 MCP 工具到 Pi customTools`)
  }

  return tools
}

/**
 * 关闭所有 MCP 连接。应在 app quit 时调用以清理 stdio 子进程。
 */
export async function disposePiMcpConnections(): Promise<void> {
  await manager.dispose()
}

/** 关闭某次 Agent 运行独占、且不再被其他运行引用的 MCP 连接。 */
export async function disposePiMcpScope(scopeId: string): Promise<void> {
  await manager.disposeScope(scopeId)
}
