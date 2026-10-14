/**
 * 研究控制（04 §3.7，轨道 R2）：暂停 / 询问 / 改方向的状态机、发送计划、闸门注册表。
 *
 * 纯逻辑 + 进程内注册表，无 I/O。状态完全由输入推出、不另存（04 §3.7 reducer 输入）；
 * 记录与发送计划的落盘由 research-record-service 负责。
 * IR-C1（Wave 2，pi-agent-adapter.ts）消费 `researchControl.attach / gate`；未接线时 wired=false，
 * 画布退化为软暂停。
 *
 * 04 §2.4 把 reducer 放在 J1 的 `control.ts`；J1 合入前 R 不能 import 它，先落在这里，
 * J1 合入后二者应收敛为一份（以测试为准）。
 */

import type {
  ResearchControlKind,
  ResearchControlView,
  ResearchForksMode,
  ResearchGate,
  ResearchInterveneInput,
  ResearchInterventionKind,
  ResearchSendPlan,
} from '../../types/research-record'

export interface ControlInput {
  lastControl?: ResearchControlKind
  agentRunning: boolean
  askPending: boolean
  declared: boolean
  wired: boolean
  canCancelChildren?: boolean
  forks?: ResearchForksMode
}

const CONTROL_KINDS = new Set<string>(['pause', 'resume', 'ask', 'steer', 'stop'])
const OPEN: ResearchGate = { readOnly: false, stopAtTurn: false }

export function gateFor(last: ResearchControlKind | undefined): ResearchGate {
  if (last === 'pause') return { readOnly: true, stopAtTurn: true }
  if (last === 'ask') return { readOnly: true, stopAtTurn: false }
  return OPEN
}

/** 最近一条控制事件（fork_open / fork_answer 不算控制事件）。 */
export function lastControl(events: ReadonlyArray<{ kind: ResearchInterventionKind }>): ResearchControlKind | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const kind = events[i]!.kind
    if (CONTROL_KINDS.has(kind)) return kind as ResearchControlKind
  }
  return undefined
}

export function controlState(input: ControlInput): ResearchControlView {
  const { lastControl: last, agentRunning, askPending, declared } = input
  const halted = last === 'pause' || last === 'ask'
  const view = (state: ResearchControlView['state'], gate: ResearchGate, waitingOn?: string): ResearchControlView => ({
    state,
    gate,
    ...(waitingOn ? { waitingOn } : {}),
    wired: input.wired,
    canCancelChildren: input.canCancelChildren ?? false,
    forks: input.forks ?? 'auto',
  })
  if (declared && !agentRunning) return view('DONE', OPEN)
  // 04 §3.7 写的是"最近控制事件不是 pause"；ask 也排除：ASKING 中 agent 发起 AskUser 不能打开只读闸门。
  if (agentRunning && askPending && !halted) return view('AWAIT_USER', OPEN)
  if (agentRunning && !halted) return view('RUNNING', OPEN)
  if (agentRunning && last === 'pause') return view('PAUSING', gateFor(last), askPending ? '等你回答分叉' : undefined)
  if (agentRunning && last === 'ask') return view('ASKING', gateFor(last))
  if (halted) return view('PAUSED', gateFor(last))
  return view('IDLE', OPEN)
}

export interface InterventionPlan {
  record?: ResearchInterventionKind
  send?: ResearchSendPlan
  askAfterPause?: true
  stop?: true
}

export interface PlanContext {
  /** 本次将写入的干预 id（U#） */
  id: string
  before: ResearchControlView
  /** 最近一次 pause 时在跑、现在已结束的子任务（继续消息里列出） */
  doneChildren: string[]
}

const RUNNING_STATES = new Set(['RUNNING', 'AWAIT_USER', 'PAUSING', 'ASKING'])

