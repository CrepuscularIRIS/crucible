import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HypothesisMap } from './HypothesisMap'
import { FocusCard } from './FocusCard'
import type { ClaimRow, FocusView } from './canvas-view'

const claim = (id: string, depth = 0): ClaimRow => ({ id, depth, name: `解释 ${id}`, statement: '尚待实验区分的机制', state: 'LIVE', stateLabel: '○ 未定', verdicts: [] })

describe('假设画布的证据边界', () => {
  test('Given 未记录 parent，When 展示假设图，Then 不生成派生关系', () => {
    const html = renderToStaticMarkup(<HypothesisMap claims={[claim('H1'), claim('H2')]} onSelect={() => {}} />)
    expect(html.match(/class="research-hypothesis-branch"/g)).toHaveLength(2)
    expect(html).not.toContain('class="research-derived"')
  })
  test('Given 已记录派生层级，Then 显示层级与当前选择，保留未定状态', () => {
    const html = renderToStaticMarkup(<HypothesisMap claims={[claim('H1'), claim('H4', 1)]} selectedId="H4" onSelect={() => {}} />)
    expect(html.match(/class="research-hypothesis-branch"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="派生假设"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('○ 未定')
  })
  test('Given 空记录，Then 说明下一步，不显示虚构节点', () => {
    expect(renderToStaticMarkup(<HypothesisMap claims={[]} onSelect={() => {}} />)).toContain('还没有提出假设')
  })
  test('Given 受阻选择或只读回放，Then 不提供可执行的选择', () => {
    const focus: FocusView = { kind: 'fork', title: '需要判断', lines: [], warnings: [], options: [{ label: '重复测量', columns: null, raw: '超出预算', selectable: false, blockedReason: '预算不足' }] }
    const live = renderToStaticMarkup(<FocusCard focus={focus} onAnswer={() => {}} />)
    expect(live).toContain('disabled=""')
    expect(live).toContain('预算不足')
    expect(renderToStaticMarkup(<FocusCard focus={focus} />)).not.toContain('<button')
  })
  test('Given 正在提交选择，Then 禁用选择按钮以避免重复干预', () => {
    const focus: FocusView = { kind: 'fork', title: '需要判断', lines: [], warnings: [], options: [{ label: '保留机制', columns: null, raw: '等待更多证据', selectable: true }] }
    expect(renderToStaticMarkup(<FocusCard focus={focus} busy onAnswer={() => {}} />)).toContain('disabled=""')
  })
})
