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

/** 一张卡（SKILL.md + references/**）的全文；SE5 的锚只许出现在这里，不算路由块。 */
function skillText(skillsRoot: string, slug: string): string {
  const parts = [readFileSync(join(skillsRoot, slug, 'SKILL.md'), 'utf-8')]
  const refs = join(skillsRoot, slug, 'references')
  if (existsSync(refs)) {
    for (const file of readdirSync(refs, { recursive: true }) as string[]) {
      if (file.endsWith('.md')) parts.push(readFileSync(join(refs, file), 'utf-8'))
    }
  }
  return parts.join('\n')
}

/** SE5（02§4.5 C2）：每张卡的 integrity-anchors.txt —— 行行带标签、不收棘轮措辞、逐字仍在卡里。 */
function anchorProblems(skillsRoot: string): string[] {
  const problems: string[] = []
  for (const slug of RESEARCH_DEFAULT_SKILL_SLUGS) {
    const file = join(skillsRoot, slug, 'integrity-anchors.txt')
    if (!existsSync(file)) {
      problems.push(`${slug}: 缺 integrity-anchors.txt`)
      continue
    }
    const card = skillText(skillsRoot, slug)
    for (const line of readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim())) {
      const m = line.match(/^(integrity|epistemic)\|(.+)$/)
      if (!m) problems.push(`${slug}: 无标签 ${line}`)
      else if (/遭遇战|会战/.test(line)) problems.push(`${slug}: 棘轮措辞 ${line}`)
      else if (!card.includes(m[2]!)) problems.push(`${slug}: 锚不在卡里 ${m[2]}`)
    }
  }
  return problems
}

/** F1-A8①（03 §10.1）：候选模式与"held-out 不可模拟"是 F1 之前的用法，卡片与路由块不许再教。 */
const DEPRECATED_USAGES = ['world_simulate(mode=candidate)', 'held-out 不可模拟', '免费 `world_simulate`']
function deprecatedUsages(sources: string[]): string[] {
  return DEPRECATED_USAGES.filter((phrase) => sources.some((source) => source.includes(phrase)))
}

/** 锚的 NEXT 行点名的卡（research-<slug>/references/<card>.md）必须真实存在：NEXT 是深卡唯一会被读到的入口（01 §6.5）。 */
function missingCardsNamedBy(src: string, skillsRoot: string): string[] {
  return [...src.matchAll(/(research-[a-z-]+)\/references\/([\w-]+\.md)/g)]
    .map((m) => `${m[1]}/references/${m[2]}`)
    .filter((path) => !existsSync(join(skillsRoot, path)))
}

const KIT_INIT = join(researchSkillsRoot, 'research-kit/src/research_kit/__init__.py')
const KIT_ANCHOR_PARTS = join(researchSkillsRoot, 'research-kit/src/research_kit/anchor_parts.py')
const HEADLESS_KERNEL_PYTHON = join(process.env.HOME ?? '', '.proma-p0-venv/bin/python')
const NBSIM_STRIP = join(repoRoot, 'research/eval/nbsim_strip.py')
const SERVER_SRC = join(repoRoot, 'packages/research-mcp/src/server.ts')

type Channel = Record<string, number | null>

/** 卡片里所有通道形状的对象（带 `"mvh"` 的 `{…}`；通道对象内部没有嵌套花括号）。不靠 JSON.parse：写坏的 JSON 也得查。 */
function cardChannels(sources: string[]): Channel[] {
  const channels: Channel[] = []
  for (const source of sources) {
    for (const [object] of source.matchAll(/\{[^{}]*"mvh"[^{}]*\}/g)) {
      channels.push(Object.fromEntries([...object.matchAll(/"(\w+)"\s*:\s*(-?\d+(?:\.\d+)?)/g)].map(([, k, v]) => [k!, Number(v)])))
    }
  }
  return channels
}

/**
 * 卡片通道与某个隐藏通道"像"：可比字段过半落在容差内——电压 ±10 mV、斜率同号且差 ≤3、时间常数 2 倍内。
 * 任一方没有失活门（hvh 不是数）就不比 h 字段。阈值是押的（01 末节 C3），宁可误报。
 */
