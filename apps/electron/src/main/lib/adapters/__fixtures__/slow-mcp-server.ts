/**
 * 测试夹具：冷启动慢的 stdio MCP server（延迟 1.5s 才完成握手），
 * 模拟 npx 拉包后 server 才可用的真实形态。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'slow-server', version: '1.0.0' }, { capabilities: { tools: {} } })
server.tool('slow_tool', '冷启动后才可见的工具', { q: z.string() }, async ({ q }) => ({
  content: [{ type: 'text', text: `echo:${q}` }],
}))

// 关键延迟：在连接前睡 1.5s，让 500ms 级的等待窗口必然超时
await new Promise((resolve) => setTimeout(resolve, 1500))
await server.connect(new StdioServerTransport())
