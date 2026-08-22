/**
 * 状态核心测试：五条科学约束的结构拒绝 + journal 重放。
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import {
  appendEvent,
  confined,
  hasDisjointBandPair,
  recomputeMetric,
  replay,
  sanitizeRunName,
  validateProbeSpec,
  type ProbeSpec,
} from './state'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'proma-research-state-'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function minimalState() {
  appendEvent(root, 'run.init', { run: 'test' })
  appendEvent(root, 'claim.propose', { id: 'H1', statement: 'A', predicts: ['x 升'] })
  appendEvent(root, 'claim.propose', { id: 'H2', statement: 'B', predicts: ['x 降'] })
  return replay(root)
}

function validSpec(overrides: Partial<ProbeSpec> = {}): ProbeSpec {
  return {
    pid: 'P1',
    question: 'A 还是 B？',
    evalCommand: 'echo ok',
    metricKind: 'json',
    metricSpec: 'metric.accuracy',
    bands: { H1: [0.8, 1.0], H2: [0.0, 0.6] },
    branches: [
      { band: [0.8, 1.0], action: 'support', target: 'H1' },
      { band: [0.0, 0.6], action: 'kill', target: 'H1' },
    ],
    ...overrides,
  }
}

describe('约束 1：互斥频段', () => {
  it('存在不重叠对 → 通过', () => {
    expect(hasDisjointBandPair({ a: [0, 0.5], b: [0.6, 1] })).toBe(true)
  })

  it('全部重叠 → 判为装饰性探针并拒绝', () => {
    expect(hasDisjointBandPair({ a: [0, 0.8], b: [0.2, 1] })).toBe(false)
    const state = minimalState()
    expect(() => validateProbeSpec(validSpec({ bands: { H1: [0, 0.9], H2: [0.1, 1] } }), state))
      .toThrow(/装饰性探针/)
  })

  it('反向验证：没有 kill/scope 分支 → 拒绝', () => {
    const state = replay(root)
    expect(() => validateProbeSpec(validSpec({
      branches: [{ band: [0.8, 1], action: 'support', target: 'H1' }],
    }), state)).toThrow(/kill\/scope/)
  })

  it('反向验证：bands 引用非 LIVE claim → 拒绝', () => {
    const state = replay(root)
    expect(() => validateProbeSpec(validSpec({ bands: { H1: [0, 0.5], H99: [0.6, 1] } }), state))
      .toThrow(/非 LIVE claim/)
  })
})

describe('约束 3：从原始文件重算', () => {
  it('json 点路径与正则单捕获组', () => {
    expect(recomputeMetric('{"metric":{"accuracy":0.83}}', 'json', 'metric.accuracy')).toBe(0.83)
    expect(recomputeMetric('final score: 0.91 done', 'regex', 'final score: ([0-9.]+)')).toBe(0.91)
  })

  it('反向验证：路径断裂 / 无匹配 / 非数字都是拒绝', () => {
    expect(() => recomputeMetric('{"a":1}', 'json', 'a.b')).toThrow()
    expect(() => recomputeMetric('nothing here', 'regex', 'score: ([0-9.]+)')).toThrow()
    expect(() => recomputeMetric('{"a":"x"}', 'json', 'a')).toThrow()
  })
})

describe('约束 4：终态可追溯（journal 重放）', () => {
  it('终态迁移没有落地探针依据 → 重放直接判 journal 损坏', () => {
    const dir = join(root, 'corrupt')
    mkdirSync(dir, { recursive: true })
    appendEvent(dir, 'run.init', { run: 'x' })
    appendEvent(dir, 'claim.propose', { id: 'H1', statement: 'A', predicts: ['x'] })
    appendEvent(dir, 'claim.transition', { id: 'H1', to: 'REFUTED' })
    expect(() => replay(dir)).toThrow(/没有已落地 probe 依据/)
  })
})

describe('路径与命名', () => {
  it('run 名单分量化，路径钉死在 run 目录内', () => {
    expect(sanitizeRunName('a/b/../c')).toBe('a-b-..-c')
    expect(() => confined('/tmp/run', '../escape')).toThrow(/越出/)
    expect(() => confined('/tmp/run', '/etc/passwd')).toThrow(/越出/)
    expect(confined('/tmp/run', 'probes/P1/raw/output.txt')).toBe('/tmp/run/probes/P1/raw/output.txt')
  })
})
