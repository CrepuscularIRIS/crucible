import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { parseBundle, verifyInterventions } from './load.ts'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** 按 prev = 上一行原文 sha256 串一条链 */
function chain(rows: Array<Record<string, unknown>>): string[] {
  const out: string[] = []
  for (const row of rows) out.push(JSON.stringify({ ...row, prev: sha256(out.at(-1) ?? '') }))
  return out
}

const journal = chain([{ op: 'run.init', run: 'r1' }, { op: 'claim.propose', id: 'H1' }, { op: 'prereg.write', pid: 'P1' }])
const journalText = `${journal.join('\n')}\n`

function intervention(id: string, journalLines: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, ts: 't', actor: 'user', kind: 'pause', journal_lines: journalLines, journal_head: sha256(journal[journalLines - 1] ?? ''), ...extra }
}

describe('子任务（归档布局 = 服务压平后的 live 布局）', () => {
  test('只有 brief.md 的作业 = 运行中，不被丢掉；有 out.md 按 STATUS 末行', () => {
    const rec = parseBundle({
      'journal.jsonl': journalText,
      'child-jobs/K3-H1-abc/brief.md': 'brief',
      'child-jobs/K3-H2-def/brief.md': 'brief',
      'child-jobs/K3-H2-def/out.md': 'done\nSTATUS: ok PATH: out.md\n',
    }, { sha256 })
    expect(rec.childJobs.map((j) => [j.name, j.status])).toEqual([['K3-H1-abc', 'running'], ['K3-H2-def', 'ok']])
  })
})

describe('interventions.jsonl 校验', () => {
  test('坏行（撕裂的半行）跳过，不拖垮整张画布；完整性报出那一行', () => {
    const [u1] = chain([intervention('U1', 3)])
    const rec = parseBundle({ 'journal.jsonl': journalText, 'interventions.jsonl': `${u1}\n{"id":"U2","ts` }, { sha256 })
    expect(rec.interventions?.map((i) => i.id)).toEqual(['U1'])
    expect(rec.interventionsBroken).toMatchObject({ line: 2 })
    expect(rec.interventionsBroken?.note).toContain('第 2 行')
  })
  test('链完好且 journal_head 对得上 → 无 interventionsBroken', () => {
    const rows = chain([intervention('U1', 2), intervention('U2', 3)])
    const rec = parseBundle({ 'journal.jsonl': journalText, 'interventions.jsonl': `${rows.join('\n')}\n` }, { sha256 })
    expect(rec.interventions).toHaveLength(2)
    expect(rec.interventionsBroken).toBeUndefined()
  })
  test('journal 在干预之后被改写：journal_head 不符 → 报出钉错的那一条', () => {
    const rows = chain([intervention('U1', 2), intervention('U2', 3)])
    const tampered = journalText.replace('"H1"', '"H9"')
    expect(verifyInterventions(rows.join('\n'), tampered, sha256)).toMatchObject({ line: 1 })
    expect(verifyInterventions(rows.join('\n'), tampered, sha256)?.note).toContain('journal_head')
  })
  test('journal 被截短（钉的行已不存在）、干预行被篡改（prev 断）都报出', () => {
    const rows = chain([intervention('U1', 3)])
    expect(verifyInterventions(rows.join('\n'), `${journal[0]}\n`, sha256)).toMatchObject({ line: 1 })
    const two = chain([intervention('U1', 2), intervention('U2', 3)])
    expect(verifyInterventions([two[0]!.replace('"pause"', '"steer"'), two[1]].join('\n'), journalText, sha256)).toMatchObject({ line: 2 })
  })
  test('没有干预文件 → interventions = null，也不报完整性', () => {
    const rec = parseBundle({ 'journal.jsonl': journalText }, { sha256 })
    expect(rec.interventions).toBeNull()
    expect(rec.interventionsBroken).toBeUndefined()
  })
})
