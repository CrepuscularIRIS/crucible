import React from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ResearchArchiveEntry } from '@/types/research-record'
import type { ResearchCanvasSource } from '@/atoms/research-atoms'
import { archivePickerView } from './canvas-view'
import { SAMPLE_PROMPT, SAMPLE_RUN } from './sample-run'

/**
 * 空状态 + 归档回放选择器（04 §3.1）：本会话没有研究 run 时出现。
 * 示例 run：主进程列出同一 run 时走归档（带注记），否则用打包的无真相副本，都没有（docker）则不显示。
 * 白名单归档要主进程（R1）列出。
 */
export function ArchivePicker({ archives, onPick, onClose }: {
  /** null = 主进程未提供归档列表 */
  archives: ResearchArchiveEntry[] | null
  onPick: (source: ResearchCanvasSource) => void
  onClose: () => void
}): React.ReactElement {
  const [copied, setCopied] = React.useState(false)
  const picker = archivePickerView(archives, SAMPLE_RUN)
  const copy = () => {
    navigator.clipboard.writeText(SAMPLE_PROMPT).then(() => setCopied(true), () => setCopied(false))
  }
  return (
    <div className="flex h-full flex-col overflow-hidden bg-content-area titlebar-no-drag">
      <div className="flex h-[34px] flex-shrink-0 items-center border-b border-border/30 px-3">
        <span className="truncate text-xs text-muted-foreground">研究画布</span>
        <button type="button" onClick={onClose} className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label="关闭研究画布">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[13px]">
        <section className="space-y-1">
          <p>研究画布把一次研究的运行记录摊开：当前在问什么、下一步要决定什么、每个解释被哪次测量支持或否定。</p>
          <p className="text-muted-foreground">本会话还没有研究 run（工作目录下没有 .proma-research/）。可以先回放一次已完成的研究。</p>
        </section>

        <section className="space-y-1">
          <h3 className="text-[11px] text-muted-foreground">回放</h3>
          {picker.sample ? (
            <Button type="button" variant="outline" size="sm" className="h-auto w-full justify-start whitespace-normal py-1.5 text-left text-[13px]" onClick={() => onPick(picker.sample!)}>
              {SAMPLE_RUN.label}
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground">本构建没有打包示例 run（容器镜像不含 research/campaigns，避免评测里的 agent 读到历史测量）。</p>
          )}
          {archives === null ? (
            <p className="text-[11px] text-muted-foreground">归档列表不可用：主进程未提供研究记录接口{picker.sample ? '，只能回放随应用打包的示例' : ''}。</p>
          ) : picker.archives.map((a) => (
            <Button key={a.path} type="button" variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal py-1 text-left text-[12px]" onClick={() => onPick({ kind: 'archive', path: a.path })}>
              {a.run} <span className="ml-1 truncate text-muted-foreground">{a.path}</span>
            </Button>
          ))}
        </section>

        <section className="space-y-1">
          <h3 className="text-[11px] text-muted-foreground">示例任务</h3>
          <p className="text-muted-foreground">示例 run 的原始一句话提示词（GLM，2026-10-14）。在研究会话里发出它，画布就会显示实时记录。</p>
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-card p-2 text-[12px]">{SAMPLE_PROMPT}</pre>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={copy}>
            {copied ? '已复制' : '复制示例提示词'}
          </Button>
        </section>
      </div>
    </div>
  )
}
