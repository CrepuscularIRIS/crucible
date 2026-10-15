import React from 'react'
import { useAtomValue } from 'jotai'
import type { AgentRefineState } from '@proma/shared'

import { agentLiveMessagesAtomFamily, agentSessionStreamingStateAtomFamily } from '@/atoms/agent-atoms'
import { Button } from '@/components/ui/button'
import { useRefineState } from '../agent/use-refine-state'
import { REFINE_MODES, REFINE_NOT_RESIDENT } from '../agent/refine-view'
import { childTaskLabel, liveActions, liveSaying, type ChildCard, type LiveAction } from './live-view'

const CHILD_STATUS: Record<ChildCard['status'], [string, string]> = {
  running: ['未见回报', 'text-muted-foreground'],
  ok: ['完成', 'text-emerald-600 dark:text-emerald-400'],
  blocked: ['受阻', 'text-amber-600 dark:text-amber-400'],
  failed: ['失败', 'text-destructive'],
  nonconforming: ['未按契约收尾', 'text-amber-600 dark:text-amber-400'],
}
const ACTION_DOT: Record<LiveAction['status'], string> = { running: 'bg-sky-500 animate-pulse', ok: 'bg-emerald-500', error: 'bg-destructive', stopped: 'bg-muted-foreground/40' }
const ACTION_STATUS: Record<LiveAction['status'], string> = { running: '进行中', ok: '完成', error: '出错', stopped: '未返回' }
export const CHILD_HINT = 'RLM 用独立上下文分工，主 agent 负责提交研究记录。这里展示任务文件；父会话代做须另行区分，文件存在不等于独立执行已验证。'

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
  const unreported = cards.filter((c) => c.status === 'running').length
  return <div className="space-y-2">
    <p className="text-[11px] text-muted-foreground">共 {cards.length} 个 · 未见回报 {unreported} · 完成 {cards.filter((c) => c.status === 'ok').length} · 受阻或异常 {cards.filter((c) => c.status !== 'ok' && c.status !== 'running').length}</p>
    <div className="research-story-intro"><span>分工与复查 · RLM</span><h3>派出去做什么，带回来什么，下一步改了什么？</h3><p>回报是一份建议；是否被采纳，要继续核对主研究员的实验与判断记录。卡片序号为展示顺序，不是派发时间。</p></div>
    {[...cards].reverse().map((c, i) => {
      const [label, tone] = CHILD_STATUS[c.status]
      return <article key={c.name} className="research-story-card">
        <header className="research-story-heading"><span className="research-story-index" aria-hidden>{String(cards.length - i).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className="research-story-kicker">{c.selfReviewed ? '父会话代做 · 自审记录' : '任务记录'}</p><h3>{childTaskLabel(c.task)}</h3></div><span className={`text-[11px] ${tone}`}>{label}</span></header>
        <ol className="research-story-chain">
          <li><span className="research-story-step">01 · 任务</span><h4>请它解决什么</h4><p>{c.task}</p><small>{c.brief ? '任务书可在下方展开核对' : '未读取到任务书，标题不能代替完整指令'}</small></li>
          <li><span className="research-story-step">02 · 回报</span><h4>它带回了什么</h4>{c.finding ? <p>带回：{c.finding}</p> : <p>{c.out ? '已有回报文件，未提取到摘要，请查看原文。' : '尚未读取到回报；仅凭文件缺失不能判断任务是否仍在执行。'}</p>}</li>
          <li className="research-story-unverified"><span className="research-story-step">03 · 采纳证据</span><h4>改变了哪一步</h4><p>采纳关联未接入。请对照实验记录核查，不能仅凭子任务完成就认定主会话已采纳。</p></li>
        </ol>
        <details className="research-story-source"><summary>核对原文 · {c.name}</summary>
          {c.brief && <><h4>任务书 brief.md</h4><pre>{c.brief}</pre></>}
          {c.out && <><h4>回报 out.md</h4><pre>{c.out}</pre></>}
          {!c.brief && !c.out && <p>当前快照未包含任务书与回报正文。</p>}
        </details>
      </article>
    })}
  </div>
}

