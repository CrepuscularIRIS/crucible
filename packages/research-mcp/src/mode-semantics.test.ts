/**
 * 01 P1 / P2（MCP 部分）+ 04 IR-D1 / IR-D3 的先红检查：经真实 MCP 客户端调用。
 *
 * 核心 fixture 是 GLM ca-rebound-s0 归档 journal 在 identify 模式下的重放（01 §10 P1 行）：
 * 同一串工具调用，在新规则下必须结束在 `lead`，而不是 SUPPORTED。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from './server'
import { runPreregGate } from '../gates/prereg'
import { runTraceGate } from '../gates/trace'

// 满载机器上 beforeAll 会超 5s 默认值，整组 26 个用例不跑（评审 LOW）。
setDefaultTimeout(30_000)

let client: Client
let researchCwd: string
const savedDeny = process.env.PROMA_RESEARCH_DENY

beforeAll(async () => {
  delete process.env.PROMA_RESEARCH_DENY // 非 world 任务：evalCommand 探针可用
  researchCwd = mkdtempSync(join(tmpdir(), 'proma-research-mode-'))
  process.env.PROMA_RESEARCH_CWD = researchCwd
  client = new Client({ name: 'test-client', version: '1.0.0' })
  const server = buildServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
})

afterAll(() => {
  rmSync(researchCwd, { recursive: true, force: true })
  delete process.env.PROMA_RESEARCH_CWD
  if (savedDeny !== undefined) process.env.PROMA_RESEARCH_DENY = savedDeny
})

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args })
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  if (result.isError) throw new Error(content.map((c) => c.text ?? '').join(''))
  return content.map((c) => c.text ?? '').join('')
}

interface Claim {
  id: string
  statement: string
  state: string
  parent?: string
  builtin?: boolean
  scopedStatement?: string
  lead?: { requested: string; byProbe: string; caps: string[] }
}
interface State {
  contract?: { mode: string; successPredicate: string; depth: string; recall: string }
  claims: Claim[]
  graveyard: Claim[]
  debts?: Array<{ gid: string; target: string; kind: string }>
}

async function state(run: string): Promise<State> {
  return JSON.parse(await callTool('research_state', { run })) as State
}

const runRoot = (run: string) => join(researchCwd, '.proma-research', run)
const rejectionLines = (run: string): Array<Record<string, unknown>> => {
  const file = join(runRoot(run), 'rejections.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
}
const journalLength = (run: string) => readFileSync(join(runRoot(run), 'journal.jsonl'), 'utf-8').trim().split('\n').length
const claimOf = (s: State, id: string) => s.claims.find((c) => c.id === id)

function writeWorkFile(relative: string, text: string): string {
  const file = join(researchCwd, relative)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf-8')
  return createHash('sha256').update(text).digest('hex')
}

describe('P2：research_init{mode, success_predicate, depth, recall} 冻结；无 mode = legacy', () => {
  it('identify：契约进 research_state（未给的字段取默认），内置 H0 = null 自动登记', async () => {
    const text = await callTool('research_init', { run: 'idf', mode: 'identify' })
    expect(text).toContain('mode=identify')
    const s = await state('idf')
    expect(s.contract?.mode).toBe('identify')
    expect(s.contract?.successPredicate).toContain('forecast')
    expect(s.contract?.depth).toBe('light')
    expect(s.contract?.recall).toBe('parametric-only')
    const h0 = claimOf(s, 'H0')
    expect(h0?.state).toBe('LIVE')
    expect(h0?.builtin).toBe(true)
  })

  it('score：H0 = incumbent；open：不在 init 登记 H0（H0′ 按候选经 claim_propose{parent}）', async () => {
    await callTool('research_init', { run: 'sc', mode: 'score', success_predicate: 'admit(best) − admit(incumbent) ≥ 0.01', depth: 'full', recall: 'on' })
    const sc = await state('sc')
    expect(sc.contract).toEqual({ mode: 'score', successPredicate: 'admit(best) − admit(incumbent) ≥ 0.01', depth: 'full', recall: 'on' })
    expect(claimOf(sc, 'H0')?.statement ?? '').toContain('incumbent')
    await callTool('research_init', { run: 'op', mode: 'open' })
    expect((await state('op')).claims).toEqual([])
  })

  it('mode 冻结：换 mode / 谓词重开被拒（落 rejections.jsonl，journal 不动）；不带字段重开不改契约', async () => {
    const before = journalLength('idf')
    await expect(callTool('research_init', { run: 'idf', mode: 'score' })).rejects.toThrow(/冻结|新 run/)
    await expect(callTool('research_init', { run: 'idf', mode: 'identify', success_predicate: '别的谓词' })).rejects.toThrow(/冻结|新 run/)
    expect(journalLength('idf')).toBe(before)
    const lines = rejectionLines('idf')
    expect(lines.length).toBe(2)
    expect(lines[0].op).toBe('research_init')
    expect(String(lines[0].error)).toMatch(/冻结|新 run/)
    await callTool('research_init', { run: 'idf' })
    const s = await state('idf')
    expect(s.contract?.mode).toBe('identify')
    expect(s.claims.filter((c) => c.id === 'H0').length).toBe(1)
  })

  it('legacy：无 mode 的 run 没有 contract、没有 H0；之后不能补 mode；契约字段离开 mode 无意义 → 拒', async () => {
    await callTool('research_init', { run: 'legacy' })
    const s = await state('legacy')
    expect(s.contract).toBeUndefined()
    expect(s.claims).toEqual([])
    expect(JSON.stringify(s)).not.toContain('debts')
    await expect(callTool('research_init', { run: 'legacy', mode: 'identify' })).rejects.toThrow(/legacy|新 run/)
    await expect(callTool('research_init', { run: 'fresh', depth: 'full' })).rejects.toThrow(/mode/)
  })
})

describe('IR-D1：claim_propose 可选 parent → claim.propose.parent', () => {
  it('parent 进 research_state；未知 parent 被拒', async () => {
    await callTool('claim_propose', { run: 'op', id: 'H1', statement: '候选 C1', predicts: ['检索召回升'] })
    await callTool('claim_propose', { run: 'op', id: 'H2', statement: 'C1 的朴素基线 H0′', predicts: ['召回不变'], parent: 'H1' })
    expect(claimOf(await state('op'), 'H2')?.parent).toBe('H1')
    await expect(callTool('claim_propose', { run: 'op', id: 'H3', statement: 'x', predicts: ['y'], parent: 'H9' }))
      .rejects.toThrow(/parent/)
  })
})

// ── GLM ca-rebound-s0 在 identify 下重放（01 §10 P1 的先红检查） ─────────────
const campaign = join(import.meta.dir, '..', '..', '..', 'research', 'campaigns', '2026-10-14-glm53flash-ca_rebound-s0')
const glmEvents = readFileSync(join(campaign, 'journal.jsonl'), 'utf-8').trim().split('\n')
  .map((line) => JSON.parse(line) as Record<string, unknown>)
const glmMetric = new Map(glmEvents.filter((e) => e.op === 'probe.land').map((e) => [String(e.pid), Number(e.metric)]))

function glmSpec(pid: string): Record<string, unknown> {
  const { observe: _observe, frozenAt: _frozenAt, ...rest } = JSON.parse(readFileSync(join(campaign, 'prereg', `${pid}.json`), 'utf-8'))
  // 计量换成等值回显：本测试只验状态机，不验 meter
  return { ...rest, evalCommand: `echo '{"spike_count": ${glmMetric.get(pid)}}'` }
}

const transitionReplies = new Map<string, string>()
let afterReplay: State

describe('GLM ca-rebound-s0 重放（identify）：结束在 lead，不是 SUPPORTED', () => {
  beforeAll(async () => {
    const run = 'glm'
    await callTool('research_init', { run, mode: 'identify' })
    for (const e of glmEvents) {
      if (e.op === 'claim.propose') {
        await callTool('claim_propose', {
          run, id: e.id, statement: e.statement, predicts: e.predicts, ...(e.conflicts ? { conflicts: e.conflicts } : {}),
        })
      } else if (e.op === 'prereg.write') {
        await callTool('prereg_write', { run, spec: glmSpec(String(e.pid)) })
      } else if (e.op === 'probe.start') {
        await callTool('probe_run', { run, pid: e.pid })
      } else if (e.op === 'claim.transition') {
        transitionReplies.set(String(e.id), await callTool('claim_transition', {
          run, id: e.id, to: e.to, byProbe: e.by_probe, note: e.note,
          ...(e.to === 'SCOPED' ? { scoped_statement: String(e.note).slice(0, 200) } : {}),
        }))
      } else if (e.op === 'attack.record') {
        await callTool('attack_record', { run, target: e.target, kind: e.kind, text: e.text })
      }
    }
    afterReplay = await state(run)
  })

  it('P4 的 support 被封顶为 lead：H5 → CONTESTED（请求 SUPPORTED），理由含对手重叠 / 未入 bands 与缺 audit', async () => {
    const s = await state('glm')
    const h5 = claimOf(s, 'H5')
    expect(h5?.state).toBe('CONTESTED')
    expect(h5?.lead?.requested).toBe('SUPPORTED')
    expect(h5?.lead?.byProbe).toBe('P4')
    expect(h5?.lead?.caps).toContain('rival_overlap')
    expect(h5?.lead?.caps).toContain('no_audit')
    expect(s.claims.some((c) => c.state === 'SUPPORTED')).toBe(false)
    expect(transitionReplies.get('H5')).toMatch(/封顶不是拒绝/)
    expect(transitionReplies.get('H5')).toContain('H0')
  })

  it('只凭手写频段（asserted）的 kill 同样封顶；家族级 REFUTED 无 audit 也封顶（s0 审计 §7.3）', async () => {
    const h1 = claimOf(await state('glm'), 'H1')
    expect(h1?.state).toBe('CONTESTED')
    expect(h1?.lead?.requested).toBe('REFUTED')
    expect(h1?.lead?.caps).toContain('asserted_band')
    expect(h1?.lead?.caps).toContain('no_audit')
  })

  it('H2 SCOPED = narrowed：带 scoped_statement、不进坟场，之后仍可入 bands', async () => {
    const s = await state('glm')
    const h2 = claimOf(s, 'H2')
    expect(h2?.state).toBe('SCOPED')
    expect(h2?.scopedStatement).toBeTruthy()
    expect(s.graveyard.some((g) => g.id === 'H2')).toBe(false)
    await callTool('prereg_write', {
      run: 'glm',
      spec: {
        pid: 'P6', question: 'H2(narrowed) vs H5', evalCommand: 'echo \'{"spike_count": 30}\'',
        metricKind: 'json', metricSpec: 'spike_count',
        bands: { H2: [20, 26], H5: [28, 34] },
        branches: [{ band: [20, 26], action: 'kill', target: 'H5' }],
      },
    })
  })

  it('H5 / H7 / H0 的 P5 规格通过', async () => {
    await callTool('prereg_write', {
      run: 'glm',
      spec: {
        pid: 'P5', question: 'paired long pulses：H5 vs H7 vs H0', evalCommand: 'echo \'{"spike_count": 30}\'',
        metricKind: 'json', metricSpec: 'spike_count',
        bands: { H5: [29, 34], H7: [22, 27], H0: [24, 28] },
        branches: [
          { band: [29, 34], action: 'kill', target: 'H7' },
          { band: [22, 27], action: 'kill', target: 'H5' },
        ],
      },
    })
  })

  it('H7 登记后 H5 的攻击债仍在（债按 claim 计）；之后点名 H5 的 prereg（P5 / P6）才清偿', async () => {
    const owed = (afterReplay.debts ?? []).filter((d) => d.target === 'H5').map((d) => d.gid)
    expect(owed).toEqual(['G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11']) // no_change 不是债
    expect((await state('glm')).debts ?? []).toEqual([])
    const lines = readFileSync(join(runRoot('glm'), 'journal.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.find((e) => e.op === 'prereg.write' && e.pid === 'P6')?.claims).toEqual(['H2', 'H5'])
  })

  it('一次被拒调用在 rejections.jsonl 出现一行；缺分支首句的 prereg 被接受、返回值带封顶提示、rejections.jsonl 无新行', async () => {
    const before = rejectionLines('glm').length
    await expect(callTool('claim_transition', { run: 'glm', id: 'H7', to: 'SUPPORTED', byProbe: 'P9' })).rejects.toThrow(/已落地/)
    const after = rejectionLines('glm')
    expect(after.length).toBe(before + 1)
    expect(after.at(-1)?.op).toBe('claim_transition')
    expect(JSON.stringify(after.at(-1)?.args)).toContain('P9')
    const reply = await callTool('prereg_write', {
      run: 'glm',
      spec: {
        pid: 'P7', question: 'H7 vs H0', discrimination: 'd=1.2, σ=2.0, r*=3', evalCommand: 'echo \'{"spike_count": 12}\'',
        metricKind: 'json', metricSpec: 'spike_count',
        bands: { H7: [10, 14], H0: [16, 20] }, provenance: { H7: 'asserted', H0: 'asserted' },
        branches: [{ band: [10, 14], action: 'support', target: 'H7' }, { band: [16, 20], action: 'kill', target: 'H7' }],
      },
    })
    expect(reply).toContain('P7 已预登记')
    expect(reply).toMatch(/封顶/)
    expect(reply).toContain('headline')
    expect(rejectionLines('glm').length).toBe(before + 1)
  })

  it('schema 层拒绝（zod 入参校验，handler 之前）同样落 rejections.jsonl 一行', async () => {
    const before = rejectionLines('glm').length
    await expect(callTool('claim_transition', { run: 'glm', id: 'H7', to: 'NOT_A_STATE' })).rejects.toThrow(/Input validation error/)
    const after = rejectionLines('glm')
    expect(after.length).toBe(before + 1)
    expect(after.at(-1)?.op).toBe('claim_transition')
    expect(String(after.at(-1)?.error)).toContain('Input validation error')
  })

  it('legacy 归档原样可重放：GLM 归档的 trace / prereg gate 仍全绿', () => {
    expect(runTraceGate(campaign).passed).toBe(true)
    expect(runPreregGate(campaign).passed).toBe(true)
  })
})

// ── 封顶与 K3 审计 ────────────────────────────────────────────────────
describe('lead 封顶与 claim_transition{audit}', () => {
  const run = 'k3'
  let simSha = ''
  const auditOk = `.rlm-jobs/${run}/k3/H1/ab12/out.md`
  const auditSelf = `.rlm-jobs/${run}/k3/H0/cd34-self/out.md`

  beforeAll(async () => {
    await callTool('research_init', { run, mode: 'identify' })
    await callTool('claim_propose', { run, id: 'H1', statement: '附加持续内向流', predicts: ['long step 计数高于基线'] })
    simSha = writeWorkFile(`research-work/${run}/sim/h1.json`, '{"counts_mean": 30, "counts_sd": 2, "reps": 64}\n')
    writeWorkFile(auditOk, `# K3 审计\n数字均有出处。\nSTATUS: ok PATH: ${auditOk}\n`)
    writeWorkFile(auditSelf, `# K3 审计（父会话代写）\nSTATUS: ok SELF_REVIEWED PATH: ${auditSelf}\n`)
    const reply = await callTool('prereg_write', {
      run,
      spec: {
        pid: 'P1', question: 'H1 vs H0', discrimination: 'd=5, σ=2, r*=1',
        evalCommand: 'echo \'{"spike_count": 30}\'', metricKind: 'json', metricSpec: 'spike_count',
        bands: { H1: [26, 34], H0: [8, 16] },
        provenance: { H1: 'sim:h1', H0: `sim:research-work/${run}/sim/h1.json` },
        sims: [{ path: 'sim/h1.json', sha256: simSha.slice(0, 12) }],
        branches: [
          { band: [26, 34], action: 'support', target: 'H1', headline: 'H1 的附加内向流在 long step 上可见' },
          { band: [26, 34], action: 'kill', target: 'H0', headline: '无附加机制被排除' },
          { band: [8, 16], action: 'kill', target: 'H1', headline: 'long step 无附加电流' },
        ],
      },
    })
    expect(reply).not.toMatch(/封顶/)
    await callTool('probe_run', { run, pid: 'P1' })
  })

  it('IR-D3：冻结规格里的 sims 是规范化路径 + 宿主算的完整 sha256', () => {
    const frozen = JSON.parse(readFileSync(join(runRoot(run), 'prereg', 'P1.json'), 'utf-8'))
    expect(frozen.sims).toEqual([{ path: `research-work/${run}/sim/h1.json`, sha256: simSha }])
  })

  it('SUPPORTED 不带 audit → CONTESTED（lead: no_audit）；带合格 audit 重迁 → SUPPORTED', async () => {
    const capped = await callTool('claim_transition', { run, id: 'H1', to: 'SUPPORTED', byProbe: 'P1', note: '30 (P1) 在 support 带' })
    expect(capped).toMatch(/lead/)
    expect(capped).toMatch(/K3/)
    let h1 = claimOf(await state(run), 'H1')
    expect(h1?.state).toBe('CONTESTED')
    expect(h1?.lead?.caps).toEqual(['no_audit'])
    await callTool('claim_transition', { run, id: 'H1', to: 'SUPPORTED', byProbe: 'P1', note: '审计后', audit: auditOk })
    h1 = claimOf(await state(run), 'H1')
    expect(h1?.state).toBe('SUPPORTED')
    expect(h1?.lead).toBeUndefined()
    const journal = readFileSync(join(runRoot(run), 'journal.jsonl'), 'utf-8')
    expect(journal).toContain(createHash('sha256').update(readFileSync(join(researchCwd, auditOk))).digest('hex'))
  })

  it('动作与预登记相反（P1 对 H0 写的是 kill）→ 拒绝', async () => {
    await expect(callTool('claim_transition', { run, id: 'H0', to: 'SUPPORTED', byProbe: 'P1', audit: auditOk }))
      .rejects.toThrow(/kill/)
  })

  it('父会话代写的审计（SELF_REVIEWED / -self）→ 家族级 REFUTED 封顶 self_reviewed', async () => {
    await callTool('claim_transition', { run, id: 'H0', to: 'REFUTED', byProbe: 'P1', note: '30 (P1)', audit: auditSelf })
    const h0 = claimOf(await state(run), 'H0')
    expect(h0?.state).toBe('CONTESTED')
    expect(h0?.lead?.caps).toEqual(['self_reviewed'])
  })

  it('audit 不在 .rlm-jobs/<run>/ 下或末行不是 STATUS: ok → audit_unverified（封顶，不拒）', async () => {
    writeWorkFile(`research-work/${run}/fake-audit.md`, 'STATUS: ok PATH: research-work/x\n')
    await callTool('claim_transition', { run, id: 'H0', to: 'REFUTED', byProbe: 'P1', audit: `research-work/${run}/fake-audit.md` })
    expect(claimOf(await state(run), 'H0')?.lead?.caps).toEqual(['audit_unverified'])
  })

  it('reconcile 接受结论行 `H0: LEAD`；trace 把 lead 迁移当作证据迁移', async () => {
    await callTool('attack_record', { run, target: 'H1', kind: 'no_change', text: '单格，但 d=5' })
    writeWorkFile(`research-work/${run}/REPORT.md`, ['# 报告', '', 'long step 计数 30 (P1)。', '', '- H1: SUPPORTED', '- H0: LEAD'].join('\n'))
    const text = await callTool('report_declare', { run, path: 'REPORT.md' })
    expect(text).toContain('三道 gate 全绿')
  })
})

describe('instance 级 REFUTED 不审（HC-Q6 保持）；asserted 带的 kill 封顶', () => {
  const run = 'inst'
  beforeAll(async () => {
    await callTool('research_init', { run, mode: 'identify' })
    await callTool('claim_propose', { run, id: 'H1', statement: 'g=2 的参数点', predicts: ['计数 ≈ 30'], level: 'instance' })
    await callTool('claim_propose', { run, id: 'H2', statement: 'g=5 的参数点', predicts: ['计数 ≈ 45'], level: 'instance' })
    const sha = writeWorkFile(`research-work/${run}/sim/g.json`, '{"counts_mean": 45}\n')
    await callTool('prereg_write', {
      run,
      spec: {
        pid: 'P1', question: 'g=2 vs g=5', discrimination: 'd=7', evalCommand: 'echo \'{"spike_count": 31}\'',
        metricKind: 'json', metricSpec: 'spike_count',
        bands: { H1: [26, 34], H2: [40, 50], H0: [8, 16] },
        provenance: { H1: 'sim:g', H2: 'sim:g' },
        sims: [{ path: `research-work/${run}/sim/g.json`, sha256: sha }],
        branches: [
          { band: [26, 34], action: 'kill', target: 'H2', headline: 'g=5 被排除' },
          { band: [26, 34], action: 'kill', target: 'H0', headline: 'null 被排除' },
        ],
      },
    })
    await callTool('probe_run', { run, pid: 'P1' })
  })

  it('instance 级、sim 出处的 kill：REFUTED 照常（不需要 audit）', async () => {
    await callTool('claim_transition', { run, id: 'H2', to: 'REFUTED', byProbe: 'P1' })
    const s = await state(run)
    expect(claimOf(s, 'H2')?.state).toBe('REFUTED')
    expect(s.graveyard.some((g) => g.id === 'H2')).toBe(true)
  })

  it('H0 的带没有出处（asserted）：kill 封顶 lead', async () => {
    await callTool('claim_transition', { run, id: 'H0', to: 'REFUTED', byProbe: 'P1', audit: '.rlm-jobs/inst/none.md' })
    expect(claimOf(await state(run), 'H0')?.lead?.caps).toContain('asserted_band')
  })

  it('出处标签写成没核对过的形状（measured:foo）→ 不算有出处，照样封顶', async () => {
    const reply = await callTool('prereg_write', {
      run,
      spec: {
        pid: 'P2', question: 'q', discrimination: 'd=3', evalCommand: 'echo \'{"spike_count": 30}\'',
        metricKind: 'json', metricSpec: 'spike_count',
        bands: { H1: [26, 34], H0: [8, 16] }, provenance: { H1: 'measured:foo', H0: 'measured:P1' },
        branches: [{ band: [8, 16], action: 'kill', target: 'H1', headline: 'x' }, { band: [26, 34], action: 'kill', target: 'H0', headline: 'y' }],
      },
    })
    expect(reply).toContain('measured:foo')
    expect(reply).not.toContain('H0 的频段出处')
  })

  it('SCOPED 在 mode run 里必须带 scoped_statement；narrowed 仍是活对手（可再入 bands）', async () => {
    await expect(callTool('claim_transition', { run, id: 'H1', to: 'SCOPED', byProbe: 'P1' })).rejects.toThrow(/scoped_statement/)
  })
})

describe('IR-D3：prereg 引用 sim 记录（路径 + sha256，宿主核对）', () => {
  const run = 'sims'
  const base = {
    pid: 'P1', question: 'q', evalCommand: 'echo \'{"spike_count": 1}\'', metricKind: 'json', metricSpec: 'spike_count',
    bands: { H1: [0, 5], H0: [10, 20] },
    branches: [{ band: [0, 5], action: 'kill', target: 'H0' }],
  }
  let sha = ''
  beforeAll(async () => {
    await callTool('research_init', { run, mode: 'identify' })
    await callTool('claim_propose', { run, id: 'H1', statement: 'x', predicts: ['低计数'] })
    sha = writeWorkFile(`research-work/${run}/sim/a.json`, '{"counts_mean": 2}\n')
  })

  it('sha256 不符 → 拒绝（并落 rejections.jsonl）', async () => {
    await expect(callTool('prereg_write', { run, spec: { ...base, sims: [{ path: 'sim/a.json', sha256: 'deadbeefdeadbeef' }] } }))
      .rejects.toThrow(/sha256/)
    expect(rejectionLines(run).at(-1)?.op).toBe('prereg_write')
  })

  it('sim/ 目录外、符号链接、缺失 → 拒绝', async () => {
    writeWorkFile(`research-work/${run}/other.json`, '{}')
    await expect(callTool('prereg_write', { run, spec: { ...base, sims: [{ path: 'other.json', sha256: sha }] } }))
      .rejects.toThrow(/sim\//)
    symlinkSync(join(researchCwd, `research-work/${run}/sim/a.json`), join(researchCwd, `research-work/${run}/sim/link.json`))
    await expect(callTool('prereg_write', { run, spec: { ...base, sims: [{ path: 'sim/link.json', sha256: sha }] } }))
      .rejects.toThrow(/链接/)
    await expect(callTool('prereg_write', { run, spec: { ...base, sims: [{ path: 'sim/none.json', sha256: sha }] } }))
      .rejects.toThrow(/不存在/)
  })

  it('出处标签指向未引用的 sim 记录或未落地的探针 → 拒绝（出处是可核对的事实）', async () => {
    await expect(callTool('prereg_write', { run, spec: { ...base, provenance: { H1: 'sim:a' } } })).rejects.toThrow(/sim:a/)
    await expect(callTool('prereg_write', { run, spec: { ...base, provenance: { H1: 'measured:P9' } } })).rejects.toThrow(/P9/)
    await callTool('prereg_write', { run, spec: { ...base, provenance: { H1: 'sim:a' }, sims: [{ path: 'sim/a.json', sha256: sha }] } })
  })
})
