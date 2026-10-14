import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AgentStreamPayload, AskUserRequest } from '@proma/shared'
import { parseBundle } from '@proma/shared/research-record'
import {
  configureResearchRecord,
  getRecord,
  handleAgentEvent,
  handleAskUserAnswered,
  intervene,
  listArchives,
  openArchive,
  readArchiveBundle,
  readLiveBundle,
  releaseRecord,
  stopAllRecordWatches,
  verifyChain,
} from './research-record-service'
import { attach, gate, syncGate } from './research-control'
import type { ResearchIntervention, ResearchRecordSnapshot } from '../../types/research-record'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const P0R = resolve(import.meta.dir, '../../../../../research/campaigns/2026-10-14-glm53flash-p0-oneline-ca_rebound')

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
