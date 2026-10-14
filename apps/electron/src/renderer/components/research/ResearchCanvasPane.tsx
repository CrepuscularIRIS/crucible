import React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import type { Annotations, ResearchRecord } from '@proma/shared/research-record'

import { researchCanvasSourceMapAtom, type ResearchCanvasSource } from '@/atoms/research-atoms'
import { agentChannelIdAtom, agentSessionChannelMapAtom, agentSessionsAtom } from '@/atoms/agent-atoms'
import type { ResearchArchiveEntry, ResearchControlView, ResearchInterveneResult, ResearchRecordSnapshot } from '@/types/research-record'
import { ArchivePicker } from './ArchivePicker'
import { ResearchCanvasView } from './ResearchCanvasView'
import { canvasView, nodeDetail, type NodeSelection } from './canvas-view'
import type { ControlAction } from './controls-view'
import { annotationsFromFiles, latestTicket, recordFromFiles, researchBridge } from './research-bridge'
import { SAMPLE_RUN } from './sample-run'

interface Loaded {
  record: ResearchRecord
  annotations: Annotations | null
  control: ResearchControlView | null
  label: string
  integrity: ResearchRecordSnapshot['integrity'] | null
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** 面板宽度：窄于 420px 时矩阵转纵向列表（04 §3.9） */
function useNarrow(el: HTMLDivElement | null): boolean {
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? 999) < 420))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return narrow
}

/**
 * 研究画布容器（04 §3，轨道 U）：选数据源、拉快照 / 订阅推送、执行控制的发送计划。
 * - 实时：会话 cwd 下有 run 目录（R1 getResearchRecord 非空）。
 * - 回放：白名单归档（R1）或随应用打包的示例 run（无需主进程）。
 * R1 缺失时只读回放；控制按钮由 controls-view 隐藏。
 */
