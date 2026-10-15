import { describe, expect, mock, test } from 'bun:test'
import { createStore, Provider } from 'jotai'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@/components/ui/tooltip'
import { activeTabIdAtom, tabsAtom } from '@/atoms/tab-atoms'
import { browserPanelOpenMapAtom } from '@/atoms/browser-atoms'

// 会话正文与本测试无关：换成占位
mock.module('./TabContent', () => ({ TabContent: () => <div data-testid="tab-content" /> }))
const { MainArea } = await import('./MainArea')

describe('MainArea 右侧槽位：受管浏览器', () => {
  test('浏览器开着：照常显示（研究画布已移到顶部研究 Tab，不再占右侧槽位）', () => {
    const store = createStore()
    store.set(tabsAtom, [{ id: 's1', type: 'agent', sessionId: 's1', title: 't' }])
    store.set(activeTabIdAtom, 's1')
    store.set(browserPanelOpenMapAtom, new Map([['s1', true]]))
    const html = renderToStaticMarkup(<Provider store={store}><TooltipProvider><MainArea /></TooltipProvider></Provider>)
    expect(html).toContain('受管浏览器')
  })
})
