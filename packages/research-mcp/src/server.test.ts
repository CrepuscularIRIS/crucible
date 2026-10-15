/**
 * MCP server 全链路测试：经 InMemoryTransport 以真实 MCP 客户端调用工具，
 * 覆盖诚实路径的结构拒绝（约束 1/2/4/5）与重算一致性。
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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

  it('P3.3：手改 journal 后，下一个工具调用拒绝且 run 被污染（只读也不放过）', async () => {
    await callTool('research_init', { run: 'tamper' })
    await callTool('claim_propose', { run: 'tamper', id: 'H1', statement: 'A', predicts: ['x'] })
    // 会话外手改 journal（追加一行伪造的终态迁移）
    const journal = join(researchCwd, '.proma-research', 'tamper', 'journal.jsonl')
    const before = readFileSync(journal, 'utf-8')
    writeFileSync(journal, `${before}${JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', op: 'claim.transition', id: 'H1', to: 'SUPPORTED' })}\n`)
    await expect(callTool('research_state', { run: 'tamper' })).rejects.toThrow(/污染/)
    await expect(callTool('claim_propose', { run: 'tamper', id: 'H2', statement: 'B', predicts: ['y'] }))
      .rejects.toThrow(/污染/)
    // tamper 事件确实落在 journal 里（重启后 replay 可见）
    const after = readFileSync(journal, 'utf-8')
    expect(after).toContain('tamper.detected')
  })

  it('P3.5：graveyard 复活无 note 被拒绝；带证据来源的复活成功', async () => {
    // honest run 里 H2 已被 P1 REFUTED 入 graveyard
    await expect(callTool('claim_transition', { run: 'honest', id: 'H2', to: 'LIVE' }))
      .rejects.toThrow(/复活必须带 note/)
    await callTool('claim_transition', {
      run: 'honest',
      id: 'H2',
      to: 'LIVE',
      note: 'G1 指出 0.83 可能来自种子方差，需 P2 换种子复测后再判',
    })
    const stateText = await callTool('research_state', { run: 'honest' })
    expect(stateText).toContain('"id": "H2"')
  })

  it('P4.2：graveyard 非空时，登记新假设必须带 conflicts', async () => {
    // honest run 的 graveyard 已有 H1/H2 的终态记录
    await expect(callTool('claim_propose', {
      run: 'honest', id: 'H3', statement: '提升来自数据泄漏', predicts: ['打乱标签后 accuracy 仍 ≥ 0.8'],
    })).rejects.toThrow(/必须带 conflicts/)
    await callTool('claim_propose', {
      run: 'honest', id: 'H3', statement: '提升来自数据泄漏', predicts: ['打乱标签后 accuracy 仍 ≥ 0.8'],
      conflicts: 'H1 死于 P1 支持——本假设主张 P1 的观测由泄漏产生，预测打乱标签后仍复现',
    })
    const stateText = await callTool('research_state', { run: 'honest' })
    expect(stateText).toContain('"conflicts"')
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

  it('P4.3：零宽点预测频段被拒——预登记不得是观测值的回忆', async () => {
    // P4.3 实测：父 Agent 先用 Bash 预览了结果，再把频段写成 [45, 45]。三道 gate 全绿，
    // 因为违规发生在 journal 之外。零宽频段是这次违规唯一留在产物里的结构性痕迹。
    await expect(callTool('prereg_write', {
      run: 'refuse',
      spec: { ...spec, pid: 'P9', bands: { H1: [45, 45], H2: [0, 44] } },
    })).rejects.toThrow(/零宽点预测/)
    // 标定：首场诚实战役的频段（含容差 + 留出意外区）必须仍然通过
    await callTool('prereg_write', {
      run: 'refuse',
      spec: { ...spec, pid: 'P9', bands: { H1: [0.8, 1.0], H2: [0.0, 0.65] } },
    })
  })

  it('P4.3：钉死战役后，子代理开不出旁路 run', async () => {
    // P4.3 实测：grill 子代理继承了可写 MCP，自行 research_init 出一个旁路战役并在里面跑探针。
    process.env.PROMA_RESEARCH_RUN = 'honest'
    try {
      await expect(callTool('research_init', { run: 'packages-research-mcp-tests' }))
        .rejects.toThrow(/已钉死战役/)
      await expect(callTool('research_state', { run: 'refuse' }))
        .rejects.toThrow(/已钉死战役/)
      await callTool('research_init', { run: 'honest' })
    } finally {
      delete process.env.PROMA_RESEARCH_RUN
    }
  })

  it('P4.3：provenance 记录沙箱见证，审阅者读产物即可判断探针确实隔离执行', async () => {
    const provenance = JSON.parse(
      readFileSync(join(researchCwd, '.proma-research', 'honest', 'probes', 'P1', 'provenance.json'), 'utf-8'),
    ) as { sandbox?: { engine: string; binary: string; isolation: string[] } }
    expect(provenance.sandbox?.engine).toBe('bubblewrap')
    expect(provenance.sandbox?.isolation).toContain('--unshare-net')
    expect(provenance.sandbox?.isolation).toContain('--clearenv')
  })

  it('崩溃探针 replay 为 FAILED，不能冒充 LANDED 依据终态迁移', async () => {
    // 上一条测试里 P2 已崩溃（exit 3，stdout 里却有合法 metric——正是伪造素材）。
    // 若 replay 把它记成 LANDED（metric null → 0），kill 频段含 0 时即可拿崩溃杀 claim。
    const stateText = await callTool('research_state', { run: 'refuse' })
    expect(stateText).toContain('"status": "FAILED"')
    expect(stateText).not.toContain('"status": "LANDED"')
    await expect(callTool('claim_transition', { run: 'refuse', id: 'H2', to: 'REFUTED', byProbe: 'P2' }))
      .rejects.toThrow(/已落地/)
  })
})

describe('SUPPORTED 被挑战（GLM ca-rebound-s0 §5）', () => {
  it('SUPPORTED + LIVE 的判别探针可预登记；落地后 SUPPORTED → REFUTED', async () => {
    const run = 'challenge'
    await callTool('research_init', { run })
    await callTool('claim_propose', { run, id: 'H1', statement: '加入特征 X 提升 accuracy', predicts: ['accuracy 升到 0.8+'] })
    await callTool('claim_propose', { run, id: 'H2', statement: '特征 X 无效', predicts: ['accuracy 不变或降'] })
    await callTool('prereg_write', { run, spec })
    await callTool('probe_run', { run, pid: 'P1' })
    await callTool('claim_transition', { run, id: 'H1', to: 'SUPPORTED', byProbe: 'P1' })
    await callTool('claim_transition', { run, id: 'H2', to: 'REFUTED', byProbe: 'P1' })
    await callTool('claim_propose', {
      run, id: 'H3', statement: '提升来自数据泄漏', predicts: ['打乱标签后 accuracy 仍 ≥ 0.8'],
      conflicts: 'H1 被 P1 支持——本假设主张 P1 的观测由泄漏产生',
    })
    const p2 = {
      ...spec,
      pid: 'P2',
      question: '打乱标签：H1 还是 H3？',
      evalCommand: 'echo \'{"metric":{"accuracy":0.9}}\'',
      bands: { H1: [0.0, 0.6], H3: [0.8, 1.0] },
      branches: [
        { band: [0.8, 1.0] as const, action: 'kill' as const, target: 'H1' },
        { band: [0.0, 0.6] as const, action: 'kill' as const, target: 'H3' },
      ],
    }
    // 修复前：bands 引用了非 LIVE claim: H1
    await callTool('prereg_write', { run, spec: p2 })
    await callTool('probe_run', { run, pid: 'P2' })
    await callTool('claim_transition', { run, id: 'H1', to: 'REFUTED', byProbe: 'P2' })
    const state = JSON.parse(await callTool('research_state', { run })) as { claims: Array<{ id: string; state: string }> }
    expect(state.claims.find((c) => c.id === 'H1')?.state).toBe('REFUTED')
  })

  it('第二次终态迁移不重复进 graveyard（保留最后一次）', async () => {
    const state = JSON.parse(await callTool('research_state', { run: 'challenge' })) as { graveyard: Array<{ id: string; state: string }> }
    const h1 = state.graveyard.filter((c) => c.id === 'H1')
    expect(h1.map((c) => c.state)).toEqual(['REFUTED'])
  })

  it('克隆 SUPPORTED 的新假设被拒；终态自迁移被拒（评审 MEDIUM 5 复现）', async () => {
    const run = 'clone'
    await callTool('research_init', { run })
    await callTool('claim_propose', { run, id: 'H1', statement: 'A', predicts: ['acc rises'] })
    await callTool('claim_propose', { run, id: 'H2', statement: 'B', predicts: ['acc flat'] })
    await callTool('prereg_write', { run, spec })
    await callTool('probe_run', { run, pid: 'P1' })
    await callTool('claim_transition', { run, id: 'H1', to: 'SUPPORTED', byProbe: 'P1' })
    await callTool('claim_transition', { run, id: 'H2', to: 'REFUTED', byProbe: 'P1' })
    await expect(callTool('claim_propose', {
      run, id: 'H3', statement: 'A 换个说法', predicts: ['acc rises'], conflicts: 'none — 攻击未探索的轴',
    })).rejects.toThrow(/SUPPORTED 假设 H1 的子集.*research-abduce/)
    await expect(callTool('claim_transition', { run, id: 'H1', to: 'SUPPORTED', byProbe: 'P1' }))
      .rejects.toThrow(/已是 SUPPORTED/)
  })

  it('CONTESTED 假设的 predicts 子集可再登记（scoop → CONTESTED → reframe 的出口）', async () => {
    const run = 'reframe'
    await callTool('research_init', { run })
    await callTool('claim_propose', { run, id: 'H1', statement: 'A', predicts: ['acc rises'] })
    await callTool('claim_transition', { run, id: 'H1', to: 'CONTESTED', note: 'scooped: 2401.00001' })
    await callTool('claim_propose', { run, id: 'H2', statement: 'A 换到不同轴', predicts: ['acc rises'] })
    const state = JSON.parse(await callTool('research_state', { run })) as { claims: Array<{ id: string; state: string }> }
    expect(state.claims.find((c) => c.id === 'H2')?.state).toBe('LIVE')
  })
})

// ── K7 封顶（cap-not-block）：declare 通过，journal 与报告末尾记下封顶理由 ──────────

function journalEvents(run: string): Array<Record<string, unknown>> {
  return readFileSync(join(researchCwd, '.proma-research', run, 'journal.jsonl'), 'utf-8')
    .trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/** 声明后的副本：宿主从 research-work 复制进 run 目录（agent 不写状态根）。 */
