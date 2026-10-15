import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readWorkdir, readStageDocAt } from './research-stage-docs'

let base: string
let outside: string
const SEGS = ['research-work', 'r1']

function put(rel: string, text: string, mtimeSec?: number): void {
  const abs = join(base, ...SEGS, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, text)
  if (mtimeSec !== undefined) utimesSync(abs, mtimeSec, mtimeSec)
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'proma-stage-docs-'))
  outside = mkdtempSync(join(tmpdir(), 'proma-stage-outside-'))
  writeFileSync(join(outside, 'secret.md'), 'SECRET')
  put('lessons.md', '# 教训', 1_000)
  put('forecast.md', '# 预报', 3_000)
  put('_P2.json', '{"pid":"P2"}', 2_000)
  put('recall/families.md', '# 家族', 1_500)
  put('recall/deep.json', '{}')
  put('sim/cdfa-1.json', '{}')
  put('sim/notes.md', 'sim notes')
  put('nbsim/README.md', 'nbsim')
  put('.hidden.md', 'hidden')
  put('run.log', 'log')
  symlinkSync(join(outside, 'secret.md'), join(base, ...SEGS, 'link.md'))
  symlinkSync(outside, join(base, ...SEGS, 'linkdir'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('阶段文档列表（research-work/<run>/）', () => {
  it('md（任意深度）+ 顶层 json，新的在前；不含 sim/、nbsim/、嵌套 json、隐藏文件、非 md/json、符号链接', () => {
    const w = readWorkdir(base, SEGS)!
    expect(w.docs.map((d) => d.path)).toEqual(['forecast.md', '_P2.json', 'recall/families.md', 'lessons.md'])
    expect(w.docs[0]).toMatchObject({ mtimeMs: 3_000_000, size: Buffer.byteLength('# 预报') })
    expect(w.simMtimeMs).toBeGreaterThan(0)
    expect(w.recallMtimeMs).toBeGreaterThan(0)
  })

  it('工作目录不存在 → null；工作目录本身是符号链接 → null（不跟随）', () => {
    expect(readWorkdir(base, ['research-work', 'nope'])).toBeNull()
    symlinkSync(outside, join(base, 'research-work', 'r2'))
    writeFileSync(join(outside, 'x.md'), 'x')
    expect(readWorkdir(base, ['research-work', 'r2'])).toBeNull()
  })
})

describe('读阶段文档：只读、限定在工作目录内、不跟随符号链接', () => {
  it('读得到列表里的文档', () => {
    expect(readStageDocAt(base, SEGS, 'forecast.md')).toMatchObject({ path: 'forecast.md', text: '# 预报', mtimeMs: 3_000_000 })
    expect(readStageDocAt(base, SEGS, 'recall/families.md').text).toBe('# 家族')
    expect(readStageDocAt(base, SEGS, '_P2.json').text).toBe('{"pid":"P2"}')
  })

  it.each([
    ['..', '../../etc/passwd'],
    ['.. 藏在中间', 'recall/../../r1/lessons.md'],
    ['绝对路径', '/etc/hostname'],
    ['反斜杠', 'recall\\families.md'],
    ['sim/ 记录', 'sim/notes.md'],
    ['nbsim/', 'nbsim/README.md'],
    ['嵌套 json', 'recall/deep.json'],
    ['非 md/json', 'run.log'],
    ['隐藏文件', '.hidden.md'],
    ['符号链接文件', 'link.md'],
    ['符号链接目录', 'linkdir/secret.md'],
    ['空路径', ''],
    ['NUL', 'lessons.md\0'],
  ])('拒绝 %s', (_name, rel) => {
    expect(() => readStageDocAt(base, SEGS, rel)).toThrow()
  })

  it('工作目录本身是符号链接 → 拒绝', () => {
    symlinkSync(outside, join(base, 'research-work', 'r2'))
    expect(() => readStageDocAt(base, ['research-work', 'r2'], 'secret.md')).toThrow()
  })

  it('FIFO（命名管道）不卡死主进程，直接拒绝', () => {
    execFileSync('mkfifo', [join(base, ...SEGS, 'pipe.md')])
    expect(() => readStageDocAt(base, SEGS, 'pipe.md')).toThrow('不是普通文件')
  })

  it('超过大小上限 → 拒绝', () => {
    put('big.md', 'x'.repeat(2 * 1024 * 1024 + 1))
    expect(() => readStageDocAt(base, SEGS, 'big.md')).toThrow('太大')
  })
})
