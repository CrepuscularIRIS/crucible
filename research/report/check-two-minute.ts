/**
 * 两分钟验收（04 §4.6 T1–T9）：逐条 PASS / FAIL，任一 FAIL 退出码 1。
 *
 *   bun research/report/check-two-minute.ts <html>
 *
 * 只认页面结构约定（首屏 `<section>` 里的 `<dl>` 四问、`data-kind="feedback|node"`、`.verdict`、
 * `blockquote.orig` + `.correction`、`.truth .src`），不认文案。T10（跨时区字节相同）在 judge-report.test.ts。
 */
import { readFileSync } from 'node:fs'
import { firstScreenViolations } from '../../packages/shared/src/research-record/index.ts'

export interface CheckResult {
  id: string
  pass: boolean
  detail: string
}

const FIRST_LABELS = ['研究什么', '怎么做的', '结果改变了什么', '下一步是什么']
const FIVE_LABELS = ['当时知道', '为什么这样选', '期待看到', '实际发生', '因此调整']
const QUALIFIERS = ['不说明结论正确', '只说明记录前后一致']
const SCRIPT_BANNED = ['src=', 'fetch', 'XMLHttpRequest', 'WebSocket', 'import(', 'eval']

export function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 所有开标签匹配 `open` 的 `<tag …>` 元素的外层 HTML（按同名标签计嵌套） */
export function elements(html: string, tag: string, open: RegExp = /.*/): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (!open.test(m[0])) continue
    const tokens = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'gi')
    tokens.lastIndex = m.index
    let depth = 0
    for (let t = tokens.exec(html); t; t = tokens.exec(html)) {
      depth += t[0].startsWith('</') ? -1 : 1
      if (depth === 0) {
        out.push(html.slice(m.index, t.index + t[0].length))
        break
      }
    }
  }
  return out
}

const stripScripts = (html: string) => html.replace(/<script\b[\s\S]*?<\/script>/gi, '')
const firstSection = (html: string) => elements(html, 'section')[0] ?? ''
const pairs = (html: string) =>
  [...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)].map((m) => [text(m[1]!), text(m[2]!)] as const)
