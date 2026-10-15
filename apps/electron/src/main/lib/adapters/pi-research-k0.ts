/**
 * K0 intake 的唯一一次停顿（01 §5.2 K0，P2）：持久化、默认阻塞、永不静默批准。
 *
 * - 父会话停下前把草稿写到 `<cwd>/.research-pending/K0-intake.md`，首个 `status:` 行为 `pending_user`
 *   （`research_init` 之前 run 目录还不存在）。
 * - 每回合上下文：pending 在 → `<research_k0_pending>` 原样带回草稿，resume 回到同一次确认（P2 检查）。
 * - `research_init` 闸：pending 写于最近一次用户回复（本 query 开始 / 针对这份草稿的 AskUserQuestion 回答）
 *   之后 → 拦。带 `mode` 的 init 没有草稿、run 里也没有 K0-intake.md → 拦（不写草稿跳不过 K0）；
 *   不带 mode 的 legacy init 不要求草稿。拦的是"代用户批准"本身，不是任何结论；reason 写明合法出口。
 *   默认阻塞来自运行时本身：AskUser 无超时，结束本轮后只有用户消息能开下一轮（§12 Q2 = c）。
 * - `research_init` 成功后宿主把 pending 移进入参 `run` 的 `<run>/K0-intake.md`，status 改 confirmed
 *   （agent 永不写状态根，02 §5 补记；画布与暂停闸门从这里读 `forks:` 行）。run 里已有 intake（mode 冻结）
 *   → 不覆盖，草稿改名留档为 `K0-intake.unapplied-<ts>.md` 并在 init 结果里告诉 agent，绝不静默删。
 */

import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

export const K0_PENDING_REL = '.research-pending/K0-intake.md'

const FIRST_STATUS = /^\s*status:.*$/m

export interface PendingK0 {
  path: string
  text: string
  mtimeMs: number
}

/** 只认首个 status 行：草稿正文里引用 "status: pending_user" 不该让已确认的文件复活。 */
export const isPendingK0 = (text: string): boolean => /^\s*status:\s*pending_user\b/.test(text.match(FIRST_STATUS)?.[0] ?? '')

export function readPendingK0(cwd: string): PendingK0 | undefined {
  const path = join(cwd, K0_PENDING_REL)
  try {
    const text = readFileSync(path, 'utf-8')
    if (!isPendingK0(text)) return undefined
    return { path, text, mtimeMs: statSync(path).mtimeMs }
  } catch {
    return undefined
  }
}

/** 每回合注入（仅研究父会话）；没有待确认的 K0 时为空串。 */
export function renderK0PendingBlock(cwd: string): string {
  const pending = readPendingK0(cwd)
  if (!pending) return ''
  return `<research_k0_pending>
K0 intake is waiting for the user (${pending.path}). The user's message in this turn is the only thing that can answer it:
- it confirms or amends → \`research_init\` with the confirmed values, then continue. Do not edit the pending file yourself (not even its status line): any edit after the reply voids the confirmation; the host moves the file into the run and marks it confirmed;
- otherwise (e.g. "继续", an unrelated question) → present the same intake again and end the turn.
Silence is never approval; never pick the defaults yourself.
${pending.text.trim()}
</research_k0_pending>`
}

/** `mcp__<含 research 的服务名>__research_init` */
function isResearchInit(toolName: string): boolean {
  const server = toolName.startsWith('mcp__') && toolName.endsWith('__research_init')
    ? toolName.slice('mcp__'.length, -'__research_init'.length)
    : ''
  return server.toLowerCase().includes('research')
}

/** 同 MCP `state.ts` 的 `sanitizeRunName` + `runDir`（electron 不依赖 research-mcp 包）；名字不合法 → undefined。 */
function runDirFromInput(cwd: string, input: Record<string, unknown>): string | undefined {
  const run = typeof input.run === 'string' ? input.run.replace(/[^A-Za-z0-9_.-]/g, '-').replace(/^\.+/, '') : ''
  return run ? join(cwd, '.proma-research', run) : undefined
}

/** 交付 run D1：agent 把草稿首行改成 confirmed 再 init，被拦；改回来又晚于回复，只好让用户再确认一次。 */
const KEEP_DRAFT = '用户回复后不要改草稿（含 status 行）：回复之后的任何改写都让这次确认作废；'
  + '用户原样确认或只改了 init 入参时直接调用 research_init，宿主自己把草稿移进 run 并改 status'
  + '（改了 forks / budget 这类只在草稿里的字段 → 重写草稿、再呈现一次）。'

const UNANSWERED = 'K0 intake 还在等用户确认（.research-pending/K0-intake.md 写于用户最近一次回复之后）：'
  + '宿主永不代用户批准。二选一：把 intake 呈现给用户后结束本轮；或单独调用 AskUserQuestion 等回答。'
  + '收到回答后再调用 research_init。'
  + KEEP_DRAFT

