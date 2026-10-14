import { describe, expect, it } from 'bun:test'
import {
  attach,
  controlState,
  gate,
  lastControl,
  planIntervention,
  syncGate,
  type ControlInput,
} from './research-control'
import type { ResearchControlView } from '../../types/research-record'

const base: ControlInput = { agentRunning: false, askPending: false, declared: false, wired: true }
const state = (patch: Partial<ControlInput>) => controlState({ ...base, ...patch })

describe('controlState：04 §3.7 状态表逐行', () => {
  it('DONE：declared 且未运行', () => {
    expect(state({ declared: true }).state).toBe('DONE')
  })
  it('AWAIT_USER：运行中、askPending、最近控制事件不是 pause', () => {
    const v = state({ agentRunning: true, askPending: true, lastControl: 'steer' })
    expect(v.state).toBe('AWAIT_USER')
    expect(v.gate).toEqual({ readOnly: false, stopAtTurn: false })
  })
  it('RUNNING：运行中，最近控制事件 ∉ {pause, ask}', () => {
    expect(state({ agentRunning: true }).state).toBe('RUNNING')
    expect(state({ agentRunning: true, lastControl: 'resume' }).gate).toEqual({ readOnly: false, stopAtTurn: false })
  })
  it('PAUSING：运行中 + pause → 只读 + 回合边界停；askPending 时 waitingOn = 等你回答分叉', () => {
    const v = state({ agentRunning: true, lastControl: 'pause' })
    expect(v.state).toBe('PAUSING')
    expect(v.gate).toEqual({ readOnly: true, stopAtTurn: true })
    expect(v.waitingOn).toBeUndefined()
    const pending = state({ agentRunning: true, askPending: true, lastControl: 'pause' })
    expect(pending.state).toBe('PAUSING')
    expect(pending.waitingOn).toBe('等你回答分叉')
  })
  it('ASKING：运行中 + ask → 只读但不在回合边界停（agent 要读完资料再答）', () => {
    const v = state({ agentRunning: true, lastControl: 'ask' })
    expect(v.state).toBe('ASKING')
    expect(v.gate).toEqual({ readOnly: true, stopAtTurn: false })
    // ASKING 中 agent 自己发起 AskUser 也不能把闸门打开
    expect(state({ agentRunning: true, askPending: true, lastControl: 'ask' }).state).toBe('ASKING')
  })
  it('PAUSED：未运行 + pause/ask；这也是渲染层回报"会话未运行"后的状态（竞态不当错误）', () => {
    expect(state({ lastControl: 'pause' }).state).toBe('PAUSED')
    expect(state({ lastControl: 'ask' }).state).toBe('PAUSED')
    expect(state({ lastControl: 'pause' }).gate).toEqual({ readOnly: true, stopAtTurn: true })
  })
  it('IDLE：其余（含终止之后）', () => {
    expect(state({}).state).toBe('IDLE')
    expect(state({ lastControl: 'stop' }).state).toBe('IDLE')
  })
  it('wired=false 原样透出；canCancelChildren 缺省 false（IR-C3 未合入）', () => {
    const v = state({ wired: false })
    expect(v.wired).toBe(false)
    expect(v.canCancelChildren).toBe(false)
    expect(v.forks).toBe('auto')
  })
})

describe('lastControl：只看控制事件', () => {
  it('fork_open / fork_answer 不改变最近控制事件', () => {
    expect(lastControl([{ kind: 'pause' }, { kind: 'fork_open' }, { kind: 'fork_answer' }])).toBe('pause')
    expect(lastControl([])).toBeUndefined()
  })
})

const view = (patch: Partial<ControlInput>): ResearchControlView => state(patch)
const ctx = (patch: Partial<ControlInput>) => ({ id: 'U3', before: view(patch), doneChildren: [] as string[] })

