/**
 * 压缩后强制一次 RLM 复核。
 *
 * 压缩摘要是模型自己写的有损陈述：哪些 claim 已证伪、哪个 probe 已落地，摘要可能写错，
 * 而压缩后的模型只能信它。这里在每次成功压缩后挂一道闸：
 *   need_spawn —— 只放行 spawn rlm 子代理的 ipython cell；
 *   waiting    —— 收到本次压缩后新出现的 child 的 rlm_child_update(queued/running) 才进入；
 *                 子代理跑完前只放行 ipython（用来等待/读检查点文件），其余工具拦截；
 *   该 child 进入 done/error/cancelled 后解闸。
 * spawn 以 Prime 事件为准、不以正则为准：spawn cell 在 kernel 里抛错（如重名）时不会卡在 waiting。
 * child 名与检查点文件名每次压缩带新 nonce（已保留的 child 名第二次 spawn 必抛错，PA :9603-9616）。
 * rlm() 在准入时就返回句柄、从不返回子代理答案（Prime prompts/rlm.ts），所以结果走文件。
 *
 * 覆盖所有压缩路径（CompactContext、阈值自动压缩、溢出恢复、kernel compact.run、
 * 用户 /compact）——它们都经 compaction_end 事件。
 */

import { randomBytes } from 'node:crypto'
import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent'

/** `rlm(...)` / `rlm.run(...)` 才是 spawn；`rlm.harness.*`、`rlm.list_subagents()` 不算。 */
const RLM_SPAWN_PATTERN = /\brlm(?:\.run)?\s*\(/

/** 闸不能挡住退出计划模式或问人，否则计划模式（ipython 被拒）下会话死锁。 */
const ALWAYS_ALLOWED = new Set(['ExitPlanMode', 'AskUserQuestion'])

/** 模型连续被拦这么多次仍不配合（弱模型常见），放行并告警，避免空烧回合。 */
const MAX_CONSECUTIVE_BLOCKS = 5

const TERMINAL_CHILD_STATUSES = new Set(['done', 'error', 'cancelled'])

const ACTIVE_CHILD_STATUSES = new Set(['queued', 'running'])

export function postCompactionRlmReason(nonce: string): string {
  return `<post_compaction_rlm_required>
Context was just compacted. The summary is a lossy, model-written account and may misstate what is done.
1. Run ONE ipython cell that spawns a checker child (rlm() returns a handle at once, never the answer):
   await rlm("Re-derive the task state without trusting this summary. Research runs: use the research_state tool (read-only); do not open files under .proma-research (the isolation guard blocks writing anything derived from them). Otherwise read the persisted handoff. Report: done, pending, next action, and every point where it disagrees with these summary claims: <key claims>. Write the result to compaction-checkpoint-${nonce}.md in the working directory.", name="compaction-check-${nonce}")
2. Wait in ipython with a bound: poll until compaction-checkpoint-${nonce}.md exists or rlm.list_subagents() no longer shows compaction-check-${nonce} running, at most 20 minutes (e.g. 60 rounds of await asyncio.sleep(20)). Other tools stay blocked until the child finishes.
3. Continue from compaction-checkpoint-${nonce}.md, not from the summary.
</post_compaction_rlm_required>`
}

const WAITING_REASON = 'The compaction-check rlm child is still running. Use ipython to wait for its compaction-checkpoint file; other tools unlock when the child finishes.'

export function isRlmSpawnCall(toolName: string, args: unknown): boolean {
  if (toolName !== 'ipython') return false
  const code = (args as { code?: unknown } | undefined)?.code
  return typeof code === 'string' && RLM_SPAWN_PATTERN.test(code)
}

/**
 * ponytail: 闸状态只在闭包里——常驻会话空闲释放或应用重启会静默清闸；注释里写 `rlm(` 仍能
 * 通过 need_spawn 的放行过滤（但不会进入 waiting，必须真有 child 出现）。需要更严时再收紧。
 */
export function installPostCompactionRlmGate(session: AgentSession): void {
  let gate: 'idle' | 'need_spawn' | 'waiting' = 'idle'
  let consecutiveBlocks = 0
  let nonce = ''
  /** waiting 时等的那个 child；只有它的终态解闸。 */
  let checkerId: string | undefined
  /** 见过的 child id：压缩前就存在的 child 的 running 更新不能被当作本次 spawn。 */
  const knownChildIds = new Set<string>()
  const release = (why?: string) => {
    if (why) console.warn(`[Pi SDK] 压缩后 RLM 复核闸放行：${why}`)
    gate = 'idle'
    consecutiveBlocks = 0
    checkerId = undefined
  }

  session.subscribe((event: AgentSessionEvent) => {
    if (event.type === 'compaction_end' && !event.aborted && event.result) {
      gate = 'need_spawn'
      consecutiveBlocks = 0
      checkerId = undefined
      nonce = randomBytes(2).toString('hex')
    }
    if (event.type !== 'rlm_child_update') return
    const { id, status } = event.child
    const isNew = !knownChildIds.has(id)
    knownChildIds.add(id)
    if (gate === 'need_spawn' && isNew && ACTIVE_CHILD_STATUSES.has(status)) {
      gate = 'waiting'
      consecutiveBlocks = 0
      checkerId = id
    } else if (gate === 'waiting' && id === checkerId && TERMINAL_CHILD_STATUSES.has(status)) {
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
        return block(postCompactionRlmReason(nonce)) ?? previousBeforeToolCall?.(context, signal)
      }
      const previousResult = await previousBeforeToolCall?.(context, signal)
      // spawn cell 被权限/计划模式拒绝：模型无法满足闸，放行而不是锁死会话。
      // 否则保持 need_spawn：进入 waiting 只看 rlm_child_update(queued/running)。
      if (previousResult?.block) release('spawn 被权限拒绝')
      return previousResult
    }
    if (gate === 'waiting' && name !== 'ipython' && !ALWAYS_ALLOWED.has(name)) {
      const blocked = block(WAITING_REASON)
      if (blocked) return blocked
    }
    return previousBeforeToolCall?.(context, signal)
  }
}
