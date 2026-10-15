import React from 'react'
import { Activity, AlertTriangle, ArrowUpRight, FileText, FlaskConical, GitBranch, History, Layers, Pause, Play, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ControlBar } from './ControlBar'
import { EvidenceMatrix } from './EvidenceMatrix'
import { FocusCard } from './FocusCard'
import { NodeDetail } from './NodeDetail'
import { HypothesisMap } from './HypothesisMap'
import { StageExplanation } from './StageExplanation'
import { ProbeVersions } from './ProbeVersions'
import { ResearchTimeline } from './ResearchTimeline'
import { StageDocViewer, type OpenStageDoc } from './StageDocViewer'
import type { CanvasView, NodeDetailView, NodeSelection } from './canvas-view'
import type { ControlAction } from './controls-view'
import type { WorkbenchEvent } from './workbench-view'
import { CHILD_HINT, ChildCards } from './LivePanel'
import type { ChildCard } from './live-view'
import './research-canvas.css'

export interface ResearchCanvasViewProps {
  view: CanvasView
  detail: NodeDetailView | null
  narrow: boolean
  onSelect: (sel: NodeSelection | null) => void
  selection?: NodeSelection | null
  onClose?: () => void
  onSeq?: (seq: number) => void
  onControl?: (action: ControlAction, text?: string) => void
  onForkAnswer?: (label: string) => void
  busy?: boolean
  error?: string | null
  onChangeSource?: () => void
  onOpenDoc?: (path: string) => void
  openDoc?: OpenStageDoc | null
  onCloseDoc?: () => void
  /** 实时面板（只在实时 run 给）：AI 此刻在做什么 + 自进化 */
  live?: React.ReactNode
  /** 子任务卡：派去做什么、带回了什么 */
  childCards?: ChildCard[]
}

interface WorkbenchUI {
  surface: 'live' | 'probe' | 'map' | 'matrix' | 'children'
  inspector: 'evidence' | 'versions' | 'run'
  mobilePane: 'process' | 'artifact' | 'inspector'
  probeId?: string
  versionPid?: string
  eventSeq?: number
  playing: boolean
}

function StageDocs({ view, onOpenDoc, openDoc, onSeq }: ResearchCanvasViewProps): React.ReactElement {
  return <section aria-label="阶段文档" className="space-y-3 p-3">
    <p className="text-[11px] leading-relaxed text-muted-foreground">阶段文档 · 时间 UTC+08:00{onSeq ? ' · 文件当前版本，不随回放回退' : ' · 文件更新后同步显示'}</p>
    {!view.docs.length ? <p className="py-6 text-[12px] text-muted-foreground">工作目录里还没有文档。阶段产物生成后会出现在这里。</p> :
      <ul className="space-y-2">{view.docs.map((d) => <li key={d.path}>
        <button type="button" className="research-doc w-full" aria-pressed={openDoc?.path === d.path} disabled={!onOpenDoc} onClick={() => onOpenDoc?.(d.path)}>
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0"><span className="block break-all text-[12px] font-medium">{d.path}</span><span className="mt-1 block text-[10px] text-muted-foreground">{d.time}{d.newest ? ' · 最新' : ''}</span></span>
        </button>
      </li>)}</ul>}
  </section>
}

