/**
 * P3.4 证据 5：MCP 首轮即可用。
 * 正向：startup_timeout_sec=30 时，1.5s 冷启动的 stdio server 在**第一次**
 * buildPiMcpTools 调用里就列出工具（修复前是与硬编码 500ms 赛跑必输）。
 * 反向：startup_timeout_sec=1（窗口 < 冷启动时间）→ 本回合拿不到工具但不清算。
 */

import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import { buildPiMcpTools, disposePiMcpConnections } from './pi-mcp-tools'

const fixture = join(import.meta.dir, '__fixtures__', 'slow-mcp-server.ts')

describe('P3.4 证据 5：MCP 首轮可用', () => {
  it('正向：冷启动 1.5s 的 server 在首轮即被列出（30s 窗口）', async () => {
    const tools = await buildPiMcpTools({
      'slow-ok': {
        type: 'stdio',
        command: 'bun',
        args: [fixture],
        required: false,
        startup_timeout_sec: 30,
        timeout: 30,
      },
    })
    expect(tools.map((t) => t.name)).toContain('mcp__slow_ok__slow_tool')
    await disposePiMcpConnections()
  }, 60_000)

  it('反向：窗口 1s < 冷启动 1.5s → 首轮拿不到工具（按可选项跳过，不报错）', async () => {
    const tools = await buildPiMcpTools({
      'slow-miss': {
        type: 'stdio',
        command: 'bun',
        args: [fixture],
        required: false,
        startup_timeout_sec: 1,
      },
    })
    expect(tools.map((t) => t.name)).not.toContain('mcp__slow_miss__slow_tool')
    await disposePiMcpConnections()
  }, 60_000)
})
