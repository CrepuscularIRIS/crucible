/**
 * 全绿集成测试（旧实现最贵教训的直接产物）。
 *
 * 旧的 10 个 gate 测试每个只跑一道、各自全绿，把三处 gate 间矛盾全藏住了
 * （review 要求每个 claim 有结论行，reconcile 又拒绝任何无 artifact 的引用
 * ——存在未检验 LIVE 假设时报告在数学上无解）。
 *
 * 本文件断言两件事：
 * 1. 一份**诚实且含未检验 LIVE 假设**的产物，三道 gate 同时通过；
 * 2. 四种蓄意破坏分别让对应的 gate 变红（不会变红的检查等于不存在）。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '../src/server'
import { runPreregGate } from './prereg'
import { runReconcileGate } from './reconcile'
import { runTraceGate } from './trace'

let researchCwd: string
let client: Client

beforeAll(async () => {
  researchCwd = mkdtempSync(join(tmpdir(), 'proma-research-gates-'))
  process.env.PROMA_RESEARCH_CWD = researchCwd
  client = new Client({ name: 'gate-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([
    client.connect(clientTransport),
    buildServer().connect(serverTransport),
  ])
})

afterAll(() => {
  rmSync(researchCwd, { recursive: true, force: true })
  delete process.env.PROMA_RESEARCH_CWD
})

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args })
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  if (result.isError) throw new Error(content.map((c) => c.text ?? '').join(''))
  return content.map((c) => c.text ?? '').join('')
}

const HONEST_REPORT = [
  '# 实验 1 报告',
  '',
  'accuracy 达到 0.83 (P1)，落在 H1 预登记频段 [0.8, 1.0] 内。',
  '据此 H2（特征 X 无效）被否证；H1 得到一次支持。',
  '',
  '## 评审',
  '- H1: LIVE',
  '- H2: REFUTED',
  '- H3: LIVE',
].join('\n')

/** 诚实 run：两个已检验假设 + 一个**未检验**的 LIVE 假设（F1 场景）。 */
let honestRunCounter = 0
async function buildHonestRun(): Promise<string> {
  honestRunCounter += 1
  const run = `honest-${honestRunCounter}`
  await callTool('research_init', { run })
  await callTool('claim_propose', { run, id: 'H1', statement: '特征 X 把 accuracy 推到 0.8 以上', predicts: ['accuracy ≥ 0.8'] })
  await callTool('claim_propose', { run, id: 'H2', statement: '特征 X 无效', predicts: ['accuracy ≤ 0.6'] })
  await callTool('claim_propose', { run, id: 'H3', statement: '特征 Y 与 X 交互后效果更强', predicts: ['交互项为正'] })
  await callTool('prereg_write', {
    run,
    spec: {
      pid: 'P1',
      question: 'X 有效还是无效？',
      evalCommand: 'echo \'{"metric":{"accuracy":0.83}}\'',
      metricKind: 'json',
      metricSpec: 'metric.accuracy',
      bands: { H1: [0.8, 1.0], H2: [0.0, 0.6] },
      branches: [
        { band: [0.8, 1.0], action: 'support', target: 'H1' },
        { band: [0.8, 1.0], action: 'kill', target: 'H2' },
        { band: [0.0, 0.6], action: 'kill', target: 'H1' },
      ],
    },
  })
  await callTool('probe_run', { run, pid: 'P1' })
  await callTool('claim_transition', { run, id: 'H2', to: 'REFUTED', byProbe: 'P1', note: '观测 0.83 落在 H1 频段' })
  // P4.1 对抗义务：信念定格后对抗者看过一眼（H1 是 SUPPORTED 候补语义下的 LIVE，
  // run 级规则要求最后一次终态迁移之后有攻击）
  await callTool('attack_record', { run, target: 'H1', kind: 'constraint', text: '单探针样本，频段下界触线风险' })
  const runRoot = join(researchCwd, '.proma-research', run)
  writeFileSync(join(runRoot, 'REPORT.md'), HONEST_REPORT, 'utf-8')
  await callTool('report_declare', { run, path: 'REPORT.md' })
  return runRoot
}

describe('全绿：诚实产物（含未检验 LIVE 假设）三道 gate 同时通过', () => {
  it('prereg / reconcile / trace 全部 PASS', async () => {
    const runRoot = await buildHonestRun()
    expect(runPreregGate(runRoot).passed).toBe(true)
    expect(runReconcileGate(runRoot).passed).toBe(true)
    expect(runTraceGate(runRoot).passed).toBe(true)
  })
})

