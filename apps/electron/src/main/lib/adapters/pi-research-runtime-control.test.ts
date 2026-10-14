import { afterEach, describe, expect, it } from 'bun:test'
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { configureResearchRecord } from '../research-record-service'
import { gate, getResearchChildCanceller, isWired, syncGate } from '../research-control'
import {
  createResearchChildTracker,
  liveForkCandidate,
  onResearchChildUpdate,
  pauseExtensionFactory,
  shouldStopForResearchPause,
  type ResearchChildUpdate,
} from './pi-research-runtime-control'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function workspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'rt-control-'))
  roots.push(cwd)
  return cwd
}

type Listener = (event: AgentSessionEvent) => void
function fakeSession() {
  const listeners: Listener[] = []
  const cancelled: string[] = []
  return {
    cancelled,
    emit: (child: Record<string, unknown>) => {
      for (const l of listeners) l({ type: 'rlm_child_update', child } as unknown as AgentSessionEvent)
    },
    subscribe: (l: Listener) => {
      listeners.push(l)
      return () => listeners.splice(listeners.indexOf(l), 1)
    },
    cancelRlmChildRun: (id: string) => {
      cancelled.push(id)
      return true
    },
  }
}

const child = (id: string, sessionName: string, status: string) => ({ id, sessionName, status, label: `读 /w/.rlm-jobs/r1/${sessionName}/brief.md`, sessionDir: '/x' })

describe('IR-C3：cancelResearchChildren 按 job_name ↔ rlm child id（sessionName）取消', () => {
  it('names 缺省 = 取消全部在跑 / 排队的 child；已结束的不碰；返回被取消的名字', () => {
    const s = fakeSession()
    const tracker = createResearchChildTracker(s, 'sess-a')
    s.emit(child('c1', 'W1-H2-ab12', 'running'))
    s.emit(child('c2', 'W2-H3-cd34', 'queued'))
    s.emit(child('c3', 'W3-H4-ef56', 'running'))
    s.emit(child('c3', 'W3-H4-ef56', 'done'))
    expect(tracker.cancel()).toEqual(['W1-H2-ab12', 'W2-H3-cd34'])
    expect(s.cancelled).toEqual(['c1', 'c2'])
  })

  it('按 job_name 取消单个；未知名字不取消任何东西', () => {
    const s = fakeSession()
    const tracker = createResearchChildTracker(s, 'sess-b')
    s.emit(child('c1', 'W1-H2-ab12', 'running'))
    s.emit(child('c2', 'W2-H3-cd34', 'running'))
    expect(tracker.cancel(['W2-H3-cd34'])).toEqual(['W2-H3-cd34'])
    expect(s.cancelled).toEqual(['c2'])
    expect(tracker.cancel(['nope'])).toEqual([])
  })

  it('P2：每条 rlm_child_update 带 Proma 会话 id 转发给 UI 监听者；退订后不再收到', () => {
    const s = fakeSession()
    createResearchChildTracker(s, 'sess-c')
    const seen: Array<[string, ResearchChildUpdate]> = []
    const off = onResearchChildUpdate((sessionId, update) => seen.push([sessionId, update]))
    s.emit(child('c1', 'W1-H2-ab12', 'running'))
    off()
    s.emit(child('c1', 'W1-H2-ab12', 'done'))
    expect(seen).toEqual([['sess-c', { id: 'c1', sessionName: 'W1-H2-ab12', status: 'running', label: '读 /w/.rlm-jobs/r1/W1-H2-ab12/brief.md' }]])
  })

  it('监听者抛错不影响转发链与取消', () => {
    const s = fakeSession()
    const tracker = createResearchChildTracker(s, 'sess-d')
    const off = onResearchChildUpdate(() => { throw new Error('boom') })
    s.emit(child('c1', 'W1-H2-ab12', 'running'))
    off()
    expect(tracker.cancel()).toEqual(['W1-H2-ab12'])
  })
})