function declaredCopy(run: string): string {
  return join(researchCwd, '.proma-research', run, 'REPORT.md')
}

/** agent 写报告的地方：<cwd>/research-work/<run>/REPORT.md。 */
function workReport(run: string): string {
  return join(researchCwd, 'research-work', run, 'REPORT.md')
}

const PASSING_REPORT = '# 报告\n\naccuracy 为 0.83 (P1)。\n\n- H1: LIVE\n- H2: REFUTED\n'

/** 能过三道 gate 的最小 run（shell 探针），报告写在 research-work 但未声明；返回声明后副本的路径。 */
async function passingRun(run: string): Promise<string> {
  await callTool('research_init', { run })
  await callTool('claim_propose', { run, id: 'H1', statement: '加入特征 X 提升 accuracy', predicts: ['accuracy 升到 0.8+'] })
  await callTool('claim_propose', { run, id: 'H2', statement: '特征 X 无效', predicts: ['accuracy 不变或降'] })
  await callTool('prereg_write', { run, spec })
  await callTool('probe_run', { run, pid: 'P1' })
  await callTool('claim_transition', { run, id: 'H2', to: 'REFUTED', byProbe: 'P1' })
  await callTool('attack_record', { run, target: 'H1', kind: 'constraint', text: '单个种子' })
  mkdirSync(dirname(workReport(run)), { recursive: true })
  writeFileSync(workReport(run), PASSING_REPORT, 'utf-8')
  return declaredCopy(run)
}

