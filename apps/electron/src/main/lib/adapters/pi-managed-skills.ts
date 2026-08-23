import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Proma 本地 SDK 模式可完整承载的 Prime 原生 Skills。
 *
 * agent-message / agent-observe / rlm-heartbeat 依赖 Prime daemon controller；
 * Proma 当前使用自己的 Collaboration 生命周期，不能暴露一个必然失效的契约。
 */
export const PROMA_PRIME_NATIVE_SKILL_SLUGS = [
  'edit',
  'goal',
  'compact',
  'refine',
] as const

export function resolvePrimeNativeSkillPaths(runtimeDir: string = __dirname): string[] {
  // 主进程/utility 都由 esbuild 输出到 apps/electron/dist；测试则直接执行 src。
  // 使用相对包布局可同时覆盖 CJS bundle 与源码测试，避免 import.meta 在 CJS 中失效。
  const candidates = [
    join(runtimeDir, '..', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'skills'),
    join(runtimeDir, '..', '..', '..', '..', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'skills'),
  ]
  const skillsRoot = candidates.find((candidate) => existsSync(candidate))
  if (!skillsRoot) {
    throw new Error(`Prime 原生 Skills 根目录缺失；已检查：${candidates.join(', ')}`)
  }
  return PROMA_PRIME_NATIVE_SKILL_SLUGS.map((slug) => {
    const skillDir = join(skillsRoot, slug)
    if (!existsSync(join(skillDir, 'SKILL.md'))) {
      throw new Error(`Prime 原生 Skill 缺失：${slug}（${skillDir}）`)
    }
    return skillDir
  })
}

export function mergePromaManagedSkillPaths(
  workspaceSkillPaths: string[],
  primeNativeSkillPaths: string[] = resolvePrimeNativeSkillPaths(),
): string[] {
  return [...new Set([...workspaceSkillPaths, ...primeNativeSkillPaths])]
}
