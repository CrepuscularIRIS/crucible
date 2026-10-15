import { describe, expect, mock, test } from 'bun:test'
import { createStore, Provider } from 'jotai'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@/components/ui/tooltip'
import { activeTabIdAtom, tabsAtom } from '@/atoms/tab-atoms'
import { browserPanelOpenMapAtom } from '@/atoms/browser-atoms'
import { researchCanvasOpenMapAtom } from '@/atoms/research-atoms'

// 画布本体用 import.meta.glob 打包示例 run（bun 不支持），会话正文与本测试无关：都换成占位
mock.module('@/components/research/ResearchCanvasPane', () => ({ ResearchCanvasPane: () => <div data-testid="research-canvas" /> }))
mock.module('./TabContent', () => ({ TabContent: () => <div data-testid="tab-content" /> }))
const { MainArea } = await import('./MainArea')

function render(canvasOpen: boolean): string {
  const store = createStore()
  store.set(tabsAtom, [{ id: 's1', type: 'agent', sessionId: 's1', title: 't' }])
  store.set(activeTabIdAtom, 's1')
  store.set(browserPanelOpenMapAtom, new Map([['s1', true]]))
  store.set(researchCanvasOpenMapAtom, new Map([['s1', canvasOpen]]))
  return renderToStaticMarkup(<Provider store={store}><TooltipProvider><MainArea /></TooltipProvider></Provider>)
}

describe('MainArea 右侧槽位：研究画布 vs 受管浏览器', () => {
  test('浏览器开着时打开画布：画布可见，浏览器让位', () => {
    const html = render(true)
    expect(html).toContain('data-testid="research-canvas"')
    expect(html).not.toContain('受管浏览器')
  })

  test('画布关着：浏览器照常显示', () => {
    const html = render(false)
    expect(html).not.toContain('data-testid="research-canvas"')
    expect(html).toContain('受管浏览器')
  })
})
