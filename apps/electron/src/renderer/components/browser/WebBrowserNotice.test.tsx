import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebBrowserNotice } from './WebBrowserNotice'

describe('Web 浏览器能力降级', () => {
  test('Given 有效网页 When Web 展示 Then 提供真实的外部链接且不宣称 Agent 访问', () => {
    const html = renderToStaticMarkup(<WebBrowserNotice url="https://example.org/paper" onClose={() => {}} />)
    expect(html).toContain('href="https://example.org/paper"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('这不代表 Agent 已读取')
  })
  test('Given 空地址或不安全协议 When 展示 Then 没有无效的打开按钮', () => {
    for (const url of ['', 'about:blank', 'javascript:alert(1)', 'file:///root/x', 'https://user:password@example.org']) {
      const html = renderToStaticMarkup(<WebBrowserNotice url={url} onClose={() => {}} />)
      expect(html).not.toContain('href=')
      expect(html).toContain('收起此面板')
    }
  })
})
