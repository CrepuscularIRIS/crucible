import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { buildReport } from '../../../../../research/report/judge-report'
import type { AgentStreamPayload, AskUserRequest } from '@proma/shared'
import { parseBundle, workbench } from '@proma/shared/research-record'
import {
  configureResearchRecord,
  getPendingIntake,
  getRecord,
  handleAgentEvent,
  handleAskUserAnswered,
  intervene,
  judgeReport,
  listArchives,
  openArchive,
  readStageDoc,
  readArchiveBundle,
  readLiveBundle,
  releaseRecord,
  stopAllRecordWatches,
  verifyChain,
} from './research-record-service'
import { attach, gate, syncGate } from './research-control'
import type { ResearchIntervention, ResearchRecordSnapshot } from '../../types/research-record'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const CAMPAIGNS = resolve(import.meta.dir, '../../../../../research/campaigns')
const P0R = join(CAMPAIGNS, '2026-10-14-glm53flash-p0-oneline-ca_rebound')
const ONE = join(CAMPAIGNS, '2026-10-14-glm53flash-oneline-ca_rebound')
const DELIVERY = join(CAMPAIGNS, '2026-10-15-glm53flash-delivery-oneline-ca_rebound')

/** 按 MCP 的链规则（prev = 上一行原文 sha256）写 journal。 */
function writeJournal(file: string, ops: Array<Record<string, unknown>>): void {
  let prevLine = ''
  const lines = ops.map((op, i) => {
    const line = JSON.stringify({ ts: `2026-10-14T13:00:0${i}Z`, ...op, prev: sha(prevLine) })
    prevLine = line
    return line
  })
  writeFileSync(file, `${lines.join('\n')}\n`)
}

function appendJournal(file: string, op: Record<string, unknown>): void {
  const lines = readFileSync(file, 'utf-8').split('\n').filter(Boolean)
  appendFileSync(file, `${JSON.stringify({ ts: 'x', ...op, prev: sha(lines.at(-1) ?? '') })}\n`)
}

let cwd: string
let runDir: string
let running: boolean
const pushes: Array<{ sessionId: string; snapshot: ResearchRecordSnapshot | null }> = []
const SID = 'sess-1'

function interventions(): ResearchIntervention[] {
  const file = join(runDir, 'interventions.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'proma-research-record-'))
  runDir = join(cwd, '.proma-research', 'r1')
  mkdirSync(join(runDir, 'prereg'), { recursive: true })
  writeJournal(join(runDir, 'journal.jsonl'), [
    { op: 'run.init', run: 'r1' },
    { op: 'claim.propose', id: 'H1' },
    { op: 'prereg.write', pid: 'P1' },
  ])
  writeFileSync(join(runDir, 'prereg', 'P1.json'), '{"pid":"P1"}')
  const job = join(cwd, '.rlm-jobs', 'r1', 'sim', 'mech', 'a3f1')
  mkdirSync(job, { recursive: true })
  writeFileSync(join(job, 'brief.md'), 'brief')
  writeFileSync(join(cwd, 'RULINGS.md'), 'Ruling: x\n')
  running = false
  pushes.length = 0
  configureResearchRecord({
    resolveCwd: (sid) => (sid === SID ? cwd : undefined),
    isRunning: () => running,
    push: (sessionId, snapshot) => pushes.push({ sessionId, snapshot }),
    archiveRoots: [],
  })
})

afterEach(() => {
  stopAllRecordWatches()
  rmSync(cwd, { recursive: true, force: true })
})

