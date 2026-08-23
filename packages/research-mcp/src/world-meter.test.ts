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

  it.skipIf(!meterAvailable)('meter 独立记账：预算耗尽时 observe 拒绝，且报错给路由', () => {
    const ledger = join(researchCwd, 'ledger-a.jsonl')
    const first = meter(ledger, 1, ['observe', 'h_sag', '0', 'brief step (12 uA, 40 ms)', '--reps', '1'])
    expect(first.status).toBe(0)
    const over = meter(ledger, 1, ['observe', 'h_sag', '0', 'brief step (12 uA, 40 ms)', '--reps', '1'])
    expect(over.status).not.toBe(0)
    expect(over.stderr).toContain('budget exhausted')
  })

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

  it.skipIf(!meterAvailable)('单 world 后端冒烟：observe → probe → transition → report declare 三 gate 全绿', async () => {
    const run = 'meter-e1-smoke'
    const root = join(researchCwd, '.proma-research', run)
    const ledger = join(root, 'world-ledger.jsonl')
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
        pid: 'P1',
        question: '真实观测的 spike_count 是否非负？',
        evalCommand: `python3 -c 'import json; rows=[json.loads(x) for x in open(${JSON.stringify(ledger)}) if x.strip()]; print("value="+str([r for r in rows if r.get("cmd")=="observe"][-1]["spike_count"]))'`,
        metricKind: 'regex',
        metricSpec: 'value=([0-9.]+)',
        bands: { H1: [0, 1000], H2: [-1000, -0.001] },
        branches: [
          { band: [0, 1000], action: 'support', target: 'H1' },
          { band: [0, 1000], action: 'kill', target: 'H2' },
          { band: [-1000, -0.001], action: 'kill', target: 'H1' },
        ],
      },
    })
    await callTool('world_observe', {
      run, world: 'h_sag', seed: 0,
      protocol: 'brief step (12 uA, 40 ms)', reps: 1,
    })
    const probeText = await callTool('probe_run', { run, pid: 'P1' })
    const metric = Number(probeText.match(/重算指标 = (-?[0-9.]+)/)?.[1])
    expect(Number.isFinite(metric)).toBe(true)
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