describe('SE7a：kernel 环境 K0 快照 / K7 重算，漂移只封顶', () => {
  let venv: string
  let kitDir: string

  beforeAll(() => {
    venv = mkdtempSync(join(tmpdir(), 'proma-kernel-venv-'))
    expect(spawnSync('python3', ['-m', 'venv', '--without-pip', venv]).status).toBe(0)
    const site = spawnSync(join(venv, 'bin/python'), ['-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'], { encoding: 'utf-8' })
      .stdout.trim()
    kitDir = join(site, 'research_kit')
    mkdirSync(kitDir)
    writeFileSync(join(kitDir, '__init__.py'), 'def anchor(run):\n    return run\n')
  })

  afterAll(() => {
    delete process.env.PROMA_KERNEL_PYTHON
    rmSync(venv, { recursive: true, force: true })
  })

  it('init 之后改 kit 文件再 declare → 通过；journal 有 env.drift；报告末尾有封顶行且 sha256 覆盖它', async () => {
    process.env.PROMA_KERNEL_PYTHON = join(venv, 'bin/python')
    const run = 'env-drift'
    const report = await passingRun(run)
    expect(journalEvents(run).find((e) => e.op === 'env.snapshot')?.kit_files).toBeDefined()
    // ca_rebound :58 的形状：run 中重装 kit
    writeFileSync(join(kitDir, '__init__.py'), 'def anchor(run):\n    return "patched"\n')

    const declared = await callTool('report_declare', { run, path: 'REPORT.md' })
    expect(declared).toContain('三道 gate 全绿')
    const events = journalEvents(run)
    const drift = events.find((e) => e.op === 'env.drift')
    expect(drift?.changed).toEqual(['kit:__init__.py'])
    const text = readFileSync(report, 'utf-8')
    const lastLine = text.trimEnd().split('\n').pop()!
    expect(lastLine).toContain('kernel 环境在 run 中变化')
    expect(lastLine).toContain(`journal seq ${events.indexOf(drift!) + 1}`)
    expect(lastLine).toContain('`lead`')
    expect(events.find((e) => e.op === 'report.declare')?.sha256).toBe(sha256Hex(text))
    expect(events.find((e) => e.op === 'gate.verdict')?.caps).toEqual(['env_drift'])
    // L6：同一漂移重复 declare 不重复记 env.drift，封顶行仍指向第一条
    await callTool('report_declare', { run, path: 'REPORT.md' })
    expect(journalEvents(run).filter((e) => e.op === 'env.drift')).toHaveLength(1)
    expect(readFileSync(report, 'utf-8').split('kernel 环境在 run 中变化').length).toBe(2)
  })

  it('没传 kernel python → env.snapshot{unavailable}，declare 照常、不封顶', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'env-unavailable'
    const report = await passingRun(run)
    expect(journalEvents(run).find((e) => e.op === 'env.snapshot')?.unavailable).toBeDefined()
    expect(await callTool('report_declare', { run, path: 'REPORT.md' })).toContain('三道 gate 全绿')
    expect(readFileSync(report, 'utf-8')).toBe(PASSING_REPORT)
    expect(journalEvents(run).some((e) => e.op === 'env.drift')).toBe(false)
  })
})