describe('planIntervention：发送计划（主进程只记录，渲染层用现有 API 发）', () => {
  it('已接线暂停：不发消息，只翻闸门', () => {
    const plan = planIntervention({ sessionId: 's', kind: 'pause' }, ctx({ agentRunning: true }))
    expect(plan.record).toBe('pause')
    expect(plan.send).toBeUndefined()
    expect(plan.stop).toBeUndefined()
  })
  it('未接线暂停：queue 计划、不带 interrupt，正文带 U#', () => {
    const plan = planIntervention({ sessionId: 's', kind: 'pause' }, ctx({ agentRunning: true, wired: false }))
    expect(plan.send).toEqual({ mode: 'queue', text: '[U3 暂停] 结束本轮回答，不要发起新的研究动作。' })
    expect(plan.send && 'interrupt' in plan.send).toBe(false)
  })
  it('会话已结束时暂停：直接 PAUSED，无消息', () => {
    const plan = planIntervention({ sessionId: 's', kind: 'pause' }, ctx({ wired: false }))
    expect(plan.send).toBeUndefined()
  })
  it('运行中点"问"：先记 pause 并要求停下后再问', () => {
    const plan = planIntervention({ sessionId: 's', kind: 'ask', text: '为什么只测一次？' }, ctx({ agentRunning: true }))
    expect(plan.record).toBe('pause')
    expect(plan.askAfterPause).toBe(true)
  })
  it('PAUSING 时再点"问"：不新增记录', () => {
    const plan = planIntervention({ sessionId: 's', kind: 'ask', text: 'x' }, ctx({ agentRunning: true, lastControl: 'pause' }))
    expect(plan.record).toBeUndefined()
    expect(plan.askAfterPause).toBe(true)
  })
  it('PAUSED 时"问"：记 ask，新一轮发出"询问·不改变计划"', () => {
    const plan = planIntervention({ sessionId: 's', kind: 'ask', text: '为什么只测一次？' }, ctx({ lastControl: 'pause' }))
    expect(plan.record).toBe('ask')
    expect(plan.send?.mode).toBe('prompt')
    expect(plan.send?.text.startsWith('[U3 询问·不改变计划] 为什么只测一次？')).toBe(true)
    // Prime 只有 bash / edit / ipython；只读闸门放不了它们 → 明说本轮只能用 research_state（M-1）
    expect(plan.send?.text).toContain('research_state')
    expect(plan.send?.text).not.toMatch(/\bRead\b/)
  })
  it('继续：列出暂停期间完成的子任务；运行中继续不发消息', () => {
    const paused = planIntervention({ sessionId: 's', kind: 'resume' }, { ...ctx({ lastControl: 'pause' }), doneChildren: ['sim-a-0f3c'] })
    expect(paused.send).toEqual({ mode: 'prompt', text: '[U3 继续] 暂停期间完成的子任务：sim-a-0f3c' })
    const running = planIntervention({ sessionId: 's', kind: 'resume' }, ctx({ agentRunning: true, lastControl: 'pause' }))
    expect(running.record).toBe('resume')
    expect(running.send).toBeUndefined()
  })
  it('改方向：运行中 queue，否则 prompt；要求先写 RULING U# 行', () => {
    const input = { sessionId: 's', kind: 'steer' as const, text: '换 hyperpol 协议', affects: ['H5', 'P2'] }
    const running = planIntervention(input, ctx({ agentRunning: true }))
    expect(running.send?.mode).toBe('queue')
    expect(running.send?.text).toContain('[U3 改方向] 换 hyperpol 协议')
    expect(running.send?.text).toContain('U3: <决定> · affects H5/P2')
    expect(planIntervention(input, ctx({ lastControl: 'pause' })).send?.mode).toBe('prompt')
  })
  it('从不终止，除非用户点终止；终止只在运行中要求 stopAgent', () => {
    for (const kind of ['pause', 'resume', 'ask', 'steer'] as const) {
      expect(planIntervention({ sessionId: 's', kind, text: 't' }, ctx({ agentRunning: true })).stop).toBeUndefined()
    }
    expect(planIntervention({ sessionId: 's', kind: 'stop' }, ctx({ agentRunning: true })).stop).toBe(true)
    expect(planIntervention({ sessionId: 's', kind: 'stop' }, ctx({ lastControl: 'pause' })).stop).toBeUndefined()
  })
  it('焦点卡上回答失效分叉：记 fork_answer，作为改方向消息发出并带 F#', () => {
    const plan = planIntervention({ sessionId: 's', kind: 'fork_answer', forkId: 'F1', chosen: '只收窄' }, ctx({}))
    expect(plan.record).toBe('fork_answer')
    expect(plan.send).toEqual({ mode: 'prompt', text: '[U3 分叉 F1 回答] 只收窄' })
  })
})

describe('gate 注册表（IR-C1 消费）', () => {
  it('attach 从未调用 → wired=false；gate 缺省全开', () => {
    expect(gate('never-attached')).toEqual({ readOnly: false, stopAtTurn: false, forks: 'auto' })
  })
  it('syncGate 后：pause → 只读 + 回合边界停并带 U#；resume → 打开', () => {
    attach('sess-gate')
    syncGate('sess-gate', { kind: 'pause', id: 'U2' }, 'wait')
    expect(gate('sess-gate')).toEqual({ readOnly: true, stopAtTurn: true, forks: 'wait', reason: 'U2' })
    syncGate('sess-gate', { kind: 'ask', id: 'U3' }, 'wait')
    expect(gate('sess-gate')).toMatchObject({ readOnly: true, stopAtTurn: false })
    syncGate('sess-gate', { kind: 'resume', id: 'U4' }, 'wait')
    expect(gate('sess-gate')).toEqual({ readOnly: false, stopAtTurn: false, forks: 'wait' })
  })
  it('未接线时 forks=wait 不生效（04 §3.8：wait 需要 IR-C1）', () => {
    syncGate('sess-unwired', undefined, 'wait')
    expect(gate('sess-unwired').forks).toBe('auto')
  })
})
