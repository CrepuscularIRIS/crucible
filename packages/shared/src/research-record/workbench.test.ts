import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseBundle } from './load.ts'
import { workbench } from './workbench.ts'

const DELIVERY = join(import.meta.dir, '../../../../research/campaigns/2026-10-15-glm53flash-delivery-oneline-ca_rebound')
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function files(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (!p.includes('/sim/')) out[relative(dir, p)] = readFileSync(p, 'utf8')
    }
  }
  walk(dir)
  return out
}

const rec = parseBundle(files(DELIVERY), { sha256 })

describe('parseBundle：rejections.jsonl 与 research-work 草稿', () => {
  test('31 行拒绝，行号 1 起算；草稿 10 份，pid 取内容', () => {
    expect(rec.rejections).toHaveLength(31)
    expect(rec.rejections![8]).toMatchObject({ line: 9, op: 'prereg_write', pid: 'P2' })
    expect(rec.drafts.map((d) => d.path)).toContain('_P2cd.json')
    expect(rec.drafts.find((d) => d.path === '_P5c.json')?.pid).toBe('P5b')
  })

  test('坏行（null / 数组 / 数字 / spec 非对象）跳过或忽略 spec，不拖垮整份记录', () => {
    const r = parseBundle({ 'journal.jsonl': '', 'rejections.jsonl': 'null\n[]\n5\n{"ts":"x","op":"prereg_write","args":{"spec":"P1"},"error":"e"}\n' }, { sha256 })
    expect(r.rejections).toEqual([{ line: 4, ts: 'x', op: 'prereg_write', error: 'e' }])
  })

  test('没有 rejections.jsonl → null（未记录，不是 0 条）', () => {
    expect(parseBundle({ 'journal.jsonl': '' }, { sha256 }).rejections).toBeNull()
  })
})

describe('timeline', () => {
  const { timeline } = workbench(rec)

  test('全部 62 行按序；结构化字段给 pid / hids', () => {
    expect(timeline.map((e) => e.seq)).toEqual(Array.from({ length: 62 }, (_, i) => i + 1))
    expect(timeline[17]).toMatchObject({ seq: 18, op: 'prereg.write', pid: 'P1', title: '登记 P1' })
    expect(timeline[17]!.hids).toHaveLength(13)
    expect(timeline[55]).toMatchObject({ op: 'attack.record', hids: ['H2'] })
    expect(timeline[55]!.pid).toBeUndefined()
    expect(timeline[0]!.hids).toEqual([])
  })

  test('被封顶的迁移在标签里写明请求与 lead', () => {
    expect(timeline[25]).toMatchObject({ seq: 26, pid: 'P2', hids: ['H5'] })
    expect(timeline[25]!.title).toBe('H5 → CONTESTED（依据 P2）· 请求 REFUTED 被封顶（no_audit）')
  })

  test('回放到第 30 行只给前 30 行', () => {
    expect(workbench(rec, 30).timeline).toHaveLength(30)
  })
})

