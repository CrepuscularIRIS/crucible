/**
 * 压缩后强制一次 RLM 复核。
 *
 * 压缩摘要是模型自己写的有损陈述：哪些 claim 已证伪、哪个 probe 已落地，摘要可能写错，
 * 而压缩后的模型只能信它。这里在每次成功压缩后挂一道闸：
 *   need_spawn —— 只放行 spawn rlm 子代理的 ipython cell；
 *   waiting    —— 子代理跑完前只放行 ipython（用来等待/读检查点文件），其余工具拦截；
 *   子代理 rlm_child_update 进入 done/error/cancelled 后解闸。
 * rlm() 在准入时就返回句柄、从不返回子代理答案（Prime prompts/rlm.ts），所以结果走文件。
 *
 * 覆盖所有压缩路径（CompactContext、阈值自动压缩、溢出恢复、kernel compact.run、
 * 用户 /compact）——它们都经 compaction_end 事件。
 */

import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent'

/** `rlm(...)` / `rlm.run(...)` 才是 spawn；`rlm.harness.*`、`rlm.list_subagents()` 不算。 */
const RLM_SPAWN_PATTERN = /\brlm(?:\.run)?\s*\(/

/** 闸不能挡住退出计划模式或问人，否则计划模式（ipython 被拒）下会话死锁。 */
const ALWAYS_ALLOWED = new Set(['ExitPlanMode', 'AskUserQuestion'])

/** 模型连续被拦这么多次仍不配合（弱模型常见），放行并告警，避免空烧回合。 */
const MAX_CONSECUTIVE_BLOCKS = 5

const TERMINAL_CHILD_STATUSES = new Set(['done', 'error', 'cancelled'])

export const POST_COMPACTION_RLM_REASON = `<post_compaction_rlm_required>
Context was just compacted. The summary is a lossy, model-written account and may misstate what is done.
1. Run ONE ipython cell that spawns a checker child (rlm() returns a handle at once, never the answer):
   await rlm("From durable files only (research runs: research_state, journal.jsonl, RULINGS.md; otherwise the persisted handoff), re-derive: done, pending, next action, and every point where it disagrees with these summary claims: <key claims>. Write the result to compaction-checkpoint.md in the working directory.", name="compaction-check")
2. Wait for it in ipython (e.g. poll compaction-checkpoint.md with await asyncio.sleep(20)). Other tools stay blocked until the child finishes.
3. Continue from compaction-checkpoint.md, not from the summary.
</post_compaction_rlm_required>`

const WAITING_REASON = 'The compaction-check rlm child is still running. Use ipython to wait for compaction-checkpoint.md; other tools unlock when the child finishes.'

export function isRlmSpawnCall(toolName: string, args: unknown): boolean {
  if (toolName !== 'ipython') return false
  const code = (args as { code?: unknown } | undefined)?.code
  return typeof code === 'string' && RLM_SPAWN_PATTERN.test(code)
}

/**
 * ponytail: 闸状态只在闭包里——常驻会话空闲释放或应用重启会静默清闸；任何 rlm 子代理
 * 终态都会解闸（不认具体 child id）；注释里写 `rlm(` 也能骗过正则。需要更严时再收紧。
 */
export function installPostCompactionRlmGate(session: AgentSession): void {
  let gate: 'idle' | 'need_spawn' | 'waiting' = 'idle'
  let consecutiveBlocks = 0
  const release = (why?: string) => {
    if (why) console.warn(`[Pi SDK] 压缩后 RLM 复核闸放行：${why}`)
    gate = 'idle'
    consecutiveBlocks = 0
  }

  session.subscribe((event: AgentSessionEvent) => {
    if (event.type === 'compaction_end' && !event.aborted && event.result) {
      gate = 'need_spawn'
      consecutiveBlocks = 0
    }
    if (event.type === 'rlm_child_update' && gate === 'waiting' && TERMINAL_CHILD_STATUSES.has(event.child.status)) {
      release()
    }
  })

  const block = (reason: string) => {
    consecutiveBlocks += 1
    if (consecutiveBlocks > MAX_CONSECUTIVE_BLOCKS) {
      release(`连续 ${MAX_CONSECUTIVE_BLOCKS} 次拦截后模型仍未配合`)
      return undefined
    }
    return { block: true, reason }
  }

  const previousBeforeToolCall = session.agent.beforeToolCall
  session.agent.beforeToolCall = async (context, signal) => {
    const name = context.toolCall.name
    if (gate === 'need_spawn' && !ALWAYS_ALLOWED.has(name)) {
      if (!isRlmSpawnCall(name, context.args)) {
        // 超限放行也必须继续走权限 hook，不能绕过。
        return block(POST_COMPACTION_RLM_REASON) ?? previousBeforeToolCall?.(context, signal)
      }
      const previousResult = await previousBeforeToolCall?.(context, signal)
      // spawn cell 被权限/计划模式拒绝：模型无法满足闸，放行而不是锁死会话。
      if (previousResult?.block) release('spawn 被权限拒绝')
      else { gate = 'waiting'; consecutiveBlocks = 0 }
      return previousResult
    }
    if (gate === 'waiting' && name !== 'ipython' && !ALWAYS_ALLOWED.has(name)) {
      const blocked = block(WAITING_REASON)
      if (blocked) return blocked
    }
    return previousBeforeToolCall?.(context, signal)
  }
}
