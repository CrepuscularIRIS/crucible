import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createStore, Provider } from 'jotai'
import type { SDKMessage } from '@proma/shared'
import { agentSessionStreamingStateAtomFamily, liveMessagesMapAtom } from '@/atoms/agent-atoms'
import { ChildCards, LivePanel, LiveStrip } from './LivePanel'

const SID = 's-live'

function render(node: React.ReactElement, running: boolean): string {
  const store = createStore()
  if (running) store.set(agentSessionStreamingStateAtomFamily(SID), { running: true, startedAt: Date.now() - 65_000, model: 'glm-5.3-flash' })
  store.set(liveMessagesMapAtom, new Map([[SID, [
    { type: 'assistant', message: { content: [{ type: 'text', text: '先跑仿真看候选能否分开' }, { type: 'tool_use', id: 't1', name: 'mcp__research__world_simulate', input: { mode: 'sweep' } }] } },
  ] as unknown as SDKMessage[]]]))
  return renderToStaticMarkup(<Provider store={store}>{node}</Provider>)
}

describe('LivePanel：运行中看得见 AI 在做什么', () => {
  test('运行中：状态、时长、AI 刚说的话、进行中的动作都在', () => {
    const html = render(<LivePanel sessionId={SID} />, true)
    expect(html).toContain('正在工作')
    expect(html).toContain('本轮已运行 1:0')
    expect(html).toContain('先跑仿真看候选能否分开')
    expect(html).toContain('跑仿真')
    expect(html).toContain('自进化 · Refine 学到的')
    // 工作台里另有子任务 tab：不传 childJobs 时不重复显示
    expect(html).not.toContain('子任务 · RLM 子代理')
  })

  test('记录建立前（childJobs = null）：子任务段说明何时出现；顶栏一行显示最近动作', () => {
    expect(render(<LivePanel sessionId={SID} childJobs={null} />, false)).toContain('研究记录建立后显示')
    const strip = render(<LiveStrip sessionId={SID} />, true)
    expect(strip).toContain('AI 正在工作')
    expect(strip).toContain('跑仿真：sweep')
  })

  test('子任务卡：任务、带回的结论、展开后的原文；HTML 按文本转义', () => {
    const html = renderToStaticMarkup(<ChildCards cards={[
      { name: 'rivals-K1-44d9', status: 'ok', task: 'K1 对手完整性审查', finding: '补 3 族 <b>H10</b>', brief: '# K1', out: '# K1\nSTATUS: ok PATH: x' },
      { name: 'w5-lessons-1', status: 'running', task: 'W5 教训综合', finding: '' },
    ]} />)
    expect(html).toContain('共 2 个 · 进行中 1 · 已返回 1')
    expect(html).toContain('带回：补 3 族 &lt;b&gt;H10&lt;/b&gt;')
    expect(html).toContain('回报 out.md')
    expect(html.indexOf('W5 教训综合')).toBeLessThan(html.indexOf('K1 对手完整性审查'))
  })
})
