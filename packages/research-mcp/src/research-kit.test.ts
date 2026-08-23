/**
 * research-kit（kernel 侧只读 Python 工具箱）× register.json 契约测试。
 *
 * 用首场战役归档做 fixture：register 格式一变（本包的输出契约），这里先红。
 * 同时验证 claim_view 的信息不对称——对抗者上下文绝不能带 transition notes。
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..', '..')
const kitSrc = join(repoRoot, 'research', 'skills', 'research-kit', 'src')
const campaign = join(repoRoot, 'research', 'campaigns', '2026-08-23-first')

function runPython(code: string): string {
  const result = spawnSync('python3', ['-c', code], {
    env: { ...process.env, PYTHONPATH: kitSrc },
    encoding: 'utf-8',
    timeout: 30_000,
  })
  if (result.status !== 0) {
    throw new Error(`python3 退出 ${result.status}: ${result.stderr}`)
  }
  return result.stdout
}

describe('research_kit（只读，对 register.json 契约）', () => {
  it('anchor：graveyard 禁令体 + 探针状态 + 攻击计数，FAILED 不冒充 LANDED', () => {
    const out = runPython(
      `import research_kit; print(research_kit.anchor(${JSON.stringify(campaign)}))`,
    )
    expect(out).toContain('GRAVEYARD (2)')
    expect(out).toContain('禁止换装重提')
    expect(out).toContain('P6 LANDED metric=0.865')
    expect(out).toContain('P1 FAILED')
    expect(out).toContain('ATTACKS: 7')
  })

  it('claim_view：含主张与证据探针，不含提出者的 transition note', () => {
    const out = runPython(
      `import research_kit; print(research_kit.claim_view(${JSON.stringify(campaign)}, 'H1'))`,
    )
    expect(out).toContain('待攻击主张 · H1')
    expect(out).toContain('P6')
    expect(out).toContain('graveyard')
    // journal 里 H1 终态迁移的 note 含"落在 H1 预测频段"——对抗者不许看到
    expect(out).not.toContain('落在 H1 预测频段')
  })

  it('disjoint_pairs：只报互斥对', () => {
    const out = runPython(
      "import research_kit; print(research_kit.disjoint_pairs({'H1': (0.8, 1.0), 'H2': (0.0, 0.6), 'H3': (0.5, 0.9)}))",
    )
    expect(out.trim()).toBe("[('H1', 'H2')]")
  })

  it('calibration：落地探针逐频段报带内/外', () => {
    const out = runPython(
      `import research_kit; print(research_kit.calibration(${JSON.stringify(campaign)}))`,
    )
    expect(out).toContain('P6 × H1')
    expect(out).toContain('带内')
  })
})
