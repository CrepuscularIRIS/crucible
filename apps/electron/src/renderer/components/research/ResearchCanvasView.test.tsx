import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@/components/ui/tooltip'
import { canvasView, nodeDetail, type CanvasOptions } from './canvas-view'
import { loadRecord, ONE_DIR } from './test-fixtures'
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
