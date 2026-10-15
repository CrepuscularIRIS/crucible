import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProbeExperiment } from './ProbeExperiment'
import type { ProbeCardView } from './workbench-view'

const fixture = (overrides: Partial<ProbeCardView> = {}): ProbeCardView => ({ pid: 'P2', question: '哪种机制解释反弹？', protocol: 'brief hyperpolarization', reps: 1, status: 'measured', bands: [{ hid: 'H3', low: 11, high: 15 }, { hid: 'H5', low: 18, high: 22 }], observed: 13, changes: [{ seq: 3, hid: 'H5', from: 'LIVE', to: 'REFUTED', reason: '观测不符合预注册预测' }], ...overrides })
const render = (probe: ProbeCardView | null): string => renderToStaticMarkup(<ProbeExperiment probe={probe} onSelectClaim={() => {}} />)

describe('实验产物的数值与科学边界', () => {
  test('Given 有效预测与实测，When 展示，Then 共用数轴并保留记录中的状态变化', () => {
    const html = render(fixture())
    expect(html).toContain('role="img"')
    expect(html.match(/data-observed="13"/g)).toHaveLength(2)
    expect(html).toContain('查看假设 H5')
    expect(html).toContain('观测不符合预注册预测')
    expect(html).toContain('落入区间不等于假设成立')
    expect(html).toContain('11 – 15')
  })
  test('Given 未选实验，Then 显示空状态', () => {
    expect(render(null)).toContain('实验产物将在这里生长')
  })
  test('Given 等待、失败或缺失实测，Then 不补零也不绘制观测点', () => {
    for (const probe of [fixture({ status: 'pending' }), fixture({ status: 'failed', observed: 0 }), fixture({ observed: undefined })]) {
      expect(render(probe)).not.toContain('data-observed=')
    }
    expect(render(fixture({ status: 'failed' }))).toContain('测量失败')
    expect(render(fixture({ observed: undefined }))).toContain('实测值未记录')
  })
  test('Given 观测和区间均为零，Then 零保留且单值数轴不会除零', () => {
    const html = render(fixture({ bands: [{ hid: 'H0', low: 0, high: 0 }], observed: 0, changes: [] }))
    expect(html).toContain('data-observed="0"')
    expect(html).toContain('x1="322"')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
    expect(html).toContain('不会自动生成科学判断')
  })
  test('Given NaN、Infinity 或逆序区间，Then 省略图形并说明问题', () => {
    const html = render(fixture({ bands: [{ hid: 'H1', low: NaN, high: 1 }, { hid: 'H2', low: 0, high: Infinity }, { hid: 'H3', low: 10, high: 1 }], observed: Infinity }))
    expect(html).not.toContain('<svg')
    expect(html).toContain('H1、H2、H3 的预测区间无效')
    expect(html).toContain('实测值无效')
    expect(html).toContain('10 – 1（无效区间）')
  })
  test('Given 极大且异号的有限数值，Then 坐标仍有限', () => {
    const html = render(fixture({ bands: [{ hid: 'H1', low: -Number.MAX_VALUE, high: Number.MAX_VALUE }], observed: 0 }))
    expect(html).not.toContain('Infinity')
    expect(html).not.toContain('NaN')
    expect(html).toContain('data-observed="0"')
  })
  test('Given 请求 REFUTED 被封顶为 CONTESTED，Then 展示实际结果及封顶原因', () => {
    const html = render(fixture({ changes: [{ seq: 26, hid: 'H5', from: 'LIVE', to: 'CONTESTED', requested: 'REFUTED', lead: ['no_audit'], reason: '测量与预测不符' }] }))
    expect(html).toContain('LIVE → CONTESTED')
    expect(html).toContain('请求 REFUTED → 实际 CONTESTED')
    expect(html).toContain('原因：no_audit')
    expect(html).not.toContain('LIVE → REFUTED')
  })
  test('Given 阻断剂信息可选，Then 显示具体阻断剂，空值明确无而缺字段不编造', () => {
    expect(render(fixture({ blockers: 'Cd' }))).toContain('阻断剂：Cd')
    expect(render(fixture({ blockers: '' }))).toContain('阻断剂：无')
    expect(render(fixture({ blockers: 'none' }))).toContain('阻断剂：无')
    expect(render(fixture())).not.toContain('阻断剂：')
  })
  test('Given 封顶记录没有原因码，Then 显示原因未记录', () => {
    const html = render(fixture({ changes: [{ seq: 26, hid: 'H5', to: 'CONTESTED', requested: 'REFUTED', reason: '' }] }))
    expect(html).toContain('原因：未记录')
    expect(html).toContain('此前状态未记录 → CONTESTED')
  })
})
