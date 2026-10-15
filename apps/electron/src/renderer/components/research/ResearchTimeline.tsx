import { useState } from 'react'
import { CircleDot, FlaskConical, GitBranch } from 'lucide-react'
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

// 只省略明确的机械记录；未知事件与环境核对结果仍保留，避免把异常藏起来。
const mechanicalOps = new Set(['world.simulate', 'world.info', 'world.env', 'env.snapshot'])
const claimLabels: Record<string, string> = {
  LIVE: '待检验', SUPPORTED: '得到支持', REFUTED: '已被否定', SCOPED: '收窄范围', CONTESTED: '仍有争议',
}

export function timelineEvents(events: WorkbenchEvent[], seq: number, replay: boolean, all: boolean): WorkbenchEvent[] {
  return events.filter((event) => (!replay || event.seq <= seq) && (all || !mechanicalOps.has(event.op)))
}

export function timelineTitle(title: string): string {
  return title.replace(/\b(LIVE|SUPPORTED|REFUTED|SCOPED|CONTESTED)\b/g, (state) => claimLabels[state] ?? state)
}

/** 关键进展里连续的 claim.propose（≥2 条）合成一组；其余事件原样一行。 */
export function timelineRows(events: WorkbenchEvent[]): (WorkbenchEvent | { events: WorkbenchEvent[] })[] {
  const rows: (WorkbenchEvent | { events: WorkbenchEvent[] })[] = []
  let run: WorkbenchEvent[] = []
  const flush = () => { if (run.length > 1) rows.push({ events: run }); else rows.push(...run); run = [] }
  for (const event of events) {
    if (event.op === 'claim.propose') { run.push(event); continue }
    flush()
    rows.push(event)
  }
  flush()
  return rows
}

/** 保留 journal 顺序；关键进展仅筛选显示，不改事件、更不推导科学判断。 */
export function ResearchTimeline({ events, seq, replay, onEvent }: ResearchTimelineProps): JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const available = timelineEvents(events, seq, replay, true)
  const visibleEvents = timelineEvents(available, seq, replay, showAll)
  const renderEvent = (event: WorkbenchEvent): JSX.Element => {
    const current = event.seq === seq
    const date = new Date(event.ts)
    const validTime = event.ts.length > 0 && !Number.isNaN(date.getTime())
    const EventIcon = event.op.startsWith('claim.') ? GitBranch : /^(probe\.|prereg\.|world\.observe)/.test(event.op) ? FlaskConical : CircleDot
    return (
      <li key={event.seq} className="timeline-event" data-current={current || undefined}>
        <button
          type="button"
          onClick={() => onEvent(event)}
          aria-current={current ? 'step' : undefined}
          className={`timeline-event-button w-full rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-border hover:bg-muted/40'}`}
        >
          <div className="timeline-event-meta flex items-center gap-2 text-[10px] text-muted-foreground">
            <EventIcon className="timeline-event-icon size-3 shrink-0" aria-hidden />
            {validTime ? <time dateTime={event.ts}>{eventTime.format(date)}</time> : <span>时间未记录</span>}
            {current && <span className="ml-auto text-primary">当前</span>}
          </div>
          <p className="timeline-event-title mt-1 break-words text-xs font-medium leading-relaxed">{timelineTitle(event.title)}</p>
          {(event.pid || event.hids.length > 0) && <div className="timeline-event-refs mt-1 flex flex-wrap items-center gap-1 text-[10px]">
            {event.pid && <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{event.pid}</span>}
            {event.hids.map((hid) => <span key={hid} className="rounded bg-muted px-1.5 py-0.5 font-mono">{hid}</span>)}
          </div>}
        </button>
        {showAll && <details className="timeline-event-source mx-3 mb-1 text-[10px] text-muted-foreground">
          <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">开发记录 · #{event.seq}</summary>
          <p className="mt-1 break-all font-mono">{event.op}</p>
          <p className="mt-1 break-words">{event.title}</p>
        </details>}
      </li>
    )
  }
  return (
    <section aria-label="研究过程" className="research-timeline min-w-0">
      <header className="timeline-heading mb-3">
        <h2 className="text-sm font-semibold">研究过程</h2>
        <p className="mt-1 text-xs text-muted-foreground">{replay ? '点击事件回看当时的研究' : '点击事件查看关联内容'}</p>
      </header>
      {available.length > 0 && <div className="timeline-filter mb-3 flex flex-wrap items-center gap-1" role="group" aria-label="事件筛选">
        <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)} className="rounded-md px-2 py-1 text-[11px] aria-pressed:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">关键进展</button>
        <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)} className="rounded-md px-2 py-1 text-[11px] aria-pressed:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">全部记录</button>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">显示 {visibleEvents.length} / {available.length} 条</span>
      </div>}
      {available.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">还没有可展示的研究事件。记录到达后，过程将在这里逐步展开。</p>
      ) : visibleEvents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">当前只有环境或模拟记录，可切换“全部记录”查看。</p>
      ) : (
        <>
          <p className="mb-2 text-[10px] tracking-wide text-muted-foreground">时间 UTC+08 · 按发生顺序</p>
          <ol className="timeline-events space-y-1" aria-label="研究事件时间线">
            {(showAll ? visibleEvents : timelineRows(visibleEvents)).map((row) => {
              if (!('events' in row)) return renderEvent(row)
              const current = row.events.some((event) => event.seq === seq)
              return (
                <li key={`group-${row.events[0]!.seq}`} className="timeline-event" data-current={current || undefined}>
                  <details className="timeline-group" open={current || undefined}>
                    <summary className={`timeline-event-button cursor-pointer rounded-lg border px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-border hover:bg-muted/40'}`}>
                      <span className="timeline-event-meta flex items-center gap-2 text-[10px] text-muted-foreground">
                        <GitBranch className="timeline-event-icon size-3 shrink-0" aria-hidden />
                        <span>第 {row.events[0]!.seq}–{row.events.at(-1)!.seq} 行</span>
                        {current && <span className="ml-auto text-primary">当前</span>}
                      </span>
                      <span className="timeline-event-title mt-1 block text-xs font-medium leading-relaxed">提出 {row.events.length} 个假设</span>
                    </summary>
                    <ol className="mt-1 space-y-1 pl-3">{row.events.map(renderEvent)}</ol>
                  </details>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}
