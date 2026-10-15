import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createStore, Provider } from 'jotai'
import { agentSessionStreamingStateAtomFamily } from '@/atoms/agent-atoms'
import type { ResearchCanvasSource } from '@/atoms/research-atoms'
import { ResearchRuntimeControls } from './ResearchRuntimeControls'

function render(sourceKind?: ResearchCanvasSource['kind'], running = false): string {
  const store = createStore()
  if (running) store.set(agentSessionStreamingStateAtomFamily('session-a'), { running: true })
  return renderToStaticMarkup(<Provider store={store}><ResearchRuntimeControls sessionId="session-a" sourceKind={sourceKind} /></Provider>)
}

describe('画布内的 RLM 与 Refine 入口', () => {
  test('Given 当前会话 When 打开画布 Then 可以查看两项能力并找到对应记录', () => {
    for (const source of [undefined, 'live'] as const) {
      const html = render(source)
      expect(html).toContain('当前会话')
      expect(html).toContain('查看 RLM 运行能力')
      expect(html).toContain('查看经验策略与提炼记录')
      expect(html).toContain('「子任务」')
      expect(html).toContain('「实时」')
    }
  })

  test('Given 宿主正在运行 When 查看归档或示例 Then 不出现当前会话的操作入口', () => {
    for (const source of ['archive', 'sample'] as const) {
      const html = render(source, true)
      expect(html).toContain('只读回放')
      expect(html).toContain('Refine 历史经验尚未接入')
      expect(html).not.toContain('查看经验策略与提炼记录')
      expect(html).not.toContain('查看 RLM 运行能力')
      expect(html).not.toContain('<button')
    }
  })
})
