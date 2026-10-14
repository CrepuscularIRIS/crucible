import React from 'react'
import { AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { FocusView } from './canvas-view'

const HEADING: Record<FocusView['kind'], string> = {
  fork: '等你决定', paused: '已暂停', failed: '测量失败', awaiting: '当前问题', interpret: '当前问题', done: '已结束', next: '下一步',
}

/** 默认焦点（04 §3.4）：当前问题 + 下一步决策；分叉时列出 ≤3 个选项的三栏 */
export function FocusCard({ focus, onAnswer }: {
  focus: FocusView
  /** 缺省 = 只读（回放 / 无控制接口） */
  onAnswer?: (label: string) => void
}): React.ReactElement {
  return (
    <section className="rounded-md border border-border bg-card p-3" aria-label="当前焦点">
      <div className="mb-1 text-[11px] text-muted-foreground">{HEADING[focus.kind]}</div>
      <h3 className="text-[13px] font-semibold">{focus.title}</h3>
      {focus.lines.map((line, i) => (
        <p key={i} className="mt-1 text-[13px] leading-relaxed tabular-nums">{line}</p>
      ))}
      {focus.warnings.map((w, i) => (
        <p key={`w${i}`} className="mt-1 flex items-start gap-1 text-[12px] text-amber-600 dark:text-amber-400" title="画布标记：宿主不强制">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{w.code} · {w.text}</span>
        </p>
      ))}
      {focus.options && focus.options.length > 0 && (
        <table className="mt-2 w-full table-fixed border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="w-1/4 py-1 font-normal">选项</th>
              <th className="py-1 font-normal">能分清什么</th>
              <th className="py-1 font-normal">花多少</th>
              <th className="py-1 font-normal">仍不确定什么</th>
            </tr>
          </thead>
          <tbody>
            {focus.options.map((o) => (
              <tr key={o.label} className={cn('border-t border-border/60 align-top', !o.selectable && 'text-muted-foreground')}>
                <td className="py-1 pr-2">
                  {onAnswer && o.selectable ? (
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onAnswer(o.label)}>{o.label}</button>
                  ) : o.label}
                  {o.blockedReason && <div className="text-[11px]">{o.blockedReason}</div>}
                </td>
                {o.columns ? (
                  <>
                    <td className="py-1 pr-2">{o.columns.resolves}</td>
                    <td className="py-1 pr-2 tabular-nums">{o.columns.cost}</td>
                    <td className="py-1">{o.columns.remaining}</td>
                  </>
                ) : (
                  <td className="py-1" colSpan={3}>{o.raw}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
