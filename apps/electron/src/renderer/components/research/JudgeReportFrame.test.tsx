import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { JudgeReportFrame, judgeReportDocument } from './JudgeReportFrame'

describe('评委报告页（同一份记录，主进程用 research/report/judge-report.ts 生成）', () => {
  test('HTML 放进无脚本沙箱 iframe（srcdoc，只读、关掉 JS 内容不变）', () => {
    const html = renderToStaticMarkup(<JudgeReportFrame result={{ html: '<main>报告<script>x()</script></main>' }} dark={false} />)
    expect(html).toContain('<iframe')
    expect(html).toContain('sandbox=""')
    expect(html).toContain('srcDoc="') // HTML 属性名大小写不敏感
    expect(html).toContain('报告&lt;script')
  })

  test('包成完整文档：charset、主题跟随应用', () => {
    const doc = judgeReportDocument('<main>报告</main>', true)
    expect(doc.startsWith('<!doctype html>')).toBe(true)
    expect(doc).toContain('<meta charset="utf-8">')
    expect(doc).toContain('<base href="about:srcdoc">') // 目录 #锚点留在报告内
    expect(doc).toContain('data-theme="dark"')
    expect(doc).toContain('<main>报告</main>')
    expect(judgeReportDocument('x', false)).toContain('data-theme="light"')
  })

  test('没有注记 / 生成失败：显示原因，不出 iframe', () => {
    const html = renderToStaticMarkup(<JudgeReportFrame result={{ error: 'ca-rebound 还没有审计注记（annotations.json）' }} dark={false} />)
    expect(html).toContain('annotations.json')
    expect(html).not.toContain('<iframe')
  })

  test('还在生成：占位', () => {
    expect(renderToStaticMarkup(<JudgeReportFrame result={null} dark={false} />)).toContain('正在生成评委报告')
  })
})
