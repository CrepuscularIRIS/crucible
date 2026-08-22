/**
 * 硬 gate 共享库：宿主侧裁决，退出码说话。
 *
 * gate 与 MCP server 共用同一份 replay 实现（packages/research-mcp/src/state.ts）
 * ——"双份实现必须等价"在旧实现里只是注释里的愿望，这里从结构上消灭双份。
 *
 * 舍入容差规则（旧实现的实测教训）：
 * - 以**引用值**的小数位为准，半宽 = 末位 0.5（0.65 对 0.6465 合法）；
 * - 零小数位引用不许买到 ±0.5：容差上限为 |重算值| 的 1%（`约 1 (P1)` 不再通过）。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recomputeMetric, replay, type Band, type ProbeSpec, type ResearchState } from '../src/state'

export interface GateFailure {
  gate: string
  reason: string
}

export interface GateResult {
  gate: string
  passed: boolean
  failures: GateFailure[]
}

export function ok(gate: string): GateResult {
  return { gate, passed: true, failures: [] }
}

export function fail(gate: string, reasons: string[]): GateResult {
  return { gate, passed: false, failures: reasons.map((reason) => ({ gate, reason })) }
}

export function loadRun(runRoot: string): ResearchState {
  if (!existsSync(join(runRoot, 'journal.jsonl'))) {
    throw new Error(`不是研究 run 目录（缺 journal.jsonl）: ${runRoot}`)
  }
  return replay(runRoot)
}

export function loadSpec(runRoot: string, pid: string): ProbeSpec {
  const file = join(runRoot, 'prereg', `${pid}.json`)
  return JSON.parse(readFileSync(file, 'utf-8')) as ProbeSpec
}

export function rawOutput(runRoot: string, pid: string): string {
  return readFileSync(join(runRoot, 'probes', pid, 'raw', 'output.txt'), 'utf-8')
}

export function recomputeForProbe(runRoot: string, pid: string): number {
  const spec = loadSpec(runRoot, pid)
  return recomputeMetric(rawOutput(runRoot, pid), spec.metricKind, spec.metricSpec)
}

/** 引用值与重算值的舍入容差比较。 */
export function matchesWithinRoundingTolerance(cited: number, recomputed: number): boolean {
  const decimals = String(cited).includes('.') ? String(cited).split('.')[1].length : 0
  const halfWidth = 0.5 * 10 ** -decimals
  const cap = Math.abs(recomputed) * 0.01
  const tolerance = decimals === 0 ? Math.min(halfWidth, cap) : halfWidth
  return Math.abs(cited - recomputed) <= tolerance + 1e-12
}

/** 严格两数值频段表达式 `[lo, hi]`（频段豁免不接受任意方括号）。 */
const STRICT_BAND_EXPRESSION = /\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]/g

/** 频段中括号内的数字不参与出处对账（它们是预登记内容，不是结果数字）。 */
export function maskBandExpressions(line: string): string {
  return line.replace(STRICT_BAND_EXPRESSION, (match) => ' '.repeat(match.length))
}

/** 结论行（如 `- H1: SUPPORTED`）：枚举 register 状态，不是证据性断言。 */
export function isVerdictLine(line: string): boolean {
  return /^\s*[-*]?\s*H\d+\s*[:：]/.test(line)
}

export function inBand(value: number, band: Band): boolean {
  return value >= band[0] && value <= band[1]
}