const hasClass = (cls: string) => new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`)

function t1(html: string): CheckResult {
  const qa = Object.fromEntries(pairs(firstSection(html)))
  const bad = FIRST_LABELS.filter((l) => !qa[l] || [...qa[l]!].length > 80)
  return { id: 'T1', pass: bad.length === 0, detail: bad.length ? `首屏缺或超长：${bad.join('、')}` : '首屏四问齐全，各 ≤80 字' }
}

function t2(html: string): CheckResult {
  const bad = firstScreenViolations(text(firstSection(html)))
  return { id: 'T2', pass: bad.length === 0, detail: bad.length ? `首屏出现原词：${bad.join('、')}` : '首屏无原词、无编号' }
}

function t3(html: string): CheckResult {
  const ok = elements(html, 'article', /data-kind="feedback"/).some((card) =>
    ['from', 'to', 'why'].every((c) =>
      ['span', 'p', 'div'].some((tag) => elements(card, tag, hasClass(c)).some((e) => text(e) !== '')),
    ),
  )
  return { id: 'T3', pass: ok, detail: ok ? '有反馈改变卡（前后协议 + 理由）' : '没有含前后协议与理由的反馈改变卡' }
}

function keyNodes(html: string): string[] {
  return elements(html, 'article', /data-kind="node"/)
}

function t4(html: string): CheckResult {
  const nodes = keyNodes(html)
  const bad = nodes.filter((card) => {
    const five = Object.fromEntries(pairs(card))
    const verdicts = elements(card, 'div', hasClass('verdict'))
    return (
      FIVE_LABELS.some((l) => !five[l]) ||
      verdicts.length !== 2 ||
      verdicts.some((v) => !elements(v, 'span', hasClass('icon')).some((i) => text(i) !== '') || text(v).length < 8) ||
      !elements(card, 'p', hasClass('basis')).some((b) => text(b).length > 4)
    )
  })
  return {
    id: 'T4',
    pass: nodes.length > 0 && bad.length === 0,
    detail: nodes.length === 0 ? '没有关键节点卡' : bad.length ? `${bad.length} 张节点卡五句话或双栏不全` : `${nodes.length} 张节点卡五句话 + 双栏齐全`,
  }
}

function t5(html: string): CheckResult {
  const quotes = [...html.matchAll(/<blockquote\b[^>]*class="[^"]*\borig\b[^"]*"[^>]*data-ref="[^"]+"[^>]*>[\s\S]*?<\/blockquote>\s*<div class="correction"/gi)]
  return { id: 'T5', pass: quotes.length > 0, detail: quotes.length ? `${quotes.length} 条报告原句，各紧随修正块` : '没有"原句 + 紧随修正"结构' }
}

function t6(html: string): CheckResult {
  const ok = elements(html, 'div', hasClass('truth')).some(
    (t) => text(t).length > 6 && elements(t, 'code', hasClass('src')).some((s) => text(s) !== ''),
  )
  return { id: 'T6', pass: ok, detail: ok ? '真相与来源都在' : '没有带来源的真相' }
}

function t7(html: string): CheckResult {
  const blocks = html.split(/<\/?(?:p|li|dd|dt|td|th|div|section|blockquote|h[1-6]|article|pre)\b[^>]*>/i).map(text)
  const bad = blocks.filter((b) => b.includes('检查通过') && !QUALIFIERS.some((q) => b.includes(q)))
  return { id: 'T7', pass: bad.length === 0, detail: bad.length ? `"检查通过"缺限定：${bad[0]!.slice(0, 40)}…` : '"检查通过"均带限定' }
}

function t8(html: string): CheckResult {
  const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  const problems: string[] = []
  if (tags.length > 1) problems.push(`${tags.length} 段 <script>`)
  for (const [, attrs, body] of tags) {
    if (/\bsrc\s*=/.test(attrs!)) problems.push('外链脚本')
    if (body!.trim().split('\n').length > 60) problems.push('脚本超过 60 行')
    const banned = SCRIPT_BANNED.filter((w) => body!.includes(w))
    if (banned.length) problems.push(`脚本含 ${banned.join('、')}`)
  }
  const chars = [...text(firstSection(html)).replace(/\s/g, '')].length
  if (chars > 400) problems.push(`首屏 ${chars} 字`)
  return { id: 'T8', pass: problems.length === 0, detail: problems.length ? problems.join('；') : `脚本 ${tags.length} 段；首屏 ${chars} 字` }
}

const CONTENT_CHECKS = [t1, t2, t3, t4, t5, t6, t7]

function t9(html: string): CheckResult {
  const bare = stripScripts(html)
  const failed = CONTENT_CHECKS.map((c) => c(bare)).filter((r) => !r.pass).map((r) => r.id)
  const noDrawer = keyNodes(bare).filter((card) => !/<details\b/.test(card)).length
  const pass = failed.length === 0 && noDrawer === 0
  return {
    id: 'T9',
    pass,
    detail: pass ? '去掉脚本后 T1–T7 仍通过；每张节点卡有证据抽屉' : `去掉脚本后失败 ${failed.join('、') || '无'}；${noDrawer} 张节点卡没有 <details>`,
  }
}

export function checkTwoMinute(html: string): CheckResult[] {
  return [...CONTENT_CHECKS.map((c) => c(html)), t8(html), t9(html)]
}

if (import.meta.main) {
  const path = process.argv[2]
  if (!path) {
    console.error('用法：bun research/report/check-two-minute.ts <html>')
    process.exit(2)
  }
  const results = checkTwoMinute(readFileSync(path, 'utf8'))
  for (const r of results) console.log(`${r.id} ${r.pass ? 'PASS' : 'FAIL'}  ${r.detail}`)
  process.exit(results.every((r) => r.pass) ? 0 : 1)
}
