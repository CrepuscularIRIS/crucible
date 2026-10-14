/**
 * 父会话空闲时到达的 rlm 完成通知（01-统一架构 §12 Q2 = c，HUMAN_CONFIRMED）。
 *
 * Prime 在 child 结束时把通知作为 followUp + queueIfBusy 注入父会话；父会话空闲时这会直接
 * 开新轮（PA agent-session.ts:9789-9813、:4556-4559）。Proma 的 query 订阅与 session.prompt()
 * 同生同灭，所以"空闲但 query 仍订阅"只是 prompt 链收尾的瞬间，不是可停留的状态：
 *   - query 订阅中（prompt 在跑）：不干预，Prime 排队、在 loop 边界消费（= 允许自动续跑）；
 *   - query 已结束：若还有 child 在跑，持有 Prime 公开的 acquireQueuedWorkPause()——
 *     通知停在 Prime 的准入栅栏里不开新轮，也不丢；终态只经 onIdleNotice 转给 UI。
 *     下一次 query 在 session.prompt() **同步紧前**调 beforePrompt() 释放：用户 prompt 先占
 *     准入 FIFO，停住的通知随后作为 followUp 排进这一轮（PA :4418-4456、:6460-6476）。
 *
 * ponytail: 暂停期间 Prime 的其他自发续跑（压缩后 continue 等）同样被推迟到下一次 prompt——
 * 那正是 query 结束后不该出现的幽灵轮；需要区分时再按 customType 细分。
 */

import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent'

const TERMINAL = new Set(['done', 'error', 'cancelled'])
// 与 research_kit.jobs.parse_status 同样宽容：先去掉 markdown 的 ` 和 *，大小写不敏感，\s*。
const STATUS_LINE = /STATUS:\s*(?:ok|blocked|failed)(?:\s+SELF_REVIEWED)?\s+PATH:\s*\S+/i

/** §4.2 STATUS 契约：从完成通知预览（child 最后一条消息前 ≤160 字符）里取出 STATUS 行。 */
export function extractStatusLine(text: string | undefined): string | undefined {
  return text?.replace(/[`*]/g, '').match(STATUS_LINE)?.[0].replace(/[.,;:)\]]+$/, '')
}

export interface IdleChildNotice {
  id: string
  sessionName?: string
  status: string
  statusLine?: string
}

export function installIdleChildNoticePolicy(
  session: Pick<AgentSession, 'subscribe' | 'hasRunningRlmChildren' | 'acquireQueuedWorkPause'>,
  onIdleNotice: (notice: IdleChildNotice) => void,
): { queryEnded(): void; beforePrompt(): void } {
  let pause: { release(): void } | undefined

  session.subscribe((event: AgentSessionEvent) => {
    if (!pause || event.type !== 'rlm_child_update') return
    const { id, status, sessionName, answerPreview } = event.child
    if (!TERMINAL.has(status)) return
    onIdleNotice({ id, sessionName, status, statusLine: extractStatusLine(answerPreview) })
  })

  return {
    queryEnded() {
      if (!pause && session.hasRunningRlmChildren()) pause = session.acquireQueuedWorkPause()
    },
    /** 必须与 session.prompt() 处于同一同步段，否则停住的通知可能先开轮。 */
    beforePrompt() {
      pause?.release()
      pause = undefined
    },
  }
}