describe('报告在 research-work 写、declare 复制进 run 目录（agent 不写状态根）', () => {
  function stateRoot(run: string): string {
    return join(researchCwd, '.proma-research', run)
  }

  it('复制成 run 目录里的普通文件；report.declare 记副本 sha256 与 source；封顶行只进副本', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'work-copy'
    const copy = await passingRun(run)
    // 预埋：run 目录里的 REPORT.md 是指向别处的链接——宿主换名落盘，不写穿
    const elsewhere = join(stateRoot(run), 'real.md')
    writeFileSync(elsewhere, 'untouched', 'utf-8')
    symlinkSync('real.md', copy)
    expect(await callTool('report_declare', { run, path: 'REPORT.md' })).toContain('三道 gate 全绿')
    expect(lstatSync(copy).isFile()).toBe(true)
    expect(lstatSync(copy).nlink).toBe(1)
    expect(readFileSync(copy, 'utf-8')).toBe(PASSING_REPORT)
    expect(readFileSync(elsewhere, 'utf-8')).toBe('untouched')
    const declared = journalEvents(run).find((e) => e.op === 'report.declare')
    expect(declared).toMatchObject({ path: 'REPORT.md', sha256: sha256Hex(PASSING_REPORT), source: `research-work/${run}/REPORT.md` })
    expect(readdirSync(stateRoot(run)).filter((name) => name.includes('declaring'))).toEqual([])
  })

  it('reconcile 跑在副本上：声明后改 research-work 源不影响离线复核；改副本才会红', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'work-reconcile'
    const copy = await passingRun(run)
    await callTool('report_declare', { run, path: 'REPORT.md' })
    const { runReconcileGate } = await import('../gates/reconcile')
    writeFileSync(workReport(run), '# 改了\n\naccuracy 为 0.99 (P1)。\n', 'utf-8')
    expect(runReconcileGate(stateRoot(run)).failures).toEqual([])
    appendFileSync(copy, '\n多一行\n')
    expect(runReconcileGate(stateRoot(run)).failures.length).toBeGreaterThan(0)
  })

  it('gate 红：拒绝声明，run 目录里不留副本也不留暂存文件，journal 无 report.declare', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'work-red'
    const copy = await passingRun(run)
    writeFileSync(workReport(run), '# 报告\n\naccuracy 为 0.95 (P1)。\n\n- H1: LIVE\n- H2: REFUTED\n', 'utf-8')
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow(/拒绝声明/)
    expect(existsSync(copy)).toBe(false)
    expect(readdirSync(stateRoot(run)).filter((name) => name.includes('REPORT'))).toEqual([])
    expect(journalEvents(run).some((e) => e.op === 'report.declare')).toBe(false)
  })

  it('源是符号链接：拒绝跟随（目标内容不进 run 目录），记 report.link；改成普通文件后声明封顶 report_link', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'work-symlink'
    const copy = await passingRun(run)
    const secret = join(researchCwd, 'secret-truth.py')
    writeFileSync(secret, 'TRUTH = 42\n', 'utf-8')
    rmSync(workReport(run))
    symlinkSync(secret, workReport(run))
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow(/链接/)
    expect(existsSync(copy)).toBe(false)
    expect(journalEvents(run).find((e) => e.op === 'report.link')).toMatchObject({ link: 'symlink' })
    expect(journalEvents(run).some((e) => e.op === 'report.declare')).toBe(false)

    rmSync(workReport(run))
    writeFileSync(workReport(run), PASSING_REPORT, 'utf-8')
    expect(await callTool('report_declare', { run, path: 'REPORT.md' })).toContain('report_link')
    expect(journalEvents(run).find((e) => e.op === 'gate.verdict')?.caps).toEqual(['report_link'])
    expect(readFileSync(copy, 'utf-8')).toContain('报告文件是链接')
    expect(readFileSync(workReport(run), 'utf-8')).toBe(PASSING_REPORT)
  })

  it('源有多重硬链接：同样拒绝跟随并记 report.link', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'work-hardlink'
    const copy = await passingRun(run)
    linkSync(workReport(run), join(researchCwd, 'research-work', run, 'other.md'))
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow(/链接/)
    expect(existsSync(copy)).toBe(false)
    expect(journalEvents(run).find((e) => e.op === 'report.link')).toMatchObject({ link: 'hardlink' })
  })

  it('research-work/<run> 目录本身是链接：拒绝跟随', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'work-dirlink'
    const copy = await passingRun(run)
    const real = join(researchCwd, 'elsewhere-dir')
    mkdirSync(real)
    writeFileSync(join(real, 'REPORT.md'), PASSING_REPORT, 'utf-8')
    rmSync(dirname(workReport(run)), { recursive: true })
    symlinkSync(real, dirname(workReport(run)))
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow(/链接/)
    expect(existsSync(copy)).toBe(false)
  })

  it('path 只是源文件名：research-work 里的 journal.jsonl 声明不会覆盖 run 目录的 journal', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'work-dest-fixed'
    await passingRun(run)
    const journalBefore = readFileSync(join(stateRoot(run), 'journal.jsonl'), 'utf-8')
    writeFileSync(join(researchCwd, 'research-work', run, 'journal.jsonl'), PASSING_REPORT, 'utf-8')
    await callTool('report_declare', { run, path: 'journal.jsonl' })
    expect(readFileSync(join(stateRoot(run), 'journal.jsonl'), 'utf-8').startsWith(journalBefore)).toBe(true)
    expect(readFileSync(declaredCopy(run), 'utf-8')).toBe(PASSING_REPORT)
    await expect(callTool('report_declare', { run, path: '../other/REPORT.md' })).rejects.toThrow(/越出/)
  })

  it('旧 run：research-work 没有源、run 目录里已有普通文件 REPORT.md → 原地声明并记 legacy source', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'legacy-in-root'
    const copy = await passingRun(run)
    rmSync(workReport(run))
    writeFileSync(copy, PASSING_REPORT, 'utf-8')
    expect(await callTool('report_declare', { run, path: 'REPORT.md' })).toContain('三道 gate 全绿')
    expect(journalEvents(run).find((e) => e.op === 'report.declare')?.source).toBe(`.proma-research/${run}/REPORT.md`)
  })

  it('旧 run 的 run 目录 REPORT.md 是链接 → 同样拒绝跟随', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'legacy-link'
    const copy = await passingRun(run)
    rmSync(workReport(run))
    writeFileSync(join(stateRoot(run), 'real.md'), PASSING_REPORT, 'utf-8')
    symlinkSync('real.md', copy)
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow(/链接/)
    expect(journalEvents(run).find((e) => e.op === 'report.link')).toMatchObject({ link: 'symlink' })
  })

  it('两处都没有：报错指向 research-work/<run>/REPORT.md', async () => {
    const run = 'no-report'
    await passingRun(run)
    rmSync(workReport(run))
    await expect(callTool('report_declare', { run, path: 'REPORT.md' })).rejects.toThrow(`research-work/${run}/REPORT.md`)
  })

  it('path 带了 research-work/<run>/ 前缀 → 剥掉照常声明；找不到时报错不回显嵌套路径（审计 D18）', async () => {
    delete process.env.PROMA_KERNEL_PYTHON
    const run = 'prefixed-path'
    await passingRun(run)
    expect(await callTool('report_declare', { run, path: `research-work/${run}/REPORT.md` })).toContain('三道 gate 全绿')
    expect(await callTool('report_declare', { run, path: `./research-work/${run}/REPORT.md` })).toContain('三道 gate 全绿')
    const error = await callTool('report_declare', { run, path: `research-work/${run}/DRAFT.md` }).catch((e: Error) => e.message)
    expect(error).not.toContain(`research-work/${run}/research-work/`)
    expect(error).toContain(`research-work/${run}/DRAFT.md`)
    expect(error).toContain('path 相对')
  })
})

