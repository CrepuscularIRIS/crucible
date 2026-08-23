import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { saveWorkspaceMcpConfigAtPath } from './agent-workspace-manager'

describe('工作区 MCP 配置', () => {
  let tempDir = ''
  let mcpPath = ''

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'proma-mcp-config-'))
    mcpPath = join(tempDir, 'mcp.json')
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('重复保存时保留上一版备份并可读回新配置', () => {
    saveWorkspaceMcpConfigAtPath(mcpPath, {
      servers: {
        research: {
          enabled: true,
          type: 'stdio',
          command: 'bun',
          args: ['/workspace/research/server.ts'],
        },
      },
    })

    saveWorkspaceMcpConfigAtPath(mcpPath, {
      servers: {
        research: {
          enabled: true,
          type: 'stdio',
          command: 'bun',
          args: ['/workspace/research/server.ts'],
          env: { PROMA_RESEARCH_DENY: '/workspace/benchmark' },
        },
      },
    })

    expect(existsSync(`${mcpPath}.bak`)).toBe(true)
    expect(existsSync(`${mcpPath}.tmp`)).toBe(false)
    expect(JSON.parse(readFileSync(`${mcpPath}.bak`, 'utf-8'))).toEqual({
      servers: {
        research: {
          enabled: true,
          type: 'stdio',
          command: 'bun',
          args: ['/workspace/research/server.ts'],
        },
      },
    })
    expect(JSON.parse(readFileSync(mcpPath, 'utf-8')).servers.research.env).toEqual({
      PROMA_RESEARCH_DENY: '/workspace/benchmark',
    })
  })
})
