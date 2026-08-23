import { join, resolve } from 'node:path'

export const RESEARCH_DEFAULT_SKILL_SLUGS = [
  'research-loop',
  'research-abduce',
  'research-probe',
  'research-grill',
  'research-report',
  'research-kit',
  'research-moves',
] as const

export interface ResearchDefaultSkillsSourceInput {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
}

/** 开发态引用仓库唯一源码，打包态引用 electron-builder 复制的只读资源。 */
export function resolveResearchDefaultSkillsSource(input: ResearchDefaultSkillsSourceInput): string {
  return input.isPackaged
    ? join(input.resourcesPath, 'research-skills')
    : resolve(input.appPath, '../../research/skills')
}
