import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import {
  PROMA_PRIME_NATIVE_SKILL_SLUGS,
  mergePromaManagedSkillPaths,
  narrowResearchSkillPaths,
  resolvePrimeNativeSkillPaths,
} from './pi-managed-skills'
import { createPromaManagedResourceLoaderOptions } from './pi-resource-loader-overrides'

describe('Prime 原生 Skills 受管接线', () => {
  it('只加载无需 daemon/controller 的四个 RLM 技能', () => {
    const paths = resolvePrimeNativeSkillPaths()

    expect(paths.map((path) => basename(path))).toEqual([...PROMA_PRIME_NATIVE_SKILL_SLUGS])
    expect(paths.every((path) => path.replaceAll('\\', '/').includes('/dist/skills/'))).toBe(true)
    expect(paths.some((path) => path.endsWith('/agent-message'))).toBe(false)
    expect(paths.some((path) => path.endsWith('/agent-observe'))).toBe(false)
    expect(paths.some((path) => path.endsWith('/rlm-heartbeat'))).toBe(false)
  })

  it('与工作区 Skills 合并并去重，不改变工作区路径顺序', () => {
    const native = resolvePrimeNativeSkillPaths()
    expect(mergePromaManagedSkillPaths(['/workspace/a', '/workspace/a'], native)).toEqual([
      '/workspace/a',
      ...native,
    ])
  })

  it('从 CJS bundle 的 dist 目录也能定位外置 Prime 包资源', () => {
    const bundledRuntimeDir = join(__dirname, '..', '..', '..', '..', 'dist')
    expect(resolvePrimeNativeSkillPaths(bundledRuntimeDir).map((path) => basename(path))).toEqual(
      [...PROMA_PRIME_NATIVE_SKILL_SLUGS],
    )
  })

  it('Prime ResourceLoader 在 noSkills 模式下仍能加载这四项受管技能', async () => {
    const root = mkdtempSync(join(tmpdir(), 'proma-prime-skills-'))
    try {
      const packageRoot = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
      const [{ DefaultResourceLoader }, { SettingsManager }] = await Promise.all([
        import(new URL('./core/resource-loader.js', packageRoot).href),
        import(new URL('./core/settings-manager.js', packageRoot).href),
      ])
      const loader = new DefaultResourceLoader({
        cwd: root,
        agentDir: join(root, 'agent'),
        settingsManager: SettingsManager.inMemory(),
        ...createPromaManagedResourceLoaderOptions(),
        additionalSkillPaths: resolvePrimeNativeSkillPaths(),
      })

      await loader.reload()

      expect(loader.getSkills().skills.map((skill: { name: string }) => skill.name).sort()).toEqual(
        [...PROMA_PRIME_NATIVE_SKILL_SLUGS].sort(),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('SE7b：研究会话的 native skill 路径里没有 refine（跳过 reviewer 的显式路径），非研究会话照旧', () => {
    const research = resolvePrimeNativeSkillPaths(undefined, { research: true }).map((path) => basename(path))
    expect(research).not.toContain('refine')
    expect(research).toEqual(PROMA_PRIME_NATIVE_SKILL_SLUGS.filter((slug) => slug !== 'refine'))
    expect(resolvePrimeNativeSkillPaths().map((path) => basename(path))).toContain('refine')
  })

  it('SE7b（M6）：研究会话只加载 bundled 研究 slug；未知 slug（带 pyproject.toml）不加载并被列出', () => {
    const root = mkdtempSync(join(tmpdir(), 'proma-research-skills-'))
    try {
      for (const slug of ['research-loop', 'research-kit', 'foo']) {
        mkdirSync(join(root, slug), { recursive: true })
        writeFileSync(join(root, slug, 'SKILL.md'), `---\nname: ${slug}\n---\n`)
      }
      writeFileSync(join(root, 'foo', 'pyproject.toml'), '[project]\nname = "foo"\n')
      const narrowed = narrowResearchSkillPaths([root])
      expect(narrowed.paths.map((path) => basename(path)).sort()).toEqual(['research-kit', 'research-loop'])
      expect(narrowed.unknown).toEqual(['foo'])
      // 非研究会话不调用 narrow：整棵工作区 skills 根照旧交给 loader
      expect(mergePromaManagedSkillPaths([root], [])).toEqual([root])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
