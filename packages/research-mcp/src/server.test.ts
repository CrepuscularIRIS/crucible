/**
 * MCP server 全链路测试：经 InMemoryTransport 以真实 MCP 客户端调用工具，
 * 覆盖诚实路径的结构拒绝（约束 1/2/4/5）与重算一致性。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from './server'

let client: Client
let researchCwd: string

beforeAll(async () => {
  researchCwd = mkdtempSync(join(tmpdir(), 'proma-research-mcp-'))
  process.env.PROMA_RESEARCH_CWD = researchCwd
  client = new Client({ name: 'test-client', version: '1.0.0' })
  const server = buildServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
})

afterAll(() => {
  rmSync(researchCwd, { recursive: true, force: true })
  delete process.env.PROMA_RESEARCH_CWD
})

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args })
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  if (result.isError) {
    throw new Error(content.map((c) => c.text ?? '').join(''))
  }
  return content.map((c) => c.text ?? '').join('')
}

const spec = {
  pid: 'P1',
  question: 'H1 还是 H2？',
  evalCommand: 'echo \'{"metric":{"accuracy":0.83}}\'',
  metricKind: 'json' as const,
  metricSpec: 'metric.accuracy',
  bands: { H1: [0.8, 1.0], H2: [0.0, 0.6] },
  branches: [
    { band: [0.8, 1.0] as const, action: 'support' as const, target: 'H1' },
    { band: [0.8, 1.0] as const, action: 'kill' as const, target: 'H2' },
    { band: [0.0, 0.6] as const, action: 'kill' as const, target: 'H1' },
  ],
}

describe('诚实路径：init → 登记 → 预登记 → 执行 → 终态 → graveyard', () => {
  it('完整走通且 graveyard 可见（约束 5）', async () => {
    await callTool('research_init', { run: 'honest' })
    await callTool('claim_propose', { run: 'honest', id: 'H1', statement: '加入特征 X 提升 accuracy', predicts: ['accuracy 升到 0.8+'] })
    await callTool('claim_propose', { run: 'honest', id: 'H2', statement: '特征 X 无效', predicts: ['accuracy 不变或降'] })

    const stateText = await callTool('research_state', { run: 'honest' })
    expect(stateText).toContain('H1')
    expect(stateText).toContain('"graveyard": []')

    await callTool('prereg_write', { run: 'honest', spec })
    const runResult = await callTool('probe_run', { run: 'honest', pid: 'P1' })
    expect(runResult).toContain('重算指标 = 0.83')

    await callTool('claim_transition', { run: 'honest', id: 'H2', to: 'REFUTED', byProbe: 'P1', note: '观测落在 H1 频段' })

    const finalState = JSON.parse(await callTool('research_state', { run: 'honest' })) as {
      claims: Array<{ id: string; state: string }>
      graveyard: Array<{ id: string }>
    }
    expect(finalState.claims.find((c) => c.id === 'H2')?.state).toBe('REFUTED')
    expect(finalState.graveyard.some((c) => c.id === 'H2')).toBe(true)
  })

  it('metric_recompute 与落地值一致（约束 3）', async () => {
    const text = await callTool('metric_recompute', { run: 'honest', pid: 'P1' })
    expect(JSON.parse(text).metric).toBe(0.83)
  })

  it('attack_record 记录 typed 对抗证据', async () => {
    const text = await callTool('attack_record', {
      run: 'honest',
      target: 'H1',
      kind: 'new_h',
      text: '可能不是 X 的功劳，而是随机种子方差',
    })
    expect(text).toMatch(/G\d+ 已记录/)
  })
})

describe('结构拒绝', () => {
  it('约束 1：全重叠频段的探针被拒绝', async () => {
    await callTool('research_init', { run: 'refuse' })
    await callTool('claim_propose', { run: 'refuse', id: 'H1', statement: 'A', predicts: ['x 升'] })
    await callTool('claim_propose', { run: 'refuse', id: 'H2', statement: 'B', predicts: ['x 平'] })
    await expect(callTool('prereg_write', {
      run: 'refuse',
      spec: { ...spec, bands: { H1: [0, 0.9], H2: [0.1, 1] } },
    })).rejects.toThrow(/装饰性/)
  })

  it('约束 2：没有预登记的探针不能执行', async () => {
    await expect(callTool('probe_run', { run: 'refuse', pid: 'P9' })).rejects.toThrow(/不存在或状态不允许/)
  })

  it('约束 2：预登记文件被改动后 sha256 不符，执行被拒绝', async () => {
    await callTool('prereg_write', { run: 'refuse', spec: { ...spec, bands: { H1: [0.8, 1.0], H2: [0.0, 0.6] } } })
    const preregFile = join(researchCwd, '.proma-research', 'refuse', 'prereg', 'P1.json')
    writeFileSync(preregFile, JSON.stringify({ ...spec, evalCommand: 'echo tampered' }, null, 2))
    await expect(callTool('probe_run', { run: 'refuse', pid: 'P1' })).rejects.toThrow(/sha256 不符/)
  })

  it('约束 4：终态迁移点名未落地的探针被拒绝', async () => {
    await expect(callTool('claim_transition', { run: 'refuse', id: 'H1', to: 'REFUTED', byProbe: 'P1' }))
      .rejects.toThrow(/已落地/)
  })

  it('可判别性：predicts 是 LIVE 假设子集的新假设被拒绝', async () => {
    await expect(callTool('claim_propose', { run: 'refuse', id: 'H3', statement: 'A′', predicts: ['x 升'] }))
      .rejects.toThrow(/不可判别/)
  })

  it('非零退出的探针不予落地', async () => {
    await callTool('prereg_write', {
      run: 'refuse',
      spec: {
        ...spec,
        pid: 'P2',
        evalCommand: 'echo \'{"metric":{"accuracy":0.9}}\'; exit 3',
        bands: { H1: [0.8, 1.0], H2: [0.0, 0.6] },
      },
    })
    await expect(callTool('probe_run', { run: 'refuse', pid: 'P2' })).rejects.toThrow(/不予落地/)
  })
})
