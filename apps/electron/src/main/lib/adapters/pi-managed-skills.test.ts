import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import {
  PROMA_PRIME_NATIVE_SKILL_SLUGS,
  mergePromaManagedSkillPaths,
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
})
