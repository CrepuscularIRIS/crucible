import React from 'react'
import { X } from 'lucide-react'

import type { NodeDetailView } from './canvas-view'

/** 节点详情（04 §3.5）：点选后在画布底部展开，Esc 收起；原始记录行内联显示（不跳行） */
export function NodeDetail({ detail, onClose, autoScroll = true }: { detail: NodeDetailView; onClose: () => void; autoScroll?: boolean }): React.ReactElement {
  const section = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    if (autoScroll) section.current?.scrollIntoView({ block: 'nearest' })
  }, [detail.title, autoScroll])
  return (
    <section ref={section} className="research-panel p-5" aria-label="节点详情">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{detail.title}</h3>
        <button type="button" onClick={onClose} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label="收起详情（Esc）">
          <X className="size-3.5" />
        </button>
      </div>
      {detail.sections.map((s) => (
        <div key={s.heading} className="mt-2">
          <div className="text-[11px] text-muted-foreground">{s.heading}</div>
          {s.rows.map((row, i) => (
            <p key={i} className="text-[13px] leading-relaxed tabular-nums">{row}</p>
          ))}
        </div>
      ))}
      {detail.rawLines.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">原始记录（{detail.rawLines.length} 行）</summary>
          {detail.rawLines.map((l) => (
            <pre key={l.seq} className="mt-1 whitespace-pre-wrap break-all text-[11px] text-muted-foreground">{l.seq}: {l.raw}</pre>
          ))}
        </details>
      )}
    </section>
  )
}
