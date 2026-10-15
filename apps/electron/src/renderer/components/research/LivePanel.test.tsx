import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createStore, Provider } from 'jotai'
import type { SDKMessage } from '@proma/shared'
import { agentSessionStreamingStateAtomFamily, liveMessagesMapAtom } from '@/atoms/agent-atoms'
import { ChildCards, LivePanel, LiveStrip, RefineHistory } from './LivePanel'

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
    expect(html).toContain('操作经验 · Refine 记录')
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
    expect(html).toContain('共 2 个 · 未见回报 1 · 完成 1 · 受阻或异常 0')
    expect(html).toContain('带回：补 3 族 &lt;b&gt;H10&lt;/b&gt;')
    expect(html).toContain('回报 out.md')
    expect(html).toContain('仅凭文件缺失不能判断任务是否仍在执行')
    expect(html).not.toContain('在独立窗口里工作')
    expect(html.indexOf('W5 教训综合')).toBeLessThan(html.indexOf('K1 对手完整性审查'))
  })
})


describe('展示状态归属与证据边界', () => {
  test('Given 宿主正在工作 When 查看归档或示例 Then 不显示宿主实时状态', () => {
    for (const sourceKind of ['archive', 'sample'] as const) {
      const html = render(<LiveStrip sessionId={SID} sourceKind={sourceKind} />, true)
      expect(html).toContain('只读记录')
      expect(html).not.toContain('正在工作')
      expect(html).not.toContain('跑仿真')
    }
  })
  test('Given 释放会话 When 查看经验 Then 说明读取缺口而非声称没有经验', () => {
    const html = renderToStaticMarkup(<RefineHistory state={{ resident: false, autoRefine: { enabled: false, turnInterval: 25 } }} />)
    expect(html).toContain('历史经验读取尚未接入')
    expect(html).not.toContain('重新发起一轮')
  })
  test('Given 学习臂有干预与提炼记录 When 展示 Then 不冒称未授权或已验证', () => {
    const html = renderToStaticMarkup(<RefineHistory state={{ resident: true, autoRefine: { enabled: true, turnInterval: 25 }, arm: { mode: 'learning', contaminated: true }, harness: { entries: 1, recent: [{ ts: '', kind: 'memory', summary: '检查环境' }] } }} />)
    expect(html).toContain('学习模式')
    expect(html).toContain('干预或污染')
    expect(html).toContain('验证与回滚状态未接入')
    expect(html).not.toContain('未授权')
  })
})
