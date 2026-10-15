import React from 'react'
import { useAtomValue } from 'jotai'
import type { AgentRefineState } from '@proma/shared'

import { agentLiveMessagesAtomFamily, agentSessionStreamingStateAtomFamily } from '@/atoms/agent-atoms'
import { Button } from '@/components/ui/button'
import { useRefineState } from '../agent/use-refine-state'
import { REFINE_MODES } from '../agent/refine-view'
import { liveActions, liveSaying, type ChildCard, type LiveAction } from './live-view'

const CHILD_STATUS: Record<ChildCard['status'], [string, string]> = {
  running: ['进行中', 'text-sky-600 dark:text-sky-400'],
  ok: ['完成', 'text-emerald-600 dark:text-emerald-400'],
  blocked: ['受阻', 'text-amber-600 dark:text-amber-400'],
  failed: ['失败', 'text-destructive'],
  nonconforming: ['未按契约收尾', 'text-amber-600 dark:text-amber-400'],
}
const ACTION_DOT: Record<LiveAction['status'], string> = { running: 'bg-sky-500 animate-pulse', ok: 'bg-emerald-500', error: 'bg-destructive', stopped: 'bg-muted-foreground/40' }
const ACTION_STATUS: Record<LiveAction['status'], string> = { running: '进行中', ok: '完成', error: '出错', stopped: '未返回' }
export const CHILD_HINT = '每个子任务在独立上下文里只做一件事，写回 out.md；主 agent 是唯一能改研究记录的一方。'

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}
const hhmm = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '')

/** 会话的运行态 + 本轮消息；运行中每秒走一次表 */
function useLiveAgent(sessionId: string) {
  const stream = useAtomValue(agentSessionStreamingStateAtomFamily(sessionId))
  const messages = useAtomValue(agentLiveMessagesAtomFamily(sessionId))
  const running = !!stream?.running
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const actions = React.useMemo(() => liveActions(messages, running), [messages, running])
  const saying = React.useMemo(() => liveSaying(messages), [messages])
  const status = !stream ? '空闲' : stream.retrying ? '模型重试中' : stream.isCompacting ? '正在压缩上下文' : running ? '正在工作' : stream.backgroundWaiting ? '等后台任务' : '空闲'
  return { running, status, elapsed: running && stream?.startedAt ? clock(now - stream.startedAt) : '', model: stream?.model, actions, saying }
}

/** 归档不能借用宿主会话的实时状态。 */
export function LiveStrip({ sessionId, sourceKind = 'live' }: { sessionId: string; sourceKind?: 'live' | 'archive' | 'sample' }): React.ReactElement {
  if (sourceKind !== 'live') return <div className="flex-1 text-[12px] text-muted-foreground">{sourceKind === 'archive' ? '归档回放' : '示例回放'} · 只读记录</div>
  return <SessionLiveStrip sessionId={sessionId} />
}

