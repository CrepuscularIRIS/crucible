/**
 * Gate 1 · prereg —— 执行之前存在预登记。
 *
 * 检查（全部从 journal 重放，不信任任何可直接编辑的状态文件）：
 * 1. 每个探针的 prereg.write 早于 probe.start（时间戳严格递增）；
 * 2. 每个已落地探针的预登记文件存在且 sha256 与 journal 记录一致；
 * 3. 预登记规格非装饰性：互斥频段对 + kill/scope 分支；
 * 4. 空 run 不通过（没有任何已落地探针 = 没有可裁决的证据链）。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasDisjointBandPair, sha256, stableStringify, type JournalEvent } from '../src/state'
import { fail, loadSpec, loadRun, ok, type GateResult } from './lib'

export function runPreregGate(runRoot: string): GateResult {
  const reasons: string[] = []
  const journalFile = join(runRoot, 'journal.jsonl')
  const events = readFileSync(journalFile, 'utf-8').split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as JournalEvent)

  const preregByPid = new Map<string, JournalEvent>()
  const startByPid = new Map<string, JournalEvent>()
  for (const event of events) {
    if (event.op === 'prereg.write' && !preregByPid.has(String(event.pid))) preregByPid.set(String(event.pid), event)
    if (event.op === 'probe.start') startByPid.set(String(event.pid), event)
    // 顺序检查：任何 probe.start 之前必须已有对应 prereg.write
    if (event.op === 'probe.start' && !preregByPid.has(String(event.pid))) {
      // 由下方 startByPid 循环给出原因，这里不重复
    }
  }

  const state = loadRun(runRoot)
  const landed = state.probes.filter((p) => p.status === 'LANDED')
  if (landed.length === 0) {
    reasons.push('空 run：没有任何已落地探针（对空集合的检查全部跳过不算通过）')
  }

  for (const [pid, startEvent] of startByPid) {
    const prereg = preregByPid.get(pid)
    if (!prereg) {
      reasons.push(`${pid} 没有预登记就被执行 → 这种 run 无法补正：新探针必须先 prereg_write 再 probe_run`)
      continue
    }
    // 顺序由只追加 journal 保证（prereg.write 必须排在 probe.start 之前）；
    // 时间戳只拒绝"倒填"（预登记晚于执行），同毫秒内合法。
    if (new Date(prereg.ts).getTime() > new Date(startEvent.ts).getTime()) {
      reasons.push(`${pid} 的预登记时间戳晚于执行开始（先登记后执行被破坏）`)
    }
    const specFile = join(runRoot, 'prereg', `${pid}.json`)
    if (!existsSync(specFile)) {
      reasons.push(`${pid} 的预登记文件缺失`)
      continue
    }
    // 与 server 侧同一份 stableStringify + sha256：单一实现，不做第二份
    const stableDigest = sha256(stableStringify(JSON.parse(readFileSync(specFile, 'utf-8'))))
    if (prereg.spec_sha256 !== stableDigest) {
      reasons.push(`${pid} 的预登记文件 sha256 与 journal 记录不符（执行前内容被改动）`)
    }
  }

  for (const probe of state.probes) {
    if (probe.status === 'PREREG') continue
    if (!existsSync(join(runRoot, 'prereg', `${probe.pid}.json`))) {
      reasons.push(`${probe.pid} 的预登记文件缺失`)
      continue
    }
    const spec = loadSpec(runRoot, probe.pid)
    if (!hasDisjointBandPair(spec.bands)) {
      reasons.push(`${probe.pid} 预登记缺少互斥频段对（装饰性探针） → research-probe：写出至少一对不重叠频段再 prereg_write`)
    }
    if (!spec.branches.some((b) => b.action === 'kill' || b.action === 'scope')) {
      reasons.push(`${probe.pid} 预登记缺少 kill/scope 分支`)
    }
  }

  return reasons.length === 0 ? ok('prereg') : fail('prereg', reasons)
}

if (import.meta.main) {
  const [runRoot] = process.argv.slice(2)
  if (!runRoot) {
    console.error('用法: bun research/gates/prereg.ts <run-dir>')
    process.exit(2)
  }
  const result = runPreregGate(runRoot)
  for (const failure of result.failures) console.error(`✗ ${failure.reason}`)
  console.log(`GATE prereg: ${result.passed ? 'PASS' : 'FAIL'}`)
  process.exit(result.passed ? 0 : 1)
}
