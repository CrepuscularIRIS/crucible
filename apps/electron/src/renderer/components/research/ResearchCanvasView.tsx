import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

import { ControlBar } from './ControlBar'
import { EvidenceMatrix } from './EvidenceMatrix'
import { FocusCard } from './FocusCard'
import { NodeDetail } from './NodeDetail'
import type { CanvasView, NodeDetailView, NodeSelection } from './canvas-view'
import type { ControlAction } from './controls-view'

function Card({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="rounded-md border border-border bg-card p-3">
      <h3 className="mb-1 text-[11px] text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

const List = ({ items }: { items: string[] }) => (
  <ul className="space-y-0.5 text-[13px]">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
)

export interface ResearchCanvasViewProps {
  view: CanvasView
  detail: NodeDetailView | null
  narrow: boolean
  onSelect: (sel: NodeSelection | null) => void
  onClose?: () => void
  /** 回放：拖动时间滑块 */
  onSeq?: (seq: number) => void
  onControl?: (action: ControlAction, text?: string) => void
  onForkAnswer?: (label: string) => void
  busy?: boolean
  error?: string | null
  /** 回放时切换数据源 */
  onChangeSource?: () => void
}

/** 研究画布主体（04 §3.1 布局）：纯渲染，数据由 ResearchCanvasPane 准备 */
export function ResearchCanvasView(props: ResearchCanvasViewProps): React.ReactElement {
  const { view, detail, narrow, onSelect } = props
  const replay = !!props.onSeq
  return (
    <div className="flex h-full flex-col overflow-hidden bg-content-area text-foreground titlebar-no-drag">
      <div className="flex h-[34px] flex-shrink-0 items-center gap-2 border-b border-border/30 px-3">
        <span className="truncate text-xs font-medium">研究画布 · {view.title}</span>
        <span className="truncate text-[11px] text-muted-foreground">{view.modeLabel}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {props.onChangeSource && (
            <button type="button" className="rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground" onClick={props.onChangeSource}>换一个</button>
          )}
          {props.onClose && (
            <button type="button" onClick={props.onClose} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label="关闭研究画布">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {view.integrityNote && (
          <p className="flex items-center gap-1 text-[12px] text-destructive"><AlertTriangle className="size-3" aria-hidden />{view.integrityNote}</p>
        )}
        {props.error && <p className="text-[12px] text-destructive">{props.error}</p>}
        {!replay && <ControlBar bar={view.controls} onAction={props.onControl} busy={props.busy} />}

        <div className={narrow ? 'space-y-1' : 'grid grid-cols-3 gap-2'}>
          {view.cells.map((c) => (
            <div key={c.label} className="rounded-md border border-border bg-card px-2 py-1.5">
              <div className="text-[11px] text-muted-foreground">{c.label}</div>
              <div className="text-[13px] tabular-nums">{c.text}</div>
            </div>
          ))}
        </div>

        {replay && (
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="shrink-0 tabular-nums">第 {view.seq} / {view.maxSeq} 行</span>
              <input
                type="range"
                min={1}
                max={view.maxSeq}
                value={view.seq}
                onChange={(e) => props.onSeq!(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="回放到运行记录第几行"
              />
            </label>
            {view.timeline.length > 0 && (
              <div className="flex flex-wrap gap-1 text-[11px]">
                {view.timeline.map((t) => (
                  <button key={t.id} type="button" className="rounded border border-border px-1 tabular-nums hover:bg-muted/50" title={`${t.title}（审计注记，只读）`} onClick={() => props.onSeq!(t.seq)}>
                    {t.id} 当时{t.atTime} 事后{t.hindsight} · {t.seq}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <FocusCard focus={view.focus} onAnswer={replay ? undefined : props.onForkAnswer} />

        <Card title="假设与证据">
          {view.derivationNote && <p className="mb-1 text-[11px] text-muted-foreground">{view.derivationNote}</p>}
          <EvidenceMatrix view={view} narrow={narrow} onSelect={onSelect} />
        </Card>

        {detail && <NodeDetail detail={detail} onClose={() => onSelect(null)} />}

        {view.feedback && <Card title="一次反馈改变"><List items={view.feedback} /></Card>}

        {view.children.length > 0 && (
          <Card title="子任务">
            <ul className="space-y-1 text-[13px]">
              {view.children.map((c) => (
                <li key={c.name}>
                  <button type="button" className="hover:underline" onClick={() => onSelect({ kind: 'child', id: c.name })}>{c.name}</button>
                  <span className="ml-2 text-muted-foreground">{c.statusLabel}</span>
                  {c.detail && <div className="truncate text-[11px] text-muted-foreground" title={c.detail}>{c.detail}</div>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {view.interventions.length > 0 && (
          <Card title="人的干预">
            <ul className="space-y-1 text-[13px]">
              {view.interventions.map((i) => (
                <li key={i.id}>
                  <button type="button" className="hover:underline" onClick={() => onSelect({ kind: 'intervention', id: i.id })}>{i.id} · {i.kind}</button>
                  <span className="ml-2">{i.text}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">{i.status}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="阶段报告">
          <List items={[`已知：${view.stage.known.join('；') || '无'}`, `未知：${view.stage.unknown.join('；') || '无'}`, `下一步：${view.stage.next.join('；')}`]} />
        </Card>

        {view.flags.length > 0 && (
          <Card title="画布标记（只打标，宿主不强制）">
            <ul className="space-y-0.5 text-[12px] text-amber-600 dark:text-amber-400">
              {view.flags.map((f, i) => <li key={i}>{f.code} · 第 {f.seq} 行 · {f.note}</li>)}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
