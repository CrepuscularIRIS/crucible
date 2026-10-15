import * as React from 'react'
import type { BrowserPagePreview } from '@proma/shared'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WebBrowserPreviewProps {
  sessionId: string
  tabId: string
}

/** Web 端展示受管页面的只读快照；真正的页面交互由 Browser 工具执行。 */
export function WebBrowserPreview({ sessionId, tabId }: WebBrowserPreviewProps): React.ReactElement {
  const [preview, setPreview] = React.useState<BrowserPagePreview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [revision, retry] = React.useReducer((value: number) => value + 1, 0)
  React.useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setPreview(null)
    setError(null)
    const poll = async (): Promise<void> => {
      if (!tabId || cancelled) return
      if (document.visibilityState !== 'hidden') {
        try {
          const capture = window.electronAPI.getAgentBrowserPreview
          if (typeof capture !== 'function') throw new Error('当前服务不支持页面快照，请更新并重启 Proma 服务。')
          const next = await capture({ sessionId, tabId })
          if (!cancelled && next.sessionId === sessionId && next.tabId === tabId) {
            setPreview(next)
            setError(null)
          }
        } catch (cause) {
          if (!cancelled) setError(cause instanceof Error ? cause.message : '页面快照获取失败')
        }
      }
      // 请求完成后再计时；页面卸载或切换后，晚到的响应不得重新启动轮询。
      if (!cancelled) timer = setTimeout(() => void poll(), 2_000)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [sessionId, tabId, revision])

  return (
    <section aria-label="受管浏览器页面快照" className="flex flex-1 min-h-0 flex-col bg-muted/10">
      <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex-1">页面快照 · 每 2 秒更新 · 由 Agent 点击、输入和读取</span>
        <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={retry} aria-label="重新获取页面快照"><RefreshCw className="size-3" />重试</Button>
      </div>
      {error && <p role="alert" className="border-b border-border/30 px-3 py-2 text-xs text-destructive">快照暂未更新：{error}</p>}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {preview ? (
          <figure className="space-y-2">
            <img src={`data:${preview.mimeType};base64,${preview.base64}`} alt={`受管页面快照：${preview.url}`} className="w-full rounded-md border border-border/50" />
            <figcaption className="text-xs text-muted-foreground">{new Date(preview.capturedAt).toLocaleTimeString()} 的页面：{preview.url}。快照不可直接点击；地址栏和标签切换可用。显示快照不代表 Agent 已读取。</figcaption>
          </figure>
        ) : (
          <div role="status" className="flex h-full min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            {!error && tabId && <LoaderCircle className="size-4 animate-spin" />}
            {error ? '暂时无法展示页面，请重试。' : tabId ? '正在获取受管页面…' : '等待浏览器标签…'}
          </div>
        )}
      </div>
    </section>
  )
}
