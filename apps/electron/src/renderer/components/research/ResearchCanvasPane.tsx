import React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import type { Annotations, ResearchRecord } from '@proma/shared/research-record'

import { researchCanvasSourceMapAtom, type ResearchCanvasSource } from '@/atoms/research-atoms'
import { agentChannelIdAtom, agentSessionChannelMapAtom, agentSessionsAtom } from '@/atoms/agent-atoms'
import type { ResearchArchiveEntry, ResearchControlView, ResearchInterveneResult, ResearchRecordSnapshot, ResearchWorkdir } from '@/types/research-record'
import { ArchivePicker } from './ArchivePicker'
import { ResearchCanvasView } from './ResearchCanvasView'
import { canvasView, nodeDetail, type NodeSelection } from './canvas-view'
import type { ControlAction } from './controls-view'
import { annotationsFromFiles, latestTicket, recordFromFiles, researchBridge } from './research-bridge'
import { SAMPLE_RUN } from './sample-run'
import { LivePanel } from './LivePanel'
import { childCards, type ChildCard } from './live-view'
import type { OpenStageDoc } from './StageDocViewer'

interface Loaded {
  record: ResearchRecord
  annotations: Annotations | null
  control: ResearchControlView | null
  label: string
  integrity: ResearchRecordSnapshot['integrity'] | null
  workdir: ResearchWorkdir | null
  budgetTotal?: number
  k0?: string
  /** 子任务卡（brief / out 原文）；快照里的文件不随回放回退 */
  children: ChildCard[]
}

