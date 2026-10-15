import React from 'react'
import type { AgentRefineState } from '@proma/shared'

/** 只读刷新；切会话立即隔离旧结果，晚返回的请求不会覆盖新状态。 */
export function useRefineState(sessionId: string, running: boolean) {
  const [result, setResult] = React.useState<{ sessionId: string; state?: AgentRefineState; error?: string } | null>(null)
  const [revision, setRevision] = React.useState(0)
  const refresh = React.useCallback(() => setRevision((value) => value + 1), [])
  React.useEffect(() => {
    let cancelled = false
    let request = 0
    setResult(null)
    const read = async () => {
      const current = ++request
      try {
        const state = await window.electronAPI.getRefineState(sessionId)
        if (!cancelled && current === request) setResult({ sessionId, state })
      } catch {
        if (!cancelled && current === request) setResult({ sessionId, error: '经验状态读取失败，请重试。' })
      }
    }
    void read()
    const timer = running ? window.setInterval(() => void read(), 15_000) : undefined
    return () => { cancelled = true; if (timer) window.clearInterval(timer) }
  }, [sessionId, running, revision])
  const current = result?.sessionId === sessionId ? result : null
  return { state: current?.state ?? null, error: current?.error, refresh }
}
