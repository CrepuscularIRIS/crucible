import { describe, expect, it } from 'bun:test'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { installPostCompactionRlmGate, isRlmSpawnCall } from './pi-post-compaction-rlm'

type HookResult = { block?: boolean; reason?: string } | undefined

function fakeSession(previous?: (name: string) => HookResult) {
  let listener: ((event: unknown) => void) | undefined
  const session = {
    agent: {
      beforeToolCall: previous
        ? async (context: { toolCall: { name: string } }) => previous(context.toolCall.name)
        : undefined,
    } as { beforeToolCall?: (context: unknown, signal?: AbortSignal) => Promise<HookResult> },
    subscribe(fn: (event: unknown) => void) { listener = fn; return () => {} },
  }
  installPostCompactionRlmGate(session as unknown as AgentSession)
  const call = (name: string, args: unknown = {}) =>
    session.agent.beforeToolCall!({ toolCall: { name }, args } as never)
  const emit = (event: unknown) => listener!(event)
  const compact = () => emit({ type: 'compaction_end', aborted: false, result: { summary: 's' } })
  const childDone = () => emit({ type: 'rlm_child_update', child: { id: 'c1', status: 'done' } })
  return { call, emit, compact, childDone }
}

const SPAWN = { code: 'await rlm("re-derive state", name="compaction-check")' }

describe('压缩后强制 RLM 复核', () => {
  it('只把 rlm(...) / rlm.run(...) 认作 spawn', () => {
    expect(isRlmSpawnCall('ipython', SPAWN)).toBe(true)
    expect(isRlmSpawnCall('ipython', { code: 'h = await rlm.run("p", name="r")' })).toBe(true)
    expect(isRlmSpawnCall('ipython', { code: 'await rlm.list_subagents()' })).toBe(false)
    expect(isRlmSpawnCall('ipython', { code: 'rlm.harness.get("subagent", "x")' })).toBe(false)
    expect(isRlmSpawnCall('bash', { code: 'rlm("x")' })).toBe(false)
  })

  it('压缩 → 只放行 spawn → 子代理跑完前只放行 ipython → 终态解闸', async () => {
    const { call, compact, childDone } = fakeSession()
    expect(await call('bash')).toBeUndefined()

    compact()
    expect((await call('bash'))?.block).toBe(true)
    expect((await call('ipython', { code: 'print(1)' }))?.block).toBe(true)

    expect(await call('ipython', SPAWN)).toBeUndefined()
    expect((await call('bash'))?.block).toBe(true)
    expect(await call('ipython', { code: 'await asyncio.sleep(20)' })).toBeUndefined()

    childDone()
    expect(await call('bash')).toBeUndefined()
  })

  it('取消或失败的压缩不挂闸', async () => {
    const { call, emit } = fakeSession()
    emit({ type: 'compaction_end', aborted: true })
    emit({ type: 'compaction_end', aborted: false, errorMessage: 'Nothing to compact' })
    expect(await call('bash')).toBeUndefined()
  })

  it('计划模式：ExitPlanMode / AskUserQuestion 不被拦；spawn 被权限拒绝时放行而不是死锁', async () => {
    const { call, compact } = fakeSession((name) => (name === 'ipython' ? { block: true, reason: 'plan mode' } : undefined))
    compact()
    expect(await call('ExitPlanMode')).toBeUndefined()
    expect(await call('AskUserQuestion')).toBeUndefined()
    expect((await call('ipython', SPAWN))?.reason).toBe('plan mode')
    expect(await call('bash')).toBeUndefined()
  })

  it('连续拦截超限后放行，且仍经过上游权限 hook', async () => {
    const { call, compact } = fakeSession((name) => (name === 'write' ? { block: true, reason: 'denied' } : undefined))
    compact()
    for (let i = 0; i < 5; i += 1) expect((await call('bash'))?.block).toBe(true)
    expect((await call('write'))?.reason).toBe('denied')
    expect(await call('bash')).toBeUndefined()
  })
})