// ── F1-T2：world_simulate(mode=info) 给出工作目录 nbsim；候选模式拒绝 + 指路（03 §5、§7）──
// 接口 7（E → D）：meter 的 `env WORLD SEED --out DIR` 子命令。这里用桩 meter，不等轨道 E。

const STUB_METER = String.raw`
import hashlib, json, os, pathlib, sys
args = sys.argv[1:]
ledger = args[args.index("--ledger") + 1]
rest, i = [], 0
while i < len(args):
    if args[i] in ("--ledger", "--budget", "--budget-spent"):
        i += 2
        continue
    rest.append(args[i])
    i += 1
cmd = rest[0]
opt = lambda name, default=None: rest[rest.index(name) + 1] if name in rest else default
if cmd == "info":
    print(json.dumps({"text_prior": "stub", "protocols": [["p1", []]], "test_protocol_labels": ["t1"]}))
elif cmd == "observe":
    reps = int(opt("--reps", "1"))
    print(json.dumps({"protocol_label": rest[3], "spike_count": 3.0, "reps": reps, "cost": reps, "voltage": [], "test_start_index": 0}))
elif cmd == "simulate":
    open(ledger, "a").write(json.dumps({"cmd": "simulate", "candidate": True}) + "\n")
    print(json.dumps({"protocol_label": rest[3], "mean_spike_count": 1.5}))
elif cmd == "forecast":
    print(json.dumps({"spike_forecast_mse": 0.25, "budget_spent": 0}))
elif cmd == "env":
    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "NO_ENV")):
        sys.exit("world-meter.py: error: argument cmd: invalid choice: 'env'")
    out = pathlib.Path(opt("--out"))
    replaced = None
    # 换 world：task.json 不同 → 旧树挪开（同 nbsim_strip.build）
    if (out / "task.json").exists() and (out / "task.json").read_text() != rest[1]:
        replaced = str(out.parent / "nbsim.replaced-stub")
        out.rename(replaced)
    out.mkdir(parents=True, exist_ok=True)
    (out / "__init__.py").write_text("from .kernel import x\n")
    (out / "kernel.py").write_text("x = 1\n")
    (out / "task.json").write_text(rest[1])
    files = sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file() and p.name != "MANIFEST.json")
    tree = hashlib.sha256("".join(hashlib.sha256((out / f).read_bytes()).hexdigest() for f in files).encode()).hexdigest()
    (out / "MANIFEST.json").write_text(json.dumps({"tree_sha256": tree}))
    print(json.dumps({"path": str(out), "sha256": tree, "nb_commit": "c354622", "generator_version": "stub-1", "files": files,
                      **({"replaced": replaced} if replaced else {})}))
`

