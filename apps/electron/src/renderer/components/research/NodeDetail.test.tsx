import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { NodeDetail } from './NodeDetail'

describe('节点证据的渐进展开', () => {
  test('Given 攻击、干预或子任务 When 打开详情 Then 主体与状态直接可见，原始行按需展开', () => {
    for (const heading of ['原文', '之后的处理', '内容', '状态', '宿主复核']) {
      const html = renderToStaticMarkup(<NodeDetail detail={{ title: '对象', sections: [{ heading, rows: ['失败或未解决的边界'] }], rawLines: [{ seq: 1, raw: '原始行' }] }} onClose={() => {}} />)
      expect(html).toMatch(new RegExp(`<details[^>]*open=""><summary>${heading}</summary>`))
      expect(html).toMatch(/<details class="mt-2"><summary/)
    }
  })
})