export function ResearchCanvasPane({ sessionId, onClose }: { sessionId: string; onClose: () => void }): React.ReactElement {
  const [sourceMap, setSourceMap] = useAtom(researchCanvasSourceMapAtom)
  const sessions = useAtomValue(agentSessionsAtom)
  const channelMap = useAtomValue(agentSessionChannelMapAtom)
  const defaultChannelId = useAtomValue(agentChannelIdAtom)
  const source = sourceMap.get(sessionId)
  const bridge = React.useMemo(researchBridge, [])
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [archives, setArchives] = React.useState<ResearchArchiveEntry[] | null>(null)
  const [seq, setSeq] = React.useState<number | undefined>(undefined)
  const [selection, setSelection] = React.useState<NodeSelection | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const pendingAsk = React.useRef<string | null>(null)
  const [rootEl, setRootEl] = React.useState<HTMLDivElement | null>(null)
  const narrow = useNarrow(rootEl)
  /** 只在首次打开时自动切到实时 run；用户点"换一个"后留在选择器 */
  const autoLive = React.useRef(true)
  /** 换数据源或新快照到达时作废在途的解析 */
  const ticket = React.useMemo(latestTicket, [])

  const setSource = React.useCallback((next: ResearchCanvasSource | null) => {
    setSourceMap((prev) => { const map = new Map(prev); if (next) map.set(sessionId, next); else map.delete(sessionId); return map })
    ticket()
    setLoaded(null); setSeq(undefined); setSelection(null); setError(null)
  }, [sessionId, setSourceMap, ticket])

  const applySnapshot = React.useCallback(async (snapshot: ResearchRecordSnapshot, label: string) => {
    const current = ticket()
    const record = await recordFromFiles(snapshot.files)
    if (!current()) return
    setLoaded({ record, annotations: annotationsFromFiles(snapshot.files), control: snapshot.control, label, integrity: snapshot.integrity })
  }, [ticket])

  // getResearchRecord 在主进程开了轮询：面板卸载 / 换会话即释放（M-5）
  React.useEffect(() => () => { void bridge.releaseResearchRecord?.(sessionId).catch(() => undefined) }, [bridge, sessionId])

  // 没选数据源：有实时 run 就用实时，否则显示归档选择器
  React.useEffect(() => {
    if (source) return
    let cancelled = false
    const probe = autoLive.current && bridge.getResearchRecord ? bridge.getResearchRecord(sessionId) : Promise.resolve(null)
    probe.then((snap) => { if (!cancelled && snap) setSource({ kind: 'live' }) }, () => undefined)
    if (bridge.listResearchArchives) bridge.listResearchArchives(sessionId).then((a) => { if (!cancelled) setArchives(a) }, () => setArchives(null))
    return () => { cancelled = true }
  }, [bridge, sessionId, source, setSource])

  // 载入所选数据源；实时模式订阅推送
  React.useEffect(() => {
    if (!source) return
    let cancelled = false
    const guard = (p: Promise<void>) => p.catch((e) => { if (!cancelled) setError(`载入失败：${message(e)}`) })
    if (source.kind === 'sample') {
      void guard(recordFromFiles(SAMPLE_RUN.files).then((record) => {
        if (!cancelled) setLoaded({ record, annotations: null, control: null, label: SAMPLE_RUN.path, integrity: null }) // 注记不打包（M-3）
      }))
      return () => { cancelled = true }
    }
    if (source.kind === 'archive') {
      if (bridge.openResearchArchive) void guard(bridge.openResearchArchive(source.path, sessionId).then((snap) => { if (!cancelled) return applySnapshot(snap, source.path) }))
      return () => { cancelled = true }
    }
    if (bridge.getResearchRecord) {
      void guard(bridge.getResearchRecord(sessionId).then((snap) => { if (!cancelled && snap) return applySnapshot(snap, snap.root) }))
    }
    const off = bridge.onResearchRecordChanged?.((event) => {
      if (cancelled || event.sessionId !== sessionId || !event.snapshot) return
      void guard(applySnapshot(event.snapshot, event.snapshot.root))
    })
    return () => { cancelled = true; off?.() }
  }, [applySnapshot, bridge, sessionId, source])

  const live = source?.kind === 'live'
  const view = React.useMemo(() => loaded && canvasView(loaded.record, {
    ...(live ? {} : { seq }),
    mode: live ? 'live' : 'replay',
    source: loaded.label,
    bridge: live && typeof bridge.interveneResearch === 'function',
    control: loaded.control,
    annotations: loaded.annotations,
    hostIntegrity: loaded.integrity,
  }), [bridge, live, loaded, seq])
  const detail = React.useMemo(
    () => (loaded && view && selection ? nodeDetail(loaded.record, selection, view.seq, loaded.annotations) : null),
    [loaded, selection, view],
  )

  /** 执行主进程给的发送计划：只用现有发送 API（04 §3.7"谁发消息"） */
  const execute = React.useCallback(async (result: ResearchInterveneResult) => {
    if (result.stop) await window.electronAPI.stopAgent(sessionId)
    if (!result.send) return
    if (result.send.mode === 'queue') {
      // 竞态：会话刚结束时 queueMessage 抛"会话未运行"——不当错误，主进程据 agentRunning=false 推出 PAUSED
      await window.electronAPI.queueAgentMessage({ sessionId, userMessage: result.send.text }).catch(() => undefined)
      return
    }
    const meta = sessions.find((s) => s.id === sessionId)
    const channelId = meta?.channelId ?? channelMap.get(sessionId) ?? defaultChannelId
    if (!channelId) throw new Error('找不到会话的模型渠道，无法发起新一轮')
    await window.electronAPI.sendAgentMessage({ sessionId, userMessage: result.send.text, channelId, modelId: meta?.modelId, workspaceId: meta?.workspaceId })
  }, [channelMap, defaultChannelId, sessionId, sessions])

  const intervene = React.useCallback(async (input: Omit<Parameters<NonNullable<typeof bridge.interveneResearch>>[0], 'sessionId'>) => {
    if (!bridge.interveneResearch) return
    setBusy(true); setError(null)
    try {
      const result = await bridge.interveneResearch({ sessionId, ...input })
      if (result.askAfterPause && input.text) pendingAsk.current = input.text
      setLoaded((prev) => (prev ? { ...prev, control: result.control } : prev))
      await execute(result)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }, [bridge, execute, sessionId])

  // "问"先暂停：停到 PAUSED 后自动发出排队的问题
  React.useEffect(() => {
    if (loaded?.control?.state !== 'PAUSED' || !pendingAsk.current) return
    const text = pendingAsk.current
    pendingAsk.current = null
    void intervene({ kind: 'ask', text })
  }, [intervene, loaded?.control?.state])

  const onControl = React.useCallback((action: ControlAction, text?: string) => {
    void intervene({ kind: action, ...(text ? { text } : {}), ...(selection ? { affects: [selection.id] } : {}) })
  }, [intervene, selection])

  const openForkId = loaded?.record.interventions?.findLast((i) => i.kind === 'fork_open')?.fork?.id
  const onForkAnswer = React.useCallback((label: string) => {
    void intervene({ kind: 'fork_answer', ...(openForkId ? { forkId: openForkId } : {}), chosen: label })
  }, [intervene, openForkId])

  if (!source) return <ArchivePicker archives={bridge.listResearchArchives ? archives : null} onPick={setSource} onClose={onClose} />
  if (!view) {
    return (
      <div className="flex h-full flex-col items-start gap-2 bg-content-area p-3 text-[13px] text-muted-foreground titlebar-no-drag">
        <p>{error ?? '正在载入研究记录…'}</p>
        <button type="button" className="text-[12px] underline" onClick={() => { autoLive.current = false; setSource(null) }}>换一个数据源</button>
      </div>
    )
  }
  const forkAnswerable = live && loaded?.control?.state !== 'AWAIT_USER' && loaded?.control?.state !== 'PAUSING' && !!bridge.interveneResearch
  return (
    <div ref={setRootEl} className="h-full" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') setSelection(null) }}>
      <ResearchCanvasView
        view={view}
        detail={detail}
        narrow={narrow}
        onSelect={setSelection}
        onClose={onClose}
        busy={busy}
        error={error}
        onChangeSource={() => { autoLive.current = false; setSource(null) }}
        {...(live ? { onControl, ...(forkAnswerable ? { onForkAnswer } : {}) } : { onSeq: setSeq })}
      />
    </div>
  )
}