/** 03 §4 的树 sha：按相对路径排序后拼接各文件 sha256 再哈希（不含 MANIFEST.json 与 __pycache__）。 */
function treeSha(dir: string): string {
  const files = (readdirSync(dir, { recursive: true }) as string[])
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file !== 'MANIFEST.json' && !file.split('/').includes('__pycache__') && statSync(join(dir, file)).isFile())
    .sort()
  return sha256Hex(files.map((file) => sha256Hex(readFileSync(join(dir, file)))).join(''))
}

describe('F1-T2：nbsim 工作目录接线（桩 meter）', () => {
  let worldClient: Client
  let benchRoot: string
  const saved: Record<string, string | undefined> = {}
  const keys = ['PROMA_RESEARCH_DENY', 'NEURONBENCH_ROOT', 'PROMA_EVAL_METER', 'PROMA_EVAL_BUDGET']

  beforeAll(async () => {
    for (const key of keys) saved[key] = process.env[key]
    benchRoot = mkdtempSync(join(tmpdir(), 'proma-stub-bench-'))
    writeFileSync(join(benchRoot, 'world-meter.py'), STUB_METER)
    process.env.PROMA_RESEARCH_DENY = benchRoot
    process.env.NEURONBENCH_ROOT = benchRoot
    process.env.PROMA_EVAL_METER = join(benchRoot, 'world-meter.py')
    process.env.PROMA_EVAL_BUDGET = '8'
    worldClient = new Client({ name: 'nbsim-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([worldClient.connect(clientTransport), buildServer().connect(serverTransport)])
  })

  afterAll(async () => {
    await worldClient.close()
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    rmSync(benchRoot, { recursive: true, force: true })
  })

  async function call(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await worldClient.callTool({ name, arguments: args })
    const text = ((result.content ?? []) as Array<{ text?: string }>).map((c) => c.text ?? '').join('')
    if (result.isError) throw new Error(text)
    return text
  }

  /** world run 的最小可声明形状：info → 两假设 → observe 探针落地 → 迁移 → 攻击 → 报告。 */
  async function worldRun(run: string): Promise<{ simEnv: { path: string; sha256: string; import_hint: string }; report: string }> {
    await call('research_init', { run })
    const info = JSON.parse(await call('world_simulate', { run, world: 'w', seed: 0, mode: 'info' })) as Record<string, unknown>
    await call('claim_propose', { run, id: 'H1', statement: '非负', predicts: ['spike_count ≥ 0'] })
    await call('claim_propose', { run, id: 'H2', statement: '为负', predicts: ['spike_count < 0'] })
    await call('prereg_write', {
      run,
      spec: {
        pid: 'P1', question: 'q', observe: { world: 'w', seed: 0, protocol: 'p1', reps: 1 },
        metricKind: 'json', metricSpec: 'spike_count',
        bands: { H1: [0, 1000], H2: [-1000, -0.001] },
        branches: [{ band: [0, 1000], action: 'kill', target: 'H2' }, { band: [-1000, -0.001], action: 'kill', target: 'H1' }],
      },
    })
    await call('probe_run', { run, pid: 'P1' })
    await call('claim_transition', { run, id: 'H2', to: 'REFUTED', byProbe: 'P1' })
    await call('attack_record', { run, target: 'H1', kind: 'constraint', text: '单次观测' })
    const report = join(researchCwd, '.proma-research', run, 'REPORT.md')
    writeFileSync(report, '# world\n\nspike_count 为 3 (P1)。\n\n- H1: LIVE\n- H2: REFUTED\n', 'utf-8')
    return { simEnv: info.sim_env as { path: string; sha256: string; import_hint: string }, report }
  }

  it('A3：info 返回 sim_env；journal 记 world.env，sha256 与目录树相等', async () => {
    const run = 'nbsim-info'
    await call('research_init', { run })
    const info = JSON.parse(await call('world_simulate', { run, world: 'w', seed: 0, mode: 'info' })) as Record<string, unknown>
    expect(info.text_prior).toBe('stub') // problem() 原样透传
    const simEnv = info.sim_env as { path: string; sha256: string; import_hint: string }
    expect(simEnv.path).toBe(join(researchCwd, 'research-work', run, 'nbsim'))
    expect(simEnv.sha256).toBe(treeSha(simEnv.path))
    expect(simEnv.sha256).toBe(JSON.parse(readFileSync(join(simEnv.path, 'MANIFEST.json'), 'utf-8')).tree_sha256)
    expect(simEnv.import_hint).toContain(`sys.path.insert(0, ${JSON.stringify(dirname(simEnv.path))})`)
    expect(simEnv.import_hint).not.toContain('pip install')
    const env = journalEvents(run).find((e) => e.op === 'world.env')
    expect(env).toMatchObject({ sha256: simEnv.sha256, nb_commit: 'c354622', generator_version: 'stub-1', path: simEnv.path })
    // 重复 info：同一份环境不重复记账
    await call('world_simulate', { run, world: 'w', seed: 0, mode: 'info' })
    expect(journalEvents(run).filter((e) => e.op === 'world.env')).toHaveLength(1)
  })

  it('A4：有 nbsim 后候选模式拒绝 + 指路（固定前缀），journal 无新行，ledger 无 candidate 行', async () => {
    const run = 'nbsim-info'
    const before = journalEvents(run).length
    await expect(call('world_simulate', { run, world: 'w', seed: 0, mode: 'candidate', protocol: 'p1', mechanism: '{}' }))
      .rejects.toThrow(/候选仿真已移到工作目录：import nbsim.*research-work/)
    expect(journalEvents(run)).toHaveLength(before)
    const ledger = join(researchCwd, '.proma-research', run, 'world-ledger.jsonl')
    expect(existsSync(ledger) && readFileSync(ledger, 'utf-8').includes('candidate')).toBe(false)
  })

  it('接口回落：meter 没有 env 子命令（轨道 E 未合入）→ info 照旧、候选模式照旧可用', async () => {
    // Bun 的 spawnSync 不继承运行时改过的 process.env，所以开关用桩旁边的标记文件
    const flag = join(benchRoot, 'NO_ENV')
    writeFileSync(flag, '')
    try {
      const run = 'nbsim-absent'
      await call('research_init', { run })
      const info = JSON.parse(await call('world_simulate', { run, world: 'w', seed: 0, mode: 'info' })) as Record<string, unknown>
      expect(info.sim_env).toBeUndefined()
      const sim = JSON.parse(await call('world_simulate', { run, world: 'w', seed: 0, mode: 'candidate', protocol: 'p1', mechanism: '{}' }))
      expect(sim.mean_spike_count).toBe(1.5)
      const ops = journalEvents(run).map((e) => e.op)
      expect(ops).toContain('world.simulate')
      expect(ops).not.toContain('world.env')
    } finally {
      rmSync(flag)
    }
  })

  it('A6：篡改工作目录里的 nbsim → forecast 记 world.env.verify{match:false}；declare 不拒，报告带 ⚠ 行', async () => {
    const run = 'nbsim-tamper'
    const { simEnv, report } = await worldRun(run)
    appendFileSync(join(simEnv.path, 'kernel.py'), 'x = 2\n')
    await call('world_forecast', { run, world: 'w', seed: 0, counts: { t1: 1 } })
    const verify = journalEvents(run).find((e) => e.op === 'world.env.verify')
    expect(verify).toMatchObject({ match: false, expected: simEnv.sha256 })
    expect(await call('report_declare', { run, path: 'REPORT.md' })).toContain('三道 gate 全绿')
    const text = readFileSync(report, 'utf-8')
    expect(text).toContain('nbsim 在 run 中被改动')
    expect(text).not.toContain('world_forecast') // 有 forecast，不出缺失行
    expect(journalEvents(run).find((e) => e.op === 'gate.verdict')?.caps).toEqual(['world_env_mismatch'])
  })

  it('H3：篡改 nbsim 后再 info（重建出同 sha 的干净树）→ 篡改证据不丢：verify{match:false}，declare 封顶', async () => {
    const run = 'nbsim-tamper-rebuild'
    const { simEnv, report } = await worldRun(run)
    appendFileSync(join(simEnv.path, 'kernel.py'), 'x = 2\n')
    await call('world_simulate', { run, world: 'w', seed: 0, mode: 'info' })
    expect(treeSha(simEnv.path)).toBe(simEnv.sha256)
    await call('world_forecast', { run, world: 'w', seed: 0, counts: { t1: 1 } })
    const verifies = journalEvents(run).filter((e) => e.op === 'world.env.verify')
    expect(verifies.map((e) => e.match)).toEqual([false, true])
    expect(verifies[0]).toMatchObject({ expected: simEnv.sha256 })
    expect(await call('report_declare', { run, path: 'REPORT.md' })).toContain('三道 gate 全绿')
    expect(readFileSync(report, 'utf-8')).toContain('nbsim 在 run 中被改动')
    expect(journalEvents(run).find((e) => e.op === 'gate.verdict')?.caps).toEqual(['world_env_mismatch'])
  })

  it('H3：删掉 nbsim 再 info 重建 → 同样记 verify{match:false, actual:missing}', async () => {
    const run = 'nbsim-delete-rebuild'
    const { simEnv } = await worldRun(run)
    rmSync(simEnv.path, { recursive: true, force: true })
    await call('world_simulate', { run, world: 'w', seed: 0, mode: 'info' })
    expect(journalEvents(run).find((e) => e.op === 'world.env.verify')).toMatchObject({ match: false, actual: 'missing' })
  })

  it('审查：nbsim 里种一个坏链接 + 改 kernel.py → forecast 不抛，verify{match:false}，declare 封顶', async () => {
    const run = 'nbsim-dangling'
    const { simEnv, report } = await worldRun(run)
    appendFileSync(join(simEnv.path, 'kernel.py'), 'x = 2\n')
    symlinkSync('/nonexistent', join(simEnv.path, 'zz.py'))
    await call('world_forecast', { run, world: 'w', seed: 0, counts: { t1: 1 } })
    expect(journalEvents(run).find((e) => e.op === 'world.env.verify')).toMatchObject({ match: false, expected: simEnv.sha256 })
    expect(await call('report_declare', { run, path: 'REPORT.md' })).toContain('三道 gate 全绿')
    expect(readFileSync(report, 'utf-8')).toContain('nbsim 在 run 中被改动')
    expect(journalEvents(run).find((e) => e.op === 'gate.verdict')?.caps).toEqual(['world_env_mismatch'])
  })

  it('审查：坏链接后再 info → 不抛，verify{match:false} 记在 info', async () => {
    const run = 'nbsim-dangling-info'
    const { simEnv } = await worldRun(run)
    symlinkSync('/nonexistent', join(simEnv.path, 'zz.py'))
    await call('world_simulate', { run, world: 'w', seed: 0, mode: 'info' })
    expect(journalEvents(run).find((e) => e.op === 'world.env.verify')).toMatchObject({ match: false, at: 'info' })
  })

  it('审查：同一 run 换 world（meter 挪开旧树）不是篡改 → 不记 verify{match:false}', async () => {
    const run = 'nbsim-switch-world'
    await call('research_init', { run })
    await call('world_simulate', { run, world: 'w', seed: 0, mode: 'info' })
    await call('world_simulate', { run, world: 'w2', seed: 0, mode: 'info' })
    expect(journalEvents(run).filter((e) => e.op === 'world.env')).toHaveLength(2)
    expect(journalEvents(run).some((e) => e.op === 'world.env.verify' && e.match === false)).toBe(false)
  })

  it('forecast 未改动 nbsim → verify{match:true}，不封顶', async () => {
    const run = 'nbsim-clean'
    const { report } = await worldRun(run)
    await call('world_forecast', { run, world: 'w', seed: 0, counts: { t1: 1 } })
    expect(journalEvents(run).find((e) => e.op === 'world.env.verify')?.match).toBe(true)
    const before = readFileSync(report, 'utf-8')
    await call('report_declare', { run, path: 'REPORT.md' })
    expect(readFileSync(report, 'utf-8')).toBe(before)
    expect(journalEvents(run).find((e) => e.op === 'gate.verdict')?.caps).toBeUndefined()
  })

  it('world 任务没有 world.forecast：declare 通过但不冒充完整——gate.verdict 记 forecast_missing，报告带一行', async () => {
    const run = 'nbsim-no-forecast'
    const { report } = await worldRun(run)
    const declared = await call('report_declare', { run, path: 'REPORT.md' })
    expect(declared).toContain('三道 gate 全绿')
    expect(declared).toContain('forecast_missing')
    expect(journalEvents(run).find((e) => e.op === 'gate.verdict')?.caps).toEqual(['forecast_missing'])
    const text = readFileSync(report, 'utf-8')
    expect(text.trimEnd().split('\n').pop()).toContain('未提交 world_forecast')
    // 重复声明不重复追加同一行
    await call('report_declare', { run, path: 'REPORT.md' })
    expect(readFileSync(report, 'utf-8').split('未提交 world_forecast').length).toBe(2)
  })
})
