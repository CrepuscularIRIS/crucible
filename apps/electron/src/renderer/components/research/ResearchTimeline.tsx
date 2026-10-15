import type { WorkbenchEvent } from './workbench-view'

interface ResearchTimelineProps {
  events: WorkbenchEvent[]
  seq: number
  replay: boolean
  onEvent: (event: WorkbenchEvent) => void
}

const eventTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** 保留 journal 的事件顺序；点击只交给工作台定位，不执行研究动作。 */
export function ResearchTimeline({ events, seq, replay, onEvent }: ResearchTimelineProps): JSX.Element {
  const visibleEvents = replay ? events.filter((event) => event.seq <= seq) : events
  return (
    <section aria-label="研究过程" className="min-w-0">
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">研究过程</h2>
          <p className="mt-1 text-xs text-muted-foreground">{replay ? '点击事件回看当时的研究' : '点击事件查看关联内容'}</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{visibleEvents.length} 条</span>
      </header>
      {visibleEvents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">还没有可展示的研究事件。记录到达后，过程将在这里逐步展开。</p>
      ) : (
        <>
          <p className="mb-3 text-[10px] tracking-wide text-muted-foreground">时间 UTC+08 · 原始事件顺序</p>
          <ol className="space-y-1" aria-label="研究事件时间线">
            {visibleEvents.map((event) => {
              const current = event.seq === seq
              const date = new Date(event.ts)
              const validTime = event.ts.length > 0 && !Number.isNaN(date.getTime())
              return (
                <li key={event.seq}>
                  <button
                    type="button"
                    onClick={() => onEvent(event)}
                    aria-current={current ? 'step' : undefined}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-border hover:bg-muted/40'}`}
                  >
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${current ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                      <span className="font-mono tabular-nums">#{event.seq}</span>
                      {validTime ? <time dateTime={event.ts}>{eventTime.format(date)}</time> : <span>时间未记录</span>}
                      {current && <span className="ml-auto text-primary">当前</span>}
                    </div>
                    <p className="mt-1.5 break-words text-xs font-medium leading-relaxed">{event.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                      {event.pid && <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{event.pid}</span>}
                      {event.hids.map((hid) => <span key={hid} className="rounded bg-muted px-1.5 py-0.5 font-mono">{hid}</span>)}
                      <span className="break-all font-mono text-muted-foreground">{event.op}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}
