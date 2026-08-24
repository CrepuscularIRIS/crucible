import { describe, expect, it } from 'bun:test'
import {
  buildDelegationPrompt,
  resolveDelegationModelId,
  resolveDelegationPermissionMode,
  shouldExposePiCollaborationTools,
} from './agent-collaboration-utils'

describe('Proma Collaboration 基座契约', () => {
  it('未指定模型时继承父会话模型', () => {
    expect(resolveDelegationModelId('glm-5.3', undefined)).toBe('glm-5.3')
    expect(resolveDelegationModelId('glm-5.3', '  gpt-5.6  ')).toBe('gpt-5.6')
    expect(resolveDelegationModelId(undefined, undefined)).toBeUndefined()
  })

  it('子会话继承父权限且不能从 plan 提升为直接执行', () => {
    expect(resolveDelegationPermissionMode('plan', undefined)).toBe('plan')
    expect(resolveDelegationPermissionMode('plan', 'bypassPermissions')).toBe('plan')
    expect(resolveDelegationPermissionMode('bypassPermissions', 'plan')).toBe('plan')
  })

  it('只向顶层、有项目归属的会话暴露 Collaboration tools', () => {
    expect(shouldExposePiCollaborationTools({ channelId: 'c1', workspaceId: 'w1' })).toBe(true)
    expect(shouldExposePiCollaborationTools({ channelId: 'c1', workspaceId: 'w1', triggeredBy: 'delegation' })).toBe(false)
    expect(shouldExposePiCollaborationTools({ channelId: 'c1' })).toBe(false)
  })

  it('委派用户消息只携带任务，不把角色名冒充完整系统契约', () => {
    const prompt = buildDelegationPrompt({
      parentSessionId: 'parent',
      delegationId: 'delegation',
      role: 'analyst',
      task: '分析候选机制',
    })
    expect(prompt).toContain('分析候选机制')
    expect(prompt).toContain('系统提示词已定义你的角色边界')
    expect(prompt).not.toContain('## 子任务角色\n\nanalyst')
  })
})
