import { describe, expect, test } from 'bun:test'
import { firstScreenViolations, fmtTime, interpolate, JudgeError } from './judge.ts'

describe('judge helpers', () => {
  test('fmtTime 固定 UTC+08:00', () => {
    expect(fmtTime('2026-10-14T12:41:13.580Z')).toBe('2026-10-14 20:41（UTC+08:00）')
    expect(fmtTime('2026-10-14T16:30:00Z')).toBe('2026-10-15 00:30（UTC+08:00）')
  })

  test('fmtTime 在不同 TZ 下输出相同', () => {
    const outs = ['UTC', 'Asia/Shanghai', 'America/Los_Angeles'].map((TZ) => {
      const r = Bun.spawnSync(
        ['bun', '-e', `import {fmtTime} from '${import.meta.dir}/judge.ts'; console.log(fmtTime('2026-10-14T12:41:13.580Z'))`],
        { env: { ...process.env, TZ } },
      )
      return r.stdout.toString()
    })
    expect(new Set(outs).size).toBe(1)
    expect(outs[0]).toContain('20:41')
  })

  test('interpolate：缺键拒绝', () => {
    const rc = { schema: 'crucible.recompute/1' as const, script: 's', values: { 'one.P2.delta': 0.67 } }
    expect(interpolate('差 {{one.P2.delta}} 峰', rc)).toBe('差 0.67 峰')
    expect(() => interpolate('{{one.P2.r_star}}', rc)).toThrow(JudgeError)
  })

  test('首屏原词与编号', () => {
    expect(firstScreenViolations('用一次测量否定了一整类解释')).toEqual([])
    expect(firstScreenViolations('H5 被 REFUTED')).toEqual(['REFUTED', 'H5'])
  })
})
