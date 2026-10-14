import { describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JudgeError } from '../../packages/shared/src/research-record/index.ts'
import { buildReport, sha256 } from './judge-report.ts'

const ROOT = join(import.meta.dir, '../..')
const ONE = join(ROOT, 'research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound')

/** 复制归档到临时目录，按 mutate 改 annotations 后生成 */
function buildWith(mutate: (ann: any) => void, recompute?: (rc: any) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'judge-'))
  cpSync(ONE, dir, { recursive: true })
  const ann = JSON.parse(readFileSync(join(dir, 'annotations.json'), 'utf8'))
  mutate(ann)
  writeFileSync(join(dir, 'annotations.json'), JSON.stringify(ann))
  if (recompute) {
    const rc = JSON.parse(readFileSync(join(dir, 'recompute.json'), 'utf8'))
    recompute(rc)
    writeFileSync(join(dir, 'recompute.json'), JSON.stringify(rc))
  }
  return buildReport(dir)
}
const node = (ann: any, id: string) => ann.nodes.find((n: any) => n.id === id)

describe('生成器拒绝', () => {
  test('annotations 钉的 journal sha 不符', () => {
    expect(() => buildWith((a) => (a.journal_sha256 = '0'.repeat(64)))).toThrow(/journal sha256/)
  })
  test('关键节点缺依据', () => {
    expect(() => buildWith((a) => (node(a, 'D6').basis = []))).toThrow(/D6 缺依据/)
  })
  test('seq 区间与节点类型不符（标"否定"的区间里没有 REFUTED）', () => {
    expect(() => buildWith((a) => (node(a, 'D6').seq = [63, 64]))).toThrow(/D6 标为 refute/)
  })
  test('引文不在 REPORT 那一行', () => {
    expect(() => buildWith((a) => (a.corrections[0].quote_ref = 'REPORT.md:12'))).toThrow(JudgeError)
  })
  test('{{键}} 在 recompute 里缺', () => {
    expect(() => buildWith(() => {}, (rc) => delete rc.values['one.P2.delta'])).toThrow(/缺键 one.P2.delta/)
  })
  test('首屏超过 80 字或含原词', () => {
    expect(() => buildWith((a) => (a.case.next_plain = '下一步做 P3'))).toThrow(/原词/)
    expect(() => buildWith((a) => (a.case.task_plain = '长'.repeat(81)))).toThrow(/80 字/)
  })
  test('CLI 拒绝时退出码 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'judge-'))
    cpSync(ONE, dir, { recursive: true })
    const ann = JSON.parse(readFileSync(join(ONE, 'annotations.json'), 'utf8'))
    writeFileSync(join(dir, 'annotations.json'), JSON.stringify({ ...ann, journal_sha256: '0'.repeat(64) }))
    const r = Bun.spawnSync(['bun', join(import.meta.dir, 'judge-report.ts'), dir, '--out', join(dir, 'x.html')])
    expect(r.exitCode).toBe(1)
    expect(r.stderr.toString()).toContain('拒绝生成')
  })
})

describe('确定性', () => {
  test('两次生成字节相同', () => {
    expect(buildReport(ONE)).toBe(buildReport(ONE))
  })
  test('T10：TZ × LANG 四种环境生成的 sha256 相同', () => {
    const dir = mkdtempSync(join(tmpdir(), 'judge-t10-'))
    const shas = ['UTC', 'Asia/Shanghai'].flatMap((TZ) =>
      ['C', 'zh_CN.UTF-8'].map((LANG) => {
        const out = join(dir, `${TZ.replace('/', '_')}-${LANG}.html`)
        const r = Bun.spawnSync(['bun', join(import.meta.dir, 'judge-report.ts'), ONE, '--out', out, '--nav', '一句话=index.html', '--here', '一句话'], {
          env: { ...process.env, TZ, LANG, LC_ALL: LANG },
        })
        expect(r.exitCode).toBe(0)
        return sha256(readFileSync(out, 'utf8'))
      }),
    )
    expect(new Set(shas).size).toBe(1)
  })
})
