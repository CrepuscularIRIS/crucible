import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseBundle } from './load.ts'
import {
  claimsAt,
  derivation,
  evidenceCells,
  feedbackChange,
  flags,
  focusAt,
  forkCandidates,
  simsBefore,
  timeline,
} from './project.ts'

const CAMPAIGNS = join(import.meta.dir, '../../../../research/campaigns')
const ONE = join(CAMPAIGNS, '2026-10-14-glm53flash-oneline-ca_rebound')
const S0 = join(CAMPAIGNS, '2026-10-14-glm53flash-ca_rebound-s0')
const P0R = join(CAMPAIGNS, '2026-10-14-glm53flash-p0-oneline-ca_rebound')
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function files(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out[relative(dir, p)] = readFileSync(p, 'utf8')
    }
  }
  walk(dir)
  return out
}
const load = (dir: string, extra: Record<string, string> = {}) => parseBundle({ ...files(dir), ...extra }, { sha256 })

describe('ONE（一句话）', () => {
  const rec = load(ONE)

  test('终态与完整性', () => {
    expect(rec.integrity).toBe('ok')
    expect(rec.events).toHaveLength(105)
    const states = Object.fromEntries([...claimsAt(rec).values()].map((c) => [c.id, c.state]))
    expect(states).toEqual({ H1: 'SCOPED', H2: 'SCOPED', H3: 'SUPPORTED', H4: 'SCOPED', H5: 'REFUTED' })
  })

  test('simsBefore 两个窗口', () => {
    const near = simsBefore(rec, 'P2')
    expect(near.values).toHaveLength(8)
    expect([near.min, near.max]).toEqual([13, 20])
    const all = simsBefore(rec, 'P2', { from: 1 })
    expect(all.values).toHaveLength(16)
    expect([all.min, all.max]).toEqual([13, 22])
  })

  test('focusAt', () => {
    expect(focusAt(rec, 63)).toMatchObject({ kind: 'awaiting', pids: ['P2'] })
    expect(focusAt(rec, 66)).toMatchObject({ kind: 'interpret', pids: ['P2'] })
    expect(focusAt(rec, 105).kind).toBe('done')
  })

  test('P2 列证据格', () => {
    const p2 = Object.fromEntries(evidenceCells(rec).filter((c) => c.pid === 'P2').map((c) => [c.hid, c]))
    expect(p2.H5?.mark).toBe('kill')
    expect(p2.H3?.mark).toBe('support')
    expect(p2.H4?.judgmentSeq).toBe(69)
    expect(p2.H1?.mark).toBe('unbanded')
  })

  test('没有 parent → 派生关系未记录；annotations 可补', () => {
    expect(derivation(rec).status).toBe('unrecorded')
    expect(derivation(rec, { H4: 'H1' })).toEqual({ status: 'annotated', parents: { H4: 'H1' } })
  })

  test('一次反馈改变 P1 → P2', () => {
    const fc = feedbackChange(rec)!
    expect([fc.from, fc.to, fc.observed]).toEqual(['P1', 'P2', 17.3333])
    expect(fc.landedIn).toEqual(['H3'])
  })

  test('标记：M-reps 落在 P2，M-null 指向 REPORT.md:11', () => {
    const f = flags(rec)
    expect(f.some((x) => x.code === 'M-reps' && x.pid === 'P2' && x.hid === 'H5')).toBe(true)
    expect(f.some((x) => x.code === 'M-null' && x.note.startsWith('REPORT.md:11'))).toBe(true)
  })

  test('干预排在 journal_lines 之后、下一行之前', () => {
    const iv = JSON.stringify({ id: 'U1', ts: '2026-10-14T13:04:16Z', actor: 'user', kind: 'pause', journal_lines: 66 })
    const r = load(ONE, { 'interventions.jsonl': `${iv}\n` })
    const order = timeline(r).map((i) => ('event' in i ? i.event.seq : 'U1'))
    expect(order.slice(65, 68)).toEqual([66, 'U1', 67])
    expect(rec.interventions).toBeNull()
  })

  test('回放：后来才作答的分叉，在作答之前的行仍是"等你决定"', () => {
    const fork = { id: 'F1', class: 'F-a', question: 'q', options: [] }
    const ivs = [
      { id: 'U1', ts: '', actor: 'host', kind: 'fork_open', journal_lines: 60, fork },
      { id: 'U2', ts: '', actor: 'user', kind: 'fork_answer', journal_lines: 70, fork: { ...fork, chosen: 'a' } },
    ]
    const r = load(ONE, { 'interventions.jsonl': `${ivs.map((x) => JSON.stringify(x)).join('\n')}\n` })
    expect(focusAt(r, 65).kind).toBe('fork')
    expect(focusAt(r, 70).kind).not.toBe('fork')
  })

  test('改 journal 一字节 → broken', () => {
    const f = files(ONE)
    const r = parseBundle({ ...f, 'journal.jsonl': f['journal.jsonl']!.replace('"spike_count":13,', '"spike_count":14,') }, { sha256 })
    expect(r.integrity).toBe('broken')
    expect(r.brokenAt).toBe(66)
  })
})

