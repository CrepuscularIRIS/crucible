import React from 'react'
import { AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { FocusView } from './canvas-view'

const HEADING: Record<FocusView['kind'], string> = {
  fork: '等你决定', paused: '已暂停', failed: '测量失败', awaiting: '当前问题', interpret: '当前问题', done: '已结束', next: '下一步',
}

/** 默认焦点（04 §3.4）：当前问题 + 下一步决策；分叉时列出 ≤3 个选项的三栏 */
export function FocusCard({ focus, onAnswer, busy }: {
  focus: FocusView
  /** 缺省 = 只读（回放 / 无控制接口） */
  onAnswer?: (label: string) => void
  busy?: boolean
}): React.ReactElement {
  return (
    <section className="research-panel research-focus" aria-label="当前焦点">
      <div className="mb-2 text-[11px] text-muted-foreground">{HEADING[focus.kind]} · 当前焦点</div>
      <h3 className="text-[13px] font-semibold">{focus.title}</h3>
      <div className="focus-lines">
      {focus.lines.map((line, i) => (
        <p key={i} className="mt-1 text-[13px] leading-relaxed tabular-nums">{line}</p>
      ))}
      </div>
      {focus.warnings.map((w, i) => (
        <p key={`w${i}`} className="mt-1 flex items-start gap-1 text-[12px] text-amber-600 dark:text-amber-400" title="画布标记：宿主不强制">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{w.code} · {w.text}</span>
        </p>
      ))}
      {focus.options && focus.options.length > 0 && (
        <div className="research-option-grid">
            {focus.options.map((o, i) => (
              <div key={o.label} className={cn('research-option flex flex-col text-[12px]', !o.selectable && 'text-muted-foreground')}>
                <div className="mb-2 font-mono text-[11px] text-muted-foreground">选项 {String(i + 1).padStart(2, '0')}</div>
                <h4 className="mb-3 text-[13px] font-medium">{o.label}</h4>
                {o.columns ? (
                  <dl className="mb-3 space-y-2 leading-relaxed">
                    <div><dt className="text-[11px] text-muted-foreground">能分清什么</dt><dd>{o.columns.resolves}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">花多少</dt><dd className="tabular-nums">{o.columns.cost}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">仍不确定什么</dt><dd>{o.columns.remaining}</dd></div>
                  </dl>
                ) : (
                  <p className="mb-3 leading-relaxed">{o.raw}</p>
                )}
                {o.blockedReason && <p className="mb-3 text-[11px]">{o.blockedReason}</p>}
                {onAnswer && <Button type="button" variant="outline" size="sm" className="mt-auto w-full text-[12px]" disabled={!o.selectable || busy} onClick={() => onAnswer(o.label)}>选择此项<span className="sr-only">：{o.label}</span></Button>}
              </div>
            ))}
        </div>
      )}
    </section>
  )
}
