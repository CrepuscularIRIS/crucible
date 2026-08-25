import { describe, expect, it } from 'bun:test'
import { resolvePiAutoRefineOverride } from './pi-agent-adapter'
import { createResearchRefineRuntime } from './pi-research-refine-runtime'

describe('Research 会话的 Prime auto-refine 策略（RESEARCH-REFINE-PLAN §4）', () => {
  it('learning 臂启用 native auto-refine 并安装确定性 reviewer', () => {
    expect(resolvePiAutoRefineOverride('learning')).toEqual({ enabled: true })
    const runtime = createResearchRefineRuntime({ mode: 'learning', artifactDir: '/tmp/x' })
    expect(runtime.autoRefineSettings).toEqual({ enabled: true })
    expect(runtime.autoRefineReviewer).toBeDefined()
    expect(runtime.serializedRefine).toBe(true)
  })

  it('off / frozen 臂关闭自动触发且不装 reviewer', () => {
    expect(resolvePiAutoRefineOverride('off')).toEqual({ enabled: false })
    expect(resolvePiAutoRefineOverride('frozen')).toEqual({ enabled: false })
    expect(createResearchRefineRuntime({ mode: 'off', artifactDir: '/tmp/x' }).autoRefineReviewer).toBeUndefined()
    expect(createResearchRefineRuntime({ mode: 'frozen', artifactDir: '/tmp/x' }).autoRefineReviewer).toBeUndefined()
  })

  it('非 research 会话不覆盖 Prime 默认策略', () => {
    expect(resolvePiAutoRefineOverride(undefined)).toBeUndefined()
  })
})
