import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebBrowserPreview } from './WebBrowserPreview'

describe('Web 受管浏览器快照', () => {
  test('Given 标签就绪 When 首次展示 Then 显示加载状态及真实的交互边界', () => {
    const html = renderToStaticMarkup(<WebBrowserPreview sessionId="session" tabId="tab" />)
    expect(html).toContain('正在获取受管页面')
    expect(html).toContain('由 Agent 点击、输入和读取')
    expect(html).toContain('aria-label="重新获取页面快照"')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<img')
  })
  test('Given 尚无标签 When 展示 Then 等待标签而非冒充页面已就绪', () => {
    const html = renderToStaticMarkup(<WebBrowserPreview sessionId="session" tabId="" />)
    expect(html).toContain('等待浏览器标签')
    expect(html).not.toContain('animate-spin')
  })
})
