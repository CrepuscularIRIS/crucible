/**
 * M-3：渲染层打包产物里不能有真相（annotations.json 的 truth、recompute.json 的 truth_mean）。
 * 宿主研究会话的拒绝根不覆盖 apps/electron/dist，打进 bundle 的文件 agent 能直接 grep 到。
 * 静态检查：渲染层源码里所有 import.meta.glob / ?raw 导入只允许点名的无真相文件；注记只在运行时经归档根（R1）读取。
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RENDERER = resolve(import.meta.dir, '../..')
/** 允许随应用打包的 run 文件（相对 run 目录）：都不含真相 */
const BUNDLE_ALLOWED = new Set(['journal.jsonl', 'REPORT.md', 'register.json', 'prereg/*.json'])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'test-fixtures.ts' ? [p] : []
  })
}

/** 源码里会被 vite 内联进 bundle 的路径字面量 */
function bundledLiterals(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/import\.meta\.glob\s*\(([\s\S]*?)\{\s*query/g)) {
    for (const lit of m[1]!.matchAll(/['"`]([^'"`]+)['"`]/g)) out.push(lit[1]!)
  }
  for (const m of text.matchAll(/from\s+['"]([^'"]+\?raw)['"]/g)) out.push(m[1]!)
  return out
}

describe('渲染层 bundle 不含真相（M-3）', () => {
  const literals = sources(RENDERER).flatMap((f) => bundledLiterals(readFileSync(f, 'utf8')).map((lit) => ({ f, lit })))

  test('找到了示例 run 的 glob（否则这个检查形同虚设）', () => {
    expect(literals.some(({ lit }) => lit.includes('research/campaigns/'))).toBe(true)
  })

  test('只打包点名的无真相文件：没有 annotations.json / recompute.json / 通配整个 run 目录', () => {
    for (const { f, lit } of literals.filter(({ lit }) => lit.includes('research/campaigns/'))) {
      const rel = lit.replace(/^.*research\/campaigns\/[^/]+\//, '')
      expect({ f, rel, ok: BUNDLE_ALLOWED.has(rel) }).toEqual({ f, rel, ok: true })
    }
    expect(literals.filter(({ lit }) => /annotations|recompute|world-ledger|\.proma-research/.test(lit))).toEqual([])
  })
})
