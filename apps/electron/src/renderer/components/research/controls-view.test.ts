import { describe, expect, test } from 'bun:test'
import { controlBar, forkOptionView, parseForkDescription, type ControlsInput } from './controls-view'

const live = (over: Partial<ControlsInput>): ControlsInput => ({
  mode: 'live', bridge: true, state: 'RUNNING', wired: true, canCancelChildren: false, ...over,
})
const actions = (input: ControlsInput) => controlBar(input).buttons.map((b) => b.action)
const button = (input: ControlsInput, action: string) => controlBar(input).buttons.find((b) => b.action === action)

describe('controls-view 控制条（04 §3.7 / U2）', () => {
  test('回放模式没有任何控制', () => {
    expect(controlBar(live({ mode: 'replay' })).buttons).toEqual([])
  })

  test('主进程没有研究控制接口时降级为只读并写明', () => {
    const bar = controlBar(live({ bridge: false }))
    expect(bar.buttons).toEqual([])
    expect(bar.notes.join('')).toContain('只读')
  })

  test('只读原因（会话共用主目录）：没有按钮，原因原样写出', () => {
    const bar = controlBar(live({ readOnly: '共用主目录：只看不控' }))
    expect(bar.buttons).toEqual([])
    expect(bar.notes).toEqual(['共用主目录：只看不控'])
  })

  test('PAUSED 显示继续 / 问 / 改方向，不显示暂停', () => {
    const a = actions(live({ state: 'PAUSED' }))
    expect(a).toContain('resume')
    expect(a).toContain('ask')
    expect(a).toContain('steer')
    expect(a).not.toContain('pause')
  })

  test('RUNNING 点"问"先提示会暂停', () => {
    expect(button(live({ state: 'RUNNING' }), 'ask')?.hint).toContain('会先让研究停在安全点')
  })

  test('IR-C1 未接线：暂停按钮文案为"请求暂停（软）"，并有软暂停说明', () => {
    const input = live({ state: 'RUNNING', wired: false })
    expect(button(input, 'pause')?.label).toBe('请求暂停（软）')
    expect(controlBar(input).notes.join('')).toContain('软暂停')
  })

  test('暂停按钮说明子任务仍在花费', () => {
    expect(button(live({ state: 'RUNNING' }), 'pause')?.hint).toContain('暂停不停止后台子任务')
  })

  test('PAUSED 且无 IR-C3：终止按钮说明子任务继续运行', () => {
    expect(button(live({ state: 'PAUSED', canCancelChildren: false }), 'stop')?.hint)
      .toContain('子任务仍会运行至完成或 60 分钟上限')
    expect(button(live({ state: 'PAUSED', canCancelChildren: true }), 'stop')?.hint ?? '')
      .not.toContain('60 分钟')
  })

  test('DONE：控制全部禁用', () => {
    const bar = controlBar(live({ state: 'DONE' }))
    expect(bar.buttons.length).toBeGreaterThan(0)
    expect(bar.buttons.every((b) => b.disabled)).toBe(true)
  })

  test('AWAIT_USER 时改方向提示先回答分叉', () => {
    expect(button(live({ state: 'AWAIT_USER' }), 'steer')?.hint).toContain('先回答分叉')
  })
})

describe('controls-view 分叉选项（04 §3.6）', () => {
  test('三段式描述解析成三栏', () => {
    expect(parseForkDescription('解决：收束分支 ｜ 成本：0 ｜ 仍不确定：单次观测')).toEqual({
      resolves: '收束分支', cost: '0', remaining: '单次观测',
    })
    // 半角竖线也认
    expect(parseForkDescription('解决：a | 成本：b | 仍不确定：c')).toEqual({ resolves: 'a', cost: 'b', remaining: 'c' })
  })

  test('解析失败时返回 null，视图显示原文', () => {
    expect(parseForkDescription('随便写的一句话')).toBeNull()
    const view = forkOptionView({ label: 'X', description: '随便写的一句话' })
    expect(view.columns).toBeNull()
    expect(view.raw).toBe('随便写的一句话')
  })

  test('结构化选项直接用三栏', () => {
    const view = forkOptionView({ label: 'A', resolves: 'r', cost: 'c', remaining: 'u' })
    expect(view.columns).toEqual({ resolves: 'r', cost: 'c', remaining: 'u' })
    expect(view.selectable).toBe(true)
  })

  test('blocked_by 选项不可选并显示原因', () => {
    const view = forkOptionView({ label: '用阻断剂', resolves: 'r', cost: 'c', remaining: 'u', blocked_by: 'R-no-blocker' })
    expect(view.selectable).toBe(false)
    expect(view.blockedReason).toContain('R-no-blocker')
  })
})
