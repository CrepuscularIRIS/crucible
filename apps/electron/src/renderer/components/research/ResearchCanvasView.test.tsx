import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { canvasView, nodeDetail, type CanvasOptions } from './canvas-view'
import { DELIVERY_DIR, loadRecord, ONE_DIR } from './test-fixtures'
import { ResearchCanvasView } from './ResearchCanvasView'

const one = loadRecord(ONE_DIR)
const noop = () => {}

function render(opts: CanvasOptions, withDetail = false): string {
  const view = canvasView(one, opts)
  const detail = withDetail ? nodeDetail(one, { kind: 'prereg', id: 'P2' }, view.seq) : null
  return renderToStaticMarkup(
    <TooltipProvider>
      <ResearchCanvasView
        view={view}
        detail={detail}
        narrow={false}
        onSelect={noop}
        onClose={noop}
        {...(opts.mode === 'replay' ? { onSeq: noop } : { onControl: noop })}
      />
    </TooltipProvider>,
  )
}

const replayAt = (seq: number) => ({ seq, mode: 'replay' as const, source: 'research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound', bridge: false })

describe('ResearchCanvasView renderToStaticMarkup（ONE 回放，04 §5.3 第 2 条）', () => {
  test('第 63 行：等待测量 P2', () => {
    const html = render(replayAt(63))
    expect(html).toContain('等待测量 P2')
    expect(html).toContain('只测 1 次就要分清 3 种解释')
    expect(html).toContain('候选参数未记录')
    expect(html).toContain('回放 · 只读')
    expect(html).toContain('第 63 / 105 行')
    expect(html).not.toContain('>暂停<')
    expect(html).toMatchSnapshot()
  })

  test('第 66 行：判读结果 P2（含 P2 节点详情）', () => {
    const html = render(replayAt(66), true)
    expect(html).toContain('判读结果 P2')
    expect(html).toContain('预登记分支：支持 H3、否定 H5')
    expect(html).toContain('宿主复核')
    expect(html).toMatchSnapshot()
  })

  test('第 105 行：已结束，账本检查与科学结论分两格', () => {
    const html = render(replayAt(105))
    expect(html).toContain('已结束')
    expect(html).toContain('通过（只说明记录前后一致，不说明结论正确）')
    expect(html).toContain('H3 得到支持；H5 被否定')
    expect(html).toContain('派生关系未记录')
    expect(html).toMatchSnapshot()
  })

  test('实时 + 软暂停：控制条显示"请求暂停（软）"与软暂停说明', () => {
    const html = render({ seq: 63, mode: 'live', bridge: true, control: { state: 'RUNNING', wired: false, canCancelChildren: false } })
    expect(html).toContain('请求暂停（软）')
    expect(html).toContain('软暂停')
    expect(html).not.toContain('回放 · 只读')
  })
})

describe('状态条 + 阶段文档（交付 run，实时视角）', () => {
  const delivery = loadRecord(DELIVERY_DIR)
  const workdir = { docs: [{ path: 'forecast.md', mtimeMs: Date.parse('2026-10-15T04:14:47Z'), size: 9 }, { path: '_P2.json', mtimeMs: Date.parse('2026-10-15T02:27:00Z'), size: 9 }] }
  const view = canvasView(delivery, { mode: 'live', bridge: false, workdir, budgetTotal: 8 })
  const renderLive = (openDoc: ComponentProps<typeof ResearchCanvasView>['openDoc'] = null) => renderToStaticMarkup(
    <TooltipProvider>
      <ResearchCanvasView view={view} detail={null} narrow={false} onSelect={noop} onControl={noop} onOpenDoc={noop} openDoc={openDoc} onCloseDoc={noop} />
    </TooltipProvider>,
  )

  test('顶部状态条：阶段、预算、计数、最新事件、下一步', () => {
    const html = renderLive()
    expect(html).toContain('report 报告')
    expect(html).toContain('6 / 8')
    expect(html).toContain('LIVE 2 · CONTESTED 11 · REFUTED 0')
    expect(html).toContain('第 62 行 · 10-15 12:50 · 账本检查通过')
    expect(html).toContain('已结束')
    expect(html.indexOf('report 报告')).toBeLessThan(html.indexOf('假设与证据'))
  })

  test('阶段文档列表：新的在前，可点开', () => {
    const html = renderLive()
    expect(html).toContain('阶段文档')
    expect(html.indexOf('forecast.md')).toBeLessThan(html.indexOf('_P2.json'))
    expect(html).toContain('10-15 12:14')
  })

  test('打开的 md 文档渲染成 markdown（只读，原始 HTML 不执行）', () => {
    const html = renderLive({ path: 'forecast.md', time: '10-15 12:14', text: '# 预报表\n\n<script>alert(1)</script>' })
    expect(html).toContain('<h1>预报表</h1>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('只读')
  })

  test('打开的 json 文档缩进显示；读失败显示原因', () => {
    expect(renderLive({ path: '_P2.json', text: '{"pid":"P2"}' })).toContain('{\n  &quot;pid&quot;: &quot;P2&quot;\n}')
    expect(renderLive({ path: 'x.md', error: '阶段文档太大' })).toContain('阶段文档太大')
  })
})


describe('阶段文档与回放时点的边界', () => {
  test('Given 早期回放正在看最终报告 When 渲染 Then 中央文档明确标为当前文件', () => {
    const html = renderToStaticMarkup(<TooltipProvider><ResearchCanvasView
      view={canvasView(one, replayAt(30))} detail={null} narrow onSelect={noop} onSeq={noop}
      openDoc={{ path: 'REPORT.md', text: '# 最终报告' }} onCloseDoc={noop}
    /></TooltipProvider>)
    expect(html).toContain('不随回放回退，不能作为该时点已经产生的证据')
    expect(html).toContain('当前文件内容')
    expect(html).toContain('<h1>最终报告</h1>')
  })
})
