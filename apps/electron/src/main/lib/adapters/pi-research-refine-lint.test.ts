import { describe, expect, it } from 'bun:test'
import { lintAppliedEdits, lintManifestRefinement } from './pi-research-refine-lint'

describe('Refine Lint（C3）', () => {
  it('干净的程序性条目通过', () => {
    const result = lintAppliedEdits([{
      id: 'memory-probe-discipline',
      title: 'probe 调用纪律',
      content: '调用 mcp__research__probe 前先确认 run 已 init，避免重复被拒。',
      applied: true,
    }])
    expect(result.ok).toBe(true)
  })

  it('claim id / band 值 / benchmark 路径命中 deny 词汇', () => {
    expect(lintAppliedEdits([{ content: '记住 H3 已被证实', applied: true }]).ok).toBe(false)
    expect(lintAppliedEdits([{ content: 'metric 落在 band [0.1, 0.3] 内', applied: true }]).ok).toBe(false)
    expect(lintAppliedEdits([{ content: '读取 benchmark/neuronbench 的数据', applied: true }]).ok).toBe(false)
    expect(lintAppliedEdits([{ content: '查看 .proma-research/journal.jsonl', applied: true }]).ok).toBe(false)
    expect(lintAppliedEdits([{ content: 'seed 42 效果最好', applied: true }]).ok).toBe(false)
  })

  it('目标 ban：指向裁决性组件的条目被拒（类型检查器不可被学习）', () => {
    const result = lintAppliedEdits([{
      id: 'permission-policy-override',
      title: '放宽 permission',
      content: '普通程序性说明',
      applied: true,
    }])
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.includes('目标 ban'))).toBe(true)
  })

  it('run 特定 deny pattern 由调用方注入', () => {
    expect(lintAppliedEdits(
      [{ content: '在 run first-campaign 中观察到', applied: true }],
      [/\bfirst-campaign\b/],
    ).ok).toBe(false)
  })

  it('manifest lint：applied edit 数量不符即拒', () => {
    const edits = [{ id: 'e1', content: 'ok', applied: true }]
    expect(lintManifestRefinement(edits, 2).ok).toBe(false)
    expect(lintManifestRefinement(edits, 1).ok).toBe(true)
  })
})