function RefineLog({ sessionId, running }: { sessionId: string; running: boolean }): React.ReactElement {
  const { state, error, refresh } = useRefineState(sessionId, running)
  if (error) return <div role="status" className="space-y-2 text-[12px]"><p>{error}</p><Button variant="outline" size="sm" onClick={refresh}>重试读取经验</Button></div>
  if (!state) return <p className="text-[12px] text-muted-foreground">读取中…</p>
  return <RefineHistory state={state} />
}

const EDIT_KIND: Record<string, string> = { memory: '操作记忆', skill: '工作技能', prompt: '提示规则', subagent: '子代理角色' }
const EDIT_ACTION: Record<string, string> = { add: '新增', update: '更新', remove: '删除', delete: '删除', create: '新增' }

export function RefineHistory({ state }: { state: AgentRefineState }): React.ReactElement {
  if (!state.resident) return <p className="text-[12px] text-muted-foreground">{REFINE_NOT_RESIDENT}，历史经验读取尚未接入；这不表示没有保存经验，也无需为查看历史重新运行模型。</p>
  const recent = state.harness?.recent ?? []
  const arm = state.arm
  return <div className="space-y-3 text-[12px]">
    <div className="research-story-intro"><span>操作经验 · Refine</span><h3>经验写下来了，下一次真的做得更好吗？</h3><p>先看触发原因，再看改了什么，最后核对验证。提炼完成不等于能力提升。</p></div>
    {arm && <p className={arm.contaminated ? 'text-destructive' : 'text-muted-foreground'}>经验策略：{REFINE_MODES[arm.mode] ?? '策略未确认'}{arm.contaminated ? ' · 本运行已标记干预或污染，原因需查审计记录；不能作为纯自动学习对照' : ''}</p>}
    <p className="text-muted-foreground">当前展示 {recent.length} 次提炼摘要（接口最多返回最近 5 次，每次最多 6 项改动），不是完整进化历史。经验条目数与提炼次数不同。</p>
    {recent.length === 0
      ? <p className="text-muted-foreground">当前没有返回经验记录。{arm?.mode === 'frozen' ? '冻结策略不允许提炼更新。' : ''}</p>
      : <ol className="space-y-3">{recent.map((r, i) => <li key={`${r.ts}-${i}`} className="research-story-card">
        <header className="research-story-heading"><span className="research-story-index" aria-hidden>↻</span><div className="min-w-0 flex-1"><p className="research-story-kicker">提炼记录 · {hhmm(r.ts) || '时间未记录'}</p><h3>{r.summary || '摘要未记录'}</h3></div></header>
        <ol className="research-story-chain">
          <li><span className="research-story-step">01 · 原因</span><h4>为什么要改</h4><p>{r.rationale || '未返回提炼原因，不能从改动反推触发事件。'}</p></li>
          <li><span className="research-story-step">02 · 改动</span><h4>经验记录改了什么</h4>{r.edits?.length ? <ul className="space-y-2">{r.edits.map((e, j) => <li key={j}><span className="research-edit-kind">{EDIT_ACTION[e.action ?? ''] ?? e.action ?? '改动'} · {EDIT_KIND[e.kind] ?? e.kind}</span><p>{e.title ?? e.id ?? '条目未命名'}</p></li>)}</ul> : <p>未返回改动明细，不能据此认定写入了新经验。</p>}</li>
          <li className="research-story-unverified"><span className="research-story-step">03 · 验证</span><h4>有没有变得更好</h4><p>验证与回滚状态未接入。需要后续任务的执行证据与对照结果，才能判断改动是否有效、是否仍生效。</p></li>
        </ol>
        <p className="research-story-footnote">来源：会话中的提炼事件摘要。当前接口没有改动前后正文及验证记录。</p>
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
