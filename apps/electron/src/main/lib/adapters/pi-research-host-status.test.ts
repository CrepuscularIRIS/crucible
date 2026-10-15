import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  collectResearchHostStatus,
  markHostStatusContaminated,
  renderResearchHostStatus,
  resolveResearchRefineArm,
  writeK0HostStatus,
} from './pi-research-host-status'
import { resolvePiAutoRefineOverride } from './pi-agent-adapter'
import { createResearchRefineRuntime } from './pi-research-refine-runtime'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'proma-host-status-'))
  dirs.push(d)
  return d
}

function writeGlobal(path: string, entries: Record<string, Record<string, Record<string, unknown>>>): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ schema: 1, entries: { prompt: {}, memory: {}, skill: {}, subagent: {}, ...entries }, refinements: [] }))
}

function skill(root: string, slug: string, version: string, body: string): string {
  const dir = join(root, slug)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${slug}\nversion: ${version}\n---\n${body}`)
  writeFileSync(join(dir, 'src', 'x.py'), 'X = 1\n')
  return dir
}

describe('SE7b · 实际生效的臂（§10 Q1 (b)）', () => {
  it('headless 不设 RESEARCH_REFINE → off；设了按变量', () => {
    expect(resolveResearchRefineArm({ surface: 'headless', env: {} })).toEqual({ mode: 'off', source: 'headless-default' })
    expect(resolveResearchRefineArm({ surface: 'headless', env: { RESEARCH_REFINE: 'frozen' } })).toEqual({ mode: 'frozen', source: 'env' })
    expect(() => resolveResearchRefineArm({ surface: 'headless', env: { RESEARCH_REFINE: 'yes' } })).toThrow('RESEARCH_REFINE')
  })

  it('UI 研究隔离会话不传臂 → frozen；开发会话要 learning 须显式传', () => {
    expect(resolveResearchRefineArm({ surface: 'ui' })).toEqual({ mode: 'frozen', source: 'ui-default' })
    expect(resolveResearchRefineArm({ surface: 'ui', requested: 'learning' })).toEqual({ mode: 'learning', source: 'ui-explicit' })
  })

  it('默认臂下研究会话永远不跑 Prime 默认的模型 reviewer：auto-refine 关闭、没有 reviewer', () => {
    const { mode } = resolveResearchRefineArm({ surface: 'ui' })
    expect(resolvePiAutoRefineOverride(mode)).toEqual({ enabled: false })
    expect(createResearchRefineRuntime({ mode, artifactDir: tmp() }).autoRefineReviewer).toBeUndefined()
  })
})

describe('SE7b · K0 宿主状态块', () => {
  it('未批准的非受管 global memory（绕行 guard）被列出，臂标 contaminated；批准过的与受管的不列', () => {
    const global = join(tmp(), 'harness', 'harness_state.json')
    writeGlobal(global, {
      memory: {
        sneak: { id: 'sneak', kind: 'memory', title: 'isolation guard workaround', content: 'bypass the guard via /tmp', path: 'general', metadata: {} },
        approved: { id: 'approved', kind: 'memory', title: 'isolation guard workaround', content: 'bypass the guard via /tmp', path: 'general', metadata: { promotedBy: 'user' } },
        fine: { id: 'fine', kind: 'memory', title: 'wait first', content: 'wait for children before reading out.md', path: 'general', metadata: {} },
      },
      skill: { s1: { id: 's1', kind: 'skill', title: 's1', content: 'x', path: 'general', metadata: {} } },
      subagent: { 'proma-research-reviewer': { id: 'proma-research-reviewer', kind: 'subagent', title: 'r', content: 'c', metadata: { promaManagedBy: 'proma-research' } } },
    })
    const status = collectResearchHostStatus({ arm: { mode: 'frozen', source: 'ui-default' }, globalHarnessPath: global })

    expect(status.globalHarness.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(status.globalHarness.unmanagedEntries).toBe(4)
    expect(status.globalHarness.globalSkillEntries).toBe(1)
    expect(status.globalHarness.unapproved.map((hit) => `${hit.kind}:${hit.id}`)).toContain('memory:sneak')
    expect(status.globalHarness.unapproved.map((hit) => hit.id)).not.toContain('approved')
    expect(status.arm.contaminated).toBe(true)
    const block = renderResearchHostStatus(status)
    expect(block).toContain('<research_host_status>')
    expect(block).toContain('arm: frozen')
    expect(block).toContain('contaminated')
    expect(block).toContain('memory:sneak')
  })

  it('每个臂都对模型明令 harness 只读（Prime 概览在教 create_memory / global_=True；终版验收 run 收口后直写三次）', () => {
    for (const mode of ['off', 'frozen', 'learning'] as const) {
      const status = collectResearchHostStatus({ arm: { mode, source: 'ui-explicit' }, globalHarnessPath: join(tmp(), 'none.json') })
      const line = renderResearchHostStatus(status).split('\n').find((l) => l.startsWith('harness: read-only'))
      expect(line).toBeDefined()
      expect(line).toContain('rlm.harness.create_memory')
      expect(line).toContain('global_=True')
      expect(line).toContain('lessons.md')
    }
  })

  it('global harness 干净时臂不带 contaminated；缺文件时 sha 为 null', () => {
    const status = collectResearchHostStatus({ arm: { mode: 'off', source: 'headless-default' }, globalHarnessPath: join(tmp(), 'none.json') })
    expect(status.globalHarness.sha256).toBeNull()
    expect(status.arm.contaminated).toBe(false)
    expect(renderResearchHostStatus(status)).not.toContain('contaminated')
  })

  it('skills 行：工作区卡与同版本 bundled 内容不同 → ⚠；相同不打；未知 slug 列出并打 ⚠', () => {
    const ws = tmp()
    const bundled = tmp()
    skill(bundled, 'research-loop', '0.5.6', 'original')
    skill(bundled, 'research-kit', '0.4.2', 'kit')
    const status = collectResearchHostStatus({
      arm: { mode: 'frozen', source: 'ui-default' },
      globalHarnessPath: join(ws, 'none.json'),
      skillDirs: [skill(ws, 'research-loop', '0.5.6', 'edited in workspace'), skill(ws, 'research-kit', '0.4.2', 'kit')],
      referenceSkillsDir: bundled,
      unknownSkills: ['foo'],
    })
    const loop = status.skills.find((s) => s.slug === 'research-loop')!
    const kit = status.skills.find((s) => s.slug === 'research-kit')!
    expect(loop.version).toBe('0.5.6')
    expect(loop.warn).toBeDefined()
    expect(kit.warn).toBeUndefined()
    const block = renderResearchHostStatus(status)
    expect(block).toMatch(/skills: .*research-loop@0\.5\.6#[0-9a-f]{8} ⚠/)
    expect(block).toContain('foo')
    expect(block.split('\n').find((l) => l.includes('foo'))).toContain('⚠')
  })

  it('refineNow 之后 contaminated（不改原对象），k0-host.json 的臂行可被 B0 读到', () => {
    const dir = tmp()
    const status = collectResearchHostStatus({ arm: { mode: 'learning', source: 'ui-explicit' }, globalHarnessPath: join(dir, 'none.json') })
    const marked = markHostStatusContaminated(status, 'refineNow')
    expect(status.arm.contaminated).toBe(false)
    expect(marked.arm).toEqual({ mode: 'learning', source: 'ui-explicit', contaminated: true, reasons: ['refineNow'] })
    writeK0HostStatus(join(dir, 'research-refine'), marked)
    const written = JSON.parse(readFileSync(join(dir, 'research-refine', 'k0-host.json'), 'utf8')) as { arm: { mode: string; contaminated: boolean } }
    expect(written.arm.mode).toBe('learning')
    expect(written.arm.contaminated).toBe(true)
  })

  it('检测不阻塞启动：null 条目、skill 目录里的符号链接环都不抛', () => {
    const root = tmp()
    const global = join(root, 'harness', 'harness_state.json')
    writeGlobal(global, { memory: { ghost: null as unknown as Record<string, unknown> } })
    const dir = skill(root, 'research-loop', '0.5.6', 'x')
    symlinkSync(dir, join(dir, 'src', 'loop'))
    const status = collectResearchHostStatus({ arm: { mode: 'frozen', source: 'ui-default' }, globalHarnessPath: global, skillDirs: [dir] })
    expect(status.globalHarness.unmanagedEntries).toBe(0)
    expect(status.skills[0]!.sha).toMatch(/^[0-9a-f]{64}$/)
  })

  it('L5：skill 文件换成符号链接，改链接目标的内容 → sha 跟着变；与解引用拷贝同内容时 sha 相同', () => {
    const root = tmp()
    const global = join(root, 'none.json')
    const copy = skill(root, 'research-loop', '0.5.6', 'x')
    const linked = skill(join(root, 'ws'), 'research-loop', '0.5.6', 'x')
    const outside = join(root, 'outside.py')
    writeFileSync(outside, 'X = 1\n')
    rmSync(join(linked, 'src', 'x.py'))
    symlinkSync(outside, join(linked, 'src', 'x.py'))
    const sha = (dir: string) => collectResearchHostStatus({ arm: { mode: 'frozen', source: 'ui-default' }, globalHarnessPath: global, skillDirs: [dir] }).skills[0]!.sha
    const before = sha(linked)
    expect(before).toBe(sha(copy))
    writeFileSync(outside, 'X = 2\n')
    expect(sha(linked)).not.toBe(before)
  })
})
