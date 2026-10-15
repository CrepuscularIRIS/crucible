/** 零模型答辩演示：只修改独立临时副本，检查报告完整性，不验证科学结论。 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeTextFileAtomic } from '../../apps/electron/src/main/lib/safe-file'
import { runPreregGate } from '../../packages/research-mcp/gates/prereg'
import { runReconcileGate } from '../../packages/research-mcp/gates/reconcile'
import { runTraceGate } from '../../packages/research-mcp/gates/trace'
import { loadRun } from '../../packages/research-mcp/gates/lib'
import { sha256 } from '../../packages/research-mcp/src/state'

export function demonstrateReportIntegrity(source: string) {
  // 必须先通过原归档的当前检查；不能用缺原始输出的案例演示“可完整对账”。
  const baseline = [runPreregGate(source), runReconcileGate(source), runTraceGate(source)]
  if (baseline.some(check => !check.passed)) throw new Error('原归档检查未通过，停止演示')
  const report = loadRun(source).reports.at(-1)
  if (!report) throw new Error('缺少已声明报告')
  const original = readFileSync(join(source, report.path), 'utf8')
  const before = sha256(original)
  const temporary = mkdtempSync(join(tmpdir(), 'crucible-report-demo-'))
  try {
    const copy = join(temporary, 'run')
    cpSync(source, copy, { recursive: true })
    writeTextFileAtomic(join(copy, report.path), `${original}\n仅在临时副本追加：演示声明后的报告被改动。\n`)
    const rejected = runReconcileGate(copy)
    const numeric = original.replace(/(-?\d+(?:\.\d+)?)\s*\(P\d+\)/, match => match.replace(/^-?\d+(?:\.\d+)?/, '999999'))
    if (numeric === original) throw new Error('报告没有可演示的探针数值引用')
    writeTextFileAtomic(join(copy, report.path), numeric)
    // 保留原声明与原始输出，直接调用现有检查，同时显示摘要不符及具体数字失配。
    const numericRejected = runReconcileGate(copy)
    const originalUnchanged = sha256(readFileSync(join(source, report.path), 'utf8')) === before
    if (rejected.passed || numericRejected.passed || !originalUnchanged) throw new Error('演示未得到预期拒绝，或原报告发生变化')
    return {
      scope: '原归档只读；临时副本演示；未调用模型或重新执行实验；不验证科学结论',
      baseline,
      changedCopy: rejected,
      proposedWrongNumber: numericRejected,
      originalUnchanged,
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const source = process.argv[2]
  if (!source) {
    console.error('用法: bun research/report/demo-report-integrity.ts <完整归档目录>')
    process.exitCode = 2
  } else {
    try { console.log(JSON.stringify(demonstrateReportIntegrity(source), null, 2)) }
    catch (error) {
      console.error(`演示未完成：${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    }
  }
}
