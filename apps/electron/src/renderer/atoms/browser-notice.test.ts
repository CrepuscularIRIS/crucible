import { describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import { browserPanelOpenMapAtom, browserPanelMinimizedMapAtom, browserPendingNavigationMapAtom, browserStateMapAtom, showWebBrowserNoticeAtom } from './browser-atoms'

describe('Web 浏览器说明入口', () => {
  test('Given 最小化的本会话与另一个会话 When 查看链接 Then 只展开本地面板，不伪造宿主浏览器状态', () => {
    const store = createStore()
    store.set(browserPanelMinimizedMapAtom, new Map([['a', true], ['b', true]]))
    store.set(showWebBrowserNoticeAtom, { sessionId: 'a', url: 'https://example.org' })
    expect(store.get(browserPanelOpenMapAtom).get('a')).toBe(true)
    expect(store.get(browserPanelMinimizedMapAtom).has('a')).toBe(false)
    expect(store.get(browserPanelMinimizedMapAtom).get('b')).toBe(true)
    expect(store.get(browserPendingNavigationMapAtom).get('a')).toBe('https://example.org')
    expect(store.get(browserStateMapAtom).size).toBe(0)
    store.set(showWebBrowserNoticeAtom, { sessionId: 'a' })
    expect(store.get(browserPendingNavigationMapAtom).has('a')).toBe(false)
  })
})