function SessionLiveStrip({ sessionId }: { sessionId: string }): React.ReactElement {
  const live = useLiveAgent(sessionId)
  const last = live.actions.at(-1)
  return <div className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-muted-foreground" role="status" aria-live="polite">
    <span className={`size-2 shrink-0 rounded-full ${live.running ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden />
    <span className="shrink-0 text-foreground">AI {live.status}</span>
    {live.elapsed && <span className="shrink-0 tabular-nums">{live.elapsed}</span>}
    {live.running && last && <span className="min-w-0 truncate">· {last.label}{last.detail ? `：${last.detail}` : ''}</span>}
  </div>
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): React.ReactElement {
  return <section className="research-panel p-4">
    <h2 className="text-[13px] font-semibold">{title}</h2>
    {hint && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    <div className="mt-3">{children}</div>
  </section>
}

export function ChildCards({ cards }: { cards: ChildCard[] }): React.ReactElement {
  if (!cards.length) return <p className="text-[12px] text-muted-foreground">还没有派出子任务。主 agent 用 research_kit.new_job + rlm 派出后，这里出现任务卡。</p>
  const running = cards.filter((c) => c.status === 'running').length
  return <div className="space-y-2">
    <p className="text-[11px] text-muted-foreground">共 {cards.length} 个 · 进行中 {running} · 完成 {cards.filter((c) => c.status === 'ok').length} · 受阻或异常 {cards.filter((c) => c.status !== 'ok' && c.status !== 'running').length}</p>
    {[...cards].reverse().map((c) => {
      const [label, tone] = CHILD_STATUS[c.status]
      return <details key={c.name} className="rounded-md border border-border/60 p-3">
        <summary className="cursor-pointer list-none">
          <div className="flex items-baseline gap-2"><span className={`shrink-0 text-[11px] ${tone}`}>{label}</span><span className="min-w-0 text-[12px] font-medium">{c.task}</span></div>
          {c.finding ? <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">带回：{c.finding}</p> : c.status === 'running' && <p className="mt-1.5 text-[11px] text-muted-foreground">在独立窗口里工作，返回后显示结论</p>}
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{c.name} · 点开看任务书与完整回报</p>
        </summary>
        {c.brief && <><h3 className="mt-3 text-[11px] text-muted-foreground">任务书 brief.md</h3><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">{c.brief}</pre></>}
        {c.out && <><h3 className="mt-3 text-[11px] text-muted-foreground">回报 out.md</h3><pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">{c.out}</pre></>}
      </details>
    })}
  </div>
}

function RefineLog({ sessionId, running }: { sessionId: string; running: boolean }): React.ReactElement {
  const { state, error, refresh } = useRefineState(sessionId, running)
  if (error) return <div role="status" className="space-y-2 text-[12px]"><p>{error}</p><Button variant="outline" size="sm" onClick={refresh}>重试读取经验</Button></div>
  if (!state) return <p className="text-[12px] text-muted-foreground">读取中…</p>
  return <RefineHistory state={state} />
}

export function RefineHistory({ state }: { state: AgentRefineState }): React.ReactElement {
  if (!state.resident) return <p className="text-[12px] text-muted-foreground">会话已释放，历史经验读取尚未接入；这不表示没有保存经验，也无需为查看历史重新运行模型。</p>
  const recent = state.harness?.recent ?? []
  const arm = state.arm
  return <div className="space-y-3 text-[12px]">
    {arm && <p className={arm.contaminated ? 'text-destructive' : 'text-muted-foreground'}>经验策略：{REFINE_MODES[arm.mode] ?? '策略未确认'}{arm.contaminated ? ' · 本运行已标记干预或污染，原因需查审计记录；不能作为纯自动学习对照' : ''}</p>}
    {recent.length === 0
      ? <p className="text-muted-foreground">当前没有返回经验记录。{arm?.mode === 'frozen' ? '冻结策略不允许提炼更新。' : ''}</p>
      : <ol className="space-y-3">{recent.map((r, i) => <li key={`${r.ts}-${i}`} className="rounded-md border border-border/60 p-3">
        <p className="mb-1 text-[10px] text-muted-foreground">提炼记录 · 验证与回滚状态未接入</p><p className="font-medium">{r.summary}</p>
        {r.rationale && <p className="mt-1 leading-relaxed text-muted-foreground">为什么：{r.rationale}</p>}
        {!!r.edits?.length && <ul className="mt-2 space-y-1">{r.edits.map((e, j) => <li key={j} className="text-[11px]"><span className="text-muted-foreground">{e.action ?? '改'} {e.kind}</span> {e.title ?? e.id}</li>)}</ul>}
        <p className="mt-1 text-[10px] text-muted-foreground">{hhmm(r.ts)}</p>
      </li>)}</ol>}
  </div>
}

/** 实时面板：AI 此刻在做什么、子任务（RLM 子代理）派去做什么 / 带回了什么、自进化学到了什么 */
export function LivePanel({ sessionId, childJobs }: {
  sessionId: string
  /** undefined = 不显示子任务段（工作台另有子任务 tab）；null = 记录还没建立 */
  childJobs?: ChildCard[] | null
}): React.ReactElement {
  const live = useLiveAgent(sessionId)
  return <div className="space-y-4">
    <Section title="AI 此刻">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className="flex items-center gap-2 font-medium"><span className={`size-2 rounded-full ${live.running ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden />{live.status}</span>
        {live.elapsed && <span className="tabular-nums text-muted-foreground">本轮已运行 {live.elapsed}</span>}
        {live.model && <span className="text-muted-foreground">{live.model}</span>}
      </div>
      {live.saying && <blockquote className="mt-3 border-l-2 border-border pl-3 text-[12px] leading-relaxed text-muted-foreground">{live.saying}</blockquote>}
      {live.actions.length > 0
        ? <ol className="mt-3 space-y-1.5" aria-label="最近动作">{[...live.actions].reverse().map((a) => <li key={a.id} className="flex items-baseline gap-2 text-[12px]">
          <span className={`size-1.5 shrink-0 translate-y-[-1px] rounded-full ${ACTION_DOT[a.status]}`} aria-hidden /><span className="shrink-0 text-[10px] text-muted-foreground">{ACTION_STATUS[a.status]}</span>
          <span className="shrink-0">{a.label}</span><span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{a.detail}</span>
        </li>)}</ol>
        : <p className="mt-3 text-[12px] text-muted-foreground">{live.running ? '等待第一个动作…' : '本轮没有进行中的动作。页面打开后开始的动作会出现在这里。'}</p>}
    </Section>
    {childJobs !== undefined && <Section title="子任务 · RLM 子代理" hint={CHILD_HINT}>
      {childJobs ? <ChildCards cards={childJobs} /> : <p className="text-[12px] text-muted-foreground">研究记录建立后显示。</p>}
    </Section>}
    <Section title="操作经验 · Refine 记录" hint="记录提炼原因与改动；是否有效、是否已回滚须结合验证记录，不能仅凭生成成功判断。">
      <RefineLog sessionId={sessionId} running={live.running} />
    </Section>
  </div>
}
