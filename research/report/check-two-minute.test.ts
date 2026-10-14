import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkTwoMinute } from './check-two-minute.ts'
import { buildReport } from './judge-report.ts'

const ROOT = join(import.meta.dir, '../..')
const OLD = ['deploy/defense/archive-v1.html', 'deploy/defense/index.html'].map((p) => join(ROOT, p)).find((p) =>
  existsSync(p) && !readFileSync(p, 'utf8').includes('data-kind="first"'),
)!
const failed = (html: string) => checkTwoMinute(html).filter((r) => !r.pass).map((r) => r.id)

const FIVE = ['当时知道', '为什么这样选', '期待看到', '实际发生', '因此调整'].map((l) => `<div><dt>${l}</dt><dd>一句话</dd></div>`).join('')
const MINIMAL = `<title>最小页</title>
<section data-kind="first"><dl>
<div><dt>研究什么</dt><dd>一个神经元为什么多放电</dd></div><div><dt>怎么做的</dt><dd>先写预测再测量</dd></div>
<div><dt>结果改变了什么</dt><dd>换了实验</dd></div><div><dt>下一步是什么</dt><dd>换阻断剂</dd></div></dl></section>
<section><article data-kind="feedback"><span class="from">长压低</span><span class="to">短压低</span><p class="why">想分清三种解释</p></article>
<article data-kind="node" data-key id="D1"><dl class="five">${FIVE}</dl>
<div class="verdict"><span class="icon">✕</span> 不合理，一次测量分不开</div><div class="verdict"><span class="icon">✕</span> 错误，真相正是这一类</div>
<p class="basis">依据：复算第 1 节</p><details><summary>证据</summary>原文</details></article>
<blockquote class="orig" data-ref="REPORT.md:1">原句</blockquote><div class="correction">修正</div>
<div class="truth">真相是 某一种离子电流 <code class="src">worlds.py:196</code></div>
<p>程序检查通过只说明记录前后一致，不说明结论正确。</p></section>
<script>
document.title
</script>`

describe('两分钟验收', () => {
  test('旧答辩页：至少 T1 / T2 / T4 / T5 失败', () => {
    expect(failed(readFileSync(OLD, 'utf8'))).toEqual(expect.arrayContaining(['T1', 'T2', 'T4', 'T5']))
  })
  test('生成的一句话报告全绿', () => {
    const html = buildReport(join(ROOT, 'research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound'))
    expect(failed(html)).toEqual([])
  })
  test('最小合成页全绿；改坏一处对应一条变红', () => {
    expect(failed(MINIMAL)).toEqual([])
    expect(failed(MINIMAL.replace('只说明记录前后一致，不说明结论正确', '全绿'))).toEqual(['T7', 'T9'])
    expect(failed(MINIMAL + '<script>x</script>')).toEqual(['T8'])
    expect(failed(MINIMAL.replace('document.title', 'fetch(1)'))).toEqual(['T8'])
    expect(failed(MINIMAL.replace('一个神经元', 'H1 '))).toEqual(['T2', 'T9'])
    expect(failed(MINIMAL.replace('<details><summary>证据</summary>原文</details>', ''))).toEqual(['T9'])
  })
})
