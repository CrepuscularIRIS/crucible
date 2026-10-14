/**
 * 计量接口验收（EVAL-PLAN §1.3，P6.0）——破坏必须变红：
 * 1. journal 掌权：删除展示 ledger 不会恢复预算或 forecast；
 * 2. forecast 终局只有一次，且终局后不再开放世界查询；
 * 3. MCP 通道：info/observe/simulate/forecast 各自把事件写进 journal；
 * 4. 真值边界：info 不扩张 problem() 键，探针沙箱读 deny 路径为空。
 *
 * meter 与 neuronbench 是 Python 侧依赖（numpy）；缺失时这些用例跳过而不是假绿。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from './server'
import { detectSandboxSupply, resetSandboxSupplyCacheForTest, runSandboxedEval } from './sandbox'

const METER = fileURLToPath(new URL('../../../research/eval/world-meter.py', import.meta.url))
const NB_ROOT = process.env.NEURONBENCH_ROOT?.trim() ?? ''
const meterAvailable = NB_ROOT !== '' && existsSync(METER) && existsSync(join(NB_ROOT, 'neuronbench', '__init__.py'))

let client: Client
let researchCwd: string
const originalDeny = process.env.PROMA_RESEARCH_DENY
const originalBudget = process.env.PROMA_EVAL_BUDGET

beforeAll(async () => {
  researchCwd = mkdtempSync(join(process.env.HOME ?? tmpdir(), 'proma-research-meter-'))
  process.env.PROMA_RESEARCH_CWD = researchCwd
  process.env.PROMA_EVAL_BUDGET = '1'
  if (NB_ROOT) process.env.PROMA_RESEARCH_DENY = NB_ROOT
  client = new Client({ name: 'meter-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([client.connect(clientTransport), buildServer().connect(serverTransport)])
})

afterAll(() => {
  rmSync(researchCwd, { recursive: true, force: true })
  delete process.env.PROMA_RESEARCH_CWD
  if (originalDeny === undefined) delete process.env.PROMA_RESEARCH_DENY
  else process.env.PROMA_RESEARCH_DENY = originalDeny
  if (originalBudget === undefined) delete process.env.PROMA_EVAL_BUDGET
  else process.env.PROMA_EVAL_BUDGET = originalBudget
})

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args })
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  if (result.isError) throw new Error(content.map((c) => c.text ?? '').join(''))
  return content.map((c) => c.text ?? '').join('')
}

function meter(ledger: string, budget: number, args: string[]) {
  return spawnSync('python3', [METER, '--ledger', ledger, '--budget', String(budget), ...args], {
    encoding: 'utf-8',
    timeout: 120_000,
  })
}

describe('计量接口（EVAL-PLAN §1.3）', () => {
  it('meter 缺少 NEURONBENCH_ROOT 时 fail closed，不使用开发机路径回退', () => {
    const env = { ...process.env }
    delete env.NEURONBENCH_ROOT
    const result = spawnSync('python3', [METER, '--help'], { encoding: 'utf-8', env })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('NEURONBENCH_ROOT 未配置')
  })

  it('DENY 未配置时 world 工具不注册，普通 research 工具仍可用', async () => {
    const configuredDeny = process.env.PROMA_RESEARCH_DENY
    delete process.env.PROMA_RESEARCH_DENY
    const isolatedClient = new Client({ name: 'missing-deny-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([isolatedClient.connect(clientTransport), buildServer().connect(serverTransport)])
      const names = (await isolatedClient.listTools()).tools.map((tool) => tool.name)
      expect(names).toContain('research_init')
      expect(names).not.toContain('world_observe')
      expect(names).not.toContain('world_simulate')
      expect(names).not.toContain('world_forecast')
    } finally {
      await isolatedClient.close()
      if (configuredDeny === undefined) delete process.env.PROMA_RESEARCH_DENY
      else process.env.PROMA_RESEARCH_DENY = configuredDeny
    }
  })

  it('PROMA_EVAL_BUDGET 非正整数时 world 工具不注册（NaN 预算会让上限恒不触发）', async () => {
    if (!process.env.PROMA_RESEARCH_DENY) return
    const configured = process.env.PROMA_EVAL_BUDGET
    process.env.PROMA_EVAL_BUDGET = '8abc'
    const isolatedClient = new Client({ name: 'bad-budget-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([isolatedClient.connect(clientTransport), buildServer().connect(serverTransport)])
      const names = (await isolatedClient.listTools()).tools.map((tool) => tool.name)
      expect(names).toContain('research_init')
      expect(names).not.toContain('world_observe')
    } finally {
      await isolatedClient.close()
      process.env.PROMA_EVAL_BUDGET = configured
    }
  })

  it.skipIf(!meterAvailable)('meter 独立记账：预算耗尽时 observe 拒绝，且报错给路由', () => {
    const ledger = join(researchCwd, 'ledger-a.jsonl')
    const first = meter(ledger, 1, ['observe', 'h_sag', '0', 'brief step (12 uA, 40 ms)', '--reps', '1'])
    expect(first.status).toBe(0)
    const over = meter(ledger, 1, ['observe', 'h_sag', '0', 'brief step (12 uA, 40 ms)', '--reps', '1'])
    expect(over.status).not.toBe(0)
    expect(over.stderr).toContain('budget exhausted')
  })

  it.skipIf(!meterAvailable)('held-out 协议：可以 simulate（预报要用），不能 observe（否则泄漏预报答案）', () => {
    // 一句话 run 审计 D10：meter 查协议时不带 world，held-out 标签 simulate 抛 KeyError，
    // agent 只能外推预报（MSE 8.99；直接模拟基线模型可到 0.61）。
    const ledger = join(researchCwd, 'ledger-heldout.jsonl')
    const info = meter(ledger, 2, ['info', 'ca_rebound', '0'])
    expect(info.status).toBe(0)
    const parsed = JSON.parse(info.stdout) as { test_protocol_labels: string[]; protocols: Array<[string, unknown]> }
    const pool = new Set(parsed.protocols.map(([label]) => label))
    // 只有不在共享池里的 held-out 标签受限；与池同名的本就公开可观测。
    const heldOut = parsed.test_protocol_labels.find((label) => !pool.has(label))!
    const plain = JSON.stringify({ extra: [], slow_na: false })
    const sim = meter(ledger, 2, ['simulate', 'ca_rebound', '0', heldOut, '--mechanism', plain, '--reps', '2'])
    expect(sim.status).toBe(0)
    expect(JSON.parse(sim.stdout).protocol_label).toBe(heldOut)
    const obs = meter(ledger, 2, ['observe', 'ca_rebound', '0', heldOut, '--reps', '1'])
    expect(obs.status).not.toBe(0)
    expect(obs.stderr).toContain('held-out')
    expect(readFileSync(ledger, 'utf-8')).not.toContain('"budget_after"')
  }, 120_000)

  it.skipIf(!meterAvailable)('meter forecast 只做确定性计算：终局唯一性由 MCP journal 负责', () => {
    const ledger = join(researchCwd, 'ledger-b.jsonl')
    const info = meter(ledger, 2, ['info', 'h_sag', '0'])
    expect(info.status).toBe(0)
    const labels = (JSON.parse(info.stdout) as { test_protocol_labels: string[] }).test_protocol_labels
    const counts = JSON.stringify(Object.fromEntries(labels.map((l) => [l, 1.0])))
    const first = meter(ledger, 2, ['forecast', 'h_sag', '0', '--counts', counts])
    expect(first.status).toBe(0)
    const second = meter(ledger, 2, ['forecast', 'h_sag', '0', '--counts', counts])
    expect(second.status).toBe(0)
    expect(JSON.parse(second.stdout)).toEqual(JSON.parse(first.stdout))
  }, 60_000)

  it.skipIf(!meterAvailable)('MCP world_simulate(info)：只返回 problem() 键，journal 独立记 world.info', async () => {
    await callTool('research_init', { run: 'meter-info' })
    const info = JSON.parse(await callTool('world_simulate', { run: 'meter-info', world: 'h_sag', seed: 0, mode: 'info' })) as Record<string, unknown>
    const problemKeysProcess = spawnSync('python3', ['-c', [
      'import json, neuronbench as nb',
      'print(json.dumps(sorted(nb.load_world("h_sag", seed=0).problem().keys())))',
    ].join('; ')], {
      encoding: 'utf-8',
      env: { ...process.env, PYTHONPATH: NB_ROOT },
    })
    expect(problemKeysProcess.status).toBe(0)
    const problemKeys = new Set(JSON.parse(problemKeysProcess.stdout) as string[])
    expect(Object.keys(info).every((key) => problemKeys.has(key))).toBe(true)
    expect(String(info.text_prior).length).toBeGreaterThan(0)
    expect(Array.isArray(info.test_protocol_labels)).toBe(true)
    const journal = readFileSync(join(researchCwd, '.proma-research', 'meter-info', 'journal.jsonl'), 'utf-8')
    expect(journal).toContain('"op":"world.info"')
    expect(journal).not.toContain('"op":"world.simulate"')
  })

  it.skipIf(!meterAvailable)('MCP world_observe：journal 记 world.observe（cost/spike_count 入账，可对账）', async () => {
    await callTool('research_init', { run: 'meter-observe' })
    const obs = JSON.parse(await callTool('world_observe', {
      run: 'meter-observe', world: 'h_sag', seed: 0,
      protocol: 'brief step (12 uA, 40 ms)', reps: 1,
    })) as Record<string, unknown>
    expect(obs.cost).toBe(1)
    expect(typeof obs.spike_count).toBe('number')
    const journal = readFileSync(join(researchCwd, '.proma-research', 'meter-observe', 'journal.jsonl'), 'utf-8')
    expect(journal).toContain('"op":"world.observe"')
    expect(journal).toContain('"cost":1')
    expect(existsSync(join(researchCwd, '.proma-research', 'meter-observe', 'world-ledger.jsonl'))).toBe(true)
  })

  it.skipIf(!meterAvailable)('MCP 预算以 journal 为准：删除展示 ledger 后预算不会恢复', async () => {
    const run = 'meter-journal-budget'
    const root = join(researchCwd, '.proma-research', run)
    await callTool('research_init', { run })
    const first = JSON.parse(await callTool('world_observe', {
      run, world: 'h_sag', seed: 0,
      protocol: 'brief step (12 uA, 40 ms)', reps: 1,
    })) as Record<string, unknown>
    expect(first.cost).toBe(1)

    rmSync(join(root, 'world-ledger.jsonl'), { force: true })
    await expect(callTool('world_observe', {
      run, world: 'h_sag', seed: 0,
      protocol: 'brief step (12 uA, 40 ms)', reps: 1,
    })).rejects.toThrow('budget exhausted')

    const events = readFileSync(join(root, 'journal.jsonl'), 'utf-8')
      .trim().split('\n').map((line) => JSON.parse(line) as { op: string })
    expect(events.filter((event) => event.op === 'world.observe')).toHaveLength(1)
  })

  it.skipIf(!meterAvailable)('MCP forecast 以 journal 为准：同 run 删除 ledger 后仍拒绝第二次终局', async () => {
    const run = 'meter-journal-forecast'
    const root = join(researchCwd, '.proma-research', run)
    await callTool('research_init', { run })
    const info = JSON.parse(await callTool('world_simulate', {
      run, world: 'h_sag', seed: 0, mode: 'info',
    })) as { test_protocol_labels: string[] }
    const counts = Object.fromEntries(info.test_protocol_labels.map((label) => [label, 1]))

    const first = JSON.parse(await callTool('world_forecast', {
      run, world: 'h_sag', seed: 0, counts,
    })) as Record<string, unknown>
    expect(typeof first.spike_forecast_mse).toBe('number')
    expect(first.next_required_action).toBe('report_declare')
    expect(first.proma_tool_name).toBe('mcp__research__report_declare')

    rmSync(join(root, 'world-ledger.jsonl'), { force: true })
    await expect(callTool('world_forecast', {
      run, world: 'h_sag', seed: 0, counts,
    })).rejects.toThrow('终局不可重复')

    const events = readFileSync(join(root, 'journal.jsonl'), 'utf-8')
      .trim().split('\n').map((line) => JSON.parse(line) as { op: string })
    expect(events.filter((event) => event.op === 'world.forecast')).toHaveLength(1)
  }, 60_000)

  it.skipIf(!meterAvailable)('forecast 后所有 world 读取与模拟都终止，不能把评分变成迭代神谕', async () => {
    const run = 'meter-forecast-terminal'
    await callTool('research_init', { run })
    const info = JSON.parse(await callTool('world_simulate', {
      run, world: 'h_sag', seed: 0, mode: 'info',
    })) as { test_protocol_labels: string[] }
    const counts = Object.fromEntries(info.test_protocol_labels.map((label) => [label, 1]))
    await callTool('world_forecast', { run, world: 'h_sag', seed: 0, counts })

    await expect(callTool('world_simulate', {
      run, world: 'h_sag', seed: 0, mode: 'info',
    })).rejects.toThrow('终局已裁决')
    await expect(callTool('world_observe', {
      run, world: 'h_sag', seed: 0,
      protocol: 'brief step (12 uA, 40 ms)', reps: 1,
    })).rejects.toThrow('终局已裁决')
  }, 60_000)

  /** 两条可判别假设 + 一个 observe 探针预登记（测量本身即探针）。 */
  async function preregObserveProbe(run: string, pid = 'P1'): Promise<void> {
    await callTool('research_init', { run })
    await callTool('claim_propose', {
      run, id: 'H1', statement: '观测尖峰数为非负', predicts: ['spike_count ≥ 0'],
    })
    await callTool('claim_propose', {
      run, id: 'H2', statement: '观测尖峰数为负', predicts: ['spike_count < 0'],
    })
    await callTool('prereg_write', {
      run,
      spec: {
        pid,
        question: '真实观测的 spike_count 是否非负？',
        observe: { world: 'h_sag', seed: 0, protocol: 'brief step (12 uA, 40 ms)', reps: 1 },
        metricKind: 'json',
        metricSpec: 'spike_count',
        bands: { H1: [0, 1000], H2: [-1000, -0.001] },
        branches: [
          { band: [0, 1000], action: 'support', target: 'H1' },
          { band: [0, 1000], action: 'kill', target: 'H2' },
          { band: [-1000, -0.001], action: 'kill', target: 'H1' },
        ],
      },
    })
  }

  function journalOf(run: string): Array<Record<string, unknown>> {
    return readFileSync(join(researchCwd, '.proma-research', run, 'journal.jsonl'), 'utf-8')
      .trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
  }

  it.skipIf(!meterAvailable)('单 world 后端冒烟：prereg(observe) → probe_run 真实计量 → transition → declare 三 gate 全绿', async () => {
    const run = 'meter-e1-smoke'
    const root = join(researchCwd, '.proma-research', run)
    await preregObserveProbe(run)
    const probeText = await callTool('probe_run', { run, pid: 'P1' })
    const metric = Number(probeText.match(/重算指标 = (-?[0-9.]+)/)?.[1])
    expect(Number.isFinite(metric)).toBe(true)
    // 指标就是这次计量本身：journal 里同一 pid 的 world.observe 与落地值一致，且扣了预算
    const observed = journalOf(run).filter((e) => e.op === 'world.observe')
    expect(observed).toHaveLength(1)
    expect(observed[0].pid).toBe('P1')
    expect(observed[0].cost).toBe(1)
    expect(Number(observed[0].spike_count)).toBe(metric)
    await callTool('claim_transition', {
      run, id: 'H2', to: 'REFUTED', byProbe: 'P1', note: 'P1 的真实观测为非负',
    })
    await callTool('attack_record', {
      run, target: 'H1', kind: 'constraint', text: '单次带噪观测只支持非负性，不识别具体机制',
    })
    writeFileSync(join(root, 'REPORT.md'), [
      '# 单世界后端冒烟',
      '',
      `spike_count 为 ${metric} (P1)。`,
      '',
      '- H1: LIVE',
      '- H2: REFUTED',
    ].join('\n'), 'utf-8')
    const declared = await callTool('report_declare', { run, path: 'REPORT.md' })
    expect(declared).toContain('三道 gate 全绿')
  }, 60_000)

  it.skipIf(!meterAvailable)('世界任务里 shell 探针被结构性拒绝：证据只能来自计量，不能来自回显或重读', async () => {
    const run = 'meter-shell-probe'
    await callTool('research_init', { run })
    await callTool('claim_propose', { run, id: 'H1', statement: 'a', predicts: ['spike_count ≥ 0'] })
    await callTool('claim_propose', { run, id: 'H2', statement: 'b', predicts: ['spike_count < 0'] })
    await expect(callTool('prereg_write', {
      run,
      spec: {
        pid: 'P1',
        question: 'demo2r 第二轮的写法',
        evalCommand: 'python3 -c "import json; print(json.dumps({\'spike_count\': 40.0}))"',
        metricKind: 'json',
        metricSpec: 'spike_count',
        bands: { H1: [36, 44], H2: [-10, -1] },
        branches: [{ band: [-10, -1], action: 'kill', target: 'H1' }],
      },
    })).rejects.toThrow('observe')
    expect(journalOf(run).some((e) => e.op === 'prereg.write')).toBe(false)
  })

  it.skipIf(!meterAvailable)('已观测过的格子不能再登记：同 (world,seed,protocol) 的计量是确定性的，先看后登记就是回忆', async () => {
    const run = 'meter-observed-cell'
    await callTool('research_init', { run })
    await callTool('claim_propose', { run, id: 'H1', statement: 'a', predicts: ['spike_count ≥ 0'] })
    await callTool('claim_propose', { run, id: 'H2', statement: 'b', predicts: ['spike_count < 0'] })
    const spec = (protocol: string, pid: string) => ({
      pid, question: 'q', observe: { world: 'h_sag', seed: 0, protocol, reps: 1 },
      metricKind: 'json', metricSpec: 'spike_count',
      bands: { H1: [0, 1000], H2: [-1000, -0.001] },
      branches: [{ band: [-1000, -0.001], action: 'kill', target: 'H1' }],
    })
    // 从未观测的协议可以登记（测试预算为 1，先登记再观测别的格子）
    await callTool('prereg_write', { run, spec: spec('long step (10 uA, 300 ms)', 'P2') })
    await callTool('world_observe', { run, world: 'h_sag', seed: 0, protocol: 'brief step (12 uA, 40 ms)', reps: 1 })
    await expect(callTool('prereg_write', { run, spec: spec('brief step (12 uA, 40 ms)', 'P1') })).rejects.toThrow('已观测')
  })

  it.skipIf(!meterAvailable)('一个格子只能有一个预登记，且登记后不能再被自由观测：杜绝多份矛盾登记后挑着跑', async () => {
    const run = 'meter-cell-lock'
    await callTool('research_init', { run })
    await callTool('claim_propose', { run, id: 'H1', statement: 'a', predicts: ['spike_count ≥ 0'] })
    await callTool('claim_propose', { run, id: 'H2', statement: 'b', predicts: ['spike_count < 0'] })
    const spec = (pid: string, reps: number) => ({
      pid, question: 'q', observe: { world: 'h_sag', seed: 0, protocol: 'brief step (12 uA, 40 ms)', reps },
      metricKind: 'json', metricSpec: 'spike_count',
      bands: { H1: [0, 1000], H2: [-1000, -0.001] },
      branches: [{ band: [-1000, -0.001], action: 'kill', target: 'H1' }],
    })
    await callTool('prereg_write', { run, spec: spec('P1', 1) })
    await expect(callTool('prereg_write', { run, spec: spec('P2', 2) })).rejects.toThrow('已有预登记')
    await expect(callTool('world_observe', {
      run, world: 'h_sag', seed: 0, protocol: 'brief step (12 uA, 40 ms)', reps: 1,
    })).rejects.toThrow('已有预登记')
  })

  it.skipIf(!meterAvailable)('reps 超过剩余预算的 observe 登记直接拒绝，不白占格子', async () => {
    const run = 'meter-prereg-over-budget'
    await callTool('research_init', { run })
    await callTool('claim_propose', { run, id: 'H1', statement: 'a', predicts: ['spike_count ≥ 0'] })
    await callTool('claim_propose', { run, id: 'H2', statement: 'b', predicts: ['spike_count < 0'] })
    await expect(callTool('prereg_write', {
      run,
      spec: {
        pid: 'P1', question: 'q', observe: { world: 'h_sag', seed: 0, protocol: 'brief step (12 uA, 40 ms)', reps: 5 },
        metricKind: 'json', metricSpec: 'spike_count',
        bands: { H1: [0, 1000], H2: [-1000, -0.001] },
        branches: [{ band: [-1000, -0.001], action: 'kill', target: 'H1' }],
      },
    })).rejects.toThrow('budget')
  })

  it.skipIf(!meterAvailable)('meter 没测成（未入账观测）的 FAILED 探针不锁格子：可换新 pid 重新登记', async () => {
    const configuredMeter = process.env.PROMA_EVAL_METER
    const brokenMeter = join(researchCwd, 'broken-meter.py')
    writeFileSync(brokenMeter, 'import sys\nsys.exit(3)\n')
    process.env.PROMA_EVAL_METER = brokenMeter
    const isolatedClient = new Client({ name: 'broken-meter', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([isolatedClient.connect(clientTransport), buildServer().connect(serverTransport)])
      const call = async (name: string, args: Record<string, unknown>) => {
        const result = await isolatedClient.callTool({ name, arguments: args })
        const text = ((result.content ?? []) as Array<{ text?: string }>).map((c) => c.text ?? '').join('')
        if (result.isError) throw new Error(text)
        return text
      }
      const run = 'meter-broken-release'
      await call('research_init', { run })
      await call('claim_propose', { run, id: 'H1', statement: 'a', predicts: ['spike_count ≥ 0'] })
      await call('claim_propose', { run, id: 'H2', statement: 'b', predicts: ['spike_count < 0'] })
      const spec = (pid: string) => ({
        pid, question: 'q', observe: { world: 'h_sag', seed: 0, protocol: 'brief step (12 uA, 40 ms)', reps: 1 },
        metricKind: 'json', metricSpec: 'spike_count',
        bands: { H1: [0, 1000], H2: [-1000, -0.001] },
        branches: [{ band: [-1000, -0.001], action: 'kill', target: 'H1' }],
      })
      await call('prereg_write', { run, spec: spec('P1') })
      await expect(call('probe_run', { run, pid: 'P1' })).rejects.toThrow()
      await call('prereg_write', { run, spec: spec('P2') })
    } finally {
      await isolatedClient.close()
      if (configuredMeter === undefined) delete process.env.PROMA_EVAL_METER
      else process.env.PROMA_EVAL_METER = configuredMeter
    }
  })

  it.skipIf(!meterAvailable)('预算非法只关世界计量，不放开 shell 探针', async () => {
    const configured = process.env.PROMA_EVAL_BUDGET
    process.env.PROMA_EVAL_BUDGET = '0'
    const isolatedClient = new Client({ name: 'bad-budget-shell', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([isolatedClient.connect(clientTransport), buildServer().connect(serverTransport)])
      const call = async (name: string, args: Record<string, unknown>) => {
        const result = await isolatedClient.callTool({ name, arguments: args })
        const text = ((result.content ?? []) as Array<{ text?: string }>).map((c) => c.text ?? '').join('')
        if (result.isError) throw new Error(text)
        return text
      }
      const run = 'meter-bad-budget-shell'
      await call('research_init', { run })
      await call('claim_propose', { run, id: 'H1', statement: 'a', predicts: ['x ≥ 0'] })
      await call('claim_propose', { run, id: 'H2', statement: 'b', predicts: ['x < 0'] })
      await expect(call('prereg_write', {
        run,
        spec: {
          pid: 'P1', question: 'q', evalCommand: 'echo \'{"x":1}\'', metricKind: 'json', metricSpec: 'x',
          bands: { H1: [0, 10], H2: [-10, -1] }, branches: [{ band: [-10, -1], action: 'kill', target: 'H1' }],
        },
      })).rejects.toThrow('observe')
    } finally {
      await isolatedClient.close()
      process.env.PROMA_EVAL_BUDGET = configured
    }
  })

  it.skipIf(!meterAvailable)('observe 探针只能取 spike_count：cost/reps 是已知常量，取它们等于回显', async () => {
    const run = 'meter-metric-allowlist'
    await callTool('research_init', { run })
    await callTool('claim_propose', { run, id: 'H1', statement: 'a', predicts: ['spike_count ≥ 0'] })
    await callTool('claim_propose', { run, id: 'H2', statement: 'b', predicts: ['spike_count < 0'] })
    await expect(callTool('prereg_write', {
      run,
      spec: {
        pid: 'P1', question: 'q', observe: { world: 'h_sag', seed: 0, protocol: 'brief step (12 uA, 40 ms)', reps: 1 },
        metricKind: 'json', metricSpec: 'cost',
        bands: { H1: [0.5, 1.5], H2: [5, 6] },
        branches: [{ band: [5, 6], action: 'kill', target: 'H1' }],
      },
    })).rejects.toThrow('spike_count')
  })

  it.skipIf(!meterAvailable)('observe 探针与 world_observe 共用一份预算：耗尽后 probe_run 拒绝且不扣费', async () => {
    const run = 'meter-probe-budget'
    await preregObserveProbe(run)
    // 测试预算为 1：在另一个格子上先用掉（已登记的格子不许自由观测）
    await callTool('world_observe', { run, world: 'h_sag', seed: 0, protocol: 'long step (10 uA, 300 ms)', reps: 1 })
    await expect(callTool('probe_run', { run, pid: 'P1' })).rejects.toThrow('budget exhausted')
    expect(journalOf(run).filter((e) => e.op === 'world.observe')).toHaveLength(1)
  })

  it.skipIf(!meterAvailable)('forecast 之后 observe 探针不可再执行：预登记不能排在终局评分之后补跑', async () => {
    const run = 'meter-probe-after-forecast'
    await preregObserveProbe(run)
    const info = JSON.parse(await callTool('world_simulate', { run, world: 'h_sag', seed: 0, mode: 'info' })) as { test_protocol_labels: string[] }
    const counts = Object.fromEntries(info.test_protocol_labels.map((label) => [label, 1]))
    await callTool('world_forecast', { run, world: 'h_sag', seed: 0, counts })
    await expect(callTool('probe_run', { run, pid: 'P1' })).rejects.toThrow('终局已裁决')
  }, 60_000)

  it.skipIf(!meterAvailable)('报告可以引用终局误差：标 (F) 且与 journal 一致才放行', async () => {
    const run = 'meter-cite-forecast'
    const root = join(researchCwd, '.proma-research', run)
    await preregObserveProbe(run)
    const probeText = await callTool('probe_run', { run, pid: 'P1' })
    const metric = Number(probeText.match(/重算指标 = (-?[0-9.]+)/)?.[1])
    await callTool('claim_transition', { run, id: 'H2', to: 'REFUTED', byProbe: 'P1', note: '非负' })
    await callTool('attack_record', { run, target: 'H1', kind: 'constraint', text: '单次观测' })
    const info = JSON.parse(await callTool('world_simulate', { run, world: 'h_sag', seed: 0, mode: 'info' })) as { test_protocol_labels: string[] }
    const counts = Object.fromEntries(info.test_protocol_labels.map((label) => [label, 1]))
    const mse = Number((JSON.parse(await callTool('world_forecast', { run, world: 'h_sag', seed: 0, counts })) as Record<string, unknown>).spike_forecast_mse)
    const report = (cited: string) => [
      '# 引用终局误差', '', `spike_count 为 ${metric} (P1)。`, `终局预报误差为 ${cited} (F)。`, '', '- H1: LIVE', '- H2: REFUTED',
    ].join('\n')

    writeFileSync(join(root, 'REPORT.md'), report((mse + 1).toFixed(3)), 'utf-8')
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow('(F)')

    // 同一行的 (F) 不能替别的裸小数背书
    writeFileSync(join(root, 'REPORT.md'), report(`${mse.toFixed(3)} (F)，准确率 0.91 也`).replace(' (F)。', '。'), 'utf-8')
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow('0.91')

    writeFileSync(join(root, 'REPORT.md'), report(mse.toFixed(3)), 'utf-8')
    expect(await callTool('report_declare', { run, path: 'REPORT.md' })).toContain('三道 gate 全绿')
  }, 60_000)

  it.skipIf(!detectSandboxSupply().available)('真值不可达：PROMA_RESEARCH_DENY 后沙箱内读被禁文件为空', async () => {
    // 秘密文件必须放在 /tmp 之外——沙箱的 tmpfs /tmp 会遮蔽 /tmp 下的父目录
    const secretDir = mkdtempSync(join(process.env.HOME ?? researchCwd, 'proma-meter-secret-'))
    const secretPath = join(secretDir, 'truth-secret.py')
    writeFileSync(secretPath, 'TRUTH = "h_sag_carries_Ih"\n')
    process.env.PROMA_RESEARCH_DENY = secretPath
    try {
      const result = await runSandboxedEval(`cat '${secretPath}' 2>&1; echo; grep -c TRUTH '${secretPath}' 2>&1 || true`, 30_000)
      // 断言"真值不可达"而非具体退出码：文件被 /dev/null bind 后读得 Permission denied
      expect(result.text).not.toContain('h_sag_carries_Ih')
      expect(result.text).not.toMatch(/(^|\n)1(\n|$)/)
    } finally {
      process.env.PROMA_RESEARCH_DENY = NB_ROOT
      resetSandboxSupplyCacheForTest()
      rmSync(secretDir, { recursive: true, force: true })
    }
  })
})
