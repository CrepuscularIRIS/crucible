import { describe, expect, it } from 'bun:test'

import type { SDKMessage, SDKUserMessage } from '../types/agent'
import { collectSuccessfulSkillReadActivations } from './skill-usage'

function assistantWithTool(toolCallId: string, name: string, input: Record<string, unknown>): SDKMessage {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: toolCallId, name, input }] },
  } as unknown as SDKMessage
}

function userWithResult(toolCallId: string, isError = false): SDKMessage {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolCallId, content: 'ok', is_error: isError }],
    },
  } as unknown as SDKMessage
}

describe('P0.3 skill 使用信号：bash / ipython / 旧 Read', () => {
  it('bash cat 打开 skills/<slug>/SKILL.md 且成功 → chip', () => {
    const messages = [
      assistantWithTool('t1', 'Bash', { command: 'cat /work/ws/skills/data-check/SKILL.md | head -50' }),
      userWithResult('t1'),
    ]
    const activations = collectSuccessfulSkillReadActivations(messages)
    expect(activations).toHaveLength(1)
    expect(activations[0]?.slug).toBe('data-check')
  })

  it('ipython cell 读取 SKILL.md（%%bash 或 pathlib）且成功 → chip', () => {
    const messages = [
      assistantWithTool('t2', 'ipython', { code: 'print(open("skills/figure/SKILL.md").read()[:200])' }),
      userWithResult('t2'),
    ]
    expect(collectSuccessfulSkillReadActivations(messages)[0]?.slug).toBe('figure')
  })

  it('同一次调用引用两个 skill 的 SKILL.md → 两个 chip', () => {
    const messages = [
      assistantWithTool('t3', 'ipython', {
        code: '%%bash\ncat skills/a/SKILL.md skills/b/SKILL.md',
      }),
      userWithResult('t3'),
    ]
    const slugs = collectSuccessfulSkillReadActivations(messages).map((a) => a.slug).sort()
    expect(slugs).toEqual(['a', 'b'])
  })

  it('反向验证：工具结果失败（is_error）→ 不产生 chip', () => {
    const messages = [
      assistantWithTool('t4', 'Bash', { command: 'cat skills/gone/SKILL.md' }),
      userWithResult('t4', true),
    ]
    expect(collectSuccessfulSkillReadActivations(messages)).toHaveLength(0)
  })

  it('反向验证：裸 tool_use 没有结果 → 不产生 chip；其他工具名不参与', () => {
    expect(collectSuccessfulSkillReadActivations([
      assistantWithTool('t5', 'Bash', { command: 'cat skills/gone/SKILL.md' }),
    ])).toHaveLength(0)
    expect(collectSuccessfulSkillReadActivations([
      assistantWithTool('t6', 'WebSearch', { query: 'skills/x/SKILL.md' }),
      userWithResult('t6'),
    ])).toHaveLength(0)
  })

  it('文本里只是恰好包含 skills/ 目录但不是 SKILL.md 入口 → 不产生 chip', () => {
    const messages = [
      assistantWithTool('t7', 'Bash', { command: 'ls skills/figure/references.md' }),
      userWithResult('t7'),
    ]
    expect(collectSuccessfulSkillReadActivations(messages)).toHaveLength(0)
  })

  it('旧会话的 Read 通道保持兼容', () => {
    const messages = [
      assistantWithTool('t8', 'Read', { file_path: '/ws/skills/legacy/SKILL.md' }),
      userWithResult('t8'),
    ]
    expect(collectSuccessfulSkillReadActivations(messages)[0]?.slug).toBe('legacy')
  })
})

describe('P0.3 skill 使用信号：工作区归属', () => {
  it('工作区 skills 根内的路径带上 workspaceSlug，根外不带', () => {
    const base = [
      assistantWithTool('t9', 'Bash', { command: 'cat /data/workspaces/ws1/skills/in-ws/SKILL.md' }),
      userWithResult('t9'),
      assistantWithTool('t10', 'Bash', { command: 'cat /elsewhere/skills/out-ws/SKILL.md' }),
      userWithResult('t10'),
    ]
    const activations = collectSuccessfulSkillReadActivations(base, {
      workspaceSlug: 'ws1',
      workspaceSkillsRoot: '/data/workspaces/ws1',
    })
    const inWs = activations.find((a) => a.slug === 'in-ws')
    const outWs = activations.find((a) => a.slug === 'out-ws')
    expect(inWs?.workspaceSlug).toBe('ws1')
    expect(inWs?.workspaceSkillPath).toBe('in-ws/SKILL.md')
    expect(outWs?.workspaceSlug).toBeUndefined()
  })
})