describe('probeCards', () => {
  const cards = workbench(rec).probeCards

  test('六个登记过的探针', () => {
    expect(cards.map((c) => c.pid)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P7'])
  })

  test('P2：协议 / 阻断剂 / 带 / 观测 / 迁移（含封顶标记）', () => {
    const p2 = cards.find((c) => c.pid === 'P2')!
    expect(p2).toMatchObject({ protocol: 'weak step (5 uA, 120 ms)', blockers: 'Cd', reps: 1, metric: 'spike_count', status: 'measured', observed: 11 })
    expect(p2.question.startsWith('weak step (5uA,120ms) + Cd')).toBe(true)
    expect(p2.bands).toHaveLength(13)
    expect(p2.bands[0]).toEqual({ hid: 'H0', low: 6.57, high: 15.15 })
    expect(p2.bands.at(-1)!.hid).toBe('H12')
    expect(p2.changes.map((c) => [c.seq, c.hid, c.from, c.to, c.requested, c.lead])).toEqual([
      [26, 'H5', 'LIVE', 'CONTESTED', 'REFUTED', ['no_audit']],
      [27, 'H4', 'LIVE', 'CONTESTED', 'REFUTED', ['no_audit']],
      [28, 'H8', 'LIVE', 'CONTESTED', 'REFUTED', ['no_audit']],
    ])
    expect(p2.changes[0]!.reason).toContain('obs=11')
  })

  test('同一假设二次迁移：from 取上一状态；未封顶的迁移不带 requested / lead', () => {
    const p3 = cards.find((c) => c.pid === 'P3')!
    expect(p3.changes.map((c) => [c.seq, c.hid, c.from, c.to])).toEqual([
      [33, 'H3', 'LIVE', 'CONTESTED'],
      [34, 'H3', 'CONTESTED', 'CONTESTED'],
      [35, 'H9', 'LIVE', 'CONTESTED'],
    ])
    const h6 = cards.find((c) => c.pid === 'P7')!.changes.find((c) => c.hid === 'H6')!
    expect(h6.requested).toBeUndefined()
    expect(h6.lead).toBeUndefined()
  })

  test('回放：观测落账前 pending、无 observed；0 迁移', () => {
    const at24 = workbench(rec, 24).probeCards
    expect(at24.map((c) => c.pid)).toEqual(['P1', 'P2'])
    expect(at24[1]).toMatchObject({ status: 'pending', changes: [] })
    expect(at24[1]!.observed).toBeUndefined()
    expect(workbench(rec, 25).probeCards[1]).toMatchObject({ status: 'measured', observed: 11, changes: [] })
  })

  test('测量失败 → failed + note', () => {
    const lines = rec.events.slice(0, 20).map((e) => e.raw)
    lines.push(JSON.stringify({ ts: '2026-10-15T02:42:12.112Z', op: 'probe.land', pid: 'P1', exit_code: 2 }))
    const failed = parseBundle({ 'journal.jsonl': `${lines.join('\n')}\n`, 'prereg/P1.json': files(DELIVERY)['prereg/P1.json']! }, { sha256 })
    expect(workbench(failed).probeCards[0]).toMatchObject({ status: 'failed', note: '测量失败（exit 2）' })
  })
})

describe('versionChains', () => {
  const chains = workbench(rec).versionChains
  const of = (pid: string) => chains.filter((v) => v.pid === pid).map((v) => [v.status, v.id, v.path ?? null])

  test('P2：五次被拒 + 冻结；草稿挂在同 pid 同观测格的最后一次提交上', () => {
    expect(of('P2')).toEqual([
      ['rejected', 'rejections.jsonl:5', null],
      ['rejected', 'rejections.jsonl:6', null],
      ['rejected', 'rejections.jsonl:7', '_P2.json'],
      ['rejected', 'rejections.jsonl:9', null],
      ['rejected', 'rejections.jsonl:10', null],
      ['accepted', 'prereg/P2.json', '_P2cd.json'],
    ])
    const rej7 = chains.find((v) => v.id === 'rejections.jsonl:7')!
    expect(rej7.reason).toContain('频段方向与 predicts 相反')
    expect(rej7.ts).toBe('2026-10-15T02:41:24.087Z')
    const acc = chains.find((v) => v.id === 'prereg/P2.json')!
    expect(acc.seq).toBe(22)
    expect(acc.sha256).toBe(rec.preregs.P2!.fileSha256)
  })

  test('从未提交的草稿 → unrecorded（排在最后、带文件哈希）；阻断剂 none ≡ 空', () => {
    expect(of('P3')).toEqual([
      ['rejected', 'rejections.jsonl:11', null],
      ['rejected', 'rejections.jsonl:12', null],
      ['accepted', 'prereg/P3.json', '_P3tea.json'],
      ['unrecorded', 'research-work/_P3.json', '_P3.json'],
    ])
    expect(chains.at(-1)!.status).toBe('unrecorded')
    expect(chains.find((v) => v.id === 'research-work/_P3.json')!.sha256).toHaveLength(64)
    expect(of('P6')).toEqual([
      ['rejected', 'rejections.jsonl:22', null],
      ['rejected', 'rejections.jsonl:23', '_P6.json'],
    ])
    expect(of('P5b')).toEqual([['rejected', 'rejections.jsonl:24', '_P5c.json']])
  })

  test('只收 prereg_write 的拒绝；其余拒绝不进版本链', () => {
    expect(chains.some((v) => v.id === 'rejections.jsonl:8' || v.id === 'rejections.jsonl:26')).toBe(false)
    expect(chains.filter((v) => v.status === 'rejected')).toHaveLength(21)
  })

  test('回放：按拒绝时刻落在 journal 的位置裁切；未提交草稿只在末行显示', () => {
    const at21 = workbench(rec, 21).versionChains
    expect(at21.filter((v) => v.pid === 'P2').map((v) => v.id)).toEqual([
      'rejections.jsonl:5', 'rejections.jsonl:6', 'rejections.jsonl:7', 'rejections.jsonl:9', 'rejections.jsonl:10',
    ])
    expect(at21.some((v) => v.status === 'unrecorded')).toBe(false)
    expect(workbench(rec, 22).versionChains.some((v) => v.id === 'prereg/P2.json')).toBe(true)
  })

  test('时间戳坏的拒绝排到末行：渲染层传有限的 maxSeq 也看得到', () => {
    const bad = { ...rec, rejections: [...rec.rejections!, { line: 99, ts: 'garbage', op: 'prereg_write', error: 'e', pid: 'P9', spec: {} }] }
    expect(workbench(bad, 62).versionChains.some((v) => v.id === 'rejections.jsonl:99')).toBe(true)
    expect(workbench(bad, 61).versionChains.some((v) => v.id === 'rejections.jsonl:99')).toBe(false)
  })
})
