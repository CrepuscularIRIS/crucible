import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { runSandboxedEval } from '../../../packages/research-mcp/src/sandbox'

const entry = process.env.PROMA_RESEARCH_MCP_ENTRY
const denyRoot = process.env.PROMA_RESEARCH_DENY
if (!entry) throw new Error('PROMA_RESEARCH_MCP_ENTRY 未配置')
if (!denyRoot) throw new Error('PROMA_RESEARCH_DENY 未配置')

const transport = new StdioClientTransport({
  command: 'bun',
  args: [entry],
  env: {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    PROMA_RESEARCH_CWD: '/workspace/docker-prereq-smoke',
    PROMA_RESEARCH_DENY: denyRoot,
    ...(process.env.NEURONBENCH_ROOT && { NEURONBENCH_ROOT: process.env.NEURONBENCH_ROOT }),
    ...(process.env.PROMA_RESEARCH_RUN && { PROMA_RESEARCH_RUN: process.env.PROMA_RESEARCH_RUN }),
  },
  stderr: 'inherit',
})
const client = new Client({ name: 'proma-docker-prereq-smoke', version: '1.0.0' })

try {
  await client.connect(transport)
  const listed = await client.listTools()
  const toolNames = new Set(listed.tools.map((tool) => tool.name))
  for (const requiredTool of ['research_init', 'research_state', 'world_simulate', 'world_observe']) {
    if (!toolNames.has(requiredTool)) throw new Error(`Research MCP 缺少工具 ${requiredTool}`)
  }

  const sandbox = await runSandboxedEval(`test ! -e '${denyRoot}/pyproject.toml'`)
  if (sandbox.exitCode !== 0 || sandbox.timedOut || sandbox.attestation.engine !== 'bubblewrap') {
    throw new Error(`bubblewrap 隔离冒烟失败: ${JSON.stringify(sandbox)}`)
  }
  if (!sandbox.attestation.isolation.includes('--tmpfs') || !sandbox.attestation.isolation.includes(denyRoot)) {
    throw new Error('bubblewrap attestation 未隐藏 benchmark 真值树')
  }

  console.log(JSON.stringify({
    mcpTools: listed.tools.length,
    requiredTools: ['research_init', 'research_state', 'world_simulate', 'world_observe'],
    sandboxEngine: sandbox.attestation.engine,
    denyRootHidden: true,
  }))
} finally {
  await client.close()
}
