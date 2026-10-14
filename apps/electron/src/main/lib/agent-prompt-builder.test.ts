import { describe, expect, it } from 'bun:test'
import { buildResearchTerminalContext } from './agent-prompt-builder'

describe('Research 父会话终局契约', () => {
  it('隔离父会话每回合拿到 Pi 实际工具全名', () => {
    const context = buildResearchTerminalContext(true)
    expect(context).toContain('mcp__research__world_forecast')
    expect(context).toContain('mcp__research__report_declare')
    expect(context).toContain('写完 REPORT.md **不等于**终局')
  })

  it('隔离父会话每回合拿到 Use When 路由块（深/浅 + 新门 + 压缩规则）', () => {
    const context = buildResearchTerminalContext(true)
    expect(context).toContain('<research_routing>')
    expect(context).toContain('research-scoop')
    expect(context).toContain('research-grill/references/idea-quality.md')
    expect(context).toContain('await rlm(')
    expect(context).toContain('compaction')
    // ponytail: 每回合付费，行数与字符上限即回归闸
    const block = context.slice(context.indexOf('<research_routing>'))
    expect(block.split('\n').length).toBeLessThanOrEqual(25)
    expect(block.length).toBeLessThanOrEqual(2200)
  })

  it('路由块：scoop/idea-quality 只在新颖性任务、claim_propose 之前运行；pid 只走 probe_run', () => {
    const block = buildResearchTerminalContext(true).split('<research_routing>')[1]!
    const lines = block.split('\n')
    const scope = lines.find((l) => l.startsWith('Novelty task ='))!
    expect(scope).toContain('world tasks')
    expect(scope).toContain('named system')
    const row = lines.find((l) => l.startsWith('- No LIVE claim'))!
    const novelty = row.slice(row.indexOf('Novelty task:'))
    expect(novelty).toContain('before claim_propose')
    expect(novelty.indexOf('research-scoop')).toBeGreaterThan(-1)
    expect(novelty.indexOf('idea-quality')).toBeGreaterThan(novelty.indexOf('research-scoop'))
    expect(novelty).toContain('not run → continue')
    expect(lines.find((l) => l.startsWith('- pid not yet run'))).not.toContain('world_observe')
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
