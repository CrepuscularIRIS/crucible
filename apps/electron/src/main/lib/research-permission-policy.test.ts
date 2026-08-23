/**
 * P4.3 审计 §3.1：计划模式曾用 `mcp__` 前缀一刀放行所有非 planning 的 MCP 工具，
 * 于是 probe_run（spawn bwrap 执行冻结命令 + 向只追加 journal 落账）在"仅规划不执行"
 * 的模式下可执行。这里锁定分类本身。
 */

import { describe, expect, it } from 'bun:test'
import { isResearchMutatingTool, isResearchReadOnlyTool } from './research-permission-policy'

describe('research MCP 权限分类', () => {
  it('执行与落账工具被识别为 mutating', () => {
    for (const tool of [
      'probe_run', 'prereg_write', 'claim_propose', 'claim_transition',
      'attack_record', 'report_declare', 'research_init',
      'world_observe', 'world_simulate', 'world_forecast',
    ]) {
      expect(isResearchMutatingTool(`mcp__proma-research__${tool}`)).toBe(true)
    }
  })

  it('只读面不被误判——计划模式下仍可读信念状态与重算指标', () => {
    expect(isResearchMutatingTool('mcp__proma-research__research_state')).toBe(false)
    expect(isResearchMutatingTool('mcp__proma-research__metric_recompute')).toBe(false)
    expect(isResearchReadOnlyTool('mcp__proma-research__research_state')).toBe(true)
  })

  it('反向：非 research 的 MCP 与内置工具一律不归本策略管', () => {
    // planning 的删除由 planning-permission-policy 处理，不能被本分类顺手拦下
    expect(isResearchMutatingTool('mcp__planning__delete_todo')).toBe(false)
    expect(isResearchMutatingTool('mcp__context7__query-docs')).toBe(false)
    expect(isResearchMutatingTool('Bash')).toBe(false)
    expect(isResearchMutatingTool('probe_run')).toBe(false)
    expect(isResearchMutatingTool('mcp__malformed')).toBe(false)
  })

  it('服务名可被用户改写，只要含 research 就按 research 面处理', () => {
    expect(isResearchMutatingTool('mcp__my-research-server__probe_run')).toBe(true)
  })
})