describe('记录快照（R1）', () => {
  it('live 布局归一为归档布局：作业目录压平成 child-jobs/<job_name>/，RULINGS 进 child-jobs/', () => {
    const snap = getRecord(SID)!
    expect(snap.source).toBe('live')
    expect(snap.run).toBe('r1')
    expect(Object.keys(snap.files).sort()).toEqual([
      'child-jobs/RULINGS.md',
      'child-jobs/sim-mech-a3f1/brief.md',
      'journal.jsonl',
      'prereg/P1.json',
    ])
    expect(snap.integrity).toEqual({ journal: null, interventions: null })
    expect(snap.control?.state).toBe('IDLE')
  })
  it('会话 cwd 下没有 .proma-research → null（画布不出现，也没有干预可记）', () => {
    rmSync(join(cwd, '.proma-research'), { recursive: true })
    expect(getRecord(SID)).toBeNull()
  })
  it('改 journal 一字节 → integrity.journal 报断链', () => {
    const file = join(runDir, 'journal.jsonl')
    writeFileSync(file, readFileSync(file, 'utf-8').replace('"H1"', '"H9"'))
    expect(getRecord(SID)!.integrity.journal).toContain('第 3 行')
  })
  it('追加一行 journal → 200 ms 内推送快照', async () => {
    getRecord(SID)
    appendJournal(join(runDir, 'journal.jsonl'), { op: 'probe.land', pid: 'P1' })
    await Bun.sleep(200)
    const last = pushes.at(-1)
    expect(last?.sessionId).toBe(SID)
    expect(last?.snapshot?.files['journal.jsonl']).toContain('probe.land')
  })
  it('releaseRecord（画布卸载 / 退订）后不再轮询、不再推送', async () => {
    getRecord(SID)
    releaseRecord(SID)
    appendJournal(join(runDir, 'journal.jsonl'), { op: 'probe.land', pid: 'P1' })
    await Bun.sleep(200)
    expect(pushes).toHaveLength(0)
  })
  it('端到端：readLiveBundle → 渲染层 parseBundle 保留运行中的子任务，与服务的 childJobsFrom 一致', () => {
    const done = join(cwd, '.rlm-jobs', 'r1', 'sim', 'mech', 'b7c2')
    mkdirSync(done, { recursive: true })
    writeFileSync(join(done, 'brief.md'), 'brief')
    writeFileSync(join(done, 'out.md'), 'done\nSTATUS: ok PATH: out.md\n')
    const record = parseBundle(readLiveBundle(cwd, runDir), { sha256: sha })
    expect(record.childJobs.map((j) => [j.name, j.status])).toEqual([['sim-mech-a3f1', 'running'], ['sim-mech-b7c2', 'ok']])
    running = true
    intervene({ sessionId: SID, kind: 'pause' })
    expect(interventions()[0]!.children).toEqual([{ name: 'sim-mech-a3f1', status: 'running' }, { name: 'sim-mech-b7c2', status: 'ok' }])
  })
  it('journal 已有 gate.verdict（无论 JSON 是否紧凑）且会话空闲 → DONE', () => {
    const file = join(runDir, 'journal.jsonl')
    const last = readFileSync(file, 'utf-8').split('\n').filter(Boolean).at(-1)!
    appendFileSync(file, `{"ts": "x", "op": "gate.verdict", "prev": "${sha(last)}"}\n`)
    expect(getRecord(SID)!.control?.state).toBe('DONE')
  })
  it('读 P0R 归档：子任务 out.md 与 RULINGS 都在', () => {
    const files = readArchiveBundle(P0R)
    expect(files['child-jobs/sim-mechspace/out.md']).toContain('COMPLETED')
    expect(files['child-jobs/RULINGS.md']).toBeDefined()
    expect(verifyChain(files['journal.jsonl']!, false)).toBeNull()
  })
  it('交付归档的子任务按 live 嵌套布局存放（child-jobs/<step>/<target>/<nonce>/）也能读出，名字与 live 一致', () => {
    const files = readArchiveBundle(DELIVERY)
    expect(files['child-jobs/rivals-K1-44d9/brief.md']).toContain('K1')
    expect(files['child-jobs/rivals-K1-44d9/out.md']).toContain('STATUS: ok')
    const record = parseBundle(files, { sha256: sha })
    expect(record.childJobs.find((j) => j.name === 'rivals-K1-44d9')?.status).toBe('ok')
    expect(record.childJobs.length).toBeGreaterThanOrEqual(8)
  })
  it('工作台数据源：live 带 rejections.jsonl 与 research-work/<run>/_P*.json（压成 research-work/_P*.json）；草稿变动即推送', async () => {
    writeFileSync(join(runDir, 'rejections.jsonl'), '{"ts":"x","op":"prereg_write","args":{"spec":{"pid":"P1"}},"error":"e"}\n')
    const work = join(cwd, 'research-work', 'r1')
    mkdirSync(work, { recursive: true })
    writeFileSync(join(work, '_P1.json'), '{"pid":"P1"}')
    writeFileSync(join(work, 'ledger.md'), 'x')
    const snap = getRecord(SID)!
    expect(snap.files['rejections.jsonl']).toContain('prereg_write')
    expect(Object.keys(snap.files).filter((k) => k.startsWith('research-work/'))).toEqual(['research-work/_P1.json'])
    const secret = join(cwd, 'secret.json')
    writeFileSync(secret, '{"pid":"leak"}')
    symlinkSync(secret, join(work, '_P9.json'))
    expect(readLiveBundle(cwd, runDir)['research-work/_P9.json']).toBeUndefined()
    writeFileSync(join(work, '_P2.json'), '{"pid":"P2"}')
    await Bun.sleep(200)
    expect(pushes.at(-1)?.snapshot?.files['research-work/_P2.json']).toBe('{"pid":"P2"}')
  })
  it('交付归档 → parseBundle → workbench：三组字段都有数据', () => {
    const rec = parseBundle(readArchiveBundle(DELIVERY), { sha256: sha })
    const wb = workbench(rec)
    expect(wb.timeline).toHaveLength(62)
    expect(wb.probeCards.map((c) => c.pid)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P7'])
    expect(wb.versionChains.find((v) => v.id === 'prereg/P2.json')?.path).toBe('_P2cd.json')
  })
})

describe('归档白名单', () => {
  it('open-archive 只认白名单根（会话 cwd / research/campaigns / 配置的根），拒绝 .. 与符号链接逃逸', () => {
    const outside = mkdtempSync(join(tmpdir(), 'proma-outside-'))
    try {
      writeJournal(join(outside, 'journal.jsonl'), [{ op: 'run.init' }])
      expect(() => openArchive(outside, SID)).toThrow('白名单')
      expect(() => openArchive(join(cwd, '..', outside.split('/').pop()!), SID)).toThrow('白名单')
      symlinkSync(outside, join(cwd, 'escape'))
      expect(() => openArchive(join(cwd, 'escape'), SID)).toThrow('白名单')

      const arch = join(cwd, 'research', 'campaigns', 'one')
      mkdirSync(arch, { recursive: true })
      writeJournal(join(arch, 'journal.jsonl'), [{ op: 'run.init' }])
      const snap = openArchive(arch, SID)
      expect(snap.source).toBe('archive')
      expect(snap.control).toBeNull()
      expect(listArchives(SID).map((a) => a.path)).toEqual([arch])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
  it('intervene 形状不对直接拒绝（kind 未知、forkId 不是 F#——它会拼进 pending 文件名）', () => {
    expect(() => intervene({ sessionId: SID, kind: 'nuke' as 'pause' })).toThrow('参数不合法')
    expect(() => intervene({ sessionId: SID, kind: 'fork_answer', forkId: '../../journal' })).toThrow('参数不合法')
    expect(interventions()).toHaveLength(0)
  })
  it('归档模式（会话没有 live run）下 intervene 被拒', () => {
    expect(() => intervene({ sessionId: 'no-such-session', kind: 'pause' })).toThrow()
  })
})

describe('interventions.jsonl（宿主写，自带哈希链，钉 journal 行号 + 链头）', () => {
  it('intervene 不碰 journal；journal_lines = 当时行数；链逐行相扣', () => {
    const journal = join(runDir, 'journal.jsonl')
    const before = readFileSync(journal)
    running = true
    const first = intervene({ sessionId: SID, kind: 'pause', text: '只测 1 次' })
    running = false
    intervene({ sessionId: SID, kind: 'steer', text: '换协议', affects: ['P2'] })

    expect(readFileSync(journal).equals(before)).toBe(true)
    const [u1, u2] = interventions()
    const journalLines = before.toString().split('\n').filter(Boolean)
    expect(u1).toMatchObject({
      id: 'U1', actor: 'user', kind: 'pause', journal_lines: 3, session_id: SID,
      journal_head: sha(journalLines[2]!), prev: sha(''), state_before: 'RUNNING', state_after: 'PAUSING',
      children: [{ name: 'sim-mech-a3f1', status: 'running' }],
    })
    expect(first.id).toBe('U1')
    expect(u2).toMatchObject({ id: 'U2', kind: 'steer', affects: ['P2'] })
    expect(u2!.prev).toBe(sha(readFileSync(join(runDir, 'interventions.jsonl'), 'utf-8').split('\n')[0]!))
    expect(verifyChain(readFileSync(join(runDir, 'interventions.jsonl'), 'utf-8'), true)).toBeNull()
    expect(getRecord(SID)!.files['interventions.jsonl']).toContain('"U2"')
  })
  it('未接线：wired=false 写进记录，暂停给出 queue 计划', () => {
    running = true
    const result = intervene({ sessionId: SID, kind: 'pause' })
    expect(result.send?.mode).toBe('queue')
    expect(result.control.wired).toBe(false)
    expect(interventions()[0]!.wired).toBe(false)
  })
  it('篡改干预行 → integrity.interventions 报断链', () => {
    intervene({ sessionId: SID, kind: 'pause' })
    intervene({ sessionId: SID, kind: 'resume' })
    const file = join(runDir, 'interventions.jsonl')
    writeFileSync(file, readFileSync(file, 'utf-8').replace('"pause"', '"steer"'))
    expect(getRecord(SID)!.integrity.interventions).toContain('第 2 行')
  })
  it('干预之后 journal 被截短 → integrity.interventions 报 journal_head 对不上；坏行不拖垮快照', () => {
    intervene({ sessionId: SID, kind: 'pause' })
    const journal = join(runDir, 'journal.jsonl')
    writeFileSync(journal, `${readFileSync(journal, 'utf-8').split('\n').slice(0, 2).join('\n')}\n`)
    expect(getRecord(SID)!.integrity).toMatchObject({ journal: null, interventions: expect.stringContaining('journal_head') })
    appendFileSync(join(runDir, 'interventions.jsonl'), '{"id":"U2","ts')
    expect(getRecord(SID)!.control?.state).toBe('PAUSED')
  })
  it('继续：列出暂停时在跑、现在已结束的子任务', () => {
    intervene({ sessionId: SID, kind: 'pause' })
    writeFileSync(join(cwd, '.rlm-jobs', 'r1', 'sim', 'mech', 'a3f1', 'out.md'), 'done\nSTATUS: ok PATH: out.md\n')
    const result = intervene({ sessionId: SID, kind: 'resume' })
    expect(result.send?.text).toContain('sim-mech-a3f1')
    expect(interventions()[1]!.children).toEqual([{ name: 'sim-mech-a3f1', status: 'ok' }])
  })
})

describe('分叉与 eventBus（fork_open / fork_answer / 代记 resume）', () => {
  const request: AskUserRequest = {
    requestId: 'req-1',
    sessionId: SID,
    toolInput: {},
    questions: [{
      question: '只凭 P2 的 1 次测量否定 H5？',
      header: '研究分叉 F-a',
      options: [
        { label: '按预登记分支', description: '解决：收束分支｜成本：0｜仍不确定：单次观测' },
        { label: '只收窄', description: '解决：不让一次测量关掉一个家族｜成本：0｜仍不确定：仍需更强实验' },
      ],
    }],
  }
  const askEvent: AgentStreamPayload = { kind: 'proma_event', event: { type: 'ask_user_request', request } }

  it('研究分叉 AskUser → 宿主记 fork_open + pending/fork-F1.json；回答 → fork_answer（全部选项 + chosen），pending 移除', () => {
    running = true
    handleAgentEvent(SID, askEvent)
    expect(getRecord(SID)!.control?.state).toBe('AWAIT_USER')
    const [open] = interventions()
    expect(open).toMatchObject({ actor: 'host', kind: 'fork_open', fork: { id: 'F1', class: 'F-a', request_id: 'req-1' } })
    expect(open!.fork!.options).toHaveLength(2)
    expect(existsSync(join(runDir, 'pending', 'fork-F1.json'))).toBe(true)

    handleAskUserAnswered(SID, 'req-1', { '只凭 P2 的 1 次测量否定 H5？': '只收窄' })
    const answer = interventions()[1]!
    expect(answer).toMatchObject({ actor: 'user', kind: 'fork_answer', fork: { id: 'F1', chosen: '只收窄' } })
    expect(answer.fork!.options.map((o) => o.label)).toEqual(['按预登记分支', '只收窄'])
    expect(existsSync(join(runDir, 'pending', 'fork-F1.json'))).toBe(false)
    expect(getRecord(SID)!.control?.state).toBe('RUNNING')
  })
  it('非研究分叉的 AskUser 只标 askPending，不留痕；宿主从不写 fork_answer', () => {
    running = true
    handleAgentEvent(SID, { kind: 'proma_event', event: { type: 'ask_user_request', request: { ...request, questions: [{ ...request.questions[0]!, header: '其他' }] } } })
    expect(interventions()).toHaveLength(0)
    handleAskUserAnswered(SID, 'req-1', { q: 'a' })
    expect(interventions()).toHaveLength(0)
  })
  it('AWAIT_USER 时暂停：pending 保持，状态 PAUSING 且 waitingOn = 等你回答分叉', () => {
    running = true
    handleAgentEvent(SID, askEvent)
    const result = intervene({ sessionId: SID, kind: 'pause' })
    expect(result.control).toMatchObject({ state: 'PAUSING', waitingOn: '等你回答分叉' })
    expect(existsSync(join(runDir, 'pending', 'fork-F1.json'))).toBe(true)
  })
  it('PAUSED 中出现新一轮（用户直接在输入框发消息）→ 代记 resume（host）；ask 引发的新一轮不代记', () => {
    intervene({ sessionId: SID, kind: 'pause' })
    expect(getRecord(SID)!.control?.state).toBe('PAUSED')
    handleAgentEvent(SID, { kind: 'proma_event', event: { type: 'run_started', startedAt: 1 } })
    expect(interventions().at(-1)).toMatchObject({ kind: 'resume', actor: 'host' })

    intervene({ sessionId: SID, kind: 'pause' })
    intervene({ sessionId: SID, kind: 'ask', text: '为什么？' })
    handleAgentEvent(SID, { kind: 'proma_event', event: { type: 'run_started', startedAt: 2 } })
    expect(interventions().at(-1)).toMatchObject({ kind: 'ask' })
  })
  it('应用重启：attach 从磁盘恢复未结束的 pause → 闸门直接只读', () => {
    intervene({ sessionId: SID, kind: 'pause' })
    syncGate(SID, undefined, 'auto') // 模拟重启后进程内状态清空
    expect(gate(SID).readOnly).toBe(false)
    attach(SID)
    expect(gate(SID)).toMatchObject({ readOnly: true, stopAtTurn: true, reason: 'U1' })
  })
})

describe('阶段文档与状态条输入（research-work/<run>/）', () => {
  const work = () => join(cwd, 'research-work', 'r1')
  const reconfigure = (env: NodeJS.ProcessEnv, archiveRoots: string[] = []) => configureResearchRecord({
    resolveCwd: (sid) => (sid === SID ? cwd : undefined),
    isRunning: () => running,
    push: (sessionId, snapshot) => pushes.push({ sessionId, snapshot }),
    archiveRoots,
    env,
  })

  beforeEach(() => {
    mkdirSync(join(work(), 'sim'), { recursive: true })
    writeFileSync(join(work(), 'sim', 'a.json'), '{}')
    writeFileSync(join(work(), 'rivals.md'), '# 补族')
    utimesSync(join(work(), 'rivals.md'), 1_000, 1_000)
    writeFileSync(join(work(), 'lessons.md'), '# 教训')
    utimesSync(join(work(), 'lessons.md'), 2_000, 2_000)
  })

  it('快照带工作目录文档（新的在前，不含 sim/）与预算总额（PROMA_EVAL_BUDGET，缺省 = MCP 的 8）', () => {
    reconfigure({})
    const snap = getRecord(SID)!
    expect(snap.workdir!.docs.map((d) => d.path)).toEqual(['lessons.md', 'rivals.md'])
    expect(snap.workdir!.simMtimeMs).toBeGreaterThan(0)
    expect(snap.budgetTotal).toBe(8)
    reconfigure({ PROMA_EVAL_BUDGET: '5' })
    expect(getRecord(SID)!.budgetTotal).toBe(5)
  })

  it('没有工作目录 → workdir null，快照照常', () => {
    rmSync(join(cwd, 'research-work'), { recursive: true, force: true })
    expect(getRecord(SID)!.workdir).toBeNull()
  })

  it('agent 新写一份文档 → 200 ms 内推送快照（运行中打开的画布也能看到）', async () => {
    getRecord(SID)
    writeFileSync(join(work(), 'forecast.md'), '# 预报')
    await new Promise((r) => setTimeout(r, 200))
    const last = pushes.at(-1)?.snapshot
    expect(last?.workdir?.docs[0]?.path).toBe('forecast.md')
  })

  it('readStageDoc：live 读会话 cwd 下的工作目录；越界拒绝', () => {
    expect(readStageDoc({ sessionId: SID, path: 'lessons.md' })).toMatchObject({ path: 'lessons.md', text: '# 教训' })
    expect(() => readStageDoc({ sessionId: SID, path: '../../.proma-research/r1/journal.jsonl' })).toThrow()
    expect(() => readStageDoc({ sessionId: SID, path: 'sim/a.json' })).toThrow()
    expect(() => readStageDoc({ sessionId: 'other', path: 'lessons.md' })).toThrow()
    expect(() => readStageDoc({ sessionId: SID, path: 42 as unknown as string })).toThrow('参数不合法')
  })

  it('readStageDoc / openArchive：归档读 <归档>/research-work/，归档路径走同一白名单', () => {
    const arch = join(cwd, 'arch')
    mkdirSync(join(arch, 'research-work'), { recursive: true })
    writeJournal(join(arch, 'journal.jsonl'), [{ op: 'run.init' }])
    writeFileSync(join(arch, 'research-work', 'REPORT.md'), '# 草稿')
    expect(openArchive(arch, SID).workdir!.docs.map((d) => d.path)).toEqual(['REPORT.md'])
    expect(readStageDoc({ sessionId: SID, archivePath: arch, path: 'REPORT.md' }).text).toBe('# 草稿')
    const outside = mkdtempSync(join(tmpdir(), 'proma-outside-'))
    try {
      mkdirSync(join(outside, 'research-work'))
      writeFileSync(join(outside, 'research-work', 'x.md'), 'x')
      writeJournal(join(outside, 'journal.jsonl'), [{ op: 'run.init' }])
      expect(() => readStageDoc({ sessionId: SID, archivePath: outside, path: 'x.md' })).toThrow('白名单')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('K0 开局草稿（run 记录建立之前，<cwd>/.research-pending/K0-intake.md）', () => {
  const DRAFT = 'status: pending_user\nmode: identify\nsuccess_predicate: <img src=x onerror=alert(1)>\n'
  const dir = () => join(cwd, '.research-pending')
  const draft = () => join(dir(), 'K0-intake.md')

  beforeEach(() => {
    rmSync(join(cwd, '.proma-research'), { recursive: true })
    mkdirSync(dir())
  })

  it('还没有 run：返回草稿原文；首个 status 不是 pending_user / 没有草稿 / 未知会话 → null', () => {
    writeFileSync(draft(), DRAFT)
    expect(getPendingIntake(SID)).toBe(DRAFT)
    expect(getPendingIntake('other')).toBeNull()
    writeFileSync(draft(), 'status: confirmed\nmode: identify\n# status: pending_user\n')
    expect(getPendingIntake(SID)).toBeNull()
    rmSync(draft())
    expect(getPendingIntake(SID)).toBeNull()
    expect(() => getPendingIntake(42 as unknown as string)).toThrow('参数不合法')
  })

  it('run 记录已建立 → null（画布走实时视图）', () => {
    writeFileSync(draft(), DRAFT)
    mkdirSync(runDir, { recursive: true })
    writeJournal(join(runDir, 'journal.jsonl'), [{ op: 'run.init', run: 'r1' }])
    expect(getPendingIntake(SID)).toBeNull()
  })

  it('只读这一个路径：文件或目录是符号链接、不是普通文件、超过上限 → null', () => {
    const secret = join(cwd, 'secret.md')
    writeFileSync(secret, DRAFT)
    symlinkSync(secret, draft())
    expect(getPendingIntake(SID)).toBeNull()
    rmSync(draft())
    mkdirSync(draft())
    expect(getPendingIntake(SID)).toBeNull()
    rmSync(dir(), { recursive: true })
    const elsewhere = join(cwd, 'elsewhere')
    mkdirSync(elsewhere)
    writeFileSync(join(elsewhere, 'K0-intake.md'), DRAFT)
    symlinkSync(elsewhere, dir())
    expect(getPendingIntake(SID)).toBeNull()
    rmSync(dir())
    mkdirSync(dir())
    writeFileSync(draft(), DRAFT)
    truncateSync(draft(), 2 * 1024 * 1024 + 1)
    expect(getPendingIntake(SID)).toBeNull()
  })

  it('草稿出现 / 改写 → 推送 null 快照（画布据此重读草稿）；getPendingIntake 自己开始轮询', async () => {
    expect(getPendingIntake(SID)).toBeNull()
    writeFileSync(draft(), DRAFT)
    await Bun.sleep(200)
    expect(pushes.at(-1)).toEqual({ sessionId: SID, snapshot: null })
    const n = pushes.length
    writeFileSync(draft(), `${DRAFT}depth: full\n`)
    await Bun.sleep(200)
    expect(pushes.length).toBeGreaterThan(n)
  })
})

describe('评委报告（research/report/judge-report.ts，同一份记录）', () => {
  it('live run 没有 annotations.json → 说明原因，不抛', () => {
    const r = judgeReport({ sessionId: SID })
    expect('error' in r && r.error).toContain('annotations.json')
  })

  it('有注记的归档 → 确定性 HTML（与答辩页同一生成器）', () => {
    configureResearchRecord({ resolveCwd: () => cwd, isRunning: () => false, push: () => {}, archiveRoots: [CAMPAIGNS] })
    const r = judgeReport({ sessionId: SID, archivePath: ONE })
    const title = (JSON.parse(readFileSync(join(ONE, 'annotations.json'), 'utf-8')) as { case: { title: string } }).case.title
    expect('html' in r && r.html).toContain(title)
    expect(judgeReport({ sessionId: SID, archivePath: ONE })).toEqual(r)
  })

  it('画布读的归档捆与答辩页生成器读整棵目录，出的 HTML 字节相同', () => {
    configureResearchRecord({ resolveCwd: () => cwd, isRunning: () => false, push: () => {}, archiveRoots: [CAMPAIGNS] })
    const r = judgeReport({ sessionId: SID, archivePath: ONE })
    expect('html' in r && r.html).toBe(buildReport(ONE, { archive: basename(ONE) }))
  })

  it('无注记的归档 → 说明原因', () => {
    const arch = join(cwd, 'arch')
    mkdirSync(arch)
    writeJournal(join(arch, 'journal.jsonl'), [{ op: 'run.init' }])
    const r = judgeReport({ sessionId: SID, archivePath: arch })
    expect('error' in r && r.error).toContain('annotations.json')
  })

  it('归档不在白名单 → 抛错', () => {
    expect(() => judgeReport({ sessionId: SID, archivePath: ONE })).toThrow('白名单')
  })
})