describe('IR-C1：暂停扩展注册 + 回合边界停', () => {
  it('前端扩展导出缺失时优雅降级（返回 undefined = 软暂停）', () => {
    expect(pauseExtensionFactory({}, 's', '/tmp')).toBeUndefined()
    expect(pauseExtensionFactory({ createResearchPauseExtension: 'nope' }, 's', '/tmp')).toBeUndefined()
  })

  it('导出存在时把 gate(sessionId) 与 F-a 判定交给它', () => {
    let captured: { getGate: () => unknown; options: { forkCandidate?: unknown } } | undefined
    const factory = pauseExtensionFactory({
      createResearchPauseExtension: (getGate: () => unknown, options: { forkCandidate?: unknown }) => {
        captured = { getGate, options }
        return () => {}
      },
    }, 'sess-ext', '/tmp')
    expect(typeof factory).toBe('function')
    syncGate('sess-ext', { kind: 'pause', id: 'U9' }, 'auto')
    expect(captured!.getGate()).toMatchObject({ readOnly: true, stopAtTurn: true })
    expect(typeof captured!.options.forkCandidate).toBe('function')
  })

  it('回合边界：从磁盘刷新闸门（attach），最近控制事件 pause → true；resume → false；并标记 wired', () => {
    const cwd = workspace()
    const runDir = join(cwd, '.proma-research', 'r1')
    mkdirSync(runDir, { recursive: true })
    writeFileSync(join(runDir, 'journal.jsonl'), '{"op":"run.init"}\n')
    configureResearchRecord({ resolveCwd: () => cwd, isRunning: () => true, push: () => {} })
    const intervention = (id: string, kind: string) => `${JSON.stringify({ id, kind, actor: 'user', affects: [], children: [], fork: null })}\n`
    writeFileSync(join(runDir, 'interventions.jsonl'), intervention('U1', 'pause'))
    expect(shouldStopForResearchPause('sess-turn', cwd)).toBe(true)
    expect(isWired('sess-turn')).toBe(true)
    appendFileSync(join(runDir, 'interventions.jsonl'), intervention('U2', 'resume'))
    expect(shouldStopForResearchPause('sess-turn', cwd)).toBe(false)
  })

  it('IR-D4：K0-intake 写 forks: wait → 会话闸门的 forks = wait（回合边界即生效）', () => {
    const cwd = workspace()
    const runDir = join(cwd, '.proma-research', 'r1')
    mkdirSync(runDir, { recursive: true })
    writeFileSync(join(runDir, 'journal.jsonl'), '{"op":"run.init"}\n')
    configureResearchRecord({ resolveCwd: () => cwd, isRunning: () => true, push: () => {} })
    shouldStopForResearchPause('sess-forks', cwd)
    expect(gate('sess-forks').forks).toBe('auto')
    writeFileSync(join(runDir, 'K0-intake.md'), 'status: confirmed\nmode: identify\nforks: wait\n')
    shouldStopForResearchPause('sess-forks', cwd)
    expect(gate('sess-forks').forks).toBe('wait')
  })

  it('闸门出错时不停（回合边界钩子永不抛）', () => {
    expect(shouldStopForResearchPause('sess-none', '/definitely/missing/cwd')).toBe(false)
  })
})

describe('F-a 判定：读实时 run 记录交给 J1 forkCandidate', () => {
  const ONE = resolve(import.meta.dir, '../../../../../../research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound')

  function liveOne(lines: number): string {
    const cwd = workspace()
    const runDir = join(cwd, '.proma-research', 'one')
    mkdirSync(runDir, { recursive: true })
    const journal = readFileSync(join(ONE, 'journal.jsonl'), 'utf-8').split('\n').slice(0, lines).join('\n')
    writeFileSync(join(runDir, 'journal.jsonl'), `${journal}\n`)
    cpSync(join(ONE, 'prereg'), join(runDir, 'prereg'), { recursive: true })
    return cwd
  }

  it('ONE:67 形状（只凭 P2 一次测量否定 H5）→ 命中', () => {
    const candidate = liveForkCandidate(liveOne(66))
    expect(candidate({ run: 'one', id: 'H5', to: 'REFUTED', byProbe: 'P2' })).toMatchObject({ hid: 'H5', pid: 'P2', reps: 1 })
  })

  it('非 REFUTED、缺 byProbe、或没有实时 run → null', () => {
    const candidate = liveForkCandidate(liveOne(66))
    expect(candidate({ run: 'one', id: 'H5', to: 'SUPPORTED', byProbe: 'P2' })).toBeNull()
    expect(candidate({ run: 'one', id: 'H5', to: 'REFUTED' })).toBeNull()
    expect(liveForkCandidate(workspace())({ id: 'H5', to: 'REFUTED', byProbe: 'P2' })).toBeNull()
  })
})

describe('IR-C1 ②：installRuntimeGuardHooks 的 shouldStopBeforeTurn 包装', () => {
  it('研究暂停 stopAtTurn → true，且不清空队列（暂停期间到达的通知留给继续那一轮）', async () => {
    const { installRuntimeGuardHooks } = await import('./pi-agent-adapter')
    let cleared = 0
    let stop = false
    const session = { agent: { clearAllQueues: () => { cleared++ } } } as unknown as Parameters<typeof installRuntimeGuardHooks>[0]
    installRuntimeGuardHooks(session, () => undefined, () => stop)
    expect(session.agent.shouldStopBeforeTurn!()).toBe(false)
    stop = true
    expect(session.agent.shouldStopBeforeTurn!()).toBe(true)
    expect(cleared).toBe(0)
  })

  it('不传研究钩子时行为不变（沿用之前的 shouldStopBeforeTurn）', async () => {
    const { installRuntimeGuardHooks } = await import('./pi-agent-adapter')
    const session = { agent: { shouldStopBeforeTurn: () => true, clearAllQueues: () => {} } } as unknown as Parameters<typeof installRuntimeGuardHooks>[0]
    installRuntimeGuardHooks(session, () => undefined)
    expect(session.agent.shouldStopBeforeTurn!()).toBe(true)
  })
})

describe('IR-C3 注册', () => {
  it('构造 PiAgentAdapter 后 research-control 拿到 child canceller（canCancelChildren=true）', async () => {
    const { PiAgentAdapter } = await import('./pi-agent-adapter')
    const adapter = new PiAgentAdapter()
    expect(getResearchChildCanceller()).toBeDefined()
    expect(adapter.cancelResearchChildren('no-such-session')).toEqual([])
  })
})
