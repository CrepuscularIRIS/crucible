import { describe, expect, test } from 'bun:test'

import {
  computeResidencyKey,
  ResidentSessionRegistry,
  type DisposableSession,
} from './pi-session-residency'

function makeSession(): DisposableSession & { disposed: boolean } {
  return { disposed: false, dispose() { this.disposed = true } }
}

describe('ResidentSessionRegistry', () => {
  test('命中占用会清 idle timer 并记录 owner', () => {
    const reg = new ResidentSessionRegistry<DisposableSession>({ idleMs: 10_000 })
    const owner = {}
    const session = makeSession()
    reg.install('c1', session, owner)
    expect(reg.release('c1', owner)).toBe('released')
    const entry = reg.get('c1')
    expect(entry?.idleTimer).toBeDefined()
    expect(entry?.owner).toBeUndefined()

    const owner2 = {}
    const reacquired = reg.acquire('c1', owner2)
    expect(reacquired?.session).toBe(session)
    expect(reacquired?.idleTimer).toBeUndefined()
    expect(reacquired?.owner).toBe(owner2)
    reg.disposeAll()
  })

  test('空闲超时后 dispose 并移除', async () => {
    const disposed: string[] = []
    const reg = new ResidentSessionRegistry<DisposableSession>({
      idleMs: 5,
      onDispose: (key) => disposed.push(key),
    })
    const owner = {}
    reg.install('c1', makeSession(), owner)
    reg.release('c1', owner)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(disposed).toEqual(['c1'])
    expect(reg.size).toBe(0)
  })

  test('owner 不匹配的释放被拒绝，不排计时', () => {
    const reg = new ResidentSessionRegistry<DisposableSession>({ idleMs: 10_000 })
    const owner = {}
    reg.install('c1', makeSession(), owner)
    expect(reg.release('c1', {})).toBe('owner-mismatch')
    expect(reg.get('c1')?.idleTimer).toBeUndefined()
    reg.disposeAll()
  })

  test('install 替换会立即 dispose 旧会话', () => {
    const disposed: string[] = []
    const reg = new ResidentSessionRegistry<DisposableSession>({
      idleMs: 0,
      onDispose: (key, reason) => disposed.push(`${key}:${reason}`),
    })
    const oldSession = makeSession()
    reg.install('c1', oldSession, {})
    reg.install('c1', makeSession(), {})
    expect(oldSession.disposed).toBe(true)
    expect(disposed).toEqual(['c1:replaced'])
    reg.disposeAll()
  })

  test('disposeAll 清场且之后 acquire 拒绝', async () => {
    const reg = new ResidentSessionRegistry<DisposableSession>({ idleMs: 0 })
    const session = makeSession()
    reg.install('c1', session, {})
    await reg.disposeAll()
    expect(session.disposed).toBe(true)
    expect(reg.acquire('c1', {})).toBeUndefined()
  })

  test('idleMs<=0 表示常驻（释放不排计时）', () => {
    const reg = new ResidentSessionRegistry<DisposableSession>({ idleMs: 0 })
    const owner = {}
    reg.install('c1', makeSession(), owner)
    reg.release('c1', owner)
    expect(reg.get('c1')?.idleTimer).toBeUndefined()
    expect(reg.size).toBe(1)
    reg.disposeAll()
  })
})

describe('computeResidencyKey', () => {
  const base = {
    provider: 'dashscope',
    model: 'qwen3.7-plus',
    thinkingLevel: 'off',
    cwd: '/w',
    agentDir: '/a',
    sessionDir: '/s',
    systemPrompt: 'p',
    additionalSkillPaths: ['/x', '/y'],
    projectInstructionFiles: [],
    projectScope: undefined,
  }

  test('相同输入稳定，敏感分量变化则变化', () => {
    expect(computeResidencyKey(base)).toBe(computeResidencyKey({ ...base }))
    expect(computeResidencyKey(base)).not.toBe(computeResidencyKey({ ...base, model: 'kimi-k3' }))
    expect(computeResidencyKey(base)).not.toBe(computeResidencyKey({ ...base, systemPrompt: 'p2' }))
    expect(computeResidencyKey(base)).not.toBe(computeResidencyKey({ ...base, thinkingLevel: 'high' }))
    expect(computeResidencyKey(base)).not.toBe(computeResidencyKey({
      ...base,
      researchIsolation: ['/home/test/oss/neuronbench', '/home/test/project/.proma-research'],
    }))
  })

  test('skill 路径顺序无关', () => {
    expect(computeResidencyKey(base)).toBe(
      computeResidencyKey({ ...base, additionalSkillPaths: [...base.additionalSkillPaths].reverse() }),
    )
  })
})
