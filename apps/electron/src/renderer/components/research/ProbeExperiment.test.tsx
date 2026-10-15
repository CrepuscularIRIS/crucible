import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProbeExperiment } from './ProbeExperiment'
import type { ProbeCardView } from './workbench-view'
import { canvasView } from './canvas-view'
import { loadRecord, ONE_DIR } from './test-fixtures'

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
    expect(html).toContain('预测范围，不是置信区间')
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
    expect(html).toContain('x1="410"')
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
    expect(html).toContain('未定 → 有争议')
    expect(html).toContain('请求被否定 → 实际有争议')
    expect(html).toContain('请求 REFUTED → 实际 CONTESTED')
    expect(html).toContain('原因：缺少审计记录')
    expect(html).toContain('原因码：no_audit')
    expect(html).not.toContain('LIVE → REFUTED')
  })
  test('Given 阻断剂信息可选，Then 显示具体阻断剂，空值明确无而缺字段不编造', () => {
    expect(render(fixture({ blockers: 'Cd' }))).toContain('，阻断剂 Cd')
    expect(render(fixture({ blockers: '' }))).toContain('，无阻断剂')
    expect(render(fixture({ blockers: 'none' }))).toContain('，无阻断剂')
    expect(render(fixture())).not.toContain('阻断剂')
  })
  test('Given 封顶记录没有原因码，Then 显示原因未记录', () => {
    const html = render(fixture({ changes: [{ seq: 26, hid: 'H5', to: 'CONTESTED', requested: 'REFUTED', reason: '' }] }))
    expect(html).toContain('原因：未记录')
    expect(html).toContain('此前状态未记录 → CONTESTED')
  })
  test('Given 长研究问题和完整协议，Then 短标题独立且可展开读取完整原文', () => {
    const question = '这里保留原始问题和未删减的研究背景。'.repeat(30)
    const protocol = '原始实验设置\n第二行完整参数'
    const html = render(fixture({ question, protocol }))
    expect(html).toMatch(/<h3[^>]*>P2 · 原始实验设置 第二行完整参数<\/h3>/)
    expect(html).toContain('展开完整问题与实验设置')
    expect(html).toContain(question)
    expect(html).toContain(protocol)
    const details = html.match(/<details[^>]*>[\s\S]*?<\/details>/)?.[0]
    expect(details).toContain(question)
    expect(details).toContain(protocol)
  })
  test('Given 部分假设有名称，Then 图旁和数值表使用提供的名字且不生成其他解释', () => {
    const html = renderToStaticMarkup(<ProbeExperiment probe={fixture()} claimNames={{ H3: '基础通道解释' }} />)
    expect(html).toContain('H3 · 基础通道解释')
    expect(html.match(/基础通道解释/g)).toHaveLength(2)
    expect(html).toContain('H5')
    expect(html).not.toContain('undefined')
  })
  test('Given 未识别状态与原因码，Then 不推断中文含义且原始码仍可展开', () => {
    const html = render(fixture({ changes: [{ seq: 27, hid: 'H5', to: 'CUSTOM_STATE', requested: 'CUSTOM_REQUEST', lead: ['custom_reason'], reason: '原始解释' }] }))
    expect(html).toContain('未识别状态（见原始记录）')
    expect(html).toContain('其他限制（见原始记录）')
    expect(html).toContain('展开原始状态记录')
    expect(html).toContain('请求 CUSTOM_REQUEST → 实际 CUSTOM_STATE')
    expect(html).toContain('原因码：custom_reason')
  })
})

describe('第一次看的评委：两分钟读懂一轮实验', () => {
  const svg = (html: string): string => html.match(/<svg[\s\S]*<\/svg>/)?.[0] ?? ''
  test('Given 实测值 When 画图 Then 每个假设行标出命中 / 落空（文字 + 样式，不只靠颜色）', () => {
    const chart = svg(render(fixture()))
    expect(chart).toMatch(/data-hit="true"[^>]*>[^<]*命中/)
    expect(chart).toMatch(/data-hit="false"[^>]*>[^<]*落空/)
    expect(svg(render(fixture({ status: 'pending' })))).not.toContain('data-hit=')
  })
  test('Given 本轮迁移 When 图下 Then 一句话说明关联迁移；缺记录不等于判断没变', () => {
    const html = render(fixture({ closed: true, bands: [{ hid: 'H3', low: 11, high: 15 }, { hid: 'H4', low: 1, high: 2 }, { hid: 'H5', low: 18, high: 22 }], changes: [
      { seq: 3, hid: 'H4', from: 'LIVE', to: 'CONTESTED', reason: '' }, { seq: 4, hid: 'H5', from: 'LIVE', to: 'CONTESTED', reason: '' }] }))
    expect(html).toContain('H4、H5 → 有争议；H3 无本轮关联迁移')
    expect(html.indexOf('H4、H5 → 有争议')).toBeLessThan(html.indexOf('这一轮改变了什么'))
    expect(render(fixture({ closed: true, changes: [] }))).toContain('尚未记录判断迁移')
    expect(render(fixture({ status: 'pending', changes: [] }))).not.toContain('本轮没有改变任何判断')
  })
  test('Given 假设名称 When 画图 Then 行标签写 H# · 短名，过长截断且保留完整名提示', () => {
    const chart = svg(renderToStaticMarkup(<ProbeExperiment probe={fixture()} claimNames={{ H3: '无额外电流', H5: '一个非常非常长的假设名称需要截断' }} />))
    expect(chart).toContain('H3 · 无额外电流')
    expect(chart).toContain('H5 · 一个非常非常长的假…')
    expect(chart).toContain('<title>H5 · 一个非常非常长的假设名称需要截断</title>')
  })
  test('Given 协议与阻断剂 When 展示 Then 先给一行白话标题，原始问题只在展开里', () => {
    const question = '这是 agent 写的原始长问题'
    const html = render(fixture({ question, protocol: 'brief hyperpol 40 ms', blockers: '' }))
    expect(html).toMatch(/<h3[^>]*>P2 · brief hyperpol 40 ms，无阻断剂<\/h3>/)
    expect(html.replace(/<details[\s\S]*?<\/details>/g, '')).not.toContain(question)
    expect(render(fixture({ blockers: 'Cd' }))).toContain('P2 · brief hyperpolarization，阻断剂 Cd')
  })
  test('Given 观测量名称 When 画图 Then 数轴标出单位', () => {
    expect(svg(render(fixture({ metric: 'spike_count' })))).toContain('spike_count')
    expect(svg(render(fixture()))).toContain('观测值（单位未记录）')
  })
})

describe('判断尚在记录中时不下结论', () => {
  const one = loadRecord(ONE_DIR)
  const at = (seq: number) => canvasView(one, { seq, mode: 'replay', bridge: false }).workbench!.probes.find((p) => p.pid === 'P2')!
  test('Given P2 已落地、迁移逐行写入（66→69）When 回放 Then 不说"没有改变"也不把未判的写成保留', () => {
    expect(at(66).closed).toBe(false)
    const landed = render(at(66))
    expect(landed).not.toContain('本轮没有改变任何判断')
    expect(landed).toContain('尚未记录判断迁移')
    const partial = render(at(67))
    expect(partial).toContain('H5 → 被否定')
    expect(partial).not.toContain('保留')
    expect(at(105).closed).toBe(true)
    // H4 在第69行有无 by_probe 的变化，不能把缺少关联称作保留。
    expect(render(at(105))).toContain('H4 无本轮关联迁移')
    expect(render(at(105))).not.toContain('H4 保留')
  })
})
