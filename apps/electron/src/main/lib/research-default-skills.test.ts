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
const repoRoot = resolve(import.meta.dir, '../../../../..')
const researchSkillsRoot = join(repoRoot, 'research/skills')

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

  it('Research loop 明确父会话、RLM 与 Collaboration 三路选择且不强制 child', () => {
    const loop = readFileSync(join(researchSkillsRoot, 'research-loop/SKILL.md'), 'utf-8')
    const delegation = readFileSync(
      join(researchSkillsRoot, 'research-loop/references/delegation.md'),
      'utf-8',
    )
    const grill = readFileSync(join(researchSkillsRoot, 'research-grill/SKILL.md'), 'utf-8')

    expect(loop).toContain('父会话直接做 / Prime RLM child / Proma')
    expect(loop).toContain('不强制调用')
    expect(delegation).toContain('analyst')
    expect(delegation).toContain('researcher')
    expect(delegation).toContain('coder')
    expect(delegation).toContain('reviewer')
    expect(delegation).toContain('省略 `modelId`')
    expect(delegation).toContain('省略 `model`')
    expect(grill).not.toContain('对抗者 = `rlm()` 子代理')
    expect(grill).toContain('父会话直接攻击')
    expect(grill).toContain('RLM `reviewer`')
    expect(grill).toContain('Collaboration `reviewer`')
  })

  it('移植的深度方法只引用现有 Research MCP，不伪造 Claude campaign 工具', () => {
    const files = [
      'research-loop/references/delegation.md',
      'research-probe/references/candidate-screen.md',
      'research-probe/references/coherence-dry-run.md',
      'research-probe/references/execution-framework.md',
      'research-moves/references/research-judgment.md',
      'research-moves/references/root-vs-shadow.md',
      'research-report/references/claim-ledger.md',
    ]
    const combined = files
      .map((file) => readFileSync(join(researchSkillsRoot, file), 'utf-8'))
      .join('\n')

    expect(combined).toContain('Coherence dry-run')
    expect(combined).toContain('root-vs-shadow')
    expect(combined).not.toContain('screen_submit')
    expect(combined).not.toContain('phase_set')
    expect(combined).not.toContain('measure_record')
    expect(combined).not.toContain('note_record')
  })

  it('所有改动过的默认 Research Skills 都递增了 patch 版本', () => {
    const expectedVersions: Record<string, string> = {
      'research-loop': '0.5.2',
      'research-abduce': '0.5.1',
      'research-probe': '0.6.1',
      'research-grill': '0.4.1',
      'research-report': '0.4.1',
      'research-kit': '0.4.1',
      'research-moves': '0.2.1',
    }
    for (const [slug, version] of Object.entries(expectedVersions)) {
      const skill = readFileSync(join(researchSkillsRoot, slug, 'SKILL.md'), 'utf-8')
      expect(skill).toContain(`version: ${version}`)
    }
  })
})