/** 04 §3.7 转移表 → 记什么、发什么。主进程不发消息，只返回计划。 */
export function planIntervention(input: ResearchInterveneInput, ctx: PlanContext): InterventionPlan {
  const { id, before } = ctx
  const running = RUNNING_STATES.has(before.state)
  const mode = running ? 'queue' : 'prompt'
  const text = input.text?.trim() ?? ''
  switch (input.kind) {
    case 'pause':
      return {
        record: 'pause',
        // 已接线：闸门 + 回合边界停，不发消息；未接线且在跑：软暂停引导消息（priority now，不带 interrupt）
        ...(!before.wired && running
          ? { send: { mode: 'queue', text: `[${id} 暂停] 结束本轮回答，不要发起新的研究动作。${text ? ` ${text}` : ''}` } }
          : {}),
      }
    case 'ask':
      if (before.state === 'PAUSING' || before.state === 'ASKING') return { askAfterPause: true }
      if (running) return { ...planIntervention({ ...input, kind: 'pause', text: '' }, ctx), askAfterPause: true }
      return {
        record: 'ask',
        send: {
          mode: 'prompt',
          // Prime 没有结构化读文件工具，只读闸门又拦 bash / ipython / edit（pi-research-pause-extension）
          text: `[${id} 询问·不改变计划] ${text}\n只读作答：本轮只能调用 research_state / metric_recompute 查记录，不要调用 bash、ipython、edit，也不要发起新的研究动作。`,
        },
      }
    case 'resume':
      return running
        ? { record: 'resume' }
        : {
            record: 'resume',
            send: { mode: 'prompt', text: `[${id} 继续] 暂停期间完成的子任务：${ctx.doneChildren.join('、') || '无'}` },
          }
    case 'steer': {
      const affects = input.affects?.length ? input.affects.join('/') : '—'
      return {
        record: 'steer',
        send: { mode, text: `[${id} 改方向] ${text}\n先在 RULINGS.md 写一行 \`${id}: <决定> · affects ${affects}\` 再继续。` },
      }
    }
    case 'stop':
      return running ? { record: 'stop', stop: true } : { record: 'stop' }
    case 'fork_answer':
      return { record: 'fork_answer', send: { mode, text: `[${id} 分叉 ${input.forkId ?? '?'} 回答] ${input.chosen ?? text}` } }
  }
}

// ===== 闸门注册表（IR-C1） =====

export interface ResearchPauseGate extends ResearchGate {
  forks: ResearchForksMode
  /** 让闸门关上的干预 id（U#），写进拦截 reason */
  reason?: string
}

const wiredSessions = new Set<string>()
const gateState = new Map<string, { last?: { kind: ResearchControlKind; id: string }; forks: ResearchForksMode }>()
let attachHook: ((sessionId: string, cwd?: string) => void) | undefined

/** 服务层注入：attach 时从磁盘恢复未结束的 pause（应用重启后闸门直接只读）。 */
export function setAttachHook(hook: (sessionId: string, cwd?: string) => void): void {
  attachHook = hook
}

/** IR-C1 ③：研究会话建立时调用。未调用 → wired=false（软暂停）。 */
export function attach(sessionId: string, cwd?: string): void {
  wiredSessions.add(sessionId)
  attachHook?.(sessionId, cwd)
}

export function isWired(sessionId: string): boolean {
  return wiredSessions.has(sessionId)
}

export function syncGate(
  sessionId: string,
  last: { kind: ResearchControlKind; id: string } | undefined,
  forks: ResearchForksMode,
): void {
  gateState.set(sessionId, { last, forks })
}

/** IR-C1 ①②：tool_call 闸门与 shouldStopBeforeTurn 每次同步读取，不做 I/O。 */
export function gate(sessionId: string): ResearchPauseGate {
  const entry = gateState.get(sessionId)
  const g = gateFor(entry?.last?.kind)
  const forks = isWired(sessionId) ? entry?.forks ?? 'auto' : 'auto'
  return { ...g, forks, ...(g.readOnly && entry?.last ? { reason: entry.last.id } : {}) }
}

/** IR-C3 注入点：缺省 undefined → canCancelChildren=false，子任务卡无取消按钮。 */
let childCanceller: ((sessionId: string, names?: string[]) => void) | undefined
export function setResearchChildCanceller(fn: ((sessionId: string, names?: string[]) => void) | undefined): void {
  childCanceller = fn
}
export function getResearchChildCanceller(): typeof childCanceller {
  return childCanceller
}

export const researchControl = { attach, gate }
