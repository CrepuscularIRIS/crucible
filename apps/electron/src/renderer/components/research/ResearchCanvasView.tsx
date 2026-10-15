import React from 'react'
import { AlertTriangle, ArrowRight, FileText, GitBranch, Layers, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ControlBar } from './ControlBar'
import { EvidenceMatrix } from './EvidenceMatrix'
import { FocusCard } from './FocusCard'
import { NodeDetail } from './NodeDetail'
import { HypothesisMap } from './HypothesisMap'
import { StageDocViewer, type OpenStageDoc } from './StageDocViewer'
import type { CanvasView, NodeDetailView, NodeSelection } from './canvas-view'
import type { ControlAction } from './controls-view'
import './research-canvas.css'

function Card({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="research-panel">
      <h3 className="research-panel-heading">{title}</h3>
      <div className="research-panel-body">{children}</div>
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
  selection?: NodeSelection | null
  onClose?: () => void
  /** 回放：拖动时间滑块 */
  onSeq?: (seq: number) => void
  onControl?: (action: ControlAction, text?: string) => void
  onForkAnswer?: (label: string) => void
  busy?: boolean
  error?: string | null
  /** 回放时切换数据源 */
  onChangeSource?: () => void
  /** 点开一份阶段文档（主进程能读时才给） */
  onOpenDoc?: (path: string) => void
  openDoc?: OpenStageDoc | null
  onCloseDoc?: () => void
}

/** 顶部状态条：一眼看到 run 走到哪（阶段 / 预算 / 假设计数 / 最新事件 / 下一步） */
function StatusStrip({ status }: { status: CanvasView['status'] }): React.ReactElement {
  const items: [string, string | undefined][] = [
    ['阶段', status.phase],
    ['预算', status.budget],
    ['假设', status.counts],
    ['最新', status.latest],
    ['下一步', status.next],
  ]
  return (
    <div className="research-status" aria-label="研究进度">
      {items.filter(([, v]) => v).map(([k, v]) => (
        <span key={k} className="min-w-0"><span className="text-muted-foreground">{k} </span><span className="tabular-nums">{v}</span></span>
      ))}
    </div>
  )
}

function StageDocs(props: ResearchCanvasViewProps): React.ReactElement | null {
  const { view, onOpenDoc, openDoc } = props
  if (!view.docs.length && !onOpenDoc) return null
  return (
    <Card title="阶段文档">
      <p className="mb-3 text-[11px] text-muted-foreground">研究产物 · 点击阅读 · 时间 UTC+08:00{props.onSeq && ' · 文件当前版本，不随回放回退'}</p>
      {view.docs.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">工作目录里还没有文档</p>
      ) : (
        <ul className="research-doc-grid text-[13px]">
          {view.docs.map((d) => (
            <li key={d.path} className="min-w-0">
              <button
                type="button"
                className="research-doc w-full"
                aria-pressed={openDoc?.path === d.path}
                disabled={!onOpenDoc}
                onClick={() => onOpenDoc?.(d.path)}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0"><span className="block truncate font-medium">{d.path}</span><span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">{d.time}{d.newest ? ' · 最新' : ''}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** 研究画布主体（04 §3.1 布局）：纯渲染，数据由 ResearchCanvasPane 准备 */
export function ResearchCanvasView(props: ResearchCanvasViewProps): React.ReactElement {
  const { view, detail, narrow, onSelect } = props
  const replay = !!props.onSeq
  return (
    <div className="research-canvas flex h-full min-w-0 flex-col overflow-hidden bg-content-area text-foreground titlebar-no-drag">
      <div className="research-canvas-scroll">
      <div className="research-canvas-body">
      <header className="research-heading">
        <div className="min-w-0"><div className="research-eyebrow">RESEARCH CANVAS / {replay ? 'REPLAY' : 'LIVE'}</div><h1>{view.title}</h1><p className="mt-2 break-all text-[11px] text-muted-foreground">{view.modeLabel}</p></div>
        <div className="flex shrink-0 items-center gap-1">
          {props.onChangeSource && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={props.onChangeSource}>切换记录</Button>
          )}
          {props.onClose && (
            <button type="button" onClick={props.onClose} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label="关闭研究画布">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </header>
        <StatusStrip status={view.status} />
        {view.integrityNote && (
          <p className="flex items-center gap-1 text-[12px] text-destructive"><AlertTriangle className="size-3" aria-hidden />{view.integrityNote}</p>
        )}
        {props.error && <p className="text-[12px] text-destructive">{props.error}</p>}
        {!replay && <ControlBar bar={view.controls} onAction={props.onControl} busy={props.busy} />}

        <div className="research-summary" role="group" aria-label="运行状态与结论">
          {view.cells.map((c) => (
            <div key={c.label}>
              <div className="research-summary-label">{c.label}{c.label === '科学结论' && <span> · 记录中的判断</span>}</div>
              <div className="research-summary-value tabular-nums">{c.text}</div>
            </div>
          ))}
        </div>

        {replay && (
          <div className="research-panel space-y-3 p-4">
            <div className="flex items-center gap-2 text-[12px] font-medium"><Layers className="size-3.5" aria-hidden />沿记录回看<span className="ml-auto text-[11px] font-normal text-muted-foreground">拖动查看当时的判断</span></div>
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

        <FocusCard focus={view.focus} busy={props.busy} onAnswer={replay ? undefined : props.onForkAnswer} />

        <section className="research-panel" aria-label="假设与证据">
          <Tabs defaultValue="map">
            <div className="research-panel-heading">
              <GitBranch className="size-4 text-muted-foreground" aria-hidden /><h2>假设与证据</h2>
              <span className="text-[11px] font-normal text-muted-foreground">{view.claims.length} 个解释 · {view.matrix.columns.length} 个实验</span>
              <TabsList className="ml-auto h-8" aria-label="假设呈现方式">
                <TabsTrigger value="map" className="px-3 text-[11px] transition-none">假设图</TabsTrigger>
                <TabsTrigger value="matrix" className="px-3 text-[11px] transition-none">证据矩阵</TabsTrigger>
              </TabsList>
            </div>
            <p className="px-[18px] py-3 text-[11px] text-muted-foreground">{view.derivationNote ?? '缩进表示已记录的派生关系；实验支持关系见证据矩阵。'}</p>
            <TabsContent value="map" className="research-evidence m-0">
              <HypothesisMap claims={view.claims} selectedId={props.selection?.kind === 'claim' ? props.selection.id : undefined} onSelect={onSelect} />
            </TabsContent>
            <TabsContent value="matrix" className="research-evidence m-0">
              <EvidenceMatrix view={view} narrow={narrow} onSelect={onSelect} />
            </TabsContent>
          </Tabs>
          {view.matrix.columns.length > 0 && <div className="border-t border-border/60 p-[18px]">
            <p className="mb-3 text-[11px] text-muted-foreground">实验记录 · 按登记顺序 · 点击查看预测、测量与判读</p>
            <div className="research-path">{view.matrix.columns.map((col, i) => <React.Fragment key={col.pid}>
              {i > 0 && <ArrowRight className="size-3 text-muted-foreground" aria-hidden />}
              <button type="button" title={col.label} onClick={() => onSelect({ kind: 'prereg', id: col.pid })}><span className="font-mono">{col.pid}</span><span className="max-w-40 truncate text-muted-foreground">{col.label.replace(col.pid, '').trim()}</span></button>
            </React.Fragment>)}</div>
          </div>}
        </section>

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

        <div className="research-bottom-grid">
          <Card title="阶段报告">
            {([['已知', view.stage.known], ['未知', view.stage.unknown], ['下一步', view.stage.next]] as const).map(([label, items]) => (
              <div key={label} className="research-stage-section"><h4 className="text-[11px] font-medium text-muted-foreground">{label}</h4><ul>{(items.length ? items : ['暂无记录']).map((text, i) => <li key={i}>{text}</li>)}</ul></div>
            ))}
          </Card>
          <StageDocs {...props} />
        </div>
        {props.openDoc && <StageDocViewer doc={props.openDoc} onClose={props.onCloseDoc} />}

        {view.flags.length > 0 && (
          <Card title="画布标记（只打标，宿主不强制）">
            <ul className="space-y-0.5 text-[12px] text-amber-600 dark:text-amber-400">
              {view.flags.map((f, i) => <li key={i}>{f.code} · 第 {f.seq} 行 · {f.note}</li>)}
            </ul>
          </Card>
        )}
      </div>
      </div>
    </div>
  )
}
