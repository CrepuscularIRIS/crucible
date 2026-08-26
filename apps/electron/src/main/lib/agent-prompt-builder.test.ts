import { describe, expect, it } from 'bun:test'
import { buildResearchTerminalContext } from './agent-prompt-builder'

describe('Research 父会话终局契约', () => {
  it('隔离父会话每回合拿到 Pi 实际工具全名', () => {
    const context = buildResearchTerminalContext(true)
    expect(context).toContain('mcp__research__world_forecast')
    expect(context).toContain('mcp__research__report_declare')
    expect(context).toContain('写完 REPORT.md **不等于**终局')
  })

  it('普通会话不注入 Research 终局契约', () => {
    expect(buildResearchTerminalContext(false)).toBe('')
  })

  it.each(['analyst', 'researcher', 'coder', 'reviewer'] as const)(
    'Proma Collaboration %s child 不继承父会话写状态义务',
    (role) => {
      expect(buildResearchTerminalContext(true, role)).toBe('')
    },
  )
})
