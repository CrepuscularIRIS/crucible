/**
 * controls-view — 研究画布控制条与分叉选项的纯视图模型（04 §3.6 / §3.7，轨道 U2）
 *
 * 不依赖 DOM / React；状态名与 04 §3.7 状态表一致。按钮只表达"能做什么、为什么"，
 * 真正的记录与发送由主进程 `research:intervene` 决定（轨道 R）。
 */

import type { ControlStateName } from '@proma/shared/research-record'

export type { ControlStateName }
export type ControlAction = 'pause' | 'resume' | 'ask' | 'steer' | 'stop'

export interface ControlsInput {
  mode: 'live' | 'replay'
  /** 主进程是否提供 research:intervene（轨道 R1）；缺则只读 */
  bridge: boolean
  state: ControlStateName
  /** IR-C1 是否已接线（回合边界停 + 只读闸门） */
  wired: boolean
  /** IR-C3 是否可用（空闲时取消子任务） */
  canCancelChildren: boolean
  /** 有值 = 这个画布只读，原因显示给人（如会话没绑项目、与别的会话共用 $HOME） */
  readOnly?: string
}

export interface ControlButton {
  action: ControlAction
  label: string
  disabled: boolean
  hint?: string
}

export interface ControlBarView {
  buttons: ControlButton[]
  notes: string[]
}

const PAUSE_COST_HINT = '暂停不停止后台子任务，它们仍在花费。'
const ASK_FIRST_PAUSE = '询问会先让研究停在安全点（等价于暂停），停下后自动发出问题。'

function pauseButton(wired: boolean): ControlButton {
  return wired
    ? { action: 'pause', label: '暂停', disabled: false, hint: `${PAUSE_COST_HINT}本轮在回合边界结束。` }
    : { action: 'pause', label: '请求暂停（软）', disabled: false, hint: `${PAUSE_COST_HINT}未接线：只发引导消息，靠 agent 自觉。` }
}

function stopButton(state: ControlStateName, canCancelChildren: boolean): ControlButton {
  if (state === 'PAUSED' && !canCancelChildren) {
    return { action: 'stop', label: '结束', disabled: false, hint: '结束（子任务仍会运行至完成或 60 分钟上限）' }
  }
  return { action: 'stop', label: '终止', disabled: false, hint: state === 'PAUSED' ? '终止并取消全部后台子任务' : '中止本轮，子任务一并取消' }
}

const btn = (action: ControlAction, label: string, hint?: string, disabled = false): ControlButton =>
  ({ action, label, disabled, ...(hint ? { hint } : {}) })

export function controlBar(input: ControlsInput): ControlBarView {
  if (input.mode === 'replay') return { buttons: [], notes: ['回放 · 只读'] }
  if (!input.bridge) return { buttons: [], notes: ['控制不可用：主进程未提供研究控制接口，画布只读。'] }
  if (input.readOnly) return { buttons: [], notes: [input.readOnly] }

  const notes = input.wired ? [] : ['软暂停：未接线（IR-C1），暂停与询问只发引导消息，靠 agent 自觉。']
  const { state } = input
  let buttons: ControlButton[]
  switch (state) {
    case 'RUNNING':
      buttons = [pauseButton(input.wired), btn('ask', '问', ASK_FIRST_PAUSE), btn('steer', '改方向'), stopButton(state, input.canCancelChildren)]
      break
    case 'AWAIT_USER':
      buttons = [pauseButton(input.wired), btn('ask', '问', ASK_FIRST_PAUSE), btn('steer', '改方向', '先回答分叉：改方向消息要等回答后才送达'), stopButton(state, input.canCancelChildren)]
      break
    case 'PAUSING':
      buttons = [btn('resume', '继续'), btn('ask', '问', '停下后自动发出问题'), btn('steer', '改方向'), stopButton(state, input.canCancelChildren)]
      break
    case 'PAUSED':
      buttons = [btn('resume', '继续'), btn('ask', '问', '只读回答，不改变计划'), btn('steer', '改方向'), stopButton(state, input.canCancelChildren)]
      break
    case 'ASKING':
      buttons = [btn('resume', '继续'), btn('ask', '问', '正在回答上一个问题', true), btn('steer', '改方向'), stopButton(state, input.canCancelChildren)]
      break
    case 'DONE':
      buttons = [btn('pause', '暂停', '研究已结束', true), btn('ask', '问', '研究已结束', true), btn('steer', '改方向', '研究已结束', true), btn('stop', '终止', '研究已结束', true)]
      break
    case 'IDLE':
      buttons = [btn('steer', '改方向', '作为新一轮消息发出')]
      break
  }
  return { buttons, notes }
}

// ===== 分叉选项 =====

export interface ForkColumns {
  resolves: string
  cost: string
  remaining: string
}

export interface ForkOptionInput {
  label: string
  description?: string
  resolves?: string
  cost?: string
  remaining?: string
  blocked_by?: string
}

export interface ForkOptionView {
  label: string
  columns: ForkColumns | null
  raw: string
  selectable: boolean
  blockedReason?: string
}

const FORK_DESC = /^\s*解决[:：]\s*(.*?)\s*[｜|]\s*成本[:：]\s*(.*?)\s*[｜|]\s*仍不确定[:：]\s*(.*?)\s*$/s

/** `解决：… ｜ 成本：… ｜ 仍不确定：…` → 三栏；不合格式返回 null（视图显示原文） */
export function parseForkDescription(text: string): ForkColumns | null {
  const m = FORK_DESC.exec(text)
  return m ? { resolves: m[1]!, cost: m[2]!, remaining: m[3]! } : null
}

export function forkOptionView(option: ForkOptionInput): ForkOptionView {
  const structured = option.resolves !== undefined && option.cost !== undefined && option.remaining !== undefined
    ? { resolves: option.resolves, cost: option.cost, remaining: option.remaining }
    : null
  const raw = option.description ?? ''
  return {
    label: option.label,
    columns: structured ?? parseForkDescription(raw),
    raw,
    selectable: !option.blocked_by,
    ...(option.blocked_by ? { blockedReason: `被规则挡住：${option.blocked_by}` } : {}),
  }
}
