import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseBundle } from './load.ts'
import { budgetFromK0, runStatus } from './status.ts'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const DELIVERY = join(import.meta.dir, '../../../../research/campaigns/2026-10-15-glm53flash-delivery-oneline-ca_rebound')
const journal = readFileSync(join(DELIVERY, 'journal.jsonl'), 'utf8').split('\n').filter(Boolean)
const k0 = readFileSync(join(DELIVERY, 'K0-intake.md'), 'utf8')
const preregs = Object.fromEntries(
  readdirSync(join(DELIVERY, 'prereg')).map((f) => [`prereg/${f}`, readFileSync(join(DELIVERY, 'prereg', f), 'utf8')]),
)

/** 交付 run 截到第 n 行（运行中打开画布时看到的样子；之后才登记的 prereg 也一并去掉） */
function at(n: number) {
  const lines = journal.slice(0, n)
  const written = new Set(lines.map((l) => JSON.parse(l) as { op: string; pid?: string }).filter((e) => e.op === 'prereg.write').map((e) => e.pid))
  const files = Object.fromEntries(Object.entries(preregs).filter(([k]) => written.has(k.slice(7, -5))))
  return parseBundle({ 'journal.jsonl': `${lines.join('\n')}\n`, ...files }, { sha256 })
}
const ms = (iso: string) => Date.parse(iso)

describe('runStatus：状态条（交付 run 2026-10-15）', () => {
  test('结案：阶段 report、预算 6/8、计数、最新事件 = 账本检查、下一步 = 已结束', () => {
    const s = runStatus(at(62), { k0 })
    expect(s.phase).toBe('report')
    expect(s.budget).toEqual({ spent: 6, total: 8 })
    expect(s.counts).toEqual({ LIVE: 2, CONTESTED: 11, REFUTED: 0, SUPPORTED: 0 })
    expect(s.latest?.seq).toBe(62)
    expect(s.latest?.ts).toBe('2026-10-15T04:50:09.186Z')
    expect(s.latest?.summary).toContain('账本检查')
    expect(s.latest?.summary).toContain('通过')
    expect(s.next).toBe('已结束')
  })

  test('只有开局事件 → K0；预算 0/8；没有下一步建议', () => {
    const s = runStatus(at(5), { k0 })
    expect(s.phase).toBe('K0')
    expect(s.budget).toEqual({ spent: 0, total: 8 })
    expect(s.counts.LIVE).toBe(1)
    expect(s.next).toBeUndefined()
  })

  test('提出假设之后 → sims；登记 P1 → prereg + 等待测量 P1；P1 落地 → probe + 判读结果 P1', () => {
    expect(runStatus(at(17)).phase).toBe('sims')
    const pre = runStatus(at(18))
    expect(pre.phase).toBe('prereg')
    expect(pre.next).toBe('等待测量 P1')
    const landed = runStatus(at(21))
    expect(landed.phase).toBe('probe')
    expect(landed.budget.spent).toBe(1)
    expect(landed.next).toBe('判读结果 P1')
    expect(landed.latest?.summary).toContain('P1')
  })

  test('迁移 → probe；攻击 → attack；预报 → forecast', () => {
    expect(runStatus(at(26)).latest?.summary).toContain('H5')
    expect(runStatus(at(26)).phase).toBe('probe')
    expect(runStatus(at(56)).phase).toBe('attack')
    expect(runStatus(at(54)).phase).toBe('forecast')
  })

  test('工作目录比 journal 新：sim/ → sims，recall/ → recall，forecast.md → forecast；比 journal 旧的不算', () => {
    const rec = at(17) // 末行 02:03:34
    expect(runStatus(rec, { activity: { simMtimeMs: ms('2026-10-15T02:10:00Z') } }).phase).toBe('sims')
    expect(runStatus(at(5), { activity: { recallMtimeMs: ms('2026-10-15T01:14:57Z') } }).phase).toBe('recall')
    expect(runStatus(at(53), { activity: { docs: [{ path: 'forecast.md', mtimeMs: ms('2026-10-15T04:14:47Z') }] } }).phase).toBe('forecast')
    expect(runStatus(at(53), { activity: { docs: [{ path: 'forecast.md', mtimeMs: ms('2026-10-15T04:00:00Z') }] } }).phase).toBe('probe')
    // 不对应阶段的文档（lessons.md）不改阶段
    expect(runStatus(at(53), { activity: { docs: [{ path: 'lessons.md', mtimeMs: ms('2026-10-15T05:00:00Z') }] } }).phase).toBe('probe')
    // 草稿 _P#.json → prereg
    expect(runStatus(at(21), { activity: { docs: [{ path: '_P2.json', mtimeMs: ms('2026-10-15T02:50:00Z') }] } }).phase).toBe('prereg')
  })

  test('预算总额：调用方给的优先；否则读 K0 的 budget 行；都没有 → 只显示已用', () => {
    expect(runStatus(at(62), { k0, budgetTotal: 12 }).budget).toEqual({ spent: 6, total: 12 })
    expect(runStatus(at(62)).budget).toEqual({ spent: 6 })
    expect(budgetFromK0(k0)).toBe(8)
    expect(budgetFromK0('mode: identify\n')).toBeUndefined()
    expect(budgetFromK0(undefined)).toBeUndefined()
  })
})
