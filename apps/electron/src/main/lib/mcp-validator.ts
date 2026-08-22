/**
 * MCP 服务器验证器
 *
 * "测试连接"必须真的连：起一次传输、完成 MCP 握手并 listTools，
 * 然后立即关闭。此前只做 existsSync/which/new URL 的格式检查却显示
 * 绿色"连接成功"，对用户说谎——命令在 PATH 里不代表 server 能握手。
 *
 * 超时使用条目自己的 timeout 设置（默认 10s），避免卡死设置界面。
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { normalizeMcpTransportType } from '@proma/shared'
import type { McpServerEntry } from '@proma/shared'

const DEFAULT_TEST_CONNECT_TIMEOUT_MS = 10_000

/**
 * MCP 验证结果
 */
export interface McpValidationResult {
  /** 服务器名称 */
  name: string
  /** 是否验证通过 */
  valid: boolean
  /** 失败原因（如果 valid 为 false） */
  reason?: string
  /** 连接成功时发现的工具数量 */
  toolCount?: number
}

function isCommandAvailable(command: string): boolean {
  if (command.startsWith('/') || command.startsWith('\\') || /^[A-Z]:/i.test(command)) {
    return existsSync(command)
  }
  try {
    const whichCommand = process.platform === 'win32' ? 'where' : 'which'
    execSync(`${whichCommand} ${command}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function createTestTransport(entry: McpServerEntry, type: string): Transport | undefined {
  if (type === 'stdio') {
    if (!entry.command) return undefined
    return new StdioClientTransport({
      command: entry.command,
      args: entry.args ?? [],
      env: { ...entry.env, ...(process.env.PATH ? { PATH: process.env.PATH } : {}) } as Record<string, string>,
    })
  }
  if ((type === 'http' || type === 'sse') && entry.url) {
    const url = new URL(entry.url)
    const headers = Object.fromEntries(
      Object.entries(entry.headers ?? {}).filter(([, value]) => typeof value === 'string'),
    )
    return type === 'sse'
      ? new SSEClientTransport(url, { requestInit: { headers } })
      : new StreamableHTTPClientTransport(url, { requestInit: { headers } })
  }
  return undefined
}

/**
 * 验证单个 MCP 服务器配置：真实连接一次，握手并列出工具。
 */
export async function validateMcpServer(
  name: string,
  entry: McpServerEntry,
): Promise<McpValidationResult> {
  const type = normalizeMcpTransportType((entry as { type?: unknown }).type)

  if (!type) {
    return { name, valid: false, reason: `未知的传输类型: ${String((entry as { type?: unknown }).type)}` }
  }

  // 快速失败检查（避免为一个必然失败的配置白等超时）
  if (type === 'stdio') {
    if (!entry.command) return { name, valid: false, reason: '缺少 command 字段' }
    if (!isCommandAvailable(entry.command)) {
      return { name, valid: false, reason: `命令不存在或不可执行: ${entry.command}` }
    }
  }
  if (type === 'http' || type === 'sse') {
    if (!entry.url) return { name, valid: false, reason: '缺少 url 字段' }
    try {
      new URL(entry.url)
    } catch {
      return { name, valid: false, reason: `无效的 URL 格式: ${entry.url}` }
    }
  }

  const transport = createTestTransport(entry, type)
  if (!transport) {
    return { name, valid: false, reason: `配置不完整（type=${type}）` }
  }

  const timeoutMs = Math.max(1, entry.timeout ?? 10) * 1000
  const client = new Client({ name: 'proma-mcp-validator', version: '1.0.0' })
  try {
    await client.connect(transport, { timeout: timeoutMs })
    const listed = await client.listTools(undefined, { timeout: timeoutMs })
    return { name, valid: true, toolCount: listed.tools.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { name, valid: false, reason: `连接失败: ${message}` }
  } finally {
    await client.close().catch(() => {})
  }
}
