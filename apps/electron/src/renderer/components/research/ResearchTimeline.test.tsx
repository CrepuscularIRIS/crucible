import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResearchTimeline } from './ResearchTimeline'
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
    expect(html).toContain('probe_run')
    expect(html).toContain('P1')
    expect(html).toContain('H2')
    expect(html.indexOf('提出竞争解释')).toBeLessThan(html.indexOf('完成测量'))
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(html).not.toContain('记录解释变化')
    expect(html).not.toContain('reconcile')
    expect(html.match(/type="button"/g)).toHaveLength(2)
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
})
