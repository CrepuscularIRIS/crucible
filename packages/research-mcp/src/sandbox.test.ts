/**
 * P3.1 沙箱验收（四项，破坏必须变红）：
 * 1. 探针内看不到哨兵密钥变量（实测）；
 * 2. 探针写工作区 → 失败；断网 → /dev/tcp 连接失败；
 * 3. bwrap 缺失（PROMA_RESEARCH_BWRAP 指向不存在路径）→ 结构性拒绝；
 * 4. 诚实探针照常落地，指标与沙箱前一致。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from './server'
import { detectSandboxSupply, resetSandboxSupplyCacheForTest, resolveResearchDenyRoots } from './sandbox'

let researchCwd: string
let client: Client
const originalBwrap = process.env.PROMA_RESEARCH_BWRAP
const originalSentinel = process.env.PROMA_E2E_SENTINEL

beforeAll(async () => {
  researchCwd = mkdtempSync(join(tmpdir(), 'proma-research-sandbox-'))
  process.env.PROMA_RESEARCH_CWD = researchCwd
  process.env.PROMA_E2E_SENTINEL = 'sk-sentinel-must-not-leak'
  delete process.env.PROMA_RESEARCH_BWRAP
  resetSandboxSupplyCacheForTest()
  client = new Client({ name: 'sandbox-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([client.connect(clientTransport), buildServer().connect(serverTransport)])
})

afterAll(() => {
  rmSync(researchCwd, { recursive: true, force: true })
  delete process.env.PROMA_RESEARCH_CWD
  delete process.env.PROMA_E2E_SENTINEL
  if (originalBwrap !== undefined) process.env.PROMA_RESEARCH_BWRAP = originalBwrap
  resetSandboxSupplyCacheForTest()
})

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args })
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  if (result.isError) throw new Error(content.map((c) => c.text ?? '').join(''))
  return content.map((c) => c.text ?? '').join('')
}

async function setupRunWithClaims(run: string): Promise<void> {
  await callTool('research_init', { run })
  await callTool('claim_propose', { run, id: 'H1', statement: 'A', predicts: ['x ≥ 0.8'] })
  await callTool('claim_propose', { run, id: 'H2', statement: 'B', predicts: ['x ≤ 0.6'] })
}

async function preregProbe(run: string, pid: string, command: string): Promise<void> {
  await callTool('prereg_write', {
    run,
    spec: {
      pid,
      question: 'H1 还是 H2？',
      evalCommand: command,
      metricKind: 'regex',
      metricSpec: 'value=([0-9.]+)',
      bands: { H1: [0.8, 1.0], H2: [0.0, 0.6] },
      branches: [
        { band: [0.8, 1.0], action: 'support', target: 'H1' },
        { band: [0.8, 1.0], action: 'kill', target: 'H2' },
        { band: [0.0, 0.6], action: 'kill', target: 'H1' },
      ],
    },
  })
}

describe('P3.1 沙箱验收', () => {
  it('本机供给就绪（前置条件）', () => {
    const supply = detectSandboxSupply()
    expect(supply.available).toBe(true)
  })

  it('验收 1：探针内看不到哨兵密钥变量（实测）', async () => {
    await setupRunWithClaims('evidence')
    await preregProbe('evidence', 'P1', 'echo "SENTINEL=[$PROMA_E2E_SENTINEL]"; echo "value=0.9"')
    await callTool('probe_run', { run: 'evidence', pid: 'P1' })
    const raw = readFileSync(join(researchCwd, '.proma-research', 'evidence', 'probes', 'P1', 'raw', 'output.txt'), 'utf-8')
    expect(raw).toContain('SENTINEL=[]')
    expect(raw).not.toContain('sk-sentinel-must-not-leak')
  })

  it('验收 2：探针写工作区失败、断网失败（非零退出 → 不落地）', async () => {
    await setupRunWithClaims('escape')
    const workspaceMarker = join(researchCwd, 'workspace-marker.txt')
    await preregProbe('escape', 'P1', `touch ${workspaceMarker} && echo "value=0.9"`)
    await expect(callTool('probe_run', { run: 'escape', pid: 'P1' })).rejects.toThrow(/不予落地/)
    expect(existsSync(workspaceMarker)).toBe(false)

    await preregProbe('escape', 'P2', 'timeout 3 bash -c "</dev/tcp/1.1.1.1/80" && echo "value=0.9"')
    await expect(callTool('probe_run', { run: 'escape', pid: 'P2' })).rejects.toThrow(/不予落地/)
  })

  it('验收 3：bwrap 缺失 → probe_run 结构性拒绝，不回落宿主执行', async () => {
    await setupRunWithClaims('nobwrap')
    await preregProbe('nobwrap', 'P1', 'echo "value=0.9"')
    const hostMarker = join(researchCwd, 'host-marker.txt')
    writeFileSync(hostMarker, 'before')
    process.env.PROMA_RESEARCH_BWRAP = '/nonexistent/bwrap-for-test'
    resetSandboxSupplyCacheForTest()
    try {
      await expect(callTool('probe_run', { run: 'nobwrap', pid: 'P1' }))
        .rejects.toThrow(/沙箱不可用/)
      // 关键：失败路径绝不执行命令本身（宿主 marker 未被触碰的方式很难观测字符串命令，
      // 用 journal 状态佐证：探针仍停在 PREREG，probe.start 未发生）
      const stateText = await callTool('research_state', { run: 'nobwrap' })
      expect(stateText).not.toContain('"status": "RUNNING"')
    } finally {
      delete process.env.PROMA_RESEARCH_BWRAP
      resetSandboxSupplyCacheForTest()
    }
    rmSync(hostMarker)
  })

  it('验收 4：诚实探针照常落地，指标与沙箱前一致（0.83）', async () => {
    await setupRunWithClaims('honest')
    await preregProbe('honest', 'P1', 'echo \'{"metric":{"accuracy":0.83}}\' | grep -o \'0.83\' | head -1 | sed "s/^/value=/"')
    const result = await callTool('probe_run', { run: 'honest', pid: 'P1' })
    expect(result).toContain('重算指标 = 0.83')
  })

  it('沙箱内 python 可用（ro-bind 宿主解释器，中间文件写 /tmp）', async () => {
    await setupRunWithClaims('python')
    await preregProbe('python', 'P1', 'python3 -c "import tempfile, os; open(os.path.join(tempfile.gettempdir(), \'probe-ok\'), \'w\').write(\'x\'); print(\'value=0.9\')"')
    const result = await callTool('probe_run', { run: 'python', pid: 'P1' })
    expect(result).toContain('重算指标 = 0.9')
  })
})

describe('world 工具 deny 配置 fail closed', () => {
  it('缺失或空白配置都拒绝', () => {
    expect(() => resolveResearchDenyRoots({})).toThrow(/未配置/)
    expect(() => resolveResearchDenyRoots({ PROMA_RESEARCH_DENY: '   ' })).toThrow(/未配置/)
  })

  it('不存在路径拒绝', () => {
    expect(() => resolveResearchDenyRoots({
      PROMA_RESEARCH_DENY: join(researchCwd, 'missing-deny'),
      NEURONBENCH_ROOT: researchCwd,
    })).toThrow(/不存在路径/)
  })

  it('deny 未覆盖 benchmark 根时拒绝；覆盖父目录时通过', () => {
    const denyRoot = join(researchCwd, 'deny-root')
    const benchmarkRoot = join(researchCwd, 'benchmark-root')
    mkdirSync(denyRoot, { recursive: true })
    mkdirSync(benchmarkRoot, { recursive: true })
    expect(() => resolveResearchDenyRoots({
      PROMA_RESEARCH_DENY: denyRoot,
      NEURONBENCH_ROOT: benchmarkRoot,
    })).toThrow(/未覆盖/)
    expect(resolveResearchDenyRoots({
      PROMA_RESEARCH_DENY: researchCwd,
      NEURONBENCH_ROOT: benchmarkRoot,
    })).toEqual([researchCwd])
  })
})
