import { ExternalLink, Globe2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function WebBrowserNotice({ url, onClose }: { url?: string; onClose: () => void }): React.ReactElement {
  let href: string | undefined
  try {
    const parsed = new URL(url ?? '')
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) href = parsed.href
  } catch { /* 空地址不提供外部打开动作。 */ }
  return <section className="flex h-full flex-col items-center justify-center gap-4 bg-content-area p-8 text-center titlebar-no-drag">
    <Globe2 className="size-9 text-muted-foreground" aria-hidden />
    <h2 className="text-base font-semibold">桌面浏览器视图</h2>
    <p className="max-w-md text-sm leading-6 text-muted-foreground">当前 Web 演示不提供 Electron 内嵌网页。可以在本机浏览器打开目标页面；这不代表 Agent 已读取它。</p>
    {href && <p className="max-w-full break-all text-xs text-muted-foreground">{href}</p>}
    <div className="flex gap-2">
      {href && <Button asChild size="sm"><a href={href} target="_blank" rel="noopener noreferrer">在新标签页打开<ExternalLink className="ml-2 size-3.5" aria-hidden /></a></Button>}
      <Button variant="outline" size="sm" onClick={onClose}>收起此面板</Button>
    </div>
  </section>
}
