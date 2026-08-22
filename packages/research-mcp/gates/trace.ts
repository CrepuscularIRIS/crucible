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
      reasons.push('register.json 与 journal 重放结果不一致（状态文件被手改，或缺少最后一次 server 写入）')
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

  return reasons.length === 0 ? ok('trace') : fail('trace', reasons)
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