function RunNotes({ view, onSelect, onJump }: Pick<ResearchCanvasViewProps, 'view' | 'onSelect'> & { onJump?: (seq: number) => void }): React.ReactElement {
  return <div className="space-y-5 p-4 text-[12px] leading-relaxed">
    <p className="text-muted-foreground">{view.status.counts}</p>
    <div className="space-y-3" role="group" aria-label="运行状态与结论">{view.cells.map((cell) => <section key={cell.label}>
      <h3 className="mb-1 text-[11px] text-muted-foreground">{cell.label}{cell.label === '科学结论' && ' · 记录中的判断'}</h3><p>{cell.text}</p>
    </section>)}</div>
    <section><h3 className="mb-2 font-medium">阶段报告</h3>{([['已知', view.stage.known], ['未知', view.stage.unknown], ['下一步', view.stage.next]] as const).map(([label, items]) => <div key={label} className="research-stage-section">
      <h4 className="text-[11px] text-muted-foreground">{label}</h4><ul>{(items.length ? items : ['暂无记录']).map((text, i) => <li key={i}>{text}</li>)}</ul>
    </div>)}</section>
    {view.children.length > 0 && <section><h3 className="mb-2 font-medium">子任务</h3><ul className="space-y-2">{view.children.map((child) => <li key={child.name}>
      <button type="button" className="break-all text-left underline underline-offset-4" onClick={() => onSelect({ kind: 'child', id: child.name })}>{child.name}</button><p className="text-muted-foreground">{child.statusLabel}</p>{child.detail && <p className="break-all font-mono text-[11px] text-muted-foreground">{child.detail}</p>}
    </li>)}</ul><p className="mt-2 text-[10px] text-muted-foreground">子任务为当前快照，不随回放回退。</p></section>}
    {view.interventions.length > 0 && <section><h3 className="mb-2 font-medium">人的干预</h3><ul className="space-y-2">{view.interventions.map((entry) => <li key={entry.id}>
      <button type="button" className="text-left underline underline-offset-4" onClick={() => onSelect({ kind: 'intervention', id: entry.id })}>{entry.id} · {entry.kind}</button><p>{entry.text}</p><p className="text-muted-foreground">{entry.status}</p>
    </li>)}</ul></section>}
    {view.timeline.length > 0 && <section><h3 className="mb-2 font-medium">审计注记（当时 / 事后）</h3><ul className="space-y-2">{view.timeline.map((node) => <li key={node.id}>
      <p><span className="font-mono text-muted-foreground">{node.id}</span> {node.title}</p>
      <p className="text-muted-foreground">当时 {node.atTime} · 事后 {node.hindsight} · {onJump ? <button type="button" className="underline underline-offset-4" onClick={() => onJump(node.seq)}>跳到第 {node.seq} 行</button> : `第 ${node.seq} 行`}</p>
    </li>)}</ul><p className="mt-2 text-[10px] text-muted-foreground">审计者事后写的注记，不是运行时记录。</p></section>}
    {!!view.flags.length && <section><h3 className="mb-2 font-medium">画布标记（只打标，宿主不强制）</h3><ul className="space-y-2">{view.flags.map((flag, i) => <li key={i} className="text-amber-700 dark:text-amber-400">{flag.code} · 第 {flag.seq} 行 · {flag.note}</li>)}</ul></section>}
  </div>
}

/** 只认回放时点已登记的实验；选中或固定的是"未来"实验时退回固定的已登记实验或最新一个，不泄露编号 */
export function pickProbe<P extends { pid: string }>(probes: P[], selectedId: string | undefined, pinnedId: string | undefined): P | null {
  const present = (id: string | undefined) => probes.find((p) => p.pid === id)
  return present(selectedId) ?? present(pinnedId) ?? probes.at(-1) ?? null
}