/** 打开中的阶段文档 + 读到时的版本 mtime:size（快照里版本变了就重读） */
type OpenDocState = OpenStageDoc & { version?: string }

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
  const [pendingIntake, setPendingIntake] = React.useState<string | null>(null)
  const [seq, setSeq] = React.useState<number | undefined>(undefined)
  const [selection, setSelection] = React.useState<NodeSelection | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [openDoc, setOpenDoc] = React.useState<OpenDocState | null>(null)
  const pendingAsk = React.useRef<string | null>(null)
  const [rootEl, setRootEl] = React.useState<HTMLDivElement | null>(null)
  const narrow = useNarrow(rootEl)
  /** 只在首次打开时自动切到实时 run；用户点"换一个"后留在选择器 */
  const autoLive = React.useRef(true)
  /** 换数据源或新快照到达时作废在途的解析 */
  const ticket = React.useMemo(latestTicket, [])
  const pendingTicket = React.useMemo(latestTicket, [])

  const setSource = React.useCallback((next: ResearchCanvasSource | null) => {
    setSourceMap((prev) => { const map = new Map(prev); if (next) map.set(sessionId, next); else map.delete(sessionId); return map })
    ticket()
    setLoaded(null); setSeq(undefined); setSelection(null); setError(null); setOpenDoc(null)
  }, [sessionId, setSourceMap, ticket])

  const applySnapshot = React.useCallback(async (snapshot: ResearchRecordSnapshot, label: string) => {
    const current = ticket()
    const record = await recordFromFiles(snapshot.files)
    if (!current()) return
    setLoaded({
      record, annotations: annotationsFromFiles(snapshot.files), control: snapshot.control, label, integrity: snapshot.integrity,
      workdir: snapshot.workdir ?? null, children: childCards(record.childJobs, snapshot.files),
      ...(snapshot.budgetTotal !== undefined ? { budgetTotal: snapshot.budgetTotal } : {}),
      ...(snapshot.files['K0-intake.md'] !== undefined ? { k0: snapshot.files['K0-intake.md'] } : {}),
    })
  }, [ticket])

  // getResearchRecord 在主进程开了轮询：面板卸载 / 换会话即释放（M-5）
  React.useEffect(() => () => { void bridge.releaseResearchRecord?.(sessionId).catch(() => undefined) }, [bridge, sessionId])

  // 没选数据源：有实时 run 就用实时，否则显示归档选择器
  React.useEffect(() => {
    if (source) return
    let cancelled = false
    const probe = autoLive.current && bridge.getResearchRecord ? bridge.getResearchRecord(sessionId) : Promise.resolve(null)
    probe.then((snap) => { if (!cancelled && snap) setSource({ kind: 'live' }) }, () => undefined)
    // K0 阶段还没有 run 目录：显示 agent 写的开局草稿（只读），草稿出现 / 改写时主进程推 null 快照，据此重读
    setPendingIntake(null)
    const readPending = () => {
      const current = pendingTicket()
      void bridge.getResearchPendingIntake?.(sessionId).then((text) => { if (!cancelled && current()) setPendingIntake(text) }, () => undefined)
    }
    readPending()
    // 画布先于 research_init 打开：run 目录一出现，推送到达即切到实时
    const off = bridge.onResearchRecordChanged?.((event) => {
      if (cancelled || event.sessionId !== sessionId) return
      if (!event.snapshot) return readPending()
      // run 已建立（草稿已收进 run）：即使用户留在选择器，也不再显示"等待你确认"
      pendingTicket()
      setPendingIntake(null)
      if (autoLive.current) setSource({ kind: 'live' })
    })
    if (bridge.listResearchArchives) bridge.listResearchArchives(sessionId).then((a) => { if (!cancelled) setArchives(a) }, () => setArchives(null))
    return () => { cancelled = true; off?.() }
  }, [bridge, pendingTicket, sessionId, source, setSource])

  // 载入所选数据源；实时模式订阅推送
  React.useEffect(() => {
    if (!source) return
    let cancelled = false
    const guard = (p: Promise<void>) => p.catch((e) => { if (!cancelled) setError(`载入失败：${message(e)}`) })
    if (source.kind === 'sample') {
      void guard(recordFromFiles(SAMPLE_RUN.files).then((record) => {
        if (!cancelled) setLoaded({ record, annotations: null, control: null, label: SAMPLE_RUN.path, integrity: null, workdir: null, children: childCards(record.childJobs, SAMPLE_RUN.files) }) // 注记不打包（M-3）
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
  // 没绑项目的会话共用 $HOME，"最近活动的 run"可能属于别的会话：只看不控（暂停 / 问 / 分叉回答写进那个 run）
  const sharedHome = !sessions.find((s) => s.id === sessionId)?.workspaceId
  const view = React.useMemo(() => loaded && canvasView(loaded.record, {
    ...(live ? {} : { seq }),
    mode: live ? 'live' : 'replay',
    source: loaded.label,
    bridge: live && typeof bridge.interveneResearch === 'function',
    ...(sharedHome ? { readOnly: '这个会话没绑项目，与别的会话共用主目录：画布只看不控，暂停或提问请在对话里发。' } : {}),
    control: loaded.control,
    annotations: loaded.annotations,
    hostIntegrity: loaded.integrity,
    workdir: loaded.workdir,
    ...(loaded.budgetTotal !== undefined ? { budgetTotal: loaded.budgetTotal } : {}),
    ...(loaded.k0 !== undefined ? { k0: loaded.k0 } : {}),
  }), [bridge, live, loaded, seq, sharedHome])

  // 阶段文档：实时 run 读会话 cwd 下的工作目录，归档读归档里的；示例 run 没有
  const canReadDocs = typeof bridge.readResearchStageDoc === 'function' && (source?.kind === 'live' || source?.kind === 'archive')
  const archivePath = source?.kind === 'archive' ? source.path : undefined
  /** 文档版本 = mtime:size（同一毫秒内截断再写，size 也会变） */
  const docVersion = (path: string) => {
    const d = loaded?.workdir?.docs.find((x) => x.path === path)
    return d ? `${d.mtimeMs}:${d.size}` : undefined
  }
  const fetchDoc = React.useCallback((path: string) => {
    const read = bridge.readResearchStageDoc
    if (!read) return
    read({ sessionId, path, ...(archivePath ? { archivePath } : {}) }).then(
      (doc) => setOpenDoc((cur) => (cur?.path === path ? { path, time: cur.time, text: doc.text, version: `${doc.mtimeMs}:${doc.size}` } : cur)),
      // 保留 version：文档之后再变仍会重读
      (e) => setOpenDoc((cur) => (cur?.path === path ? { path, time: cur.time, error: `读取失败：${message(e)}`, ...(cur.version ? { version: cur.version } : {}) } : cur)),
    )
  }, [archivePath, bridge, sessionId])
  const onOpenDoc = React.useCallback((path: string) => {
    const time = view?.docs.find((d) => d.path === path)?.time
    const version = docVersion(path)
    setOpenDoc({ path, ...(time ? { time } : {}), ...(version ? { version } : {}) })
    fetchDoc(path)
  }, [fetchDoc, view])
  // 运行中 agent 改写了打开着的文档 → 快照里版本变了，重读（旧文本留着，读完再换，不闪）
  const openPath = openDoc?.path
  const openVersion = openDoc?.version
  const latestVersion = openPath ? docVersion(openPath) : undefined
  React.useEffect(() => {
    if (!openPath || latestVersion === undefined || latestVersion === openVersion) return
    const time = view?.docs.find((d) => d.path === openPath)?.time
    setOpenDoc((cur) => (cur?.path === openPath ? { ...cur, ...(time ? { time } : {}), version: latestVersion } : cur))
    fetchDoc(openPath)
  }, [fetchDoc, latestVersion, openVersion, openPath, view])
  const detail = React.useMemo(
    () => (loaded && view && selection ? nodeDetail(loaded.record, selection, view.seq, loaded.annotations) : null),
    [loaded, selection, view],
  )
  const resolveDetail = React.useCallback(
    (sel: NodeSelection) => (loaded && view ? nodeDetail(loaded.record, sel, view.seq, loaded.annotations) : null),
    [loaded, view],
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

  if (!source) return <ArchivePicker archives={bridge.listResearchArchives ? archives : null} pendingIntake={pendingIntake} onPick={setSource} onClose={onClose} live={<LivePanel sessionId={sessionId} childJobs={null} />} />
  if (!view) {
    return (
      <div className="flex h-full flex-col items-start gap-2 bg-content-area p-3 text-[13px] text-muted-foreground titlebar-no-drag">
        <p>{error ?? '正在载入研究记录…'}</p>
        <button type="button" className="text-[12px] underline" onClick={() => { autoLive.current = false; setSource(null) }}>换一个数据源</button>
      </div>
    )
  }
  const controllable = live && !sharedHome
  const forkAnswerable = controllable && loaded?.control?.state !== 'AWAIT_USER' && loaded?.control?.state !== 'PAUSING' && !!bridge.interveneResearch
  return (
    <div ref={setRootEl} className="h-full" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') setSelection(null) }}>
      <ResearchCanvasView
        // 换数据源（含实时 run 根目录变化）时重挂载，工作台 UI 状态不跨 run 共享
        key={`${source.kind}:${loaded?.label ?? ''}`}
        view={view}
        detail={detail}
        narrow={narrow}
        onSelect={setSelection}
        selection={selection}
        onClose={onClose}
        busy={busy}
        error={error}
        onChangeSource={() => { autoLive.current = false; setSource(null) }}
        openDoc={openDoc}
        onCloseDoc={() => setOpenDoc(null)}
        live={live ? <LivePanel sessionId={sessionId} /> : undefined}
        childCards={loaded?.children ?? []}
        resolveDetail={resolveDetail}
        {...(canReadDocs ? { onOpenDoc } : {})}
        {...(live ? (controllable ? { onControl, ...(forkAnswerable ? { onForkAnswer } : {}) } : {}) : { onSeq: setSeq })}
      />
    </div>
  )
}
