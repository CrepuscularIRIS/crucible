import React from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { REFINE_MODES, refineBlockReason } from './refine-view'
import { useRefineState } from './use-refine-state'

/** 状态入口始终可查看；真正写入经验的动作放在说明面板内。 */
export const RefineBadge: React.FC<{ sessionId: string; streaming: boolean }> = ({ sessionId, streaming }) => {
  const { state, error, refresh } = useRefineState(sessionId, streaming)
  const [busy, setBusy] = React.useState(false)
  const inFlight = React.useRef(false)
  const currentSession = React.useRef(sessionId)
  currentSession.current = sessionId
  const [feedback, setFeedback] = React.useState<{ sessionId: string; text: string } | null>(null)
  const blocked = refineBlockReason(state, streaming, busy)
  const mode = state?.arm?.mode
  const label = mode === 'frozen' ? '经验 · 冻结' : mode === 'off' ? '经验 · 关闭' : mode === 'learning' ? '经验 · 学习' : '经验 · Refine'

  const refine = async () => {
    if (blocked || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFeedback(null)
    try {
      // 打开面板之后策略可能改变；主进程还会在写入前再次校验。
      const fresh = await window.electronAPI.getRefineState(sessionId)
      if (currentSession.current !== sessionId) return
      const reason = refineBlockReason(fresh, streaming, false)
      if (reason) { setFeedback({ sessionId, text: reason }); return }
      const result = await window.electronAPI.refineSession(sessionId)
      setFeedback({ sessionId, text: result.scheduled ? '提炼请求已执行，记录以刷新结果为准；不代表经验已验证。' : result.reason ?? '未执行提炼。' })
    } catch {
      setFeedback({ sessionId, text: '提炼结果未确认，请先刷新记录核对，避免重复执行。' })
    } finally {
      inFlight.current = false
      setBusy(false)
      refresh()
    }
  }

  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground" aria-label="查看经验策略与提炼记录">{label}</Button></PopoverTrigger>
    <PopoverContent side="top" align="start" className="w-80 space-y-3 text-[12px]">
      <h3 className="font-semibold">操作经验 · Refine</h3>
      <p className="text-muted-foreground">{error ?? (state ? !state.resident ? '会话已释放，历史经验读取尚未接入。' : mode ? REFINE_MODES[mode] ?? '经验策略未确认。' : `自动提炼${state.autoRefine.enabled ? '开启' : '关闭'}；当前会话策略。` : '正在读取经验状态…')}</p>
      {state?.resident && <p>已记录 {state.harness?.entries ?? 0} 条经验。<span className="text-muted-foreground">记录数量不代表已验证有效。</span></p>}
      {state?.harness?.recent?.[0] && <p className="rounded border border-border/60 p-2">最近记录：{state.harness.recent[0].summary}</p>}
      {blocked && <p className="text-muted-foreground">{blocked}</p>}
      {!blocked && <p className="text-amber-700 dark:text-amber-400">将提炼并写入操作经验，可能影响后续行为。{mode === 'learning' ? '手动提炼会将本研究标为人工干预，不再作为纯自动学习对照。' : ''}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>刷新状态</Button>
        <Button size="sm" onClick={() => void refine()} disabled={!!blocked}>{busy ? '处理中…' : '提炼并写入经验'}</Button>
      </div>
      {feedback?.sessionId === sessionId && <p role="status" className="rounded bg-muted p-2">{feedback.text}</p>}
    </PopoverContent>
  </Popover>
}
