/**
 * Gate 2 · reconcile —— 报告里的数字与重算值对得上。
 *
 * 旧实现的四条实测教训全部固化成规则：
 * - F1（review 与 reconcile 死锁）：结论行（`- H1: SUPPORTED`）枚举的是 register
 *   状态，不是证据性断言——只要求它与重放状态**一致**，不要求每个 LIVE claim
 *   都有 artifact。未检验的 LIVE 假设存在时，报告依然有解。
 * - F6/F7（频段豁免）：严格两数值 `[lo, hi]` 是预登记内容，豁免出处对账；
 *   任意方括号（`准确率 [0.91]`）不豁免。
 * - F8（零小数位容差）：`约 1 (P1)` 买不到 ±0.5——容差上限为 |重算值| 的 1%。
 * - F9（中文无词边界）：claim 引用用裸 `H\d+` 模式，`据H99的分析` 也会被抓。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256 } from '../src/state'
import {
  fail,
  isVerdictLine,
  loadRun,
  maskBandExpressions,
  matchesWithinRoundingTolerance,
  ok,
  recomputeForProbe,
  type GateResult,
} from './lib'

/** 结果数字必须带 (P#) 出处，且 P# 已落地。 */
const NUMBER_WITH_SOURCE = /-?\d+(?:\.\d+)?\s*\(P(\d+)\)/g
/** 裸数字（同一行没有 (P#) 出处）。 */
const BARE_NUMBER = /-?\d+\.\d+/

export function runReconcileGate(runRoot: string): GateResult {
  const reasons: string[] = []
  const state = loadRun(runRoot)

  const declared = state.reports[state.reports.length - 1]
  if (!declared) {
    return fail('reconcile', ['没有任何已声明的报告（report_declare）'])
  }
  const reportPath = join(runRoot, declared.path)
  if (!existsSync(reportPath)) {
    return fail('reconcile', [`已声明的报告文件不存在: ${declared.path}`])
  }
  const reportText = readFileSync(reportPath, 'utf-8')
  if (sha256(reportText) !== declared.sha256) {
    reasons.push('报告文件与声明时的 sha256 不符（声明后被改动）')
  }

  const landedPids = new Set(state.probes.filter((p) => p.status === 'LANDED').map((p) => p.pid))
  const knownClaims = new Map(state.claims.map((c) => [c.id, c]))

  const lines = reportText.split('\n')
  for (const [index, rawLine] of lines.entries()) {
    const lineNo = index + 1
    const isVerdict = isVerdictLine(rawLine)
    // 频段表达式是预登记内容，先摘掉再对账（F6/F7）
    const masked = maskBandExpressions(rawLine)

    // 结论行：必须与重放出的 register 状态一致（F1 的一致解）
    if (isVerdict) {
      const id = rawLine.match(/H\d+/)?.[0]
      const claimedState = rawLine.split(/[:：]/)[1]?.trim().toUpperCase()
      const actual = id ? knownClaims.get(id) : undefined
      if (!actual) {
        reasons.push(`第 ${lineNo} 行结论引用了未知假设 ${id ?? '(无)'}`)
      } else if (claimedState !== actual.state) {
        reasons.push(`第 ${lineNo} 行结论 ${id}: ${claimedState} 与 register 实际状态 ${actual.state} 不符`)
      }
      continue
    }

    // 证据性断言中的 claim 引用必须存在（F9：裸 H\d+，中文无词边界）
    for (const match of masked.matchAll(/H\d+/g)) {
      if (!knownClaims.has(match[0])) {
        reasons.push(`第 ${lineNo} 行引用了未知假设 ${match[0]}`)
      }
    }

    // 数字出处对账：带 (P#) 的数字与重算值比对；裸小数一律拒绝
    const sources = [...masked.matchAll(NUMBER_WITH_SOURCE)]
    const hasSourceOnLine = sources.length > 0
    for (const match of sources) {
      const cited = Number(match[0].match(/-?\d+(?:\.\d+)?/)?.[0])
      const pid = `P${match[1]}`
      if (!landedPids.has(pid)) {
        reasons.push(`第 ${lineNo} 行引用 ${pid} 作为出处，但它没有落地`)
        continue
      }
      const recomputed = recomputeForProbe(runRoot, pid)
      if (!matchesWithinRoundingTolerance(cited, recomputed)) {
        reasons.push(`第 ${lineNo} 行幻觉数字：报告称 ${cited}（${pid}），重算 ${recomputed}`)
      }
    }
    if (!hasSourceOnLine && BARE_NUMBER.test(masked)) {
      const bare = masked.match(BARE_NUMBER)?.[0]
      reasons.push(`第 ${lineNo} 行的数字 ${bare} 缺少 (P#) 出处（报告数字必须可对账）`)
    }
  }

  return reasons.length === 0 ? ok('reconcile') : fail('reconcile', reasons)
}

if (import.meta.main) {
  const [runRoot] = process.argv.slice(2)
  if (!runRoot) {
    console.error('用法: bun research/gates/reconcile.ts <run-dir>')
    process.exit(2)
  }
  const result = runReconcileGate(runRoot)
  for (const failure of result.failures) console.error(`✗ ${failure.reason}`)
  console.log(`GATE reconcile: ${result.passed ? 'PASS' : 'FAIL'}`)
  process.exit(result.passed ? 0 : 1)
}
