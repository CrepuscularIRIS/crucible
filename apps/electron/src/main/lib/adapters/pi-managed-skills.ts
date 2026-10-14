import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { RESEARCH_DEFAULT_SKILL_SLUGS } from '../research-default-skills'

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

/**
 * `research: true`：研究会话不加载原生 `refine`（02 §3.5 M2）——它向模型推荐一条跳过
 * reviewer 的显式 refine 路径。kernel 里的 `refine.run` 仍在，由 refine runtime 回滚兜底。
 */
export function resolvePrimeNativeSkillPaths(
  runtimeDir: string = __dirname,
  options: { research?: boolean } = {},
): string[] {
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
  const slugs = PROMA_PRIME_NATIVE_SKILL_SLUGS.filter((slug) => !(options.research && slug === 'refine'))
  return slugs.map((slug) => {
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

const RESEARCH_SKILL_SLUGS: ReadonlySet<string> = new Set(RESEARCH_DEFAULT_SKILL_SLUGS)

/**
 * 研究会话只加载 bundled 研究 slug（02 §4.8 M6）：工作区 `skills/` 整棵在白名单里时，run 中途
 * 写进去的 skill（连同 pyproject/src）会被之后每个 run 加载。把 skills 根展开成逐个已知 slug 的
 * 目录，未知 slug 不加载，交给 K0 宿主状态块列出。直接给的 skill 目录按 basename 同样过滤。
 */
export function narrowResearchSkillPaths(paths: string[]): { paths: string[]; unknown: string[] } {
  const kept: string[] = []
  const unknown: string[] = []
  const consider = (dir: string): void => {
    const slug = basename(dir)
    if (RESEARCH_SKILL_SLUGS.has(slug)) kept.push(dir)
    else unknown.push(slug)
  }
  for (const path of paths) {
    if (existsSync(join(path, 'SKILL.md'))) {
      consider(path)
      continue
    }
    let names: string[] = []
    try { names = readdirSync(path) } catch { continue }
    for (const name of names.sort()) {
      if (existsSync(join(path, name, 'SKILL.md'))) consider(join(path, name))
    }
  }
  return { paths: kept, unknown }
}
