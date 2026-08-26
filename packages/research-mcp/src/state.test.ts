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

describe('约束 5：恒等回显探针（ARFT C.1 预登记剧场）', () => {
  it('python -c print(常数) → 拒绝', () => {
    const state = minimalState()
    expect(() => validateProbeSpec(validSpec({ evalCommand: 'python3 -c "print(13.5)"' }), state))
      .toThrow(/常量输出/)
  })

  it('echo / printf 常数 → 拒绝', () => {
    const state = minimalState()
    expect(() => validateProbeSpec(validSpec({ evalCommand: 'echo 13.5' }), state)).toThrow(/常量输出/)
    expect(() => validateProbeSpec(validSpec({ evalCommand: 'printf "13.5"' }), state)).toThrow(/常量输出/)
  })

  it('读取数据/执行计算的命令 → 通过', () => {
    const state = minimalState()
    expect(() => validateProbeSpec(validSpec({ evalCommand: 'python3 probe_eval.py --out /tmp/x.json' }), state))
      .not.toThrow()
  })
})

describe('约束 6：稻草人频段方向（ARFT A.6）', () => {
  it('H1 预测升、H2 预测降，但频段整体倒置 → 拒绝', () => {
    const state = minimalState()
    expect(() => validateProbeSpec(validSpec({ bands: { H1: [0, 0.3], H2: [0.5, 1.0] } }), state))
      .toThrow(/稻草人/)
  })

  it('方向与频段一致 → 通过', () => {
    const state = minimalState()
    expect(() => validateProbeSpec(validSpec(), state)).not.toThrow()
  })

  it('predicts 无法推断方向 → 不执法', () => {
    const dir = join(root, 'no-dir-claims')
    mkdirSync(dir, { recursive: true })
    appendEvent(dir, 'run.init', { run: 'test' })
    appendEvent(dir, 'claim.propose', { id: 'H1', statement: 'A', predicts: ['格式差异'] })
    appendEvent(dir, 'claim.propose', { id: 'H2', statement: 'B', predicts: ['另一种格式'] })
    expect(() => validateProbeSpec(validSpec({ bands: { H1: [0, 0.3], H2: [0.5, 1.0] } }), replay(dir)))
      .not.toThrow()
  })

  it('否定短语（不低于/不超过）不算方向 → 互补频段不被误杀', () => {
    const dir = join(root, 'neg-claims')
    mkdirSync(dir, { recursive: true })
    appendEvent(dir, 'run.init', { run: 'test' })
    appendEvent(dir, 'claim.propose', { id: 'H1', statement: 'A', predicts: ['准确率不低于 0.8'] })
    appendEvent(dir, 'claim.propose', { id: 'H2', statement: 'B', predicts: ['准确率不超过 0.5'] })
    expect(() => validateProbeSpec(validSpec({ bands: { H1: [0.8, 1.0], H2: [0.0, 0.5] } }), replay(dir)))
      .not.toThrow()
  })

  it('前置与后置趋势否定都保守跳过，不把“没有上升”当作升方向', () => {
    const dir = join(root, 'neg-trend-claims')
    mkdirSync(dir, { recursive: true })
    appendEvent(dir, 'run.init', { run: 'test' })
    appendEvent(dir, 'claim.propose', { id: 'H1', statement: 'A', predicts: ['准确率没有明显上升'] })
    appendEvent(dir, 'claim.propose', { id: 'H2', statement: 'B', predicts: ['error increase does not occur'] })
    expect(() => validateProbeSpec(validSpec({ bands: { H1: [0, 0.3], H2: [0.5, 1.0] } }), replay(dir)))
      .not.toThrow()
  })
})
