import { describe, expect, it } from 'bun:test'
import {
  MANAGED_RESEARCH_SUBAGENT_ROLES,
  buildResearchSubagentSystemPrompt,
  buildResearchRlmSubagentSpec,
  normalizeResearchSubagentRole,
} from './research-subagent-roles'

describe('Research 子 Agent 角色契约', () => {
  it('只提供四个受管科研角色，并兼容旧角色名', () => {
    expect(MANAGED_RESEARCH_SUBAGENT_ROLES).toEqual([
      'analyst',
      'researcher',
      'coder',
      'reviewer',
    ])
    expect(normalizeResearchSubagentRole('explore')).toBe('analyst')
    expect(normalizeResearchSubagentRole('research')).toBe('researcher')
    expect(normalizeResearchSubagentRole('implement')).toBe('coder')
    expect(normalizeResearchSubagentRole('review')).toBe('reviewer')
  })

  it('所有角色都遵守父会话独占状态、禁止二次委派和统一状态回传', () => {
    for (const role of MANAGED_RESEARCH_SUBAGENT_ROLES) {
      const prompt = buildResearchSubagentSystemPrompt(role)
      expect(prompt).toContain('父会话是唯一的研究状态写入者')
      expect(prompt).toContain('不得创建任何子 Agent')
      expect(prompt).toContain('STATUS: DONE')
      expect(prompt).toContain('STATUS: OUT_OF_ROLE')
    }
  })

  it('角色权限互不混淆', () => {
    expect(buildResearchSubagentSystemPrompt('analyst')).toContain('不实施代码')
    expect(buildResearchSubagentSystemPrompt('researcher')).toContain('不替父会话排序或选择')
    expect(buildResearchSubagentSystemPrompt('coder')).toContain('SPEC_GAP')
    expect(buildResearchSubagentSystemPrompt('reviewer')).toContain('只读审查')
    expect(buildResearchSubagentSystemPrompt('reviewer')).toContain('不得修补被审查文件')
    expect(buildResearchSubagentSystemPrompt('custom')).toContain('未给路径时完整产出放在最终回复')
    expect(buildResearchSubagentSystemPrompt('custom')).not.toContain('Research MCP')
  })

  it('RLM spec 使用 Prime 原生 rlm 调用且默认继承模型', () => {
    const spec = buildResearchRlmSubagentSpec('analyst')
    expect(spec).toContain("rlm.harness.get('subagent', 'proma-research-analyst', global_=True).content")
    expect(spec).toContain('await rlm(')
    expect(spec).toContain('不要传 model')
    expect(spec).toContain('继承父会话当前模型')
    expect(spec).toContain('绝对报告路径')
    expect(spec).not.toContain('run_subagent')
  })

  it('RLM spec 用 kit 的 nonce 作业：new_job 给名字，同一 turn wait，field 取值', () => {
    for (const role of MANAGED_RESEARCH_SUBAGENT_ROLES) {
      const spec = buildResearchRlmSubagentSpec(role)
      for (const verb of ['research_kit.new_job(', 'name=name', 'research_kit.wait(', 'research_kit.field(']) {
        expect(spec).toContain(verb)
      }
      expect(spec).not.toContain("name='research-")
    }
  })

  it('RLM spec 只出现 ok|blocked|failed 三个 STATUS 词（§4.2）；Collaboration 词表不变', () => {
    for (const role of MANAGED_RESEARCH_SUBAGENT_ROLES) {
      const words = [...buildResearchRlmSubagentSpec(role).matchAll(/STATUS:\s*([^\s`]+)/g)].map((m) => m[1])
      expect(words.length).toBeGreaterThan(0)
      for (const word of words) expect(['ok', 'blocked', 'failed', '<ok|blocked|failed>']).toContain(word!)
      expect(buildResearchRlmSubagentSpec(role)).not.toMatch(/\b(DONE|NEEDS_CONTEXT|OUT_OF_ROLE)\b/)
    }
    expect(buildResearchRlmSubagentSpec('coder')).toContain('`STATUS: blocked`，并在摘要中写 `SPEC_GAP')
    expect(buildResearchSubagentSystemPrompt('coder')).toContain('`STATUS: NEEDS_CONTEXT`，并在摘要中写 `SPEC_GAP')
  })

  it('RLM STATUS 行只在所有节都定稿后才追加（防 wait 提前返回）', () => {
    expect(buildResearchRlmSubagentSpec('reviewer')).toContain('only after every section is final')
  })
})
