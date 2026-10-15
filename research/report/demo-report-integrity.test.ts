import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { demonstrateReportIntegrity } from './demo-report-integrity'

describe('零模型报告完整性演示', () => {
  test('Given 原始输出齐全的交付归档 When 临时副本改报告 Then 被拒且原报告不变', () => {
    const result = demonstrateReportIntegrity(join(import.meta.dir, '../campaigns/2026-10-15-glm53flash-delivery-oneline-ca_rebound'))
    expect(result.baseline.every(check => check.passed)).toBe(true)
    expect(result.changedCopy.passed).toBe(false)
    expect(result.changedCopy.failures.some(failure => failure.reason.includes('sha256 不符'))).toBe(true)
    expect(result.proposedWrongNumber.failures.some(failure => failure.reason.includes('幻觉数字'))).toBe(true)
    expect(result.proposedWrongNumber.failures.some(failure => failure.reason.includes('sha256 不符'))).toBe(true)
    expect(result.originalUnchanged).toBe(true)
  })

  test('Given 缺原始输出的旧归档 When 开始演示 Then 报错而非冒充可复算通过', () => {
    expect(() => demonstrateReportIntegrity(join(import.meta.dir, '../campaigns/2026-10-14-glm53flash-oneline-ca_rebound'))).toThrow('output.txt')
  })
})
