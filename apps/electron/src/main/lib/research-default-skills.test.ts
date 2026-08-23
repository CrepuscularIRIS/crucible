import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  RESEARCH_DEFAULT_SKILL_SLUGS,
  resolveResearchDefaultSkillsSource,
} from './research-default-skills'
import {
  removeRetiredDefaultSkills,
  RETIRED_DEFAULT_SKILL_SLUGS,
  seedDefaultSkillsFromDirectory,
} from './config-paths'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('受管 research 默认 Skills', () => {
  it('allowlist 恰好包含七个战役 Skill，排除开发期 writing skill', () => {
    expect(RESEARCH_DEFAULT_SKILL_SLUGS).toEqual([
      'research-loop',
      'research-abduce',
      'research-probe',
      'research-grill',
      'research-report',
      'research-kit',
      'research-moves',
    ])
    expect(RESEARCH_DEFAULT_SKILL_SLUGS).not.toContain('research-writing-skills')
    expect(RETIRED_DEFAULT_SKILL_SLUGS).toContain('research-writing-skills')
  })

  it('开发态与打包态都解析到可移植的受管资源目录', () => {
    expect(resolveResearchDefaultSkillsSource({
      isPackaged: false,
      appPath: '/repo/apps/electron',
      resourcesPath: '/unused',
    })).toBe('/repo/research/skills')
    expect(resolveResearchDefaultSkillsSource({
      isPackaged: true,
      appPath: '/unused',
      resourcesPath: '/opt/Proma/resources',
    })).toBe('/opt/Proma/resources/research-skills')
  })

  it('真实仓库来源的七项都有 SKILL.md，并只把 allowlist seed 到默认缓存', () => {
    const repoRoot = resolve(import.meta.dir, '../../../../..')
    const source = resolveResearchDefaultSkillsSource({
      isPackaged: false,
      appPath: join(repoRoot, 'apps/electron'),
      resourcesPath: '/unused',
    })
    for (const slug of RESEARCH_DEFAULT_SKILL_SLUGS) {
      expect(readFileSync(join(source, slug, 'SKILL.md'), 'utf-8')).toContain(`name: ${slug}`)
    }

    const target = mkdtempSync(join(tmpdir(), 'proma-research-default-skills-'))
    tempRoots.push(target)
    seedDefaultSkillsFromDirectory(source, target, new Set(RESEARCH_DEFAULT_SKILL_SLUGS))
    for (const slug of RESEARCH_DEFAULT_SKILL_SLUGS) {
      expect(existsSync(join(target, slug, 'SKILL.md'))).toBe(true)
    }
    expect(existsSync(join(target, 'research-writing-skills'))).toBe(false)
  })

  it('seed 会把同版本 legacy symlink 替换成实体受管副本', () => {
    const repoRoot = resolve(import.meta.dir, '../../../../..')
    const source = join(repoRoot, 'research/skills')
    const target = mkdtempSync(join(tmpdir(), 'proma-research-symlink-seed-'))
    tempRoots.push(target)
    symlinkSync(join(source, 'research-loop'), join(target, 'research-loop'), 'dir')

    seedDefaultSkillsFromDirectory(source, target, new Set(RESEARCH_DEFAULT_SKILL_SLUGS))

    expect(lstatSync(join(target, 'research-loop')).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(target, 'research-loop/SKILL.md'), 'utf-8')).toContain('name: research-loop')
  })

  it('退役清理会删除 research-writing-skills 的断链 symlink', () => {
    const target = mkdtempSync(join(tmpdir(), 'proma-retired-skill-'))
    tempRoots.push(target)
    const legacyLink = join(target, 'research-writing-skills')
    symlinkSync(join(target, 'missing-source'), legacyLink, 'dir')

    removeRetiredDefaultSkills(target)

    expect(() => lstatSync(legacyLink)).toThrow()
  })
})
