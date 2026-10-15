import { describe, expect, test } from 'bun:test'
import {
  closeTab,
  createResearchTabId,
  ensureScratchPadTab,
  focusScratchPadTab,
  getPersistableTabState,
  openTab,
  SCRATCH_PAD_ID,
  updateTabTitle,
  type TabItem,
} from './tab-atoms'

function createAgentTab(id = 'agent-1'): TabItem {
  return {
    id,
    type: 'agent',
    sessionId: id,
    title: 'Agent 会话',
  }
}

describe('Scratch Pad Tab 恢复', () => {
  test('given 草稿已拖到右侧分屏 when Ctrl+Tab 聚焦草稿 then 恢复完整草稿并关闭分屏', () => {
    const result = focusScratchPadTab([
      createAgentTab(),
      {
        id: '__preview__:agent-1',
        type: 'preview',
        sessionId: 'agent-1',
        title: '预览：README.md',
      },
    ])

    expect(result.activeTabId).toBe(SCRATCH_PAD_ID)
    expect(result.scratchPanelOpen).toBe(false)
    expect(result.tabs.map((tab) => tab.id)).toEqual([
      SCRATCH_PAD_ID,
      'agent-1',
      '__preview__:agent-1',
    ])
  })

  test('given 顶部已有固定草稿 when 再次聚焦 then 不重复创建草稿标签', () => {
    const existingScratch: TabItem = {
      id: SCRATCH_PAD_ID,
      type: 'scratch',
      sessionId: SCRATCH_PAD_ID,
      title: 'Scratch Pad',
    }

    const result = focusScratchPadTab([existingScratch, createAgentTab()])

    expect(result.tabs.filter((tab) => tab.id === SCRATCH_PAD_ID)).toEqual([existingScratch])
    expect(result.scratchPanelOpen).toBe(false)
  })
})

describe('研究 Tab（顶部标签：科研进度 / 评委）', () => {
  const open = (tabs: TabItem[] = []) => openTab(tabs, { type: 'research', sessionId: 's1', title: '研究画布' })

  test('打开：草稿 + 所属会话 + 研究 Tab，研究 Tab 激活', () => {
    const { tabs, activeTabId } = open([createAgentTab('s1')])
    expect(tabs.map((t) => [t.id, t.type])).toEqual([[SCRATCH_PAD_ID, 'scratch'], ['s1', 'agent'], [createResearchTabId('s1'), 'research']])
    expect(activeTabId).toBe(createResearchTabId('s1'))
  })

  test('同一会话再点会话入口：研究 Tab 保留；换会话：丢掉', () => {
    const { tabs } = open([createAgentTab('s1')])
    expect(openTab(tabs, { type: 'agent', sessionId: 's1', title: 'x' }).tabs.map((t) => t.id)).toContain(createResearchTabId('s1'))
    expect(openTab(tabs, { type: 'agent', sessionId: 's2', title: 'x' }).tabs.map((t) => t.id)).not.toContain(createResearchTabId('s1'))
  })

  test('打开文件预览不挤掉研究 Tab', () => {
    const { tabs } = open([createAgentTab('s1')])
    expect(openTab(tabs, { type: 'preview', sessionId: 's1', title: '预览：a.md' }).tabs.map((t) => t.type)).toEqual(['scratch', 'agent', 'preview', 'research'])
  })

  test('不持久化；激活中的研究 Tab 持久化为所属会话', () => {
    const { tabs, activeTabId } = open([createAgentTab('s1')])
    expect(getPersistableTabState(tabs, activeTabId)).toEqual({ tabs: [createAgentTab('s1')], activeTabId: 's1' })
  })

  test('关闭会话一并关闭研究 Tab；单独关闭研究 Tab 回到相邻标签', () => {
    const { tabs, activeTabId } = open([createAgentTab('s1')])
    expect(closeTab(tabs, activeTabId, 's1').tabs.map((t) => t.id)).toEqual([SCRATCH_PAD_ID])
    expect(closeTab(tabs, activeTabId, createResearchTabId('s1'))).toEqual({ tabs: tabs.slice(0, 2), activeTabId: 's1' })
  })

  test('研究 Tab 不算会话入口：ensureScratchPadTab 不把它当会话，改会话标题不改它', () => {
    const { tabs } = open([createAgentTab('s1')])
    expect(ensureScratchPadTab(tabs).map((t) => t.id)).toEqual([SCRATCH_PAD_ID, 's1'])
    expect(updateTabTitle(tabs, 's1', '新标题').find((t) => t.type === 'research')!.title).toBe('研究画布')
  })
})
