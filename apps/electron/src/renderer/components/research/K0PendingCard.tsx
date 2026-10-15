import React from 'react'
import { Hourglass } from 'lucide-react'

/** 草稿里要给人看的字段（research-loop intake-check.md §4 的模板键）→ 标签 */
const FIELDS: [key: string, label: string][] = [
  ['mode', '模式'],
  ['success_predicate', '成功谓词'],
  ['depth', '深度'],
  ['world', '世界 · seed'],
  ['recall', '检索'],
  ['budget', '预算'],
]
const ENVELOPE = '副作用信封'

/** 模板行尾的说明注释（`off   # on | off | parametric-only`）不是值；只剥空白之后的 #，值里的 # 保留 */
const stripComment = (s: string): string => s.replace(/\s+#.*$/, '').trim()

/** 顶层 `键: 值` 行（同键取第一行）+ 副作用信封下的缩进行。只拆文本，不解释内容。 */
function intakeFields(text: string): { fields: [string, string][]; envelope: string[] } {
  const top = new Map<string, string>()
  const envelope: string[] = []
  let inEnvelope = false
  for (const line of text.split('\n')) {
    if (inEnvelope && (/^\s/.test(line) || !line.trim())) {
      const item = stripComment(line)
      if (item) envelope.push(item)
      continue
    }
    const m = /^([^\s:：#][^:：]*)[:：]\s*(.*)$/.exec(line)
    const key = m?.[1]?.trim() ?? ''
    const value = stripComment(m?.[2] ?? '')
    inEnvelope = key === ENVELOPE
    if (inEnvelope && value) envelope.push(value)
    if (key && !top.has(key)) top.set(key, value)
  }
  const fields = FIELDS.flatMap(([key, label]): [string, string][] => (top.get(key) ? [[label, top.get(key)!]] : []))
  return { fields, envelope }
}

/**
 * K0 开局确认（run 记录建立之前）：agent 写的草稿 `.research-pending/K0-intake.md`，只读。
 * 草稿是 agent 写的文本：一律作为 React 文本节点渲染（转义），从不当 HTML / Markdown 解释。
 */
export function K0PendingCard({ text }: { text: string }): React.ReactElement {
  const { fields, envelope } = intakeFields(text)
  return (
    <section className="research-panel p-5 space-y-3" aria-label="K0 开局确认">
      <h3 className="flex items-center gap-2 font-medium"><Hourglass className="size-4" aria-hidden />K0 开局确认 · 等待你确认</h3>
      {(fields.length > 0 || envelope.length > 0) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          {fields.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </React.Fragment>
          ))}
          {envelope.length > 0 && (
            <>
              <dt className="text-muted-foreground">{ENVELOPE}</dt>
              <dd className="min-w-0 break-words">{envelope.map((line, i) => <div key={i}>{line}</div>)}</dd>
            </>
          )}
        </dl>
      )}
      <p className="text-[12px] text-muted-foreground">在对话里回复「确认」开始研究，或直接写出要改的字段；确认后 run 记录建立，画布会自动切到实时视图。</p>
      <details className="text-[12px]">
        <summary className="cursor-pointer text-muted-foreground">草稿原文</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-2">{text}</pre>
      </details>
    </section>
  )
}
