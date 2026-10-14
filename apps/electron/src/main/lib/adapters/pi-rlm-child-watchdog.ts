/**
 * rlm child 宿主 watchdog（01-统一架构 §4.3-2、§9.4，P0）。
 *
 * 主等待是 kernel 里的 `research_kit.wait`（超时自己 `rlm.delete_subagent`）；这里兜住父会话
 * 不在 wait cell 里的情况：child 从第一次出现（queued/running）起超过墙钟上限，就经 Prime 的
 * 公开 API `cancelRlmChildRun` 取消（Prime 随后给父会话注入一条 cancelled 通知，PA :9584、:9947）。
 * 能从 prompt 里认出 job 目录（§4.2：`读 <cwd>/.rlm-jobs/<run>/…/brief.md`）时，再往
 * `<cwd>/.rlm-jobs/<run>/failures.jsonl` 追加一行 timeout，与 research_kit.wait 的记录同形。
 */

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent'

type RlmChildSnapshot = Extract<AgentSessionEvent, { type: 'rlm_child_update' }>['child']

/**
 * ponytail: 固定 60 min，取 wait 初值（W1/W2 20 min）的 3 倍作兜底；
 * 需要按 K0 信封分窗口配置时再改成参数。
 */
export const RLM_CHILD_HARD_LIMIT_MS = 60 * 60_000

const ACTIVE = new Set(['queued', 'running'])
/** ponytail: 路径含空格时认不出 job 目录，只取消不记 failures.jsonl。 */
/** 捕获：1 = 研究工作目录，2 = `.rlm-jobs/<run>`（failures.jsonl 所在），3 = `<step>/<target>/<nonce>`。 */
const JOB_BRIEF_PATTERN = /(\/\S*?)\/(\.rlm-jobs\/[^/\s]+)\/(\S+?)\/brief\.md/

export function installRlmChildWatchdog(
  session: Pick<AgentSession, 'subscribe' | 'cancelRlmChildRun'>,
  options: { limitMs?: number } = {},
): () => void {
  const limitMs = options.limitMs ?? RLM_CHILD_HARD_LIMIT_MS
  const timers = new Map<string, NodeJS.Timeout>()
  const seen = new Set<string>()

  const fire = (child: RlmChildSnapshot) => {
    timers.delete(child.id)
    const reason = `Host watchdog: exceeded ${Math.round(limitMs / 60_000)} min wall-clock limit`
    const cancelled = session.cancelRlmChildRun(child.id, reason)
    console.warn(`[Pi SDK] rlm child ${child.sessionName ?? child.id} 超时，watchdog 取消: ${cancelled}`)
    const match = child.label.match(JOB_BRIEF_PATTERN)
    if (!match) return
    const record = {
      kind: 'timeout',
      source: 'host-watchdog',
      job: `${match[2]}/${match[3]}`,
      name: child.sessionName,
      ts: new Date().toISOString(),
      cancelled,
    }
    try {
      appendFileSync(join(match[1]!, match[2]!, 'failures.jsonl'), `${JSON.stringify(record)}\n`)
    } catch (error) {
      console.error(`[Pi SDK] watchdog 写 failures.jsonl 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type !== 'rlm_child_update') return
    const child = event.child
    if (!ACTIVE.has(child.status)) {
      clearTimeout(timers.get(child.id))
      timers.delete(child.id)
      seen.add(child.id)
      return
    }
    if (seen.has(child.id)) return
    seen.add(child.id)
    const timer = setTimeout(() => fire(child), limitMs)
    timer.unref?.()
    timers.set(child.id, timer)
  })

  return () => {
    unsubscribe()
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
}
