/**
 * Gate 3 · trace —— 状态是怎么来的。
 *
 * 旧实现最贵的教训：四道 gate 曾对一场完全捏造的战役全绿，因为所有 gate
 * 都把模型可写的 register.json 当事实读。本 gate 拿只追加的 journal 重放
 * 一遍，与磁盘上的 register.json 逐字对比——手改 register 当场变红。
 *
 * 同时执行"空 run 不通过"判定（对空集合的循环不构成检查）与时间戳单调性。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { replay, type JournalEvent } from '../src/state'
import { fail, ok, type GateResult } from './lib'

export function runTraceGate(runRoot: string): GateResult {
  const reasons: string[] = []
  const journalFile = join(runRoot, 'journal.jsonl')
  if (!existsSync(journalFile)) {
    return fail('trace', [`不是研究 run 目录: ${runRoot}`])
  }

  // journal 自身必须能重放（损坏/矛盾事件在此抛出）
  let replayed
  try {
    replayed = replay(runRoot)
  } catch (error) {
    return fail('trace', [`journal 重放失败: ${error instanceof Error ? error.message : String(error)}`])
  }

  // 空 run 不通过：没有落地探针、或没有任何 claim 走到终态
  if (!replayed.probes.some((p) => p.status === 'LANDED')) {
    reasons.push('空 run：没有任何已落地探针')
  }
  if (replayed.graveyard.length === 0 && !replayed.claims.some((c) => c.state === 'SUPPORTED')) {
    reasons.push('空 run：没有任何假设走到终态（信念从未被证据改变过）')
  }

  // register.json 必须与重放结果逐字一致（防手改）
  const registerFile = join(runRoot, 'register.json')
  if (!existsSync(registerFile)) {
    reasons.push('register.json 缺失')
  } else {
    const onDisk = readFileSync(registerFile, 'utf-8').trim()
    const derived = JSON.stringify(replayed, null, 2).trim()
    if (onDisk !== derived) {
      reasons.push('register.json 与 journal 重放结果不一致（状态文件被手改，或缺少最后一次 server 写入） → 手改 register 无效：journal 是唯一事实源，用 MCP 工具重做状态变更')
    }
  }

  // journal 时间戳单调不减（事后补写/倒填的时间戳是伪造的第一现场）
  const events = readFileSync(journalFile, 'utf-8').split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as JournalEvent)
  for (let i = 1; i < events.length; i += 1) {
    if (new Date(events[i].ts).getTime() < new Date(events[i - 1].ts).getTime()) {
      reasons.push(`journal 第 ${i + 1} 条时间戳早于前一条（顺序被倒填）`)
      break
    }
  }

  // P4.1 · 对抗义务（ARFT R3：路径必须被自己控制不了的检查质询过）。
  // 时间戳取自 journal 事件而非 state（register 形状不变，归档产物免重生成）。
  reasons.push(...checkAdversarialObligation(replayed, events))
  reasons.push(...checkWorldTrace(events))

  return reasons.length === 0 ? ok('trace') : fail('trace', reasons)
}

const WORLD_OPS = new Set<JournalEvent['op']>([
  'world.info',
  'world.observe',
  'world.simulate',
  'world.forecast',
])

/**
 * world 事件也是 gate 的事实输入：检查预算快照、终局唯一性和终局后不可再查询。
 * 这不是把 meter 与 journal 伪装成两个独立记账者；这里只重放唯一事实源本身。
 */
function checkWorldTrace(events: JournalEvent[]): string[] {
  const reasons: string[] = []
  let spent = 0
  let forecastCount = 0
  let terminalIndex = -1

  events.forEach((event, index) => {
    if (!WORLD_OPS.has(event.op)) return
    if (terminalIndex >= 0) {
      reasons.push(`world 终局后仍出现 ${event.op}（journal 第 ${index + 1} 条）`)
    }
    if (event.op === 'world.info') return
    if (event.op === 'world.observe') {
      const cost = Number(event.cost)
      if (!Number.isFinite(cost) || cost < 0) {
        reasons.push(`world.observe cost 非法（journal 第 ${index + 1} 条）`)
        return
      }
      spent += cost
      return
    }
    if (event.op === 'world.simulate') {
      if (event.mode !== 'candidate') {
        reasons.push(`world.simulate 只能记录 candidate；info 必须记 world.info（journal 第 ${index + 1} 条）`)
      }
      return
    }

    forecastCount += 1
    if (forecastCount > 1) reasons.push('world.forecast 在同一 run 中出现超过一次')
    if (Number(event.budget_spent) !== spent) {
      reasons.push(`world.forecast 的预算快照 ${String(event.budget_spent)} 与此前 world.observe 累计 ${spent} 不一致`)
    }
    terminalIndex = index
  })
  return reasons
}

const TERMINAL_STATES = new Set(['SUPPORTED', 'REFUTED', 'SCOPED'])

function checkAdversarialObligation(
  replayed: ReturnType<typeof replay>,
  events: JournalEvent[],
): string[] {
  const reasons: string[] = []
  // "晚于"以只追加 journal 的条目序为准（同毫秒写入合法；时间戳只拒倒填）
  const lastTerminalIndex = new Map<string, number>()
  let runLastTerminalIndex = -1
  events.forEach((event, index) => {
    if (event.op !== 'claim.transition' || !TERMINAL_STATES.has(String(event.to))) return
    const id = String(event.id)
    lastTerminalIndex.set(id, Math.max(lastTerminalIndex.get(id) ?? -1, index))
    runLastTerminalIndex = Math.max(runLastTerminalIndex, index)
  })
  const attackIndexes = (target?: string) => events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.op === 'attack.record'
      && (target === undefined || String(event.target) === target))
    .map(({ index }) => index)

  // 规则 1：每个 SUPPORTED claim 至少一条攻击晚于它的最后一次终态迁移
  for (const claim of replayed.claims) {
    if (claim.state !== 'SUPPORTED') continue
    const terminalIndex = lastTerminalIndex.get(claim.id) ?? -1
    if (!attackIndexes(claim.id).some((index) => index > terminalIndex)) {
      reasons.push(
        `SUPPORTED 结论 ${claim.id} 没有任何晚于其终态迁移的对抗攻击（对抗者必须见过最终信念，不是草稿）`
        + ' → 用 research-grill 拉对抗者并 attack_record 指向它',
      )
    }
  }

  // 规则 2（run 级）：信念定格后对抗者至少看过一眼（kill/scope 不逐条强制）
  if (runLastTerminalIndex >= 0 && !attackIndexes().some((index) => index > runLastTerminalIndex)) {
    reasons.push(
      '最后一次终态迁移之后没有任何对抗攻击（graveyard 可见是约束 5，这是它的执行点）'
      + ' → research-grill 至少跑一轮并 attack_record',
    )
  }
  return reasons
}

if (import.meta.main) {
  const [runRoot] = process.argv.slice(2)
  if (!runRoot) {
    console.error('用法: bun research/gates/trace.ts <run-dir>')
    process.exit(2)
  }
  const result = runTraceGate(runRoot)
  for (const failure of result.failures) console.error(`✗ ${failure.reason}`)
  console.log(`GATE trace: ${result.passed ? 'PASS' : 'FAIL'}`)
  process.exit(result.passed ? 0 : 1)
}
