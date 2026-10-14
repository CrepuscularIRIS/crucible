import { afterEach, describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
import * as refineLint from './adapters/pi-research-refine-lint'

const tempRoots: string[] = []
const repoRoot = resolve(import.meta.dir, '../../../../..')
const researchSkillsRoot = join(repoRoot, 'research/skills')

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// ── C1 契约（02§4.5）：卡片只点名已发布的东西。全部从当时的真实源码解析，天然按片生效。 ──

/** 卡片 + 路由块：C1 各检查共用的扫描面。 */
function cardSources(skillsRoot = researchSkillsRoot): string[] {
  const sources = [buildResearchTerminalContext(true)]
  for (const slug of RESEARCH_DEFAULT_SKILL_SLUGS) {
    sources.push(readFileSync(join(skillsRoot, slug, 'SKILL.md'), 'utf-8'))
    const refs = join(skillsRoot, slug, 'references')
    if (!existsSync(refs)) continue
    for (const file of readdirSync(refs, { recursive: true }) as string[]) {
      if (file.endsWith('.md')) sources.push(readFileSync(join(refs, file), 'utf-8'))
    }
  }
  return sources
}

/** research_kit 的导出名：顶层 def / 赋值 + `from .x import a, b`（含括号多行写法）；`_` 开头的不算。 */
function kitExports(initSrc: string): Set<string> {
  const defs = [...initSrc.matchAll(/^(?:async\s+)?def ([A-Za-z]\w*)\(/gm)].map((m) => m[1]!)
  const assigned = [...initSrc.matchAll(/^([A-Za-z]\w*)\s*(?::[^=\n]+)?=/gm)].map((m) => m[1]!)
  const imported = [...initSrc.matchAll(/^from \.[\w.]* import (?:\(([^)]*)\)|([^\n]+))/gm)]
    .flatMap((m) => (m[1] ?? m[2] ?? '').split(/[,\s]+/).filter(Boolean))
  return new Set([...defs, ...assigned, ...imported])
}

/** 卡片里点名、但 kit 没导出的 `research_kit.<name>`（dunder 是模块属性，不查）。 */
function unknownKitNames(sources: string[], exports: Set<string>): string[] {
  const unknown = new Set<string>()
  for (const source of sources) {
    for (const [, name] of source.matchAll(/\bresearch_kit\.([A-Za-z_]\w*)/g)) {
      if (!name!.startsWith('__') && !exports.has(name!)) unknown.add(name!)
    }
  }
  return [...unknown]
}

/** 有 pyproject.toml 的研究 skill 必须有 `src/<import>/__init__.py`，否则 Prime 静默退回 markdown skill。 */
function pythonSkillsMissingPackage(skillsRoot: string): string[] {
  return RESEARCH_DEFAULT_SKILL_SLUGS.filter((slug) => (
    existsSync(join(skillsRoot, slug, 'pyproject.toml'))
    && !existsSync(join(skillsRoot, slug, 'src', slug.replaceAll('-', '_'), '__init__.py'))
  ))
}

/**
 * 在给定 python 里 import research_kit：拿不到真模块（Prime 会绑定调用时才抛错的占位符）
 * 或缺了源码导出的名字（旧副本顶替），都返回问题描述。
 */
function kitImportProblems(python: string, exports: Set<string>, env: NodeJS.ProcessEnv = process.env): string[] {
  const probe = spawnSync(python, ['-c', 'import json, research_kit as k; print(json.dumps({"file": getattr(k, "__file__", None), "names": dir(k)}))'], {
    encoding: 'utf-8',
    env,
  })
  if (probe.status !== 0) return [`import research_kit 失败：${probe.stderr.trim().split('\n').pop()}`]
  const loaded = JSON.parse(probe.stdout) as { file: string | null; names: string[] }
  if (!loaded.file?.endsWith(join('research_kit', '__init__.py'))) return [`research_kit.__file__ 不是包入口：${loaded.file}`]
  const names = new Set(loaded.names)
  return [...exports].filter((name) => !names.has(name)).map((name) => `缺导出 ${name}（${loaded.file}）`)
}

/** server.ts 注册的工具名里，不被 F9 工具名模式覆盖的。 */
function toolsNotCoveredBy(pattern: RegExp, serverSrc: string): string[] {
  const single = new RegExp(pattern.source, pattern.flags.replace('g', ''))
  return [...serverSrc.matchAll(/\.tool\(\s*'([a-z_]+)'/g)].map((m) => m[1]!).filter((name) => !single.test(name))
}

/** 卡片里点名、但 nbsim 门面（`nbsim_strip.py` 的 FACADE_EXPORTS 字面常量）没有的 `nbsim.<name>`。 */
function unknownNbsimNames(sources: string[], stripSrc: string): string[] {
  const tuple = stripSrc.match(/^FACADE_EXPORTS\s*=\s*\(([^)]*)\)/m)?.[1] ?? ''
  const facade = new Set([...tuple.matchAll(/["']([A-Za-z_]\w*)["']/g)].map((m) => m[1]!))
  const unknown = new Set<string>()
  for (const source of sources) {
    for (const [, name] of source.matchAll(/\bnbsim\.([A-Za-z_]\w*)/g)) {
      if (!facade.has(name!)) unknown.add(name!)
    }
  }
  return [...unknown]
}

const KIT_INIT = join(researchSkillsRoot, 'research-kit/src/research_kit/__init__.py')
const HEADLESS_KERNEL_PYTHON = join(process.env.HOME ?? '', '.proma-p0-venv/bin/python')
const NBSIM_STRIP = join(repoRoot, 'research/eval/nbsim_strip.py')
const SERVER_SRC = join(repoRoot, 'packages/research-mcp/src/server.ts')

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

    const sources = cardSources()
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

  it('C1②：卡片与路由块点名的 research_kit.<name> 都在 kit 导出里（含 .jobs 导入的名字）', () => {
    const exports = kitExports(readFileSync(KIT_INIT, 'utf-8'))
    expect(exports.has('anchor')).toBe(true) // 解析失效时别让下面空转
    expect(exports.has('wait')).toBe(true)
    expect(unknownKitNames(cardSources(), exports)).toEqual([])
    // 夹具：P3b 之前点名 discriminate 就是不可能指令；已发布的 wait 放行
    expect(unknownKitNames(['先 `research_kit.discriminate(run)` 再登记'], exports)).toEqual(['discriminate'])
    expect(unknownKitNames(['`await research_kit.wait(job)`'], exports)).toEqual([])
  })

  it('C1④：Python 研究 skill 都有 src/<import>/__init__.py；删掉后检查变红', () => {
    expect(pythonSkillsMissingPackage(researchSkillsRoot)).toEqual([])
    const fixture = mkdtempSync(join(tmpdir(), 'proma-python-skill-'))
    tempRoots.push(fixture)
    cpSync(researchSkillsRoot, fixture, { recursive: true, filter: (src) => !src.includes('__pycache__') })
    rmSync(join(fixture, 'research-kit/src/research_kit/__init__.py'))
    expect(pythonSkillsMissingPackage(fixture)).toEqual(['research-kit'])
  })

  it('C1④：import research_kit 拿不到真模块（占位符 / 旧副本）时检查变红', () => {
    const exports = kitExports(readFileSync(KIT_INIT, 'utf-8'))
    const stale = mkdtempSync(join(tmpdir(), 'proma-stale-kit-'))
    tempRoots.push(stale)
    mkdirSync(join(stale, 'research_kit'))
    writeFileSync(join(stale, 'research_kit/__init__.py'), 'def anchor(run):\n    return ""\n')
    const problems = kitImportProblems('python3', exports, { ...process.env, PYTHONPATH: stale })
    expect(problems.some((p) => p.includes('缺导出 wait'))).toBe(true)
    // import 失败正是 Prime 绑定占位符的条件
    const broken = join(stale, 'broken')
    mkdirSync(join(broken, 'research_kit'), { recursive: true })
    writeFileSync(join(broken, 'research_kit/__init__.py'), 'raise ImportError("uv install failed")\n')
    expect(kitImportProblems('python3', exports, { ...process.env, PYTHONPATH: broken })[0])
      .toContain('import research_kit 失败')
  })

  it.skipIf(!existsSync(HEADLESS_KERNEL_PYTHON))('C1④：headless kernel venv 里 import research_kit 是真模块', () => {
    expect(kitImportProblems(HEADLESS_KERNEL_PYTHON, kitExports(readFileSync(KIT_INIT, 'utf-8')))).toEqual([])
  })

  it('F9：server.ts 注册的每个工具名都被 RESEARCH_TOOL_NAME_PATTERN 覆盖', () => {
    const serverSrc = readFileSync(SERVER_SRC, 'utf-8')
    // 夹具先证明检查本身会红：新增一个不在模式里的工具
    const withNewTool = `${serverSrc}\nserver.tool(\n  'zzz_unlisted',`
    expect(toolsNotCoveredBy(/^(research|claim|prereg|probe|metric|attack|report|world)_/, withNewTool)).toEqual(['zzz_unlisted'])
    // 接口 3（A → D）：轨道 A 合入前没有导出，按旧行为跳过
    const pattern = (refineLint as Record<string, unknown>).RESEARCH_TOOL_NAME_PATTERN
    if (!(pattern instanceof RegExp)) return
    expect(toolsNotCoveredBy(pattern, serverSrc)).toEqual([])
  })

  it('F1-A8②：卡片点名的 nbsim.<name> 都在 nbsim_strip.py 的 FACADE_EXPORTS 里', () => {
    const facade = 'FACADE_EXPORTS = ("load_task", "protocol", "simulate", "observe_like")\n'
    expect(unknownNbsimNames(['`nbsim.simulate(mech, seg, 64, seed=0)` 与 `nbsim.foo()`'], facade)).toEqual(['foo'])
    // 接口 9（E → D）：生成器未合入时跳过
    if (!existsSync(NBSIM_STRIP)) return
    expect(unknownNbsimNames(cardSources(), readFileSync(NBSIM_STRIP, 'utf-8'))).toEqual([])
  })

  it('SE7c：skill-creator / find-skills / tool-builder 默认停用（研究 skill 只走 02§4.4 这条路径）', () => {
    for (const slug of ['skill-creator', 'find-skills', 'tool-builder']) {
      expect(isDefaultInactiveSkill(slug)).toBe(true)
    }
  })

  it('SE7c：新建工作区里三者落在 skills-inactive/；v1→v2 迁移跑两次也不会重新启用', () => {
    // homedir() 在 Bun 进程内不跟随运行时改的 HOME，所以在子进程里跑，绝不碰真实 ~/.proma
    const home = mkdtempSync(join(tmpdir(), 'proma-se7c-home-'))
    tempRoots.push(home)
    const script = join(home, 'se7c.ts')
    writeFileSync(script, `
      import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
      import { join } from 'node:path'
      const cfg = await import(${JSON.stringify(join(import.meta.dir, 'config-paths.ts'))})
      const mgr = await import(${JSON.stringify(join(import.meta.dir, 'agent-workspace-manager.ts'))})
      const slugs = ['skill-creator', 'find-skills', 'tool-builder', 'research-loop']
      for (const slug of slugs) {
        mkdirSync(join(cfg.getDefaultSkillsDir(), slug), { recursive: true })
        writeFileSync(join(cfg.getDefaultSkillsDir(), slug, 'SKILL.md'), '---\\nname: ' + slug + '\\ndescription: x\\n---\\n')
      }
      const ws = mgr.createAgentWorkspace('se7c-ws')
      const state = () => Object.fromEntries(slugs.map((s) => [s,
        existsSync(join(cfg.getInactiveSkillsDir(ws.slug), s)) ? 'inactive'
          : existsSync(join(cfg.getWorkspaceSkillsDir(ws.slug), s)) ? 'active' : 'missing']))
      const rerunV1Migration = () => {
        const indexPath = cfg.getAgentWorkspacesIndexPath()
        writeFileSync(indexPath, JSON.stringify({ ...JSON.parse(readFileSync(indexPath, 'utf-8')), version: 1 }))
        mgr.listAgentWorkspaces()
      }
      const created = state()
      rerunV1Migration()
      const first = state()
      rerunV1Migration()
      console.log('SE7C' + JSON.stringify({ created, first, second: state() }))
    `)
    const proc = spawnSync(process.execPath, [script], { encoding: 'utf-8', env: { ...process.env, HOME: home, PROMA_DEV: '1' } })
    const line = proc.stdout.split('\n').find((l) => l.startsWith('SE7C'))
    expect(line, proc.stderr).toBeDefined()
    const expected = { 'skill-creator': 'inactive', 'find-skills': 'inactive', 'tool-builder': 'inactive', 'research-loop': 'active' }
    expect(JSON.parse(line!.slice(4))).toEqual({ created: expected, first: expected, second: expected })
  })

  it('SE7c：routing 跑器的判定不依赖卡片原文（P2 删棘轮措辞不会让它误报）', () => {
    const runner = readFileSync(join(repoRoot, 'apps/electron/scripts/routing-acceptance.ts'), 'utf-8')
    const checks = runner.slice(runner.indexOf('const checks = {'), runner.indexOf('const pass ='))
    expect(checks.length).toBeGreaterThan(0)
    for (const cardWording of ['遭遇战', '会战', '[战役]', '等级']) expect(checks).not.toContain(cardWording)
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
      'research-loop': '0.5.7',
      'research-abduce': '0.5.3',
      'research-probe': '0.6.3',
      'research-grill': '0.4.4',
      'research-report': '0.4.4',
      'research-kit': '0.4.2',
      'research-moves': '0.2.3',
      'research-scoop': '0.1.1',
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
