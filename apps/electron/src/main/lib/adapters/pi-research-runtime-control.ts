/**
 * 研究会话的宿主控制面（04 §3.7 / §5.2，Wave 2 轨道 W2-runtime）：
 *
 * - IR-C1：注册前端的暂停扩展（缺导出时优雅降级为软暂停）、回合边界停（shouldStopBeforeTurn）、attach。
 *   回合边界顺带从磁盘刷新闸门（`research-control.attach` → 记录服务读 interventions / K0-intake），
 *   所以 K0 里定下的 `forks: wait`（IR-D4）在下一回合即生效，不依赖画布是否打开。
 * - IR-C3：按 job_name（= rlm child 的 sessionName，research_kit.new_job）取消子任务，空闲时也可。
 * - P2：rlm_child_update 带 Proma 会话 id 转发给 UI 监听者（IR-C3 ②）。
 *
 * 前端文件（research-control / research-record-service / pause extension）只读引用，不改。
 */

import type { AgentSession, AgentSessionEvent, ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { forkCandidate, parseBundle, type ForkCandidate } from '@proma/shared/research-record'
import { attach, gate } from '../research-control'
import { findLiveRunDir, readLiveBundle, sha256 } from '../research-record-service'

type RlmChildSnapshot = Extract<AgentSessionEvent, { type: 'rlm_child_update' }>['child']

// ===== P2：child 状态转发 =====

export interface ResearchChildUpdate {
  id: string
  sessionName?: string
  status: RlmChildSnapshot['status']
  label: string
}

const childListeners = new Set<(sessionId: string, update: ResearchChildUpdate) => void>()

/** UI 侧订阅（主进程内）；返回退订函数。 */
export function onResearchChildUpdate(listener: (sessionId: string, update: ResearchChildUpdate) => void): () => void {
  childListeners.add(listener)
  return () => childListeners.delete(listener)
}

const ACTIVE = new Set(['queued', 'running'])

export interface ResearchChildTracker {
  /** 取消在跑 / 排队的 child；names = job_name（或 child id），缺省 = 全部。返回被取消的名字。 */
  cancel(names?: string[]): string[]
  dispose(): void
}

export function createResearchChildTracker(
  session: Pick<AgentSession, 'subscribe' | 'cancelRlmChildRun'>,
  sessionId: string,
): ResearchChildTracker {
  const children = new Map<string, ResearchChildUpdate>()
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type !== 'rlm_child_update') return
    const { id, sessionName, status, label } = event.child
    const update: ResearchChildUpdate = { id, ...(sessionName ? { sessionName } : {}), status, label }
    // 只登记可取消的（queued / running）：结束的 child 出表，常驻会话里表不随作业数增长。
    if (ACTIVE.has(status)) children.set(id, update)
    else children.delete(id)
    for (const listener of childListeners) {
      try {
        listener(sessionId, update)
      } catch (error) {
        console.error('[Pi SDK] rlm child 状态转发失败:', error)
      }
    }
  })
  return {
    cancel(names) {
      const out: string[] = []
      for (const child of children.values()) {
        const name = child.sessionName ?? child.id
        if (!ACTIVE.has(child.status) || (names && !names.includes(name) && !names.includes(child.id))) continue
        if (session.cancelRlmChildRun(child.id, 'Cancelled by the user from the research canvas')) out.push(name)
      }
      return out
    },
    dispose: unsubscribe,
  }
}

// ===== IR-C1：暂停扩展 + 回合边界 =====

/** 前端扩展模块的形状（按名取，缺了就是软暂停）。 */
interface PauseModule {
  createResearchPauseExtension?: unknown
}

export function pauseExtensionFactory(
  mod: PauseModule,
  sessionId: string,
  cwd: string,
): ((pi: ExtensionAPI) => void) | undefined {
  const create = mod.createResearchPauseExtension
  if (typeof create !== 'function') return undefined
  return create(() => gate(sessionId), { forkCandidate: liveForkCandidate(cwd) }) as (pi: ExtensionAPI) => void
}

/** IR-C1 ③ + 从磁盘刷新闸门（未结束的 pause、K0 的 forks 行）。会话建立、每次 query 开始、每个回合边界都调。 */
export function refreshResearchGate(sessionId: string, cwd: string): void {
  try {
    attach(sessionId, cwd)
  } catch (error) {
    console.error('[Pi SDK] 研究闸门刷新失败（沿用内存里的闸门）:', error)
  }
}

/** IR-C1 ②：回合边界读 stopAtTurn。钩子在 Prime 的 loop 里同步调用，永不抛。 */
export function shouldStopForResearchPause(sessionId: string, cwd: string): boolean {
  refreshResearchGate(sessionId, cwd)
  try {
    return gate(sessionId).stopAtTurn
  } catch (error) {
    console.error('[Pi SDK] 研究暂停闸门读取失败（按不停处理）:', error)
    return false
  }
}

/**
 * F-a 判定的输入：`claim_transition` 的入参 + 实时 run 记录（journal + prereg）→ J1 `forkCandidate`。
 * ponytail: 每假设一次 / 每 run ≤2 由扩展工厂闭包记账，应用重启后会重新计数；
 * 要跨重启就从 interventions.jsonl 的 fork_open 推 asked 列表。
 */
export function liveForkCandidate(cwd: string): (input: Record<string, unknown>) => ForkCandidate | null {
  return (input) => {
    const byProbe = input.byProbe ?? input.by_probe
    if (input.to !== 'REFUTED' || typeof byProbe !== 'string' || typeof input.id !== 'string') return null
    try {
      const runDir = findLiveRunDir(cwd)
      if (!runDir) return null
      const rec = parseBundle(readLiveBundle(cwd, runDir), { sha256 })
      return forkCandidate(rec, { id: input.id, to: 'REFUTED', by_probe: byProbe, seq: (rec.events.at(-1)?.seq ?? 0) + 1 })
    } catch (error) {
      console.error('[Pi SDK] F-a 判定失败（按未命中处理）:', error)
      return null
    }
  }
}
