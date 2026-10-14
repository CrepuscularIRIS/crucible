import React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ControlAction, ControlBarView } from './controls-view'

const NEEDS_TEXT: Partial<Record<ControlAction, string>> = {
  ask: '问 agent（不改变计划）：',
  steer: '改方向（agent 先写 RULING 再继续）：',
}

/**
 * 暂停 / 问 / 改方向 / 继续 / 终止（04 §3.7）。按钮只发意图；记什么、发什么由主进程的发送计划决定。
 * "问"和"改方向"先在这里写一句话再提交。
 */
export function ControlBar({ bar, onAction, busy }: {
  bar: ControlBarView
  onAction?: (action: ControlAction, text?: string) => void
  busy?: boolean
}): React.ReactElement | null {
  const [draft, setDraft] = React.useState<{ action: ControlAction; text: string } | null>(null)
  if (bar.buttons.length === 0 && bar.notes.length === 0) return null

  const click = (action: ControlAction) => {
    if (NEEDS_TEXT[action]) setDraft({ action, text: '' })
    else onAction?.(action)
  }
  const submit = () => {
    if (!draft || !draft.text.trim()) return
    onAction?.(draft.action, draft.text.trim())
    setDraft(null)
  }

  return (
    <div className="space-y-1">
      {bar.buttons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {bar.buttons.map((b) => {
            const button = (
              <Button
                type="button"
                size="sm"
                variant={b.action === 'stop' ? 'ghost' : 'outline'}
                className="h-7 px-2 text-[12px]"
                disabled={b.disabled || busy || !onAction}
                onClick={() => click(b.action)}
              >
                {b.label}
              </Button>
            )
            return b.hint ? (
              <Tooltip key={b.action}>
                <TooltipTrigger asChild><span>{button}</span></TooltipTrigger>
                <TooltipContent side="bottom"><p className="max-w-64">{b.hint}</p></TooltipContent>
              </Tooltip>
            ) : <React.Fragment key={b.action}>{button}</React.Fragment>
          })}
        </div>
      )}
      {draft && (
        <div className="space-y-1">
          <label className="block text-[11px] text-muted-foreground" htmlFor="research-control-draft">{NEEDS_TEXT[draft.action]}</label>
          <textarea
            id="research-control-draft"
            className="w-full rounded-md border border-border bg-background p-2 text-[13px]"
            rows={2}
            value={draft.text}
            autoFocus
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
          />
          <div className="flex gap-1">
            <Button type="button" size="sm" className="h-7 px-2 text-[12px]" disabled={!draft.text.trim() || busy} onClick={submit}>发送</Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setDraft(null)}>取消</Button>
          </div>
        </div>
      )}
      {bar.notes.map((n) => (
        <p key={n} className="text-[11px] text-amber-600 dark:text-amber-400">{n}</p>
      ))}
    </div>
  )
}
