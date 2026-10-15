import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { canvasView } from './canvas-view'
import { followingProbe, StageExplanation } from './StageExplanation'
import { loadRecord, ONE_DIR } from './test-fixtures'
import type { ProbeCardView, WorkbenchEvent } from './workbench-view'

const record = loadRecord(ONE_DIR)
const noop = () => {}
function render(seq: number, pid: string): string {
  const wb = canvasView(record, { mode: 'replay', bridge: false, seq }).workbench!
  return renderToStaticMarkup(<StageExplanation probe={wb.probes.find((p) => p.pid === pid) ?? null} probes={wb.probes}
    events={wb.events} seq={seq} claimNames={{}} onSelectProbe={noop} onSelectClaim={noop} onSeq={noop} />)
}

describe('阶段解释：真实归档按时点读取', () => {
  test('Given P2 已登记但未测量 When 回放63行 Then 不冒充执行或显示后来的判断', () => {
    const html = render(63, 'P2')
    expect(html).toContain('本轮解释 · P2')
    expect(html).toContain('已登记 · 尚无落地结果')
    expect(html).toContain('计划登记 #63')
    expect(html).not.toContain('结果落地 #66')
    expect(html).not.toContain('REFUTED')
    expect(html).not.toContain('P3')
    expect(html).toContain('此时尚无后续实验登记')
  })

  test('Given 已测但未迁移 When 回放66行 Then 结果和科学判断分开', () => {
    const html = render(66, 'P2')
    expect(html).toContain('结果落地 #66')
    expect(html).toContain('已取得测量结果')
    expect(html).toContain('尚无关联的判断变更记录')
    expect(html).toContain('记录可追溯 ≠ 科学结论已验证')
  })

  test('Given 后续P2已登记 When 回看P1 Then 只称后续、不把相邻强行写成因果', () => {
    const planned = render(63, 'P1')
    expect(planned).toContain('P2 · 已登记 · 尚无落地结果')
    expect(planned).toContain('不能断言它由本轮结果促成')
    const executed = render(68, 'P1')
    expect(executed).toContain('P2 · 已取得测量结果')
    expect(render(68, 'P2')).toContain('2 个假设有状态变更记录')
  })
})

describe('阶段解释：缺失、失败与不可信文本', () => {
  const p: ProbeCardView = { pid: 'P1', question: '', protocol: '', reps: 1, status: 'failed', bands: [], changes: [], note: '失败 <script>alert(1)</script>' }
  test('Given 没有理由且测量失败 When 渲染 Then 不补造问题和零观测，原文被转义', () => {
    const html = renderToStaticMarkup(<StageExplanation probe={p} probes={[p]} events={[]} seq={0} claimNames={{}} onSelectProbe={noop} onSelectClaim={noop} />)
    expect(html).toContain('未记录研究问题')
    expect(html).toContain('已记录失败')
    expect(html).toContain('没有记录的理由不补写')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('已取得测量结果')
  })

  test('Given 未来登记含哨兵 When 找后续 Then 不穿过回放边界、不按编号猜测', () => {
    const events: WorkbenchEvent[] = [
      { seq: 1, ts: '', op: 'prereg.write', title: '', pid: 'P1', hids: [] },
      { seq: 8, ts: '', op: 'prereg.write', title: '', pid: 'P9', hids: [] },
    ]
    const p9 = { ...p, pid: 'P9', question: 'FUTURE_SENTINEL' }
    expect(followingProbe('P1', [p9, p], events, 7)).toBeUndefined()
    expect(followingProbe('P1', [p9, p], events, 8)?.pid).toBe('P9')
    expect(followingProbe('missing', [p9, p], events, 8)).toBeUndefined()
  })
})