/** 三栏共用同一时点：左侧导航，中间研究产物，右侧证据与版本；新快照不抢焦点。 */
export function ResearchCanvasView(props: ResearchCanvasViewProps): React.ReactElement {
  const { view, detail, narrow, onSelect, onSeq } = props
  const artifactScroll = React.useRef<HTMLDivElement>(null)
  const versionPickerId = React.useId()
  const replay = !!onSeq
  // 换数据源时由调用方用 key 重挂载（ResearchCanvasPane），这里不按标题重置
  const [ui, setUI] = React.useState<WorkbenchUI>({ surface: props.live ? 'live' : 'probe', inspector: 'evidence', mobilePane: 'artifact', playing: false })
  const patch = (value: Partial<WorkbenchUI>) => setUI((prev) => ({ ...prev, ...value }))
  const probes = view.workbench?.probes ?? []
  const probe = pickProbe(probes, props.selection?.kind === 'prereg' ? props.selection.id : undefined, ui.probeId)
  const pid = probe?.pid
  const claimNames = Object.fromEntries(view.claims.map((claim) => [claim.id, claim.name]))
  const events = view.workbench?.events ?? []
  const versions = view.workbench?.versions ?? []
  const versionPids = [...new Set(versions.map((version) => version.pid))]
  const versionPid = ui.versionPid && versionPids.includes(ui.versionPid) ? ui.versionPid : pid ?? versionPids[0]

  React.useEffect(() => {
    if (!ui.playing || !onSeq) return
    if (view.seq >= view.maxSeq) { setUI((prev) => ({ ...prev, playing: false })); return }
    const timer = window.setTimeout(() => onSeq(view.seq + 1), 800)
    return () => window.clearTimeout(timer)
  }, [ui.playing, view.seq, view.maxSeq, onSeq, setUI])

  const select = (selection: NodeSelection | null, reveal = true) => {
    onSelect(selection)
    patch({
      inspector: 'evidence',
      ...(reveal ? { mobilePane: 'inspector' } : {}),
      // 从默认实验检查假设时也固定当前实验，避免新快照抢走正在阅读的产物。
      ...(selection?.kind === 'prereg' ? { probeId: selection.id, versionPid: selection.id } : { probeId: pid }),
    })
  }
  const chooseEvent = (event: WorkbenchEvent) => {
    patch({ playing: false, eventSeq: event.seq, mobilePane: 'artifact', inspector: 'evidence', ...(event.pid ? { surface: 'probe' } : event.hids.length ? { surface: 'map' } : {}) })
    onSeq?.(event.seq)
    if (event.pid) select({ kind: 'prereg', id: event.pid }, false)
    else if (event.hids[0]) select({ kind: 'claim', id: event.hids[0] }, false)
    else select(null, false)
    props.onCloseDoc?.()
  }
  const showSurface = (surface: string) => {
    if (surface !== 'live' && surface !== 'probe' && surface !== 'map' && surface !== 'matrix' && surface !== 'children') return
    props.onCloseDoc?.()
    patch({ surface, mobilePane: 'artifact' })
  }
  const openDoc = (path: string) => { patch({ mobilePane: 'artifact', playing: false }); props.onOpenDoc?.(path) }

  return <div className="research-canvas research-workbench h-full min-w-0 bg-content-area text-foreground titlebar-no-drag">
    <header className="workbench-header">
      <div className="min-w-0"><div className="research-eyebrow">{replay ? '研究回放' : '进行中的研究'}</div><h1 className="mt-1 truncate text-lg font-semibold tracking-tight">{view.title}</h1></div>
      <div className="workbench-status"><span className="workbench-phase" title={view.status.phase}><span className="workbench-phase-dot" />{view.status.phase.replace(/^\S+ /, '')}</span><span>预算 <strong className="font-medium tabular-nums text-foreground">{view.status.budget}</strong></span><span className="workbench-status-mode">{replay ? '回放 · 只读' : view.modeLabel}</span></div>
      <div className="ml-auto flex items-center gap-2">{props.onChangeSource && <Button type="button" variant="outline" size="sm" onClick={props.onChangeSource}>切换记录</Button>}{props.onClose && <Button type="button" variant="ghost" size="icon" className="size-8" onClick={props.onClose} aria-label="关闭研究画布"><X className="size-4" /></Button>}</div>
    </header>
    {(view.integrityNote || props.error) && <div className="border-b border-border px-4 py-2 text-[12px] text-destructive" role="alert"><AlertTriangle className="mr-1 inline size-3" aria-hidden />{view.integrityNote}{props.error ? ` ${props.error}` : ''}</div>}
    {!replay && <div className="workbench-controls"><ControlBar bar={view.controls} onAction={props.onControl} busy={props.busy} /></div>}
    <nav className="workbench-mobile-nav" aria-label="工作台区域">{([['process', '过程与文件'], ['artifact', '研究产物'], ['inspector', '证据与版本']] as const).map(([pane, label]) => <Button key={pane} type="button" size="sm" variant={ui.mobilePane === pane ? 'secondary' : 'ghost'} aria-pressed={ui.mobilePane === pane} onClick={() => patch({ mobilePane: pane })}>{label}</Button>)}</nav>
    <div className="workbench-columns" data-mobile-pane={ui.mobilePane}>
      <aside className="workbench-process" aria-label="研究过程与文件">
        <Tabs defaultValue="events" className="workbench-pane-tabs">
          <div className="workbench-pane-heading"><History className="size-3.5" aria-hidden /><h2>研究过程</h2><span className="ml-auto font-mono text-[10px] text-muted-foreground">{view.seq} / {view.maxSeq}</span></div>
          <TabsList className="workbench-tabs" aria-label="过程导航"><TabsTrigger value="events">研究进展</TabsTrigger><TabsTrigger value="documents">文件 <span className="ml-1 text-muted-foreground">{view.docs.length}</span></TabsTrigger></TabsList>
          <TabsContent value="events" className="workbench-scroll m-0 p-3"><ResearchTimeline events={events} seq={replay ? view.seq : ui.eventSeq ?? view.seq} replay={replay} onEvent={chooseEvent} /></TabsContent>
          <TabsContent forceMount value="documents" className="workbench-scroll m-0 data-[state=inactive]:hidden"><StageDocs {...props} onOpenDoc={props.onOpenDoc ? openDoc : undefined} /></TabsContent>
        </Tabs>
      </aside>
      <main className="workbench-artifact" aria-label="研究产物">
        <Tabs value={props.openDoc ? 'document' : ui.surface} onValueChange={showSurface} className="workbench-pane-tabs">
          <div className="workbench-artifact-bar"><TabsList className="workbench-tabs" aria-label="研究产物视图">{props.live && <TabsTrigger value="live"><Activity className="mr-1.5 size-3.5" aria-hidden />实时</TabsTrigger>}<TabsTrigger value="probe"><FlaskConical className="mr-1.5 size-3.5" aria-hidden />实验对照</TabsTrigger><TabsTrigger value="map"><GitBranch className="mr-1.5 size-3.5" aria-hidden />假设图</TabsTrigger><TabsTrigger value="matrix"><Layers className="mr-1.5 size-3.5" aria-hidden />证据矩阵</TabsTrigger>{!!props.childCards?.length && <TabsTrigger value="children"><Users className="mr-1.5 size-3.5" aria-hidden />子任务 <span className="ml-1 text-muted-foreground">{props.childCards.length}</span></TabsTrigger>}{props.openDoc && <TabsTrigger value="document"><FileText className="mr-1.5 size-3.5" aria-hidden />文档</TabsTrigger>}</TabsList>
            <span className="workbench-revision">记录 #{view.seq}</span>
          </div>
          <div ref={artifactScroll} className="workbench-scroll workbench-artifact-content">
            {['fork', 'paused', 'failed'].includes(view.focus.kind) ?
              <FocusCard focus={view.focus} busy={props.busy} onAnswer={replay ? undefined : props.onForkAnswer} /> :
              <details className="workbench-now">
                <summary><span className="workbench-now-label">当前进展</span><strong>{view.focus.title}</strong><span className="workbench-now-hint">展开说明</span></summary>
                <FocusCard focus={view.focus} busy={props.busy} />
              </details>}
            {view.focus.warnings.length > 0 && !['fork', 'paused', 'failed'].includes(view.focus.kind) && <div className="workbench-caution" role="note"><AlertTriangle className="size-4 shrink-0" aria-hidden /><span>{view.focus.warnings.map((warning) => warning.text).join('；')}</span></div>}
            {props.openDoc ? <TabsContent value="document" className="m-0"><p className="mb-3 text-[11px] text-muted-foreground">当前文件内容{replay ? ' · 不随回放回退，不能作为该时点已经产生的证据' : ' · 文件更新后同步显示'}</p><StageDocViewer doc={props.openDoc} onClose={props.onCloseDoc} autoScroll={false} /></TabsContent> : <>
              <TabsContent forceMount value="probe" className="m-0 space-y-4 data-[state=inactive]:hidden">
                {probes.length > 0 && <div className="workbench-probe-toolbar">
                  <nav aria-label="实验轮次" className="workbench-probe-nav">
                    {probes.map((item) => <button key={item.pid} type="button" aria-pressed={pid === item.pid} onClick={() => {
                      select({ kind: 'prereg', id: item.pid }, false)
                      artifactScroll.current?.scrollTo({ top: 0 })
                    }}><span className="font-mono">{item.pid}</span><span>{item.status === 'pending' ? '待测量' : item.status === 'failed' ? '测量失败' : '已测量'}</span></button>)}
                  </nav>
                  <Button type="button" size="sm" variant="ghost" onClick={() => patch({ inspector: 'versions', versionPid: pid, mobilePane: 'inspector' })}>方案版本<ArrowUpRight className="ml-1 size-3.5" aria-hidden /></Button>
                </div>}
                <StageExplanation probe={probe} probes={probes} events={events} seq={view.seq} claimNames={claimNames}
                  onSelectClaim={(hid) => select({ kind: 'claim', id: hid })}
                  onSelectProbe={(id, reveal) => { select({ kind: 'prereg', id }, reveal); artifactScroll.current?.scrollTo({ top: 0 }) }}
                  onSeq={onSeq ? (seq) => { patch({ playing: false }); onSeq(seq) } : undefined} />
                {view.feedback && <details className="workbench-feedback"><summary>实验如何迭代 <span>查看一次反馈改变</span></summary><ul className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">{view.feedback.map((line, i) => <li key={i}>{line}</li>)}</ul></details>}
              </TabsContent>
              <TabsContent forceMount value="map" className="m-0 data-[state=inactive]:hidden"><section className="research-panel p-4" aria-label="假设与证据"><h2 className="mb-2 text-[13px] font-semibold">假设与证据</h2><p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">{view.derivationNote ?? '连线表示已记录的派生关系；实验支持关系见证据矩阵。'}</p><HypothesisMap claims={view.claims} selectedId={props.selection?.kind === 'claim' ? props.selection.id : undefined} onSelect={select} /></section></TabsContent>
              {props.live && <TabsContent forceMount value="live" className="m-0 data-[state=inactive]:hidden">{props.live}</TabsContent>}
              {!!props.childCards?.length && <TabsContent value="children" className="m-0"><section className="research-panel p-4" aria-label="子任务"><h2 className="text-[13px] font-semibold">子任务 · RLM 子代理</h2><p className="mb-3 mt-1 text-[11px] leading-relaxed text-muted-foreground">{CHILD_HINT}{replay ? ' 子任务为当前快照，不随回放回退。' : ''}</p><ChildCards cards={props.childCards} /></section></TabsContent>}
              <TabsContent forceMount value="matrix" className="m-0 data-[state=inactive]:hidden"><section className="research-panel p-4" aria-label="证据矩阵"><h2 className="mb-4 text-[13px] font-semibold">假设与证据</h2><EvidenceMatrix view={view} narrow={narrow} onSelect={select} /></section></TabsContent>
            </>}
          </div>
        </Tabs>
      </main>
      <aside className="workbench-inspector" aria-label="证据与版本">
        <Tabs value={ui.inspector} onValueChange={(value) => { if (value === 'evidence' || value === 'versions' || value === 'run') patch({ inspector: value }) }} className="workbench-pane-tabs">
          <div className="workbench-pane-heading"><FileText className="size-3.5" aria-hidden /><h2>证据与版本</h2><span className="ml-auto font-mono text-[10px] text-muted-foreground">{props.openDoc ? 'DOC' : (ui.inspector === 'versions' ? versionPid : (detail ? props.selection?.id : undefined) ?? pid) ?? 'RUN'}</span></div>
          <TabsList className="workbench-tabs" aria-label="对象检查"><TabsTrigger value="evidence">证据</TabsTrigger><TabsTrigger value="versions">版本</TabsTrigger><TabsTrigger value="run">开发记录</TabsTrigger></TabsList>
          <TabsContent value="evidence" className="workbench-scroll m-0"><div className="space-y-4 p-3">{detail ? <NodeDetail detail={detail} onClose={() => select(null)} autoScroll={false} /> : <div className="workbench-inspector-guide"><span className="workbench-guide-icon"><FileText className="size-5" aria-hidden /></span><h3>每个判断，都有来处</h3><p>点选假设或实验，沿着证据检查这次判断。</p><ol><li><span>01</span>执行前，预测了什么</li><li><span>02</span>实验实际测到了什么</li><li><span>03</span>判断为什么改变</li></ol>{pid && <Button type="button" variant="outline" size="sm" className="mt-4 w-full" onClick={() => select({ kind: 'prereg', id: pid })}>查看 {pid} 的证据</Button>}</div>}<details className="research-panel p-3"><summary className="cursor-pointer text-[11px] text-muted-foreground">记录状态与科学结论</summary><div className="mt-3 space-y-3">{view.cells.map((cell) => <p key={cell.label} className="text-[12px] leading-relaxed"><span className="block text-[10px] text-muted-foreground">{cell.label}</span>{cell.text}</p>)}</div></details></div></TabsContent>
          <TabsContent value="versions" className="workbench-scroll m-0 p-3">
            {versionPids.length > 0 && <div className="mb-4 flex items-center gap-2 text-xs"><label htmlFor={versionPickerId}>方案</label><select id={versionPickerId} className="workbench-select min-w-0" value={versionPid ?? ''} onChange={(event) => patch({ versionPid: event.target.value })}>{versionPids.map((id) => <option key={id} value={id}>{id}</option>)}</select></div>}
            <ProbeVersions versions={versions} pid={versionPid} />
          </TabsContent>
          <TabsContent forceMount value="run" className="workbench-scroll m-0 data-[state=inactive]:hidden"><RunNotes view={view} onSelect={select} {...(onSeq ? { onJump: (seq: number) => { patch({ playing: false }); onSeq(seq) } } : {})} /></TabsContent>
        </Tabs>
      </aside>
    </div>
    <footer className="workbench-footer">{replay ? <>
      <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={ui.playing ? '暂停回放' : '播放研究回放'} disabled={view.maxSeq < 1} onClick={() => { if (!ui.playing && view.seq >= view.maxSeq) onSeq(1); patch({ playing: !ui.playing }) }}>{ui.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>
      <input type="range" min={view.maxSeq ? 1 : 0} max={view.maxSeq} value={view.seq} onChange={(event) => { patch({ playing: false }); onSeq(Number(event.target.value)) }} className="min-w-0 flex-1 accent-primary" aria-label="回放到运行记录第几行" disabled={view.maxSeq < 1} />
      <span className="shrink-0 font-mono text-[10px] tabular-nums">第 {view.seq} / {view.maxSeq} 行</span>
    </> : <><span className="size-1.5 rounded-full bg-primary" aria-hidden /><span className="truncate">{view.status.latest ?? '等待下一条研究记录'}</span><span className="ml-auto shrink-0">{view.status.next}</span></>}</footer>
  </div>
}