const NO_DRAFT = '带 mode 的 research_init 必须先过 K0：把 intake 草稿写到 .research-pending/K0-intake.md，'
  + '首行 `status: pending_user`，其后 mode · predicate · depth · forks 各一行；呈现给用户问一次'
  + '（结束本轮，或单独调用 AskUserQuestion），收到回答后再调用 research_init。宿主永不代用户批准。'
  + KEEP_DRAFT

export interface K0IntakeExtensionOptions {
  cwd: string
  /** 最近一次用户消息开启 query 的时刻（ms） */
  userReplyAt: () => number
}

export function createK0IntakeExtension(options: K0IntakeExtensionOptions): (pi: ExtensionAPI) => void {
  // AskUserQuestion 的回答只算对"发问时那份草稿"（按 mtime 认）的回复：草稿之前发的问题、或回答后草稿又改写，都不算。
  // ponytail: 不看问题内容——草稿在场时发的任何 AskUserQuestion 都算；要更严就核对问题文本含草稿的 mode / predicate。
  const askedFor = new Map<string, number>()
  let answeredDraftMtime: number | undefined
  return (pi) => {
    pi.on('tool_call', (event, ctx) => {
      if (ctx.sessionManager.getHeader()?.rlmDepth) return undefined
      if (event.toolName === 'AskUserQuestion') {
        const pending = readPendingK0(options.cwd)
        if (pending) askedFor.set(event.toolCallId, pending.mtimeMs)
        return undefined
      }
      if (!isResearchInit(event.toolName)) return undefined
      const pending = readPendingK0(options.cwd)
      if (pending) {
        const answered = pending.mtimeMs < options.userReplyAt() || pending.mtimeMs === answeredDraftMtime
        return answered ? undefined : { block: true, reason: UNANSWERED }
      }
      const input = event.input as Record<string, unknown>
      const runDir = runDirFromInput(options.cwd, input)
      // 不带 mode 只用于续跑已有的旧账本；新 run 不带 mode 等于绕过 K0 与全部封顶，同样要求先写 K0 草稿。
      if (input.mode == null) return runDir && existsSync(runDir) ? undefined : { block: true, reason: NO_DRAFT }
      return runDir && existsSync(join(runDir, 'K0-intake.md')) ? undefined : { block: true, reason: NO_DRAFT }
    })
    pi.on('tool_result', (event, ctx) => {
      if (ctx.sessionManager.getHeader()?.rlmDepth) return undefined
      if (event.toolName === 'AskUserQuestion') {
        const draftMtime = askedFor.get(event.toolCallId)
        askedFor.delete(event.toolCallId)
        if (draftMtime !== undefined && !event.isError) answeredDraftMtime = draftMtime
        return undefined
      }
      if (!isResearchInit(event.toolName) || event.isError) return undefined
      try {
        const note = moveIntoRun(options.cwd, event.input)
        return note ? { content: [...event.content, { type: 'text' as const, text: note }] } : undefined
      } catch (error) {
        console.error('[Pi SDK] K0-intake 移入 run 失败:', error)
        return undefined
      }
    })
  }
}

/** 返回要附在 research_init 结果后的说明（草稿没被采用时），否则 undefined。 */
function moveIntoRun(cwd: string, input: Record<string, unknown>): string | undefined {
  const pending = readPendingK0(cwd)
  const runDir = runDirFromInput(cwd, input)
  if (!pending || !runDir || !existsSync(runDir)) return undefined
  const target = join(runDir, 'K0-intake.md')
  const stamp = new Date().toISOString()
  if (!existsSync(target)) {
    writeFileSync(target, pending.text.replace(FIRST_STATUS, `status: confirmed · research_init ${stamp}`))
    rmSync(pending.path, { force: true })
    return undefined
  }
  // mode 在 init 时冻结（N9：切换 = 新 run）；重开同一 run 不覆盖已确认的 intake，新草稿改名留档。
  const kept = join(dirname(pending.path), `K0-intake.unapplied-${stamp.replace(/[:.]/g, '-')}.md`)
  renameSync(pending.path, kept)
  writeFileSync(kept, pending.text.replace(FIRST_STATUS, `status: unapplied · ${target} 已存在（mode 冻结）· ${stamp}`))
  console.warn(`[Pi SDK] ${target} 已存在，保留原 intake；新 K0 草稿留档于 ${kept}`)
  return `⚠ K0：${target} 已存在（mode 在首次 init 冻结），新的 K0 草稿未采用，原文留在 ${kept}。`
    + '要换 mode / predicate = 用新 run 名 research_init。'
}
