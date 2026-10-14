/**
 * Research canvas atoms — 研究画布（04 §3）面板状态
 *
 * 画布占右侧工作区中草稿的位置：与浏览器、草稿互斥，可与预览并排（04 Q8）。
 * 每个 Agent 会话独立记住开关与数据源。
 */

import { atom } from 'jotai'

/** 画布数据源：实时 run（会话 cwd）、白名单归档、或随应用打包的示例 run */
export type ResearchCanvasSource =
  | { kind: 'live' }
  | { kind: 'archive'; path: string }
  | { kind: 'sample' }

/** 每会话画布开关 */
export const researchCanvasOpenMapAtom = atom<Map<string, boolean>>(new Map())

/** 每会话画布数据源；缺省时由面板自行判断（有实时 run 用实时，否则显示归档选择器） */
export const researchCanvasSourceMapAtom = atom<Map<string, ResearchCanvasSource>>(new Map())
