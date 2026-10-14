import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  RESEARCH_DEFAULT_SKILL_SLUGS,
  resolveResearchDefaultSkillsSource,
} from './research-default-skills'
import {
  isDefaultInactiveSkill,
  removeRetiredDefaultSkills,
  RETIRED_DEFAULT_SKILL_SLUGS,
  seedDefaultSkillsFromDirectory,
} from './config-paths'
import { buildResearchTerminalContext } from './agent-prompt-builder'

const tempRoots: string[] = []
const repoRoot = resolve(import.meta.dir, '../../../../..')
const researchSkillsRoot = join(repoRoot, 'research/skills')

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('受管 research 默认 Skills', () => {
  it('allowlist 恰好包含八个战役 Skill，排除开发期 writing skill', () => {
    expect(RESEARCH_DEFAULT_SKILL_SLUGS).toEqual([
      'research-loop',
      'research-abduce',
      'research-scoop',
      'research-probe',
      'research-grill',
      'research-report',
      'research-kit',
      'research-moves',
    ])
    expect(RESEARCH_DEFAULT_SKILL_SLUGS).not.toContain('research-writing-skills')
    expect(RETIRED_DEFAULT_SKILL_SLUGS).toContain('research-writing-skills')
  })

  it('写论文类内置 Skill 默认停用，research 战役 Skill 默认启用', () => {
    expect(isDefaultInactiveSkill('ccf-paper-writer')).toBe(true)
    expect(isDefaultInactiveSkill('nature-figure')).toBe(true)
    expect(RESEARCH_DEFAULT_SKILL_SLUGS.filter(isDefaultInactiveSkill)).toEqual([])
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

  it('真实仓库来源的八项都有 SKILL.md，并只把 allowlist seed 到默认缓存', () => {
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
      'research-loop/references/stage-questioning.md',
      'research-abduce/references/discovery-methods.md',
      'research-scoop/SKILL.md',
      'research-probe/references/candidate-screen.md',
      'research-probe/references/coherence-dry-run.md',
      'research-probe/references/execution-framework.md',
      'research-probe/references/experimental-tactics.md',
      'research-grill/references/idea-gauntlet.md',
      'research-moves/references/research-judgment.md',
      'research-moves/references/root-vs-shadow.md',
      'research-report/references/claim-ledger.md',
      'research-report/references/evidence-audit.md',
    ]
    const combined = files
      .map((file) => readFileSync(join(researchSkillsRoot, file), 'utf-8'))
      .join('\n')

    expect(combined).toContain('Coherence dry-run')
    expect(combined).toContain('root-vs-shadow')
    expect(combined).toContain('Oracle rescue')
    expect(combined).toContain('方法谱系')
    expect(combined).toContain('审查者与修订者保持分离')
  })

  it('Skill/references 与路由块里反引号中的 MCP 工具名都真实注册在 research-mcp server', () => {
    // 真实工具集直接从 server.ts 解析，不手写清单。
    const serverSrc = readFileSync(join(repoRoot, 'packages/research-mcp/src/server.ts'), 'utf-8')
    const tools = new Set([...serverSrc.matchAll(/server\.tool\(\s*'([a-z_]+)'/g)].map((m) => m[1]!))
    expect(tools.has('claim_propose')).toBe(true) // 解析失效时别让下面空转
    // "像 MCP 工具名" = 首段与某个真实工具同前缀（research_/claim_/prereg_/…/world_）。
    const prefixes = new Set([...tools].map((t) => t.split('_')[0]))
    // 误报过滤：research_kit 是 kernel 里的 Python 包（如 `claim_view`），包名与其 def 名同样从源码解析。
    const kitSrc = readFileSync(join(researchSkillsRoot, 'research-kit/src/research_kit/__init__.py'), 'utf-8')
    const kitNames = new Set(['research_kit', ...[...kitSrc.matchAll(/^def ([a-z_]+)\(/gm)].map((m) => m[1]!)])

    const sources = [buildResearchTerminalContext(true)]
    for (const slug of RESEARCH_DEFAULT_SKILL_SLUGS) {
      sources.push(readFileSync(join(researchSkillsRoot, slug, 'SKILL.md'), 'utf-8'))
      const refs = join(researchSkillsRoot, slug, 'references')
      if (!existsSync(refs)) continue
      for (const file of readdirSync(refs, { recursive: true }) as string[]) {
        if (file.endsWith('.md')) sources.push(readFileSync(join(refs, file), 'utf-8'))
      }
    }
    const unknown = new Set<string>()
    for (const source of sources) {
      for (const [, code] of source.matchAll(/`([^`\n]+)`/g)) {
        for (const [name] of code!.replaceAll('mcp__research__', '').matchAll(/\b[a-z]+(?:_[a-z0-9]+)+\b/g)) {
          if (prefixes.has(name.split('_')[0]) && !kitNames.has(name) && !tools.has(name)) unknown.add(name)
        }
      }
    }
    expect([...unknown]).toEqual([])
    // 前缀规则看不到 research-mcp 命名空间外的伪造名；保留历史上真出现过的 Claude campaign 工具名作回归。
    for (const fake of ['screen_submit', 'phase_set', 'measure_record', 'note_record']) {
      expect(sources.join('\n')).not.toContain(fake)
    }
  })

  it('高阶方法从对应阶段入口可发现，并会随受管 seed 完整复制', () => {
    const stageReferences = [
      ['research-loop', 'references/stage-questioning.md'],
      ['research-abduce', 'references/discovery-methods.md'],
      ['research-probe', 'references/experimental-tactics.md'],
      ['research-grill', 'references/idea-gauntlet.md'],
      ['research-report', 'references/evidence-audit.md'],
    ] as const

    const target = mkdtempSync(join(tmpdir(), 'proma-research-method-chain-'))
    tempRoots.push(target)
    seedDefaultSkillsFromDirectory(
      researchSkillsRoot,
      target,
      new Set(RESEARCH_DEFAULT_SKILL_SLUGS),
    )

    for (const [slug, reference] of stageReferences) {
      const entry = readFileSync(join(researchSkillsRoot, slug, 'SKILL.md'), 'utf-8')
      expect(entry).toContain(reference)
      expect(existsSync(join(researchSkillsRoot, slug, reference))).toBe(true)
      expect(existsSync(join(target, slug, reference))).toBe(true)
    }
  })

  it('Scoop 门保留 5 级裁决、delta 句、全文纪律，且引用的兄弟文件真实存在', () => {
    const scoop = readFileSync(join(researchSkillsRoot, 'research-scoop/SKILL.md'), 'utf-8')
    expect(scoop).toContain('level = 5 - matched axes')
    expect(scoop).toContain('Abstract-only does not count as read')
    expect(scoop).toContain('Unlike [closest prior work]')
    expect(scoop).toContain('DO NOT TRIGGER')
    expect(scoop).toContain("await rlm(")
    expect(scoop).toContain('RULINGS.md')
    expect(existsSync(join(researchSkillsRoot, 'research-loop/references/delegation.md'))).toBe(true)
    expect(existsSync(join(researchSkillsRoot, 'research-moves/references/reframe.md'))).toBe(true)
  })

  it('实验策略把多模态 oracle rescue 限定为上界，并要求语义与形状控制', () => {
    const tactics = readFileSync(
      join(researchSkillsRoot, 'research-probe/references/experimental-tactics.md'),
      'utf-8',
    )
    expect(tactics).toContain('多模态例')
    expect(tactics).toContain('wrong-answer')
    expect(tactics).toContain('跨样本 swap')
    expect(tactics).toContain('贡献上界')
    expect(tactics).toContain('不要从 oracle 单臂直接写“融合模块是瓶颈”')
  })

  it('所有改动过的默认 Research Skills 都递增了 patch 版本', () => {
    const expectedVersions: Record<string, string> = {
      'research-loop': '0.5.5',
      'research-abduce': '0.5.3',
      'research-probe': '0.6.3',
      'research-grill': '0.4.3',
      'research-report': '0.4.3',
      'research-kit': '0.4.1',
      'research-moves': '0.2.3',
      'research-scoop': '0.1.0',
    }
    for (const [slug, version] of Object.entries(expectedVersions)) {
      const skill = readFileSync(join(researchSkillsRoot, slug, 'SKILL.md'), 'utf-8')
      expect(skill).toContain(`version: ${version}`)
    }
  })

  it('每个默认 research SKILL.md 的 frontmatter 都能被 Prime 的 yaml 解析（否则 Prime 静默丢弃该 skill）', () => {
    // 不能 import pi-coding-agent（zeromq 原生模块让 bun 测试崩），所以借它的依赖解析拿同一个 yaml，
    // 并复刻 utils/frontmatter.ts 的切分：首个 "\n---" 之前。
    const piEntry = realpathSync(join(__dirname, '../../../node_modules/@earendil-works/pi-coding-agent/dist/index.js'))
    const { parse } = createRequire(piEntry)('yaml') as { parse: (src: string) => Record<string, unknown> }
    for (const slug of RESEARCH_DEFAULT_SKILL_SLUGS) {
      const src = readFileSync(join(researchSkillsRoot, slug, 'SKILL.md'), 'utf-8').replace(/\r\n?/g, '\n')
      const end = src.indexOf('\n---', 3)
      const frontmatter = parse(src.slice(4, end))
      expect(frontmatter.name).toBe(slug)
      expect(typeof frontmatter.description).toBe('string')
    }
  })
})
