import { describe, expect, test } from 'bun:test'
import { parseAgentSendIpcArguments } from './agent-send-input'

describe('Agent 发送 IPC 参数', () => {
  test('given 当前对象协议 when 解析 then 保留必填字段和可选上下文', () => {
    expect(parseAgentSendIpcArguments([{
      sessionId: 'session-1',
      userMessage: '继续实验',
      channelId: 'channel-1',
      modelId: 'qwen-max',
      mentionedSkills: ['research-loop'],
      startedAt: 123,
    }])).toEqual({
      sessionId: 'session-1',
      userMessage: '继续实验',
      channelId: 'channel-1',
      modelId: 'qwen-max',
      mentionedSkills: ['research-loop'],
      startedAt: 123,
    })
  })

  test('given 旧评测位置参数协议 when 解析 then 转成 AgentSendInput', () => {
    expect(parseAgentSendIpcArguments([
      'session-1',
      '继续实验',
      'channel-1',
      'qwen-max',
      'workspace-1',
    ])).toEqual({
      sessionId: 'session-1',
      userMessage: '继续实验',
      channelId: 'channel-1',
      modelId: 'qwen-max',
      workspaceId: 'workspace-1',
    })
  })

  test('given 空对象或缺少必填字段 when 解析 then 在落盘前明确拒绝', () => {
    expect(() => parseAgentSendIpcArguments([{}])).toThrow('sessionId 必须是非空字符串')
    expect(() => parseAgentSendIpcArguments(['session-1'])).toThrow('userMessage 必须是字符串')
    expect(() => parseAgentSendIpcArguments([{ sessionId: 'session-1', userMessage: 'x' }]))
      .toThrow('channelId 必须是非空字符串')
  })

  test('given 非法可选字段 when 解析 then 不让污染运行时', () => {
    expect(() => parseAgentSendIpcArguments([{
      sessionId: 'session-1',
      userMessage: 'x',
      channelId: 'channel-1',
      mentionedSkills: [undefined],
    }])).toThrow('mentionedSkills 必须是字符串数组')
  })
})