describe('反向验证：四种蓄意破坏必须变红', () => {
  it('手改 register.json（状态凭空改变）→ trace 红', async () => {
    const runRoot = await buildHonestRun()
    const registerFile = join(runRoot, 'register.json')
    const register = JSON.parse(readFileSync(registerFile, 'utf-8')) as { claims: Array<{ id: string; state: string }> }
    register.claims.find((c) => c.id === 'H1')!.state = 'SUPPORTED'
    writeFileSync(registerFile, JSON.stringify(register, null, 2), 'utf-8')
    const result = runTraceGate(runRoot)
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => /不一致/.test(f.reason))).toBe(true)
  })

  it('报告幻觉数字（0.97 冒充 0.83）→ declare 拒绝 + 独立 gate 红', async () => {
    const runRoot = await buildHonestRun()
    const run = runRoot.split('/').pop()!
    const report = join(runRoot, 'REPORT.md')
    writeFileSync(report, HONEST_REPORT.replace('0.83', '0.97'), 'utf-8')
    // P3.2 后重新声明会当庭被拒（对账本身变红）
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow(/幻觉数字/)
    // 已声明文件被改：独立复跑 gate 因 sha256 不符变红
    const result = runReconcileGate(runRoot)
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => /sha256 不符/.test(f.reason))).toBe(true)
  })

  it('结论行与 register 矛盾（LIVE 写成 SUPPORTED）→ declare 拒绝', async () => {
    const runRoot = await buildHonestRun()
    const run = runRoot.split('/').pop()!
    writeFileSync(join(runRoot, 'REPORT.md'), HONEST_REPORT.replace('- H1: LIVE', '- H1: SUPPORTED'), 'utf-8')
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow(/与 register 实际状态/)
  })

  it('删除预登记文件（执行失去先登记依据）→ prereg 红', async () => {
    const runRoot = await buildHonestRun()
    rmSync(join(runRoot, 'prereg', 'P1.json'))
    const result = runPreregGate(runRoot)
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => /预登记文件缺失/.test(f.reason))).toBe(true)
  })

  it('空 run（只 init 不做任何事）→ prereg 与 trace 都红', async () => {
    const emptyRoot = join(researchCwd, '.proma-research', 'empty')
    mkdirSync(emptyRoot, { recursive: true })
    await callTool('research_init', { run: 'empty' })
    expect(runPreregGate(emptyRoot).passed).toBe(false)
    expect(runTraceGate(emptyRoot).passed).toBe(false)
  })
})

describe('P3.2 declare 即裁决', () => {
  it('诚实产物 declare 成功，gate.verdict 入 journal', async () => {
    const runRoot = await buildHonestRun()
    // buildHonestRun 已 declare 过一次；再次 declare 幂等走同一裁决路径
    const text = await callTool('report_declare', { run: runRoot.split('/').pop()!, path: 'REPORT.md' })
    expect(text).toContain('三道 gate 全绿')
    const stateText = await callTool('research_state', { run: runRoot.split('/').pop()! })
    expect(stateText).toContain('gateVerdicts')
  })

  it('幻觉数字的报告 declare 被拒绝，且 journal 里不出现对它的声明', async () => {
    const runRoot = await buildHonestRun()
    const run = runRoot.split('/').pop()!
    writeFileSync(join(runRoot, 'BAD.md'), HONEST_REPORT.replace('0.83', '0.97'), 'utf-8')
    await expect(callTool('report_declare', { run, path: 'BAD.md' })).rejects.toThrow(/幻觉数字/)
    const stateText = await callTool('research_state', { run })
    expect(stateText).not.toContain('"path": "BAD.md"')
  })

  it('结论行造假的报告 declare 被拒绝', async () => {
    const runRoot = await buildHonestRun()
    const run = runRoot.split('/').pop()!
    writeFileSync(join(runRoot, 'LIE.md'), HONEST_REPORT.replace('- H1: LIVE', '- H1: SUPPORTED'), 'utf-8')
    await expect(callTool('report_declare', { run, path: 'LIE.md' })).rejects.toThrow(/与 register 实际状态/)
  })

  it('空 run 的报告 declare 被拒绝（prereg/trace 先红）', async () => {
    mkdirSync(join(researchCwd, '.proma-research', 'empty-declare'), { recursive: true })
    await callTool('research_init', { run: 'empty-declare' })
    const emptyRoot = join(researchCwd, '.proma-research', 'empty-declare')
    writeFileSync(join(emptyRoot, 'REPORT.md'), '# 空报告', 'utf-8')
    await expect(callTool('report_declare', { run: 'empty-declare', path: 'REPORT.md' }))
      .rejects.toThrow(/空 run/)
  })
})

