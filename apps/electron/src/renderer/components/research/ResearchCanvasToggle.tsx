import React from 'react'
import { useAtom } from 'jotai'
import { FlaskConical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { researchCanvasOpenMapAtom } from '@/atoms/research-atoms'
import { scratchPadPanelOpenAtom } from '@/atoms/tab-atoms'

/**
 * 研究画布开关（04 §3.1）：AgentView 徽标位常驻。
 * 打开时关闭草稿（两者占同一槽位）；画布内部决定显示实时 run 还是归档选择器。
 */
export const ResearchCanvasToggle: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [openMap, setOpenMap] = useAtom(researchCanvasOpenMapAtom)
  const [, setScratchOpen] = useAtom(scratchPadPanelOpenAtom)
  const open = openMap.get(sessionId) ?? false

  const toggle = React.useCallback(() => {
    if (!open) setScratchOpen(false)
    setOpenMap((previous) => { const next = new Map(previous); next.set(sessionId, !open); return next })
  }, [open, sessionId, setOpenMap, setScratchOpen])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-6 gap-1 px-2 text-[11px] ${open ? 'text-foreground' : 'text-muted-foreground'}`}
          onClick={toggle}
          aria-pressed={open}
          aria-label={open ? '关闭研究画布' : '打开研究画布'}
        >
          <FlaskConical className="size-3" />
          画布
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="max-w-64">研究画布：当前问题、下一步决策、假设与证据。没有研究 run 时可回放归档。</p>
      </TooltipContent>
    </Tooltip>
  )
}
