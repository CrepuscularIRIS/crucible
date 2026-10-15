import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResearchTimeline, timelineEvents, timelineRows, timelineTitle } from './ResearchTimeline'
import type { WorkbenchEvent } from './workbench-view'

const events: WorkbenchEvent[] = [
  { seq: 1, ts: '2026-10-15T00:15:00Z', op: 'claim_add', title: '提出竞争解释', hids: ['H1', 'H2'] },
  { seq: 3, ts: '2026-10-15T01:20:00Z', op: 'probe_run', title: '完成测量', pid: 'P1', hids: ['H1'] },
  { seq: 4, ts: 'invalid', op: 'reconcile', title: '记录解释变化', pid: 'P1', hids: ['H2'] },
]

describe('研究过程时间线', () => {
  test('Given 原始事件，When 回放，Then 保留事件顺序、关联标签和 UTC+08 时间', () => {
    const html = renderToStaticMarkup(<ResearchTimeline events={events} seq={3} replay onEvent={() => {}} />)
    expect(html).toContain('UTC+08')
    expect(html).toContain('08:15:00')
    expect(html).toContain('09:20:00')
    expect(html).not.toContain('probe_run')
    expect(html).toContain('P1')
    expect(html).toContain('H2')
    expect(html.indexOf('提出竞争解释')).toBeLessThan(html.indexOf('完成测量'))
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(html).not.toContain('记录解释变化')
    expect(html).not.toContain('reconcile')
    expect(html.match(/class="timeline-event-button/g)).toHaveLength(2)
  })
  test('Given 实时视图，Then 不将后续事件标记为尚未发生', () => {
    const html = renderToStaticMarkup(<ResearchTimeline events={events} seq={3} replay={false} onEvent={() => {}} />)
    expect(html).not.toContain('之后')
    expect(html).toContain('点击事件查看关联内容')
    expect(html).toContain('时间未记录')
    expect(html).toContain('记录解释变化')
  })
  test('Given 回放游标前没有事件，Then 不泄露未来标题与关联信息', () => {
    const html = renderToStaticMarkup(<ResearchTimeline events={events} seq={0} replay onEvent={() => {}} />)
    expect(html).toContain('还没有可展示的研究事件')
    expect(html).not.toContain('提出竞争解释')
    expect(html).not.toContain('H1')
    expect(html).not.toContain('<button')
  })
  test('Given 没有事件，Then 显示等待记录且不编造进度', () => {
    const html = renderToStaticMarkup(<ResearchTimeline events={[]} seq={0} replay={false} onEvent={() => {}} />)
    expect(html).toContain('还没有可展示的研究事件')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('aria-current')
  })
  test('Given 已知机械事件和未知事件，Then 关键筛选只移除明确噪声且可完整恢复', () => {
    const mixed: WorkbenchEvent[] = ['world.simulate', 'world.info', 'world.env', 'env.snapshot', 'world.env.verify', 'new.future.operation', 'claim.transition'].map((op, index) => ({ seq: index + 1, ts: '', op, title: op, hids: [] }))
    expect(timelineEvents(mixed, 7, false, false).map((event) => event.op)).toEqual(['world.env.verify', 'new.future.operation', 'claim.transition'])
    expect(timelineEvents(mixed, 7, false, true)).toEqual(mixed)
    expect(timelineEvents(mixed, 5, true, true).map((event) => event.seq)).toEqual([1, 2, 3, 4, 5])
    expect(timelineEvents(mixed, 5, true, false).map((event) => event.op)).toEqual(['world.env.verify'])
    const html = renderToStaticMarkup(<ResearchTimeline events={mixed} seq={5} replay onEvent={() => {}} />)
    expect(html).toContain('显示 1 / 5 条')
    expect(html).toContain('关键进展')
    expect(html).toContain('全部记录')
    expect(html).not.toContain('new.future.operation')
  })
  test('Given 只有机械事件，Then 解释筛选结果并保留全部记录入口', () => {
    const html = renderToStaticMarkup(<ResearchTimeline events={[{ seq: 1, ts: '', op: 'world.simulate', title: '模拟数据', hids: [] }]} seq={1} replay onEvent={() => {}} />)
    expect(html).toContain('当前只有环境或模拟记录')
    expect(html).toContain('显示 0 / 1 条')
    expect(html).toContain('全部记录')
  })
  test('Given 科学状态标题，Then 中文解释保持原判断及未知词', () => {
    expect(timelineTitle('H1 → SCOPED；请求 REFUTED 被封顶')).toBe('H1 → 收窄范围；请求 已被否定 被封顶')
    expect(timelineTitle('LIVE SUPPORTED CONTESTED UNKNOWN LIVE_TEST')).toBe('待检验 得到支持 仍有争议 UNKNOWN LIVE_TEST')
    const html = renderToStaticMarkup(<ResearchTimeline events={[{ seq: 1, ts: '', op: 'claim.transition', title: 'H1 → SCOPED', hids: ['H1'] }]} seq={1} replay onEvent={() => {}} />)
    expect(html).toContain('H1 → 收窄范围')
    expect(html).not.toContain('<details')
    expect(html).not.toContain('H1 → SCOPED')
  })
})

describe('关键进展的阅读密度', () => {
  const proposals: WorkbenchEvent[] = [
    { seq: 1, ts: '', op: 'run.init', title: '开始研究', hids: [] },
    ...[2, 3, 4].map((seq) => ({ seq, ts: '', op: 'claim.propose', title: `提出 H${seq}`, hids: [`H${seq}`] })),
    { seq: 5, ts: '', op: 'world.info', title: '世界', hids: [] },
    { seq: 6, ts: '', op: 'claim.propose', title: '提出 H6', hids: ['H6'] },
    { seq: 7, ts: '', op: 'prereg.write', title: '登记 P1', pid: 'P1', hids: [] },
  ]
  test('Given 连续提出假设（中间只隔机械记录）When 关键进展 Then 合成一行可展开', () => {
    const rows = timelineRows(timelineEvents(proposals, 7, false, false))
    expect(rows.map((row) => 'events' in row ? `group:${row.events.length}` : row.op)).toEqual(['run.init', 'group:4', 'prereg.write'])
    const html = renderToStaticMarkup(<ResearchTimeline events={proposals} seq={7} replay={false} onEvent={() => {}} />)
    expect(html).toContain('提出 4 个假设')
    expect(html).toMatch(/<details[^>]*class="timeline-group[\s\S]*提出 H2[\s\S]*提出 H6/)
  })
  test('Given 单个提出 When 关键进展 Then 不合并', () => {
    const single = [proposals[0]!, proposals[1]!, proposals[6]!]
    expect(timelineRows(single).map((row) => 'events' in row ? 'group' : row.op)).toEqual(['run.init', 'claim.propose', 'prereg.write'])
  })
  test('Given 关键进展 When 默认显示 Then 不展开开发记录', () => {
    const html = renderToStaticMarkup(<ResearchTimeline events={proposals} seq={7} replay={false} onEvent={() => {}} />)
    expect(html).not.toContain('开发记录')
  })
})