describe('P4.1 对抗义务（破坏必须变红）', () => {
  it('SUPPORTED 无攻击 → trace 红 + declare 拒绝', async () => {
    const runRoot = await buildHonestRun()
    const run = runRoot.split('/').pop()!
    // 构造一个 SUPPORTED 且无攻击的场景：新 run，H1 支持落地后不跑 grill
    await callTool('research_init', { run: 'no-attack' })
    await callTool('claim_propose', { run: 'no-attack', id: 'H1', statement: 'A', predicts: ['x ≥ 0.8'] })
    await callTool('claim_propose', { run: 'no-attack', id: 'H2', statement: 'B', predicts: ['x ≤ 0.6'] })
    await callTool('prereg_write', {
      run: 'no-attack',
      spec: {
        pid: 'P1',
        question: 'A 还是 B？',
        evalCommand: 'echo value=0.9',
        metricKind: 'regex',
        metricSpec: 'value=([0-9.]+)',
        bands: { H1: [0.8, 1.0], H2: [0.0, 0.6] },
        branches: [
          { band: [0.8, 1.0], action: 'support', target: 'H1' },
          { band: [0.8, 1.0], action: 'kill', target: 'H2' },
        ],
      },
    })
    await callTool('probe_run', { run: 'no-attack', pid: 'P1' })
    await callTool('claim_transition', { run: 'no-attack', id: 'H1', to: 'SUPPORTED', byProbe: 'P1' })
    const noAttackRoot = join(researchCwd, '.proma-research', 'no-attack')
    const traceResult = runTraceGate(noAttackRoot)
    expect(traceResult.passed).toBe(false)
    expect(traceResult.failures.some((f) => /SUPPORTED 结论 H1/.test(f.reason))).toBe(true)
    // declare 同样拒绝（内嵌同一 trace 函数）
    writeFileSync(join(noAttackRoot, 'REPORT.md'), '# r\n\nvalue=0.9 (P1)\n\n- H1: SUPPORTED\n- H2: LIVE\n', 'utf-8')
    await expect(callTool('report_declare', { run: 'no-attack', path: 'REPORT.md' }))
      .rejects.toThrow(/对抗攻击/)
    void runRoot
    void run
  })

  it('攻击全部早于最后终态迁移 → 红（对抗者看的是草稿）', async () => {
    const runRoot = await buildHonestRun()
    const run = runRoot.split('/').pop()!
    // 再做一次终态迁移使既有攻击全部"过时"：H3 被新探针杀死
    await callTool('prereg_write', {
      run,
      spec: {
        pid: 'P2',
        question: 'H3 交互项为正？',
        evalCommand: 'echo value=0.1',
        metricKind: 'regex',
        metricSpec: 'value=([0-9.]+)',
        bands: { H1: [0.8, 1.0], H3: [0.0, 0.3] },
        branches: [{ band: [0.0, 0.3], action: 'kill', target: 'H3' }],
      },
    })
    await callTool('probe_run', { run, pid: 'P2' })
    await callTool('claim_transition', { run, id: 'H3', to: 'REFUTED', byProbe: 'P2' })
    const result = runTraceGate(runRoot)
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => /最后一次终态迁移之后没有任何对抗攻击/.test(f.reason))).toBe(true)
  })

  it('归档战役（不改 journal）在 P4.1 规则下复跑仍 3×PASS', () => {
    const archiveRoot = join(import.meta.dir, '..', '..', '..', 'research', 'campaigns', '2026-08-23-first')
    expect(runPreregGate(archiveRoot).passed).toBe(true)
    expect(runReconcileGate(archiveRoot).passed).toBe(true)
    expect(runTraceGate(archiveRoot).passed).toBe(true)
  })
})

describe('gate 间不矛盾（F1 回归锁）', () => {
  it('未检验的 LIVE 假设 H3 出现在结论行里，reconcile 依然通过', async () => {
    const runRoot = await buildHonestRun()
    const result = runReconcileGate(runRoot)
    expect(result.failures.some((f) => /H3/.test(f.reason))).toBe(false)
    expect(result.passed).toBe(true)
  })

  it('trace 会读取 world 事件：forecast 的预算快照与此前 observe 不符时变红', async () => {
    const runRoot = await buildHonestRun()
    const journalFile = join(runRoot, 'journal.jsonl')
    const forgedWorldEvent = {
      ts: new Date().toISOString(),
      op: 'world.forecast',
      world: 'h_sag',
      seed: 0,
      counts: {},
      spike_forecast_mse: 1,
      budget_spent: 99,
    }
    writeFileSync(
      journalFile,
      `${readFileSync(journalFile, 'utf-8')}${JSON.stringify(forgedWorldEvent)}\n`,
      'utf-8',
    )
    const result = runTraceGate(runRoot)
    expect(result.passed).toBe(false)
    expect(result.failures.some((failure) => /world\.forecast.*预算快照/.test(failure.reason))).toBe(true)
  })
})
