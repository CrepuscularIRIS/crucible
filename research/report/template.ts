/**
 * 评委报告 HTML 模板（04 §4.1–§4.4）。纯字符串拼接：同输入字节相同。
 * 页面契约：无 doctype/html/head/body（Artifact 宿主包壳）；颜色全是 :root token；关掉 JS 内容不变。
 */
import {
  fmtTime,
  JUDGE_REPORT_VERSION,
  MARK_ICON,
  MARK_WORD,
  type Annotations,
  type JudgeNode,
  type ResearchRecord,
} from '../../packages/shared/src/research-record/index.ts'

export interface ReportModel {
  /** 仅检查传给生成器的文件捆；文件存在不表示测量内容已重新核验。 */
  rawEvidence: { expected: number; provided: number; missing: string[] }
  rec: ResearchRecord
  ann: Annotations
  archive: string
  answers: { label: string; text: string }[]
  nodes: JudgeNode[]
  feedback: {
    from: string
    to: string
    fromProtocol: string
    toProtocol: string
    prediction: string
    observed: string
    why: string
    raw: string[]
  } | null
  corrections: { quote_ref: string; quote: string; later: string; correction: string; basis: { text: string; ref: string }[] }[]
  cycles: { pid: string; protocol: string; seq: [number, number]; five: { label: string; text: string }[]; reviewedBy: string[] }[]
  shas: [string, string][]
  nav: { label: string; href: string; here: boolean }[]
  /** 复算脚本路径（recompute.json 的 script 字段） */
  scriptRef: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const seqText = (seq: [number, number] | null) =>
  seq === null ? '全程 / 会话外' : seq[0] === seq[1] ? `运行记录第 ${seq[0]} 行` : `运行记录第 ${seq[0]}–${seq[1]} 行`
const LAYERS = ['接入层', '推理层', '实例化层', '设计层'] as const

const STYLE = `<style>
/* tokens · layout: one reading column (max 880px), sticky case bar; cards are bordered blocks, no shadows */
:root{
  --bg:#eef0f3; --surface:#ffffff; --ink:#14181e; --muted:#59616d; --line:#d3d8df; --accent:#1d4e94;
  --yes:#16794a; --no:#b42318; --warn:#8a5a00;
  --f-display:"PingFang SC","Noto Sans SC","Microsoft YaHei","Source Han Sans SC",system-ui,sans-serif;
  --f-body:"PingFang SC","Noto Sans SC","Microsoft YaHei","Source Han Sans SC",system-ui,sans-serif;
  --f-mono:ui-monospace,"SFMono-Regular","Cascadia Mono",Menlo,Consolas,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#0f1217; --surface:#171b22; --ink:#e5e8ed; --muted:#9aa3af; --line:#2b313b; --accent:#86aefc;
  --yes:#4cc38a; --no:#ff7b6b; --warn:#e2a64b; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0f1217; --surface:#171b22; --ink:#e5e8ed; --muted:#9aa3af; --line:#2b313b; --accent:#86aefc;
  --yes:#4cc38a; --no:#ff7b6b; --warn:#e2a64b; color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 var(--f-body);padding-inline:16px;-webkit-text-size-adjust:100%}
main,.bar-in{max-width:880px;margin-inline:auto;min-width:0}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
h1,h2,h3{font-family:var(--f-display);line-height:1.3}
h1{font-size:clamp(1.5rem,1.1rem + 1.8vw,2.2rem);margin:0 0 12px}
h2{font-size:1.3rem;margin:0 0 14px}
h3{font-size:1.05rem;margin:0}
section{padding-block:32px;border-bottom:1px solid var(--line);scroll-margin-top:56px}
p{margin:.45em 0}
.muted{color:var(--muted)}.small{font-size:.86rem}
.num,td,.mono{font-variant-numeric:tabular-nums}
code,.mono,pre{font-family:var(--f-mono);font-size:.86em}
.bar{position:sticky;top:0;z-index:3;background:var(--bg);border-bottom:1px solid var(--line);margin-inline:-16px;padding:8px 16px}
.bar-in{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
.bar b{margin-right:auto;font-family:var(--f-display)}
.bar ul{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}
.bar a{display:inline-block;padding:2px 10px;border:1px solid var(--line);border-radius:4px;background:var(--surface);text-decoration:none;color:var(--muted);font-size:.86rem}
.bar a[aria-current="page"]{color:var(--ink);border-color:var(--accent)}
.headline{font-size:1.12rem;font-weight:600;margin:0 0 18px}
.qa{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:6px;overflow:hidden;margin:0}
.qa>div{background:var(--surface);padding:12px 14px;min-width:0}
.qa dt{font-weight:700;font-size:.9rem;color:var(--accent)}
.qa dd{margin:2px 0 0}
pre{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:10px 12px;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere}
.card{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px;margin:14px 0;min-width:0;scroll-margin-top:56px}
.card header{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;margin-bottom:10px}
.nid{font-family:var(--f-mono);color:var(--accent);font-weight:600}
.meta{color:var(--muted);font-size:.85rem}
.five{margin:0;display:grid;gap:6px}
.five>div{display:grid;grid-template-columns:6.5em 1fr;gap:8px}
.five dt{font-weight:700;color:var(--muted);font-size:.9rem}
.five dd{margin:0;min-width:0;overflow-wrap:anywhere}
.aud{color:var(--warn);font-size:.8rem;white-space:nowrap}
@media (max-width:520px){.five>div{grid-template-columns:1fr;gap:0}}
.verdicts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px;margin:14px 0 6px}
.verdict{border:1px solid var(--line);border-radius:6px;padding:10px 12px;min-width:0}
.verdict h4{margin:0 0 4px;font-size:.82rem;color:var(--muted);font-weight:600}
.verdict p{margin:0}
.icon{font-weight:700;display:inline-block;min-width:1.2em}
.m-yes{color:var(--yes)}.m-no{color:var(--no)}.m-partial{color:var(--warn)}
.basis{font-size:.88rem;color:var(--muted)}
.basis code{color:var(--ink)}
details{margin-top:10px;border-top:1px dashed var(--line);padding-top:8px}
summary{cursor:pointer;color:var(--accent);font-size:.9rem}
details h5{margin:10px 0 4px;font-size:.85rem}
details pre{font-size:.78rem;max-height:22em;overflow:auto}
details ul{margin:0;padding-left:1.2em;font-size:.88rem}
.tl{list-style:none;padding:0;margin:0 0 16px;display:grid;gap:4px}
.tl a{display:flex;gap:10px;align-items:baseline;text-decoration:none;color:var(--ink);padding:4px 8px;border-radius:4px;border:1px solid transparent}
.tl a[aria-current="true"]{border-color:var(--accent);background:var(--surface)}
.tl .icons{font-weight:700;white-space:nowrap}
.layers{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:8px;margin:0 0 10px;padding:0;list-style:none}
.layers li{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font-size:.9rem}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.88rem;min-width:620px}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:.8rem}
tr:last-child td{border-bottom:0}
blockquote.orig{margin:14px 0 0;padding:10px 14px;border-left:3px solid var(--no);background:var(--surface)}
blockquote.orig .src{display:block;font-size:.8rem;color:var(--muted)}
.correction{padding:8px 14px 12px;border-left:3px solid var(--yes);background:var(--surface);margin-bottom:12px}
.truth{border:1px solid var(--line);border-left:3px solid var(--accent);background:var(--surface);padding:10px 14px;border-radius:0 6px 6px 0}
.tag{display:inline-block;font-size:.75rem;border:1px solid currentColor;border-radius:3px;padding:0 5px;color:var(--muted)}
.tag.todo{color:var(--warn)}
.ver dl{display:grid;grid-template-columns:9em 1fr;gap:4px 12px;margin:0}
.ver dt{color:var(--muted)}.ver dd{margin:0;min-width:0;overflow-wrap:anywhere}
@media (max-width:520px){.ver dl{grid-template-columns:1fr}.ver dd{margin-bottom:6px}}
.tools{margin:0 0 10px}
.tools button{font:inherit;font-size:.86rem;color:var(--accent);background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:3px 10px;cursor:pointer}
@media (prefers-reduced-motion: no-preference){html{scroll-behavior:smooth}}
</style>`

// 唯一一段内联脚本：←/→ 在关键节点间跳转、"展开全部证据"、高亮时间条当前节点。关掉 JS 内容不变。
const SCRIPT = `<script>
(() => {
  const cards = [...document.querySelectorAll('article[data-key]')];
  const links = new Map([...document.querySelectorAll('.tl a')].map((a) => [a.getAttribute('href').slice(1), a]));
  const mark = (id) => links.forEach((a, k) => a.setAttribute('aria-current', String(k === id)));
  const current = () => {
    let i = -1;
    cards.forEach((c, k) => { if (c.getBoundingClientRect().top < 120) i = k; });
    return i;
  };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea/i.test(e.target.tagName)) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = current();
    const next = cards[e.key === 'ArrowRight' ? Math.min(i + 1, cards.length - 1) : Math.max(i - 1, 0)];
    if (!next) return;
    e.preventDefault();
    next.scrollIntoView({ block: 'start' });
    history.replaceState(null, '', '#' + next.id);
    mark(next.id);
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && mark(x.target.id)), { rootMargin: '0px 0px -70% 0px' });
    cards.forEach((c) => io.observe(c));
  }
  const host = document.querySelector('.tools');
  if (host) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '展开全部证据';
    b.addEventListener('click', () => {
      const all = [...document.querySelectorAll('article details')];
      const open = all.some((d) => !d.open);
      all.forEach((d) => { d.open = open; });
      b.textContent = open ? '收起全部证据' : '展开全部证据';
    });
    host.append(b);
  }
})();
</script>`

function verdictBlock(n: JudgeNode, col: 'atTime' | 'hindsight'): string {
  const v = n[col]
  const head = col === 'atTime' ? '当时是否合理' : '事后对照真相'
  return `<div class="verdict" data-col="${col === 'atTime' ? 'at-time' : 'hindsight'}"><h4>${head}</h4><p><span class="icon m-${v.mark}" aria-hidden="true">${MARK_ICON[v.mark]}</span><b class="word m-${v.mark}">${MARK_WORD[col][v.mark]}</b>。${esc(v.text)}</p></div>`
}

function basisList(basis: { text: string; ref: string }[]): string {
  return basis.map((b) => `${esc(b.text)}（<code>${esc(b.ref)}</code>）`).join('；')
}

function drawer(n: JudgeNode, rec: ResearchRecord, scriptRef: string): string {
  const raw = n.rawLines.map((l) => `${l.seq}: ${l.raw}`).join('\n')
  return `<details><summary>证据（原始记录 ${n.rawLines.length} 行 · 推导值 · 复算 · 审查者 · 干预）</summary>
<h5>① 原始记录</h5>${raw ? `<pre>${esc(raw)}</pre>` : '<p class="small muted">本节点不对应运行记录里的行（全程或会话外）。</p>'}
<h5>② 推导值（由记录推出）</h5>${n.derived.length ? `<ul>${n.derived.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '<p class="small muted">无。</p>'}
<h5>③ 复算</h5>${n.recomputeKeys.length ? `<p class="small">键 ${n.recomputeKeys.map((k) => `<code>${esc(k)}</code>`).join('、')}，来自 <code>recompute.json</code>，脚本 <code>${esc(scriptRef)}</code></p>` : '<p class="small muted">本节点没有引用复算数字。</p>'}
<h5>④ 审查者</h5><ul>${n.reviewers.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
<h5>⑤ 人的干预</h5><p class="small muted">${rec.interventions === null ? '本归档没有干预文件。' : `${rec.interventions.length} 条，见运行版本卡。`}</p>
</details>`
}

function nodeCard(n: JudgeNode, rec: ResearchRecord, scriptRef: string): string {
  const five = n.five
    .map((f) => `<div><dt>${f.label}</dt><dd>${esc(f.text)}${f.audited ? ' <span class="aud">（审计补写）</span>' : ''}</dd></div>`)
    .join('')
  return `<article class="card node" data-kind="node" data-key id="${n.id}">
<header><span class="nid">${n.id}</span><h3>${esc(n.title)}</h3><span class="meta">${seqText(n.seq)} · ${n.layer}</span></header>
<dl class="five">${five}</dl>
<div class="verdicts">${verdictBlock(n, 'atTime')}${verdictBlock(n, 'hindsight')}</div>
<p class="basis">依据：${basisList(n.basis)}</p>
${n.options.length ? `<p class="small"><b>当时本可以选：</b>${n.options.map(esc).join('；')}</p>` : ''}
${drawer(n, rec, scriptRef)}
</article>`
}

function otherRow(n: JudgeNode): string {
  const cell = (col: 'atTime' | 'hindsight') =>
    `<span class="icon m-${n[col].mark}" aria-hidden="true">${MARK_ICON[n[col].mark]}</span><b class="m-${n[col].mark}">${MARK_WORD[col][n[col].mark]}</b>。${esc(n[col].text)}`
  return `<tr id="${n.id}"><td class="mono">${n.id}</td><td>${esc(n.title)}<br><span class="small muted">${seqText(n.seq)} · ${n.layer}</span></td><td>${cell('atTime')}</td><td>${cell('hindsight')}</td><td class="small">${basisList(n.basis)}</td></tr>`
}

export function renderReport(m: ReportModel): string {
  const { rec, ann } = m
  const key = m.nodes.filter((n) => n.key)
  const rest = m.nodes.filter((n) => !n.key)
  const gate = rec.events.findLast((e) => e.op === 'gate.verdict')?.data
  const ok = (v: unknown) => (v === true ? '✓' : '✕')
  const iv = rec.interventions
  const ivText =
    iv === null
      ? '未记录（本归档无干预文件）'
      : `${iv.length} 次（其中软暂停 ${iv.filter((i) => i.kind === 'pause' && i.wired === false).length} 次）`
  const first = rec.events[0]
  const last = rec.events.at(-1)
  const scriptRef = m.scriptRef
  const neuronSimulation = ['textbook_M', 'z_rebound', 'd_type', 'ca_rebound', 'h_sag', 'na_fatigue'].includes(rec.world ?? '')
  // 仅澄清展示摘要；逐字引文与原始证据保持原样。
  const summaryText = (text: string) => esc(neuronSimulation
    ? text.replace(/计费的真实测量|真实测量/g, '计费仿真观测')
    : text)
  return `<title>${esc(ann.case.title)}</title>
${STYLE}
<div class="bar"><div class="bar-in"><b>Crucible 评委报告</b><ul>${m.nav
    .map((n) => `<li><a href="${esc(n.href)}"${n.here ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`)
    .join('')}</ul></div></div>
<main>
<section id="top" data-kind="first">
<h1>${esc(ann.case.title)}</h1>
<p class="small muted" data-kind="scope">历史回放与事后审计，不是现场重新执行。${neuronSimulation ? '本案例为神经元仿真；原文中的“真实测量”指仿真环境的计费观测，不是生物细胞实验。' : '实验环境与适用范围见下方任务说明。'}事后审计不代表系统在运行时已自动发现这些错误。</p>
${m.rawEvidence.missing.length ? `<p class="small" data-kind="archive-warning">本页输入归档缺少 ${m.rawEvidence.missing.length} 份原始测量输出；页面读数来自运行记录，不能据此宣称已完成原始输出复算。</p>` : ''}
<p class="headline">${esc(ann.case.headline_plain)}</p>
<dl class="qa">${m.answers.map((a) => `<div><dt>${a.label}</dt><dd>${summaryText(a.text)}</dd></div>`).join('')}</dl>
</section>

<section id="task">
<h2>示例任务</h2>
<p>${summaryText(ann.case.background)}</p>
<p class="small muted">用户发给系统的原话（${esc(ann.case.prompt_source)}）：</p>
<pre>${esc(ann.case.prompt)}</pre>
<p class="small">在已载入本案例的 Proma 研究画布中，可按来源行号回看预测、观测与判断。现场展示前须确认归档已可用；本页对应 <code>${esc(m.archive)}</code>，其 <code>journal.jsonl</code> 每行一个事件，行号即本页引用的“运行记录第 N 行”。</p>
<details data-kind="raw-evidence"><summary>原始输出归档覆盖 ${m.rawEvidence.provided}/${m.rawEvidence.expected}</summary><p class="small">仅检查生成器收到的文件捆是否包含各已落地实验的原始输出，不代表内容正确或已重跑实验。日志哈希链、审计复算值、原始测量输出是不同证据。</p>${m.rawEvidence.missing.length ? `<ul>${m.rawEvidence.missing.map((path) => `<li><code>${esc(path)}</code> 未提供</li>`).join('')}</ul>` : '<p class="small">输入捆未发现此类缺件；科学结论仍需独立审查。</p>'}</details>
</section>

${m.feedback
    ? `<section id="feedback">
<h2>一次反馈改变了下一步实验</h2>
<article class="card" data-kind="feedback">
<p><b>原来的实验</b>（${m.feedback.from}）：<span class="from">${esc(m.feedback.fromProtocol)}</span></p>
<p><b>原预测</b>：${esc(m.feedback.prediction)}</p>
<p><b>实测</b>：${esc(m.feedback.observed)}</p>
<p><b>下一组实验</b>（${m.feedback.to}）改为：<span class="to">${esc(m.feedback.toProtocol)}</span></p>
<p class="why"><b>改变理由</b>（${m.feedback.to} 事先写下的问题，逐字）：${esc(m.feedback.why)}</p>
<p class="small muted">这里展示后续实验登记的问题；时间相邻本身不能证明选择的因果关系，也不能证明研究效果已经改善。</p>
<details><summary>证据（原始记录）</summary><pre>${esc(m.feedback.raw.join('\n'))}</pre></details>
</article>
</section>`
    : ''}

<section id="nodes">
<h2>关键节点</h2>
<p class="small muted">每个节点两栏判定：左栏只看当时 agent 能知道的信息，右栏对照真相。按 ← / → 在节点间跳转。</p>
<div class="tools"></div>
<ol class="tl">${key
    .map(
      (n) =>
        `<li><a href="#${n.id}"><span class="mono">${n.id}</span><span class="icons"><span class="m-${n.atTime.mark}" title="当时${MARK_WORD.atTime[n.atTime.mark]}">${MARK_ICON[n.atTime.mark]}</span> <span class="m-${n.hindsight.mark}" title="事后${MARK_WORD.hindsight[n.hindsight.mark]}">${MARK_ICON[n.hindsight.mark]}</span></span><span>${esc(n.title)}</span></a></li>`,
    )
    .join('')}</ol>
<h3>问题出在哪</h3>
<ul class="layers">${LAYERS.map((layer) => {
    const ns = m.nodes.filter((n) => n.layer === layer && (n.atTime.mark !== 'yes' || n.hindsight.mark !== 'yes'))
    return ns.length ? `<li><b>${layer}</b>：${ns.map((n) => `<a href="#${n.id}">${n.id}</a>`).join('、')}</li>` : ''
  }).join('')}</ul>
${key.map((n) => nodeCard(n, rec, scriptRef)).join('\n')}
${rest.length
    ? `<h3>其余决策</h3><div class="tbl"><table><thead><tr><th>#</th><th>决策</th><th>当时是否合理</th><th>事后对照真相</th><th>依据</th></tr></thead><tbody>${rest.map(otherRow).join('')}</tbody></table></div>`
    : ''}
</section>

<section id="corrections">
<h2>原结论与修正</h2>
<div class="truth"><p><b>对照的真相</b>：${esc(ann.case.truth.text)}（来源 <code class="src">${esc(ann.case.truth.source)}</code>；真相只存在归档里，运行中的 agent 读不到）</p></div>
${m.corrections
    .map(
      (c) => `<blockquote class="orig" data-ref="${esc(c.quote_ref)}"><span class="src">报告原句（${esc(c.quote_ref)}，逐字）</span>${esc(c.quote)}</blockquote>
<div class="correction"><p><b>后来发现</b>：${esc(c.later)}</p><p><b>修正</b>：${esc(c.correction)}</p><p class="basis">依据：${basisList(c.basis)}</p></div>`,
    )
    .join('\n')}
</section>

<section id="unknowns">
<h2>仍不能确定</h2>
<ul>${ann.unknowns.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
</section>

<section id="version" class="ver">
<h2>运行版本卡</h2>
<dl>
<dt>会话 ID</dt><dd class="mono">${esc(ann.case.session_id ?? '未记录')}</dd>
<dt>run</dt><dd class="mono">${esc(rec.run)} · ${esc(m.archive)}</dd>
<dt>模型</dt><dd>${esc(ann.case.model)}</dd>
<dt>world / seed</dt><dd class="mono">${esc(rec.world ?? '?')} / ${rec.seed ?? '?'}</dd>
<dt>时间</dt><dd>${first ? fmtTime(first.ts) : '?'} – ${last ? fmtTime(last.ts) : '?'}</dd>
<dt>历史程序检查</dt><dd>${gate ? `运行当时记录为：${gate.passed === true ? '程序检查通过' : '程序检查未通过'}（预登记 ${ok(gate.prereg)} · 对账 ${ok(gate.reconcile)} · 溯源 ${ok(gate.trace)}）。程序检查通过只说明记录前后一致，不说明结论正确；此处不是本次重新执行检查的结果。` : '没有检查记录。'}</dd>
<dt>人工干预</dt><dd>${ivText}</dd>
<dt>运行记录链</dt><dd>${rec.integrity === 'ok' ? `完整（${rec.events.length} 行，逐行哈希相连）` : `第 ${rec.brokenAt} 行断开`}</dd>
<dt>sha256</dt><dd><ul class="small mono">${m.shas.map(([k, v]) => `<li>${esc(k)} ${v}</li>`).join('')}</ul></dd>
<dt>生成器</dt><dd class="mono">${JUDGE_REPORT_VERSION}</dd>
</dl>
</section>

<section id="appendix">
<h2>附录：每次实验的五句话</h2>
<p class="small muted">由运行记录自动推出；没有审计节点覆盖的标“未审”，不带判定。</p>
${m.cycles
    .map(
      (c) => `<article class="card cycle" id="cyc-${c.pid}"><header><span class="nid">${c.pid}</span><h3>${esc(c.protocol)}</h3><span class="meta">${seqText(c.seq)}</span>${c.reviewedBy.length ? `<span class="tag">已审：${c.reviewedBy.map((id) => `<a href="#${id}">${id}</a>`).join('、')}</span>` : '<span class="tag todo">未审</span>'}</header>
<dl class="five">${c.five.map((f) => `<div><dt>${f.label}</dt><dd>${esc(f.text)}</dd></div>`).join('')}</dl></article>`,
    )
    .join('\n')}
</section>
</main>
${SCRIPT}
`
}
