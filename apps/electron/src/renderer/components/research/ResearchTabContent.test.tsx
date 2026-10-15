import { describe, expect, mock, test } from 'bun:test'
import { createStore, Provider } from 'jotai'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@/components/ui/tooltip'
import { researchCanvasSourceMapAtom, researchTabViewMapAtom } from '@/atoms/research-atoms'

// 画布本体用 import.meta.glob 打包示例 run（bun 不支持）：换成占位
mock.module('./ResearchCanvasPane', () => ({ ResearchCanvasPane: () => <div data-testid="progress-pane" /> }))
const { ResearchTabContent } = await import('./ResearchTabContent')

function render(view?: 'progress' | 'judge', withSource = false): string {
  const store = createStore()
  if (view) store.set(researchTabViewMapAtom, new Map([['s1', view]]))
  if (withSource) store.set(researchCanvasSourceMapAtom, new Map([['s1', { kind: 'live' as const }]]))
  return renderToStaticMarkup(<Provider store={store}><TooltipProvider><ResearchTabContent sessionId="s1" /></TooltipProvider></Provider>)
}

describe('研究 Tab：科研进度 / 评委 两种读法', () => {
  test('默认 = 科研进度（研究者画布）', () => {
    const html = render()
    expect(html).toContain('data-testid="progress-pane"')
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>[\s\S]*?科研进度<\/button>/)
    expect(html).toMatch(/role="tab" aria-selected="false"[^>]*>[\s\S]*?评委报告<\/button>/)
    expect(html).toContain('role="tabpanel"')
  })

  test('评委：还没选 run → 提示先在科研进度里选', () => {
    const html = render('judge')
    expect(html).not.toContain('data-testid="progress-pane"')
    expect(html).toContain('先在「科研进度」里选择')
  })

  test('评委：已选 run → 生成中占位（报告由主进程生成）', () => {
    expect(render('judge', true)).toContain('正在生成评委报告')
  })
})
