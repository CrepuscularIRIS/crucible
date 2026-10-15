import { describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import { scratchPadPanelOpenAtom, SCRATCH_PAD_ID, SCRATCH_PAD_TITLE, tabsAtom } from '@/atoms/tab-atoms'
import { researchCanvasOpenMapAtom } from '@/atoms/research-atoms'
import { openScratchInSplit } from './scratch-pad-opener'

describe('草稿分屏与研究画布互斥', () => {
  test('打开草稿时关掉该会话的研究画布（否则画布按钮按下却不可见）', () => {
    const store = createStore()
    store.set(tabsAtom, [
      { id: 's1', type: 'agent', sessionId: 's1', title: 't' },
      { id: SCRATCH_PAD_ID, type: 'scratch', sessionId: SCRATCH_PAD_ID, title: SCRATCH_PAD_TITLE },
    ])
    store.set(researchCanvasOpenMapAtom, new Map([['s1', true]]))
    expect(openScratchInSplit(store)).toBe(true)
    expect(store.get(scratchPadPanelOpenAtom)).toBe(true)
    expect(store.get(researchCanvasOpenMapAtom).get('s1')).toBe(false)
  })
})
