import { describe, expect, it } from 'bun:test'
import {
  MANAGED_RESEARCH_MCP_NAME,
  buildManagedResearchMcpServer,
  listManagedResearchMcpCapability,
  mergeManagedResearchMcpServer,
} from './managed-research-mcp'

describe('受管 Research MCP', () => {
  it('未配置入口时不注入，保持普通桌面安装行为不变', () => {
    expect(buildManagedResearchMcpServer('/workspace/session', {})).toBeUndefined()
    expect(listManagedResearchMcpCapability({})).toBeUndefined()
  })

  it('配置入口后固定当前 cwd，并透传评测隔离所需环境', () => {
    const server = buildManagedResearchMcpServer('/workspace/session-a', {
      PATH: '/usr/local/bin:/usr/bin',
      PROMA_RESEARCH_MCP_ENTRY: '/crucible/packages/research-mcp/src/server.ts',
      PROMA_RESEARCH_DENY: '/bench/neuronbench',
      NEURONBENCH_ROOT: '/bench/neuronbench',
    })

    expect(MANAGED_RESEARCH_MCP_NAME).toBe('research')
    expect(server).toEqual({
      type: 'stdio',
      command: 'bun',
      args: ['/crucible/packages/research-mcp/src/server.ts'],
      env: {
        PATH: '/usr/local/bin:/usr/bin',
        PROMA_RESEARCH_CWD: '/workspace/session-a',
        PROMA_RESEARCH_DENY: '/bench/neuronbench',
        NEURONBENCH_ROOT: '/bench/neuronbench',
      },
      required: true,
      startup_timeout_sec: 30,
    })
  })

  it('允许显式覆盖命令、run 与启动超时，但不把空白变量注入子进程', () => {
    const server = buildManagedResearchMcpServer('/workspace/session-b', {
      PROMA_RESEARCH_MCP_ENTRY: ' /runtime/research-server.js ',
      PROMA_RESEARCH_MCP_COMMAND: ' node ',
      PROMA_RESEARCH_MCP_TIMEOUT_SEC: '45',
      PROMA_RESEARCH_RUN: ' eval-run ',
      PROMA_RESEARCH_DENY: '   ',
    })

    expect(server).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['/runtime/research-server.js'],
      env: {
        PROMA_RESEARCH_CWD: '/workspace/session-b',
        PROMA_RESEARCH_RUN: 'eval-run',
      },
      required: true,
      startup_timeout_sec: 45,
    })
  })

  it('能力摘要让新工作区立即看见受管 MCP，但不泄露运行机路径', () => {
    expect(listManagedResearchMcpCapability({
      PROMA_RESEARCH_MCP_ENTRY: '/private/runtime/research-server.ts',
    })).toEqual({
      name: 'research',
      enabled: true,
      type: 'stdio',
    })
  })

  it('受管服务器覆盖同名工作区配置，隔离边界不能被用户配置旁路', () => {
    const servers = {
      research: { type: 'stdio', command: 'unsafe-server' },
      ordinary: { type: 'http', url: 'https://example.test/mcp' },
    }

    expect(mergeManagedResearchMcpServer(servers, '/workspace/safe', {
      PROMA_RESEARCH_MCP_ENTRY: '/runtime/research-server.ts',
    })).toEqual({
      research: expect.objectContaining({
        command: 'bun',
        args: ['/runtime/research-server.ts'],
        env: { PROMA_RESEARCH_CWD: '/workspace/safe' },
      }),
      ordinary: { type: 'http', url: 'https://example.test/mcp' },
    })
  })
})