function resembles(card: Channel, hidden: Channel): boolean {
  const volt = (a: number, b: number) => Math.abs(a - b) <= 10
  const slope = (a: number, b: number) => Math.sign(a) === Math.sign(b) && Math.abs(a - b) <= 3
  const tau = (a: number, b: number) => a > 0 && b > 0 && Math.max(a / b, b / a) <= 2
  const rules: Record<string, (a: number, b: number) => boolean> = { E: volt, mvh: volt, mk: slope, mtau: tau, hvh: volt, hk: slope, htau: tau }
  const gated = typeof card.hvh === 'number' && typeof hidden.hvh === 'number'
  const fields = Object.keys(rules).filter((k) => (gated || !k.startsWith('h')) && typeof card[k] === 'number' && typeof hidden[k] === 'number')
  const close = fields.filter((k) => rules[k]!(card[k] as number, hidden[k] as number))
  return fields.length >= 3 && close.length * 2 > fields.length
}

/** 测试时从 NEURONBENCH_ROOT 派生全部隐藏通道（nbsim_strip.truth_fingerprints，不手抄任何真值）。 */
function hiddenChannels(benchmarkRoot: string): Channel[] {
  const code = [
    'import json, sys',
    'from pathlib import Path',
    `sys.path.insert(0, ${JSON.stringify(join(repoRoot, 'research/eval'))})`,
    'import nbsim_strip',
    'print(json.dumps(list(nbsim_strip.truth_fingerprints(Path(sys.argv[1]))["channels"].values())))',
  ].join('\n')
  const proc = spawnSync('python3', ['-c', code, benchmarkRoot], { encoding: 'utf-8' })
  if (proc.status !== 0) throw new Error(`派生隐藏通道失败（exit ${proc.status}）`)
  return JSON.parse(proc.stdout) as Channel[]
}

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

  it('F1-A8①：卡片与路由块不教弃用用法（候选模式 / held-out 不可模拟）；旧 research-probe:64 的写法变红', () => {
    expect(deprecatedUsages(['探索用 `world_simulate` 免费比候选。'])).toEqual([])
    expect(deprecatedUsages(['探索用免费 `world_simulate` 比候选'])).toEqual(['免费 `world_simulate`'])
    expect(deprecatedUsages(['先 world_simulate(mode=candidate) 再说'])).toEqual(['world_simulate(mode=candidate)'])
    expect(deprecatedUsages(cardSources())).toEqual([])
    // 03 §9.3 #21：research-probe 的探索指向工作目录里的 nbsim
    expect(readFileSync(join(researchSkillsRoot, 'research-probe/SKILL.md'), 'utf-8')).toContain('探索用工作目录里的 nbsim 免费比候选')
  })

  it('SE5：八张卡的 integrity 锚带标签、无棘轮措辞、逐字仍在卡里；删一条即红', () => {
    expect(anchorProblems(researchSkillsRoot)).toEqual([])
    const fixture = mkdtempSync(join(tmpdir(), 'proma-anchors-'))
    tempRoots.push(fixture)
    cpSync(researchSkillsRoot, fixture, { recursive: true, filter: (src) => !src.includes('__pycache__') })
    const anchorsFile = join(fixture, 'research-probe/integrity-anchors.txt')
    const firstIntegrity = readFileSync(anchorsFile, 'utf-8').split('\n').find((l) => l.startsWith('integrity|'))!
    const probeCard = join(fixture, 'research-probe/SKILL.md')
    writeFileSync(probeCard, readFileSync(probeCard, 'utf-8').replaceAll(firstIntegrity.slice('integrity|'.length), ''))
    expect(anchorProblems(fixture).some((p) => p.startsWith('research-probe: 锚不在卡里'))).toBe(true)
    writeFileSync(anchorsFile, `${firstIntegrity}\n没有标签的一行\nepistemic|遭遇战 2 起步\n`)
    const problems = anchorProblems(fixture)
    expect(problems.some((p) => p.includes('无标签'))).toBe(true)
    expect(problems.some((p) => p.includes('棘轮措辞'))).toBe(true)
    // oracle-rescue 夹具的 RED 从未实测，标 unmeasured
    expect(readFileSync(join(researchSkillsRoot, 'research-probe/test-pressure-oracle-rescue.md'), 'utf-8')).toContain('unmeasured')
  })

  it('SE8：W5 brief 模板含 other: 段与"本 run 全局"；triage 的 bug 级保留新探针出口并补 #26 那句；held-out 锚已登记', () => {
    const w5 = readFileSync(join(researchSkillsRoot, 'research-loop/references/w5-lessons.md'), 'utf-8')
    expect(w5).toContain('## other:')
    expect(w5).toContain('本 run 全局')
    expect(w5).toContain('through-seq:')
    const triage = readFileSync(join(researchSkillsRoot, 'research-moves/references/triage.md'), 'utf-8')
    const bugRow = triage.split('\n').find((l) => l.startsWith('| **伪影 / bug**'))!
    expect(bugRow).toContain('`prereg_write` 一个**新探针**')
    expect(bugRow).toContain('永不作终态依据')
    expect(bugRow).toContain('只有系统 bug（MCP、meter、`world_simulate`、nbsim 生成器）才暂停该分支')
    expect(readFileSync(join(researchSkillsRoot, 'research-loop/integrity-anchors.txt'), 'utf-8'))
      .toContain('integrity|held-out 不可观测；forecast 只一次')
  })

  it('A8③ + P3a：world-engine.md 有 I0–I9、两条 r* 公式、sim 引用、只示范符号的 hk 规则（参考模型自己的 Na 失活门）与 m∞/h∞ 打印检查，且不写 world 专属提示', () => {
    const engine = readFileSync(join(researchSkillsRoot, 'research-loop/references/world-engine.md'), 'utf-8')
    for (let i = 0; i <= 9; i++) expect(engine).toContain(`## I${i}`)
    expect(engine).toContain('r* = ⌈(2/d)²⌉')
    expect(engine).toContain('r* = ⌈ln 0.05 / ln(1 − p)⌉')
    expect(engine).toContain('held-out 不可观测；forecast 只一次')
    expect(engine).toContain('sims[{path}]')
    expect(engine).toContain('research-work/<run>/nbsim')
    expect(engine).toContain('永不凭一组参数否定一个家族')
    // HIGH-3：不给完整的新增通道例子（任何带失活的例子都像某个 world）；只示范符号，用参考模型自己的 Na h 门
    expect(engine).not.toMatch(/```json/)
    expect(cardChannels([engine])).toEqual([])
    for (const mark of ['Na 失活门', 'hk > 0', 'h_inf(-40, vh, +1) < h_inf(-95, vh, +1)']) expect(engine).toContain(mark)
    for (const mark of ['m∞', 'h∞', '-95', '-65', '-40']) expect(engine).toContain(mark)
    for (const leak of ['TTX', 'T 型', 'ca_rebound', 'rebound']) expect(engine).not.toContain(leak)
  })

  it.skipIf(!process.env.NEURONBENCH_ROOT?.trim())('HIGH-3：卡片与路由块里没有与任何隐藏通道相像的新增通道（隐藏通道在测试时从 NEURONBENCH_ROOT 派生）', () => {
    const hidden = hiddenChannels(process.env.NEURONBENCH_ROOT!.trim())
    expect(hidden.length).toBeGreaterThan(0)
    // 检测器自检：每个隐藏通道挪 5 mV 后必须被认作"像"——否则下面的空结果没有意义
    for (const h of hidden) {
      const shifted = { ...h, E: (h.E as number) + 5, mvh: (h.mvh as number) - 5 }
      expect(resembles(shifted, h)).toBe(true)
    }
    const hits: string[] = []
    cardChannels(cardSources()).forEach((card, i) => hidden.forEach((h, j) => {
      if (resembles(card, h)) hits.push(`卡片通道 #${i} ≈ 隐藏通道 #${j}`) // 只报序号，不回显任何真值
    }))
    expect(hits).toEqual([])
  })

  it('HIGH-2：probe 卡与 world-engine 点名 prereg 的结构字段（MCP 只读它们，写进 question 等于没写）；出处标签 sim:<记录 id>；k3 封顶表与宿主的 CONTESTED + lead 一致', () => {
    const serverSrc = readFileSync(SERVER_SRC, 'utf-8')
    const probe = readFileSync(join(researchSkillsRoot, 'research-probe/SKILL.md'), 'utf-8')
    const engine = readFileSync(join(researchSkillsRoot, 'research-loop/references/world-engine.md'), 'utf-8')
    for (const field of ['discrimination', 'provenance', 'sims', 'headline', 'scoped_statement']) {
      expect(serverSrc).toContain(`${field}: z.`) // 名字确实是 MCP 收的字段
      expect(probe).toMatch(new RegExp(`\`(?:branches\\[\\]\\.)?${field}`)) // 以代码字面点名（headline 写作 branches[].headline）
    }
    for (const field of ['discrimination', 'provenance', 'sims', 'headline']) expect(engine).toMatch(new RegExp(`\`(?:branches\\[\\]\\.)?${field}`))
    expect(probe).toContain('sim:<记录 id>')
    expect(engine).toContain('sim:<记录 id>')
    const k3 = readFileSync(join(researchSkillsRoot, 'research-probe/references/k3-audit.md'), 'utf-8')
    expect(k3).toContain('sim:<记录 id>')
    expect(k3).toContain('CONTESTED + lead')
    expect(k3).not.toContain('claim 留 LIVE')
    for (const source of cardSources()) {
      expect(source).not.toMatch(/sim:H#`?\s*[·/]\s*`?measured/) // 旧标签形式：MCP 只认 sim:<记录 id>
      expect(source).not.toMatch(/在 `question` 里标|question 另写/) // 结构字段不写进 question
    }
  })

  it('P3a：K3 审计卡覆盖 SUPPORTED 与家族级 REFUTED，只靠 asserted 带的结论封顶 lead；probe 卡能走到它', () => {
    const k3 = readFileSync(join(researchSkillsRoot, 'research-probe/references/k3-audit.md'), 'utf-8')
    for (const mark of ['家族级 REFUTED', 'asserted', '`lead`', 'claim_transition{audit}', 'self-reviewed']) {
      expect(k3).toContain(mark)
    }
    expect(readFileSync(join(researchSkillsRoot, 'research-probe/SKILL.md'), 'utf-8')).toContain('references/k3-audit.md')
  })

  it('P2 + IR-C2：research-loop 无棘轮；K0 一次停顿持久化到工作区 pending 路径；forks=wait 例外与 forks.md 单独成批', () => {
    const loop = readFileSync(join(researchSkillsRoot, 'research-loop/SKILL.md'), 'utf-8')
    expect(loop).not.toMatch(/遭遇战|会战/)
    for (const ref of ['intake-check.md', 'forks.md', 'world-engine.md', 'w5-lessons.md']) expect(loop).toContain(`references/${ref}`)
    expect(loop).toContain('⑤ `forks: wait`')
    const excuse = loop.split('\n').find((l) => l.includes('用户没回消息'))!
    expect(excuse).toContain('forks: wait')
    const k0 = readFileSync(join(researchSkillsRoot, 'research-loop/references/intake-check.md'), 'utf-8')
    for (const mark of ['.research-pending/K0-intake.md', 'status: pending_user', 'mode:', 'success_predicate:', 'forks:', 'seed:', '副作用信封', 'N_identify', 'research_init{mode']) {
      expect(k0).toContain(mark)
    }
    const forks = readFileSync(join(researchSkillsRoot, 'research-loop/references/forks.md'), 'utf-8')
    for (const mark of ['AskUserQuestion', '同一批', '研究分叉 F-a', '解决：… ｜ 成本：… ｜ 仍不确定：…', 'U#:']) {
      expect(forks).toContain(mark)
    }
  })

  it('交付 run 审计 D1/D4/§5.1：K0 确认后不改草稿；读数与已花预算只抄 journal；child brief 只用 ipython 跑 Python', () => {
    const k0 = readFileSync(join(researchSkillsRoot, 'research-loop/references/intake-check.md'), 'utf-8')
    // 宿主门拦"回复后改写过的草稿"：卡片再叫 agent 改成 status: confirmed 就是不可能指令
    expect(k0).not.toContain('`status: confirmed`')
    expect(k0).toContain('不要改草稿')
    const loop = readFileSync(join(researchSkillsRoot, 'research-loop/SKILL.md'), 'utf-8')
    const sourceRule = loop.split('\n').find((l) => l.startsWith('数字出处') && l.includes('probe.land'))
    expect(sourceRule).toContain('(P#)')
    expect(loop).toContain('journal 里没有的读数不写')
    const delegation = readFileSync(join(researchSkillsRoot, 'research-loop/references/delegation.md'), 'utf-8')
    const ipythonRule = delegation.split('\n').find((l) => l.includes('ipython') && l.includes('Bash'))
    expect(ipythonRule).toBeDefined()
    expect(ipythonRule).toContain('隔离守卫')
  })

  it('F1 B6/B7/B9：判别搜索含阻断剂格、observe 收 blockers；预算没花完时锚继续点名探针、报告写明为何没花；预报逐标签带 (sim:<记录 id>)', () => {
    const read = (rel: string) => readFileSync(join(researchSkillsRoot, rel), 'utf-8')
    const engine = read('research-loop/references/world-engine.md')
    const intake = read('research-loop/references/intake-check.md')
    const probe = read('research-probe/SKILL.md')
    const report = read('research-report/SKILL.md')
    const anchorSrc = readFileSync(KIT_ANCHOR_PARTS, 'utf-8')
    // B6：阻断剂进判别比较（只写方法，不点名任何阻断剂）；observe 的格子含 blockers
    for (const src of [engine, probe]) expect(src).toContain('阻断剂下各仿真')
    expect(engine).toContain('`spec.observe.blockers`')
    expect(probe).toContain('{world, seed, protocol, reps, blockers}')
    // B9：剩余预算 > 0 且活对手未分开 → 锚点名下一探针；等价类不免花预算；10% 保留额不是计量 reps
    expect(anchorSrc).toContain('→ 选判别度最高的下一探针（含阻断剂）')
    expect(engine).toContain('剩余预算 N → 选判别度最高的下一探针（含阻断剂）')
    for (const src of [engine, report, anchorSrc]) expect(src).toContain('01 K2-1')
    for (const src of [engine, intake]) expect(src).not.toMatch(/预算预留约 10%|预留约 10% 给 K3/)
    // B7：预报出处是仿真记录 id，不是 H#；REPORT 逐 held-out 标签一行带出处
    for (const src of [engine, report, anchorSrc]) {
      expect(src).not.toContain('(sim:H#)')
      expect(src).toContain('(sim:<记录 id>)')
    }
    expect(report).toContain('逐 held-out 标签一行')
    expect(report).toContain('reconcile 跳过括号内的记录 id')
  })

  it('P2：锚 NEXT 点名的卡都存在（kit 源码里的 research-<slug>/references/<card>.md）', () => {
    const src = readFileSync(KIT_ANCHOR_PARTS, 'utf-8')
    expect(src).toContain('research-loop/references/world-engine.md') // 解析失效时别让下面空转
    expect(missingCardsNamedBy(src, researchSkillsRoot)).toEqual([])
    expect(missingCardsNamedBy('见 research-loop/references/nope.md', researchSkillsRoot)).toEqual(['research-loop/references/nope.md'])
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
      'research-loop': '0.6.3',
      'research-abduce': '0.5.4',
      'research-probe': '0.6.6',
      'research-grill': '0.4.6',
      'research-report': '0.4.6',
      'research-kit': '0.5.3',
      'research-moves': '0.2.4',
      'research-scoop': '0.1.2',
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
