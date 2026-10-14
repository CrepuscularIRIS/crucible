import { describe, expect, it } from 'bun:test'
import { buildResearchTerminalContext, buildSystemPrompt } from './agent-prompt-builder'
import { MANAGED_RESEARCH_SUBAGENT_ROLES, buildResearchRlmSubagentSpec } from './research-subagent-roles'
import { getResearchRolesDir } from './managed-research-subagents'

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
    expect(novelty).toContain('not run → claim_propose')
    expect(novelty).toContain('not the artifact rival')
    expect(lines.find((l) => l.startsWith('- pid not yet run'))).not.toContain('world_observe')
  })

  it('路由块：deep 走 kit 的 nonce 作业（new_job/wait/field）；压缩复核用闸给的名字和文件', () => {
    const block = buildResearchTerminalContext(true).split('<research_routing>')[1]!
    for (const verb of ['research_kit.new_job(', 'name=name', 'research_kit.wait(', 'research_kit.field']) {
      expect(block).toContain(verb)
    }
    expect(block).not.toContain("name='research-")
    const row = block.split('\n').find((l) => l.startsWith('- After compaction'))!
    expect(row).toContain('<post_compaction_rlm_required>')
    expect(block).not.toContain('compaction-checkpoint')
    expect(block).not.toContain('compaction-check')
  })

  it('路由块：deep 只走已安装的 research_kit（P0 验收 run 自写了 /root/jobs 助手、child 的 out.md 没有 STATUS）', () => {
    const block = buildResearchTerminalContext(true).split('<research_routing>')[1]!
    const deep = block.split('\n').find((l) => l.includes('deep = '))!
    expect(deep).toContain('import research_kit')
    expect(deep).toContain('no hand-written job helpers')
    // brief 以受管角色 spec 开头：out.md 末行 STATUS 的契约在 spec 里（RLM_STATUS_CONTRACT）
    expect(deep).toContain('brief.md = ')
    expect(deep).toContain('/proma-research-<role>.md')
  })

  it('路由块给出受管角色 spec 的绝对路径（SE6：不再 rlm.harness.get）', () => {
    const block = buildResearchTerminalContext(true).split('<research_routing>')[1]!
    expect(block).toContain(`${getResearchRolesDir()}/proma-research-<role>.md`)
    expect(block).not.toContain('rlm.harness.get')
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

describe('rlm child 系统提示（P0 检查 ④）', () => {
  // child 复用父会话 ResourceLoader：Proma 能控制的系统提示面 = 父会话 append 段
  // + harness 里的受管 rlm spec。父会话的契约/路由块只能走每回合用户消息。
  it('spawn 出的 child 系统提示里没有 <research_terminal_contract> / <research_routing>', () => {
    const append = buildSystemPrompt({ sessionId: 'p0-check', permissionMode: 'bypassPermissions' })
    const surfaces = [append, ...MANAGED_RESEARCH_SUBAGENT_ROLES.map(buildResearchRlmSubagentSpec)]
    for (const surface of surfaces) {
      expect(surface).not.toContain('<research_terminal_contract>')
      expect(surface).not.toContain('<research_routing>')
    }
  }, 20_000) // 首次加载 settings/user-profile 服务可能超过默认 5s
})
