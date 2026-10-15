import React from 'react'
import { useStore } from 'jotai'
import { FlaskConical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { activeTabIdAtom, openTab, tabsAtom } from '@/atoms/tab-atoms'

/** 研究 Tab 标题（顶部标签栏） */
export const RESEARCH_TAB_TITLE = '研究画布'

/**
 * 研究画布入口（04 §3.1）：AgentView 徽标位常驻，点击在顶部标签栏打开（或切到）本会话的研究 Tab。
 * Tab 里分「科研进度 / 评委」两种读法；没有研究 run 时可回放归档。
 */
export const ResearchCanvasToggle: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const store = useStore()
  const open = React.useCallback(() => {
    const result = openTab(store.get(tabsAtom), { type: 'research', sessionId, title: RESEARCH_TAB_TITLE })
    store.set(tabsAtom, result.tabs)
    store.set(activeTabIdAtom, result.activeTabId)
  }, [sessionId, store])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
          onClick={open}
          aria-label="在标签页打开研究画布"
        >
          <FlaskConical className="size-3" />
          画布
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="max-w-64">研究画布（顶部标签页）：科研进度（运行中实时、阶段文档）与评委报告。没有研究 run 时可回放归档。</p>
      </TooltipContent>
    </Tooltip>
  )
}
