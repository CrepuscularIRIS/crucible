/**
 * Research canvas atoms — 研究画布（04 §3）面板状态
 *
 * 画布在顶部研究 Tab 里（科研进度 / 评委）；每个 Agent 会话独立记住数据源与视图。
 */

import { atom } from 'jotai'

/** 画布数据源：实时 run（会话 cwd）、白名单归档、或随应用打包的示例 run */
export type ResearchCanvasSource =
  | { kind: 'live' }
  | { kind: 'archive'; path: string }
  | { kind: 'sample' }

/** 每会话画布数据源；缺省时由面板自行判断（有实时 run 用实时，否则显示归档选择器） */
export const researchCanvasSourceMapAtom = atom<Map<string, ResearchCanvasSource>>(new Map())

/** 研究 Tab 的两种读法：科研进度（研究者画布）/ 评委（评委报告）；每会话记住 */
export type ResearchTabView = 'progress' | 'judge'
export const researchTabViewMapAtom = atom<Map<string, ResearchTabView>>(new Map())