describe('S0 / P0R', () => {
  const s0 = load(S0)
  const p0 = load(P0R)

  test('F-a 在三份 journal 的 7 次 REFUTED 上恰好命中 ONE:67、S0:60、P0R:68', () => {
    const refuted = [load(ONE), s0, p0].flatMap((r) =>
      r.events.filter((e) => e.op === 'claim.transition' && e.data.to === 'REFUTED'),
    )
    expect(refuted).toHaveLength(7)
    expect(forkCandidates(load(ONE)).map((h) => h.seq)).toEqual([67])
    expect(forkCandidates(s0).map((h) => [h.seq, h.hid])).toEqual([[60, 'H6']])
    expect(forkCandidates(p0).map((h) => [h.seq, h.hid])).toEqual([[68, 'H2']])
  })

  test('S0 P4 的 H1 区间无仿真来源 → M-band', () => {
    expect(flags(s0).some((f) => f.code === 'M-band' && f.pid === 'P4' && f.hid === 'H1')).toBe(true)
  })

  test('P0R：连写两个 prereg、失败探针、非契约子任务', () => {
    expect(focusAt(p0, 42)).toMatchObject({ kind: 'awaiting', pids: ['P0', 'P1'] })
    expect(focusAt(p0, 47)).toMatchObject({ kind: 'failed', pids: ['P1'] })
    expect(focusAt(p0, 51)).toMatchObject({ kind: 'awaiting', pids: ['P2'] })
    expect(evidenceCells(p0).find((c) => c.pid === 'P1' && c.hid === 'H1')?.mark).toBe('failed')
    expect(p0.childJobs.map((j) => [j.name, j.status])).toEqual([
      ['sim-characterize', 'nonconforming'],
      ['sim-mechspace', 'nonconforming'],
    ])
    expect(p0.childJobs[0]!.lastLine).toStartWith('BLOCKED:')
    expect(p0.childJobs[1]!.lastLine).toStartWith('COMPLETED:')
  })

  test('运行中布局：.rlm-jobs 下有 brief 无 out = 运行中；合契约的 STATUS 行可解析', () => {
    const r = load(ONE, {
      '.rlm-jobs/ca_rebound/sim/mech/a3f1/brief.md': 'x',
      '.rlm-jobs/ca_rebound/grill/H5/9c0d/brief.md': 'x',
      '.rlm-jobs/ca_rebound/grill/H5/9c0d/out.md': 'done\n\nSTATUS: ok SELF_REVIEWED PATH: findings.md\n',
    })
    expect(r.childJobs).toEqual([
      { name: 'grill-H5-9c0d', status: 'ok', selfReviewed: true, path: 'findings.md', lastLine: 'STATUS: ok SELF_REVIEWED PATH: findings.md' },
      { name: 'sim-mech-a3f1', status: 'running' },
    ])
  })
})
