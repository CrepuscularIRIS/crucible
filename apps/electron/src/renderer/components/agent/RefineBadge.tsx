import React from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AgentRefineState } from '@proma/shared'

/**
 * Track B #2/#3：auto-refine 显隐 + 手动"立即提炼"。
 *
 * - Prime 的条件触发（轮数/压缩）仍是策略，这里只做两件事：
 *   会话空闲时拉取 harness_state 摘要，显示"经验已记录"徽标；
 *   用户可随时手动触发 session.refine()（UI 动作，/refine 斜杠命令仍被 shield）。
 * - 未驻留（首轮消息前/空闲超时后）时按钮禁用并给出原因。
 */
export const RefineBadge: React.FC<{
  sessionId: string
  streaming: boolean
}> = ({ sessionId, streaming }) => {
  const [state, setState] = React.useState<AgentRefineState | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const next = await window.electronAPI.getRefineState(sessionId)
      setState(next)
    } catch {
      /* 主进程未就绪时静默 */
    }
  }, [sessionId])

  React.useEffect(() => {
    void refresh()
  }, [refresh, streaming])

  const handleRefineNow = React.useCallback(async () => {
    if (streaming || busy) return
    setBusy(true)
    setToast(null)
    try {
      const result = await window.electronAPI.refineSession(sessionId)
      setToast(result.scheduled ? '已开始提炼（结束后显示新经验）' : (result.reason ?? '暂不可用'))
      await refresh()
    } catch (error) {
      setToast(error instanceof Error ? error.message : '提炼失败')
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, sessionId, streaming])

  const entries = state?.harness?.entries ?? 0
  const autoOn = state?.autoRefine?.enabled ?? true
  const label = busy ? '提炼中…' : entries > 0 ? `经验 ${entries}` : '提炼'
  const title = [
    `auto-refine：${autoOn ? `开（每 ${state?.autoRefine?.turnInterval ?? 25} 轮/压缩后）` : '关'}`,
    entries > 0 ? `最近：${state?.harness?.recent?.[0]?.summary ?? ''}` : '尚无经验记录',
    state?.resident ? '点击立即提炼' : '会话未驻留（先发一条消息）',
    toast,
  ].filter(Boolean).join(' · ')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground"
          disabled={streaming || busy || state?.resident === false}
          onClick={handleRefineNow}
        >
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top"><p className="max-w-64">{title}</p></TooltipContent>
    </Tooltip>
  )
}
