import React from 'react'
import { X } from 'lucide-react'

import { MessageResponse } from '@/components/ai-elements/message'
import { stageDocView } from './canvas-view'

/** 打开中的阶段文档：text / error 二选一；都没有 = 正在读 */
export interface OpenStageDoc {
  path: string
  time?: string
  text?: string
  error?: string
}

/** 阶段文档只读视图：markdown 渲染（react-markdown，不渲染原始 HTML），JSON 缩进 */
export function StageDocViewer({ doc, onClose }: { doc: OpenStageDoc; onClose?: () => void }): React.ReactElement {
  const shown = doc.text === undefined ? null : stageDocView(doc.path, doc.text)
  const viewer = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { viewer.current?.scrollIntoView({ block: 'nearest' }) }, [doc.path])
  return (
    <div ref={viewer} className="research-panel overflow-hidden" role="region" aria-label={`阶段文档 ${doc.path}`}>
      <div className="flex items-center gap-2 border-b border-border/40 px-2 py-1 text-[11px] text-muted-foreground">
        <span className="truncate font-mono text-foreground">{doc.path}</span>
        <span className="shrink-0">只读{doc.time ? ` · ${doc.time}` : ''}</span>
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto flex size-5 items-center justify-center rounded hover:bg-muted/50 hover:text-foreground" aria-label="关闭文档">
            <X className="size-3" />
          </button>
        )}
      </div>
      <div className="max-h-[70vh] overflow-auto p-5">
        {doc.error ? (
          <p className="text-[12px] text-destructive">{doc.error}</p>
        ) : !shown ? (
          <p className="text-[12px] text-muted-foreground">正在读取…</p>
        ) : shown.kind === 'markdown' ? (
          <MessageResponse>{shown.text}</MessageResponse>
        ) : (
          <pre className="whitespace-pre-wrap break-all font-mono text-[12px]">{shown.text}</pre>
        )}
      </div>
    </div>
  )
}
