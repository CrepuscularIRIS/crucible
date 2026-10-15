import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { K0PendingCard } from './K0PendingCard'

const DRAFT = `status: pending_user
mode: identify
success_predicate: <img src=x onerror=alert(1)> 判别出机制
depth: light            # light ≈ 3 个 child · 20 min
recall: off             # on | off | parametric-only
world: ca_rebound · seed: 20261014
forks: auto
副作用信封:
  workdir: research-work/<run>/   # REPORT.md、lessons.md

  web: off
budget: 8 次世界计量；保留额 ≈10%
seed_questions:
`

describe('K0PendingCard：run 记录建立之前的开局确认（只读、纯文本）', () => {
  test('标题、关键字段、副作用信封、回复提示', () => {
    const html = renderToStaticMarkup(<K0PendingCard text={DRAFT} />)
    expect(html).toContain('K0 开局确认 · 等待你确认')
    for (const s of ['模式', 'identify', '成功谓词', '深度', 'light', '世界 · seed', 'ca_rebound · seed: 20261014', '检索', '预算', '8 次世界计量', '副作用信封', 'web: off']) {
      expect(html).toContain(s)
    }
    expect(html).toContain('回复「确认」')
  })

  test('模板行尾的 # 注释不当作值；空行不截断副作用信封', () => {
    const html = renderToStaticMarkup(<K0PendingCard text={DRAFT} />)
    expect(html).toContain('<dd class="min-w-0 break-words">off</dd>')
    expect(html).toContain('<dd class="min-w-0 break-words">light</dd>')
    expect(html).toMatch(/<dd[^>]*><div>workdir: research-work\/&lt;run&gt;\/<\/div><div>web: off<\/div><\/dd>/)
  })

  test('草稿里的 HTML 只作文本：转义，不生成元素', () => {
    const html = renderToStaticMarkup(<K0PendingCard text={DRAFT} />)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('research-work/&lt;run&gt;/')
  })

  test('缺的字段不显示空行', () => {
    const html = renderToStaticMarkup(<K0PendingCard text={'status: pending_user\nmode: score\n'} />)
    expect(html).toContain('score')
    expect(html).not.toContain('成功谓词')
    expect(html).not.toContain('副作用信封')
  })
})
