import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  MANAGED_RESEARCH_SUBAGENT_VERSION,
  getManagedResearchSubagentHarnessPath,
  seedManagedResearchSubagents,
} from './managed-research-subagents'

const tempDirs: string[] = []

interface HarnessFixtureEntry {
  title?: string
  content: string
  metadata: Record<string, unknown>
  scope?: string
  source?: string
}

interface HarnessFixtureState {
  entries: {
    prompt: Record<string, HarnessFixtureEntry>
    subagent: Record<string, HarnessFixtureEntry>
  }
  refinements: unknown[]
}

function requireEntry(
  bucket: Record<string, HarnessFixtureEntry>,
  id: string,
): HarnessFixtureEntry {
  const entry = bucket[id]
  if (!entry) throw new Error(`测试 fixture 缺少 harness entry: ${id}`)
  return entry
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempStatePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proma-managed-research-subagents-'))
  tempDirs.push(dir)
  return join(dir, 'harness', 'harness_state.json')
}

describe('受管 Research RLM subagent specs', () => {
  it('首次初始化写入四个全局 subagent spec，并保留其它 harness 桶', () => {
    const path = tempStatePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({
      schema: 1,
      entries: {
        prompt: { keep: { id: 'keep', kind: 'prompt', title: 'keep', content: 'keep' } },
        memory: {},
        skill: {},
        subagent: {},
      },
      refinements: [{ id: 'r1', trigger: 'keep', changes: [] }],
    }))

    const result = seedManagedResearchSubagents(path, '2026-08-24T00:00:00.000Z')
    const state = JSON.parse(readFileSync(path, 'utf8')) as HarnessFixtureState

    expect(result).toEqual({ created: 4, upgraded: 0, preserved: 0 })
    expect(Object.keys(state.entries.subagent)).toHaveLength(4)
    expect(requireEntry(state.entries.prompt, 'keep').content).toBe('keep')
    expect(state.refinements).toHaveLength(1)
    for (const entry of Object.values(state.entries.subagent)) {
      expect(entry.scope).toBe('global')
      expect(entry.source).toBe('proma')
      expect(entry.metadata.promaManagedVersion).toBe(MANAGED_RESEARCH_SUBAGENT_VERSION)
    }
  })

  it('升级未被用户修改的受管条目，但保留已编辑内容和非受管同名条目', () => {
    const path = tempStatePath()
    seedManagedResearchSubagents(path, '2026-08-23T00:00:00.000Z')
    const state = JSON.parse(readFileSync(path, 'utf8')) as HarnessFixtureState
    const analyst = requireEntry(state.entries.subagent, 'proma-research-analyst')
    analyst.metadata.promaManagedVersion = '0.0.0'
    const researcher = requireEntry(state.entries.subagent, 'proma-research-researcher')
    researcher.metadata.promaManagedVersion = '0.0.0'
    researcher.content = '用户定制内容'
    const reviewer = requireEntry(state.entries.subagent, 'proma-research-reviewer')
    delete reviewer.metadata.promaManagedBy
    reviewer.source = 'agent'
    reviewer.content = '非受管同名条目'
    const coder = requireEntry(state.entries.subagent, 'proma-research-coder')
    coder.title = '用户改过的标题'
    writeFileSync(path, JSON.stringify(state))

    const result = seedManagedResearchSubagents(path, '2026-08-24T00:00:00.000Z')
    const updated = JSON.parse(readFileSync(path, 'utf8')) as HarnessFixtureState

    expect(result.upgraded).toBe(1)
    expect(result.preserved).toBe(3)
    expect(requireEntry(updated.entries.subagent, 'proma-research-analyst').metadata.promaManagedVersion)
      .toBe(MANAGED_RESEARCH_SUBAGENT_VERSION)
    expect(requireEntry(updated.entries.subagent, 'proma-research-researcher').content)
      .toBe('用户定制内容')
    expect(requireEntry(updated.entries.subagent, 'proma-research-reviewer').content)
      .toBe('非受管同名条目')
    expect(requireEntry(updated.entries.subagent, 'proma-research-coder').title)
      .toBe('用户改过的标题')
  })
})

describe('受管 reviewer spec 的落盘路径', () => {
  it('与 Prime 全局 harness 同一路径（否则 rlm.harness.get 返回 None）', () => {
    expect(getManagedResearchSubagentHarnessPath({})).toBe(join(homedir(), '.prime/agent/harness/harness_state.json'))
    expect(getManagedResearchSubagentHarnessPath({ PRIME_AGENT_CODING_AGENT_DIR: '/x' })).toBe('/x/harness/harness_state.json')
    // Prime TS 不读 PI_CODING_AGENT_DIR：只设它时必须仍落到默认目录
    expect(getManagedResearchSubagentHarnessPath({ PI_CODING_AGENT_DIR: '/y' })).toBe(join(homedir(), '.prime/agent/harness/harness_state.json'))
    expect(getManagedResearchSubagentHarnessPath({ PRIME_AGENT_CODING_AGENT_DIR: '~/p' })).toBe(join(homedir(), 'p/harness/harness_state.json'))
  })
})

describe('受管 rlm spec 的 P0 契约', () => {
  /** Prime formatHarnessStateForPrompt 只给每条 entry 前 180 字符（compactText）。 */
  const harnessPreview = (content: string): string => content.replace(/\s+/g, ' ').trim().slice(0, 177)

  function seededContents(): Record<string, string> {
    const path = tempStatePath()
    seedManagedResearchSubagents(path, '2026-10-14T00:00:00.000Z')
    const state = JSON.parse(readFileSync(path, 'utf8')) as HarnessFixtureState
    return Object.fromEntries(Object.entries(state.entries.subagent).map(([id, e]) => [id, e.content]))
  }

  it('agent_message 覆盖行出现在 harness 预览里（父会话与 child 的系统提示都看得到）', () => {
    for (const content of Object.values(seededContents())) {
      expect(harnessPreview(content)).toContain('No agent_message')
      expect(harnessPreview(content)).toContain('WHEN:')
    }
  })

  it('reviewer / analyst 按 §4.2 收尾：out.md 末行与最后一条消息首行是同一条 STATUS 行', () => {
    const contents = seededContents()
    for (const id of ['proma-research-reviewer', 'proma-research-analyst']) {
      const content = contents[id]!
      expect(content).toContain('STATUS: <ok|blocked|failed> PATH: <path of out.md relative to the job root>')
      expect(content).toContain('LAST line of out.md')
      expect(content).toContain('FIRST line of your final message')
      expect(content).toContain('SUMMARY')
      // 旧的 Collaboration 词表不得与 rlm 的三值 STATUS 并存
      expect(content).not.toContain('STATUS: DONE')
    }
  })

  it('改了受管内容就升版本，旧版本条目被 seed 升级', () => {
    expect(MANAGED_RESEARCH_SUBAGENT_VERSION).toBe('1.2.0')
  })
})
