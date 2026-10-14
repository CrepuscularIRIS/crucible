/**
 * SE7a · K0/K7 kernel 环境快照（02§4.4）：run 中改 kit 文件或装包，K7 重算必须看得见。
 * 夹具是一个临时 venv（--without-pip，秒级），kit 与假包直接写进它的 site-packages。
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { diffKernelEnv, takeKernelEnvSnapshot, treeSha256, type KernelEnvSnapshot } from './env-snapshot'

let venv: string
let python: string
let sitePackages: string

beforeAll(() => {
  venv = mkdtempSync(join(tmpdir(), 'proma-env-snapshot-'))
  expect(spawnSync('python3', ['-m', 'venv', '--without-pip', venv]).status).toBe(0)
  python = join(venv, 'bin', 'python')
  sitePackages = spawnSync(python, ['-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'], { encoding: 'utf-8' })
    .stdout.trim()
  mkdirSync(join(sitePackages, 'research_kit'))
  writeFileSync(join(sitePackages, 'research_kit', '__init__.py'), 'def anchor(run):\n    return run\n')
  writeFileSync(join(sitePackages, 'research_kit', 'jobs.py'), 'def wait(job):\n    return job\n')
})

afterAll(() => rmSync(venv, { recursive: true, force: true }))

function snapshot(): KernelEnvSnapshot {
  const result = takeKernelEnvSnapshot(python)
  if (!result.available) throw new Error(result.reason)
  return result.snapshot
}

describe('kernel 环境快照', () => {
  it('记下 research_kit.__file__ 与每个 kit 文件的 sha256', () => {
    const snap = snapshot()
    expect(snap.kit_file).toBe(join(sitePackages, 'research_kit', '__init__.py'))
    expect(Object.keys(snap.kit_files).sort()).toEqual(['__init__.py', 'jobs.py'])
    expect(snap.packages_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('同一环境两次快照没有差异', () => {
    expect(diffKernelEnv(snapshot(), snapshot())).toEqual([])
  })

  it('run 中改一个 kit 文件 → 差异列出该文件', () => {
    const before = snapshot()
    writeFileSync(join(sitePackages, 'research_kit', 'jobs.py'), 'def wait(job):\n    return None\n')
    expect(diffKernelEnv(before, snapshot())).toEqual(['kit:jobs.py'])
  })

  it('run 中装一个包 → 差异里出现包清单 sha256 变化', () => {
    const before = snapshot()
    const dist = join(sitePackages, 'fakepkg-1.0.dist-info')
    mkdirSync(dist)
    writeFileSync(join(dist, 'METADATA'), 'Metadata-Version: 2.1\nName: fakepkg\nVersion: 1.0\n')
    expect(diffKernelEnv(before, snapshot())).toEqual(['packages_sha256'])
  })

  it('C1：研究 cwd 里 agent 种下的 hashlib.py 不在宿主上执行；kit 自身代码也不执行', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'proma-env-cwd-'))
    const marker = join(cwd, 'PWNED')
    const kitInit = join(sitePackages, 'research_kit', '__init__.py')
    const original = 'def anchor(run):\n    return run\n'
    try {
      for (const mod of ['hashlib', 'json', 'pathlib']) {
        writeFileSync(join(cwd, `${mod}.py`), `open(${JSON.stringify(marker)}, "a").write("${mod}\\n")\n`)
      }
      writeFileSync(kitInit, `open(${JSON.stringify(marker)}, "a").write("kit\\n")\n`)
      const result = takeKernelEnvSnapshot(python, cwd)
      expect(existsSync(marker)).toBe(false)
      expect(result).toMatchObject({ available: true })
    } finally {
      writeFileSync(kitInit, original)
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('C1：cwd 里出现 research_kit 影子（kernel 会先 import 它）→ 宿主侧看得见，差异列出', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'proma-env-cwd-'))
    try {
      const take = () => {
        const result = takeKernelEnvSnapshot(python, cwd)
        if (!result.available) throw new Error(result.reason)
        return result.snapshot
      }
      const before = take()
      writeFileSync(join(cwd, 'research_kit.py'), 'def wait(job):\n    return None\n')
      expect(diffKernelEnv(before, take())).toEqual(['cwd:research_kit'])
      rmSync(join(cwd, 'research_kit.py'))
      mkdirSync(join(cwd, 'research_kit'))
      writeFileSync(join(cwd, 'research_kit', '__init__.py'), '')
      expect(diffKernelEnv(before, take())).toEqual(['cwd:research_kit'])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('cwd 影子里有坏链接 / 不可读文件 → 快照照样可用，差异列出 cwd:research_kit（不误报"输出不是 JSON"）', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'proma-env-cwd-'))
    try {
      const before = takeKernelEnvSnapshot(python, cwd)
      mkdirSync(join(cwd, 'research_kit'))
      symlinkSync('/nonexistent', join(cwd, 'research_kit', 'zz.py'))
      const dangling = takeKernelEnvSnapshot(python, cwd)
      expect(dangling).toMatchObject({ available: true })
      if (!before.available || !dangling.available) throw new Error('unavailable')
      expect(diffKernelEnv(before.snapshot, dangling.snapshot)).toEqual(['cwd:research_kit'])
      rmSync(join(cwd, 'research_kit'), { recursive: true })
      writeFileSync(join(cwd, 'research_kit.py'), '')
      chmodSync(join(cwd, 'research_kit.py'), 0o000)
      expect(takeKernelEnvSnapshot(python, cwd)).toMatchObject({ available: true })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('旧 journal 的快照没有 cwd_shadow 字段 → 与"没有影子"等价，不算漂移', () => {
    const { cwd_shadow: _drop, ...legacy } = snapshot()
    expect(diffKernelEnv(legacy as KernelEnvSnapshot, snapshot())).toEqual([])
  })

  it('没传 kernel python / 路径不可执行 → unavailable，不抛', () => {
    expect(takeKernelEnvSnapshot(undefined)).toMatchObject({ available: false })
    expect(takeKernelEnvSnapshot(join(venv, 'no-such-python'))).toMatchObject({ available: false })
  })
})

describe('treeSha256：lstat、全函数（审查：一个坏链接不能让 A6 失效）', () => {
  const hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'proma-tree-'))
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'kernel.py'), 'x = 1\n')
    writeFileSync(join(dir, 'sub', 'a.py'), 'a = 1\n')
    writeFileSync(join(dir, 'MANIFEST.json'), '{}')
  })

  afterAll(() => {
    chmodSync(dir, 0o755)
    rmSync(dir, { recursive: true, force: true })
  })

  it('普通文件树：与生成器（nbsim_strip.tree_sha256）同一配方', () => {
    const recipe = ['kernel.py', 'sub/a.py'].map((f) => hex(readFileSync(join(dir, f)))).join('')
    expect(treeSha256(dir)).toBe(hex(recipe))
  })

  it('坏链接 / 不可读文件 / 不可读目录：不抛，树 sha 变化', () => {
    const clean = treeSha256(dir)
    symlinkSync('/nonexistent', join(dir, 'zz.py'))
    const dangling = treeSha256(dir)
    expect(dangling).toMatch(/^[0-9a-f]{64}$/)
    expect(dangling).not.toBe(clean)
    rmSync(join(dir, 'zz.py'))
    chmodSync(join(dir, 'kernel.py'), 0o000)
    expect(treeSha256(dir)).not.toBe(clean)
    chmodSync(join(dir, 'kernel.py'), 0o644)
    chmodSync(join(dir, 'sub'), 0o000)
    expect(treeSha256(dir)).not.toBe(clean)
    chmodSync(join(dir, 'sub'), 0o755)
    chmodSync(dir, 0o000)
    expect(treeSha256(dir)).not.toBe(clean)
    chmodSync(dir, 0o755)
    expect(treeSha256(dir)).toBe(clean)
  })

  it('指向同内容文件的符号链接也算改动（不跟随链接）', () => {
    const clean = treeSha256(dir)
    rmSync(join(dir, 'kernel.py'))
    writeFileSync(join(dir, 'real.txt'), 'x = 1\n')
    symlinkSync(join(dir, 'real.txt'), join(dir, 'kernel.py'))
    try {
      expect(treeSha256(dir)).not.toBe(clean)
    } finally {
      rmSync(join(dir, 'kernel.py'))
      rmSync(join(dir, 'real.txt'))
      writeFileSync(join(dir, 'kernel.py'), 'x = 1\n')
    }
  })
})
