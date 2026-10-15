import React from 'react'
import { ArrowUpRight, FlaskConical, History, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ResearchArchiveEntry } from '@/types/research-record'
import type { ResearchCanvasSource } from '@/atoms/research-atoms'
import { archivePickerView } from './canvas-view'
import { K0PendingCard } from './K0PendingCard'
import { SAMPLE_PROMPT, SAMPLE_RUN } from './sample-run'

/**
 * 空状态 + 归档回放选择器（04 §3.1）：本会话没有研究 run 时出现。
 * 示例 run：主进程列出同一 run 时走归档（带注记），否则用打包的无真相副本，都没有（docker）则不显示。
 * 白名单归档要主进程（R1）列出。
 */
export function ArchivePicker({ archives, pendingIntake, onPick, onClose, live }: {
  /** null = 主进程未提供归档列表 */
  archives: ResearchArchiveEntry[] | null
  /** run 记录建立之前的 K0 草稿原文（等用户确认）；没有为 null */
  pendingIntake: string | null
  onPick: (source: ResearchCanvasSource) => void
  onClose: () => void
  /** 实时面板：记录建立前也能看到 AI 在做什么 */
  live?: React.ReactNode
}): React.ReactElement {
  const [copied, setCopied] = React.useState(false)
  const picker = archivePickerView(archives, SAMPLE_RUN)
  const copy = () => {
    navigator.clipboard.writeText(SAMPLE_PROMPT).then(() => setCopied(true), () => setCopied(false))
  }
  return (
    <div className="research-canvas flex h-full flex-col overflow-hidden bg-content-area titlebar-no-drag">
      <div className="flex h-[34px] flex-shrink-0 items-center border-b border-border/30 px-3">
        <span className="truncate text-xs text-muted-foreground">研究画布</span>
        <button type="button" onClick={onClose} className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label="关闭研究画布">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="research-canvas-scroll"><div className="research-canvas-body text-[13px]">
        {pendingIntake !== null && <K0PendingCard text={pendingIntake} />}
        <section className="research-panel p-4">
          <p className="flex items-center gap-2 text-[12px] leading-relaxed text-muted-foreground"><FlaskConical className="size-4 shrink-0" aria-hidden />本会话还没有研究记录：开局确认（K0）后 agent 调 research_init 建档，画布自动接入。下面可以先回放已有研究。</p>
        </section>
        {live}

        <section className="research-panel p-5 space-y-3">
          <h3 className="flex items-center gap-2 font-medium"><History className="size-4" aria-hidden />从一份真实记录开始</h3>
          {picker.sample ? (
            <Button type="button" variant="outline" size="sm" className="h-auto w-full justify-start whitespace-normal py-1.5 text-left text-[13px]" onClick={() => onPick(picker.sample!)}>
              {SAMPLE_RUN.label}<ArrowUpRight className="ml-auto size-4 shrink-0" aria-hidden />
            </Button>
          ) : null}
          {archives === null ? (
            <p className="text-[11px] text-muted-foreground">归档列表不可用：主进程未提供研究记录接口{picker.sample ? '，只能回放随应用打包的示例' : ''}。</p>
          ) : picker.archives.length === 0 && !picker.sample ? (
            <p className="text-[11px] text-muted-foreground">没有可回放的归档。</p>
          ) : picker.archives.map((a) => (
            <Button key={a.path} type="button" variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal py-1 text-left text-[12px]" onClick={() => onPick({ kind: 'archive', path: a.path })}>
              {a.run} <span className="ml-1 truncate text-muted-foreground">{a.path}</span>
            </Button>
          ))}
        </section>

        {picker.sample && <section className="research-panel p-5 space-y-3">
          <h3 className="text-[11px] text-muted-foreground">示例任务</h3>
          <p className="text-muted-foreground">示例 run 的原始一句话提示词（GLM，2026-10-14）。在研究会话里发出它，画布就会显示实时记录。</p>
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-card p-2 text-[12px]">{SAMPLE_PROMPT}</pre>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={copy}>
            {copied ? '已复制' : '复制示例提示词'}
          </Button>
        </section>}
      </div>
      </div>
    </div>
  )
}
