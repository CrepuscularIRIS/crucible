import { describe, expect, test } from 'bun:test'
import type { AgentRefineState } from '@proma/shared'
import { REFINE_MODES, refineBlockReason } from './refine-view'

const ready: AgentRefineState = { resident: true, autoRefine: { enabled: true, turnInterval: 25 } }
describe('手动提炼的许可与策略说明', () => {
  test('Given 已驻留且空闲的学习会话 When 查看动作 Then 允许写入并准确解释 learning', () => {
    expect(refineBlockReason({ ...ready, arm: { mode: 'learning' } }, false, false)).toBeUndefined()
    expect(REFINE_MODES.learning).toContain('效果需另行验证')
    expect(refineBlockReason(ready, false, false)).toBeUndefined()
  })
  test('Given 冻结、关闭、未知策略或未驻留 When 尝试提炼 Then 拒绝写入', () => {
    for (const mode of ['frozen', 'off', 'future']) expect(refineBlockReason({ ...ready, arm: { mode } }, false, false)).toBeTruthy()
    expect(refineBlockReason({ ...ready, resident: false }, false, false)).toContain('首轮消息前或空闲超时后')
    expect(refineBlockReason(null, false, false)).toContain('未确认')
    expect(refineBlockReason(ready, true, false)).toContain('等待本轮结束')
    expect(refineBlockReason(ready, false, true)).toContain('请勿重复提交')
  })
})
