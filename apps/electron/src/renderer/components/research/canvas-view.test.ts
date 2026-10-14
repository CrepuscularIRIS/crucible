import { describe, expect, test } from 'bun:test'
import type { Annotations } from '@proma/shared/research-record'
import { archivePickerView, canvasView, nodeDetail, sliceRecord } from './canvas-view'
import { loadRecord, ONE_DIR, P0R_DIR, readBundle } from './test-fixtures'

const one = loadRecord(ONE_DIR)
const replay = (seq: number, extra: Partial<Parameters<typeof canvasView>[1]> = {}) =>
  canvasView(one, { seq, mode: 'replay', source: 'research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound', bridge: false, ...extra })
const text = (v: unknown) => JSON.stringify(v)

describe('canvas-view：ONE 一句话 run 回放（04 §5.1 U1）', () => {
  test('sliceRecord 只保留到第 seq 行，之后才写的 prereg / 报告不可见', () => {
    const s = sliceRecord(one, 63)
    expect(s.events.length).toBe(63)
    expect(Object.keys(s.preregs).sort()).toEqual(['P1', 'P2'])
    expect(s.report).toBeUndefined()
    expect(sliceRecord(one, 105).report).toBeDefined()
  })

  test('第 63 行：焦点 = 等待测量 P2，含 P2 问题；P2 有 M-reps；文案写"候选参数未记录"、不写"噪声"', () => {
    const v = replay(63)
    expect(v.focus.kind).toBe('awaiting')
    expect(v.focus.title).toContain('等待测量')
    expect(v.focus.title).toContain('P2')
    expect(text(v.focus)).toContain(one.preregs.P2!.question)
    expect(v.focus.warnings.some((w) => w.code === 'M-reps' && w.pid === 'P2')).toBe(true)
    expect(text(v.focus)).toContain('只测 1 次就要分清 3 种解释')
    expect(text(v.focus)).toContain('同协议候选仿真值 13–20（8 次；候选参数未记录，含参数差异）')
    // 画布自己生成的文案不写"噪声"（agent 原文 H1 statement 里有，属于引用，不算）
    expect(text(v.focus) + text(v.cells)).not.toContain('噪声')
    // 矩阵：P2 已登记、待测
    expect(v.matrix.rows.find((r) => r.hid === 'H5')?.cells.find((c) => c.pid === 'P2')?.mark).toBe('pending')
  })

  test('第 66 行：焦点 = 判读结果 P2，观测 13 落在 H3 带内，预登记分支 = 否定 H5、支持 H3', () => {
    const v = replay(66)
    expect(v.focus.kind).toBe('interpret')
    expect(v.focus.title).toContain('判读结果 P2')
    const body = text(v.focus)
    expect(body).toContain('13')
    expect(body).toContain('H3')
    expect(body).toContain('否定 H5')
    expect(body).toContain('支持 H3')
  })

  test('第 105 行：已结束；"账本检查：通过"与"科学结论"是两个格', () => {
    const v = replay(105)
    expect(v.focus.kind).toBe('done')
    const labels = v.cells.map((c) => c.label)
    expect(labels).toEqual(['进度', '账本检查', '科学结论'])
    expect(v.cells[1]!.text.startsWith('通过')).toBe(true)
    expect(v.cells[1]!.text).toContain('不说明结论正确')
    expect(v.cells[2]!.text).not.toContain('通过')
  })

  test('第 105 行：终态 H3 支持 / H5 否定；P2 列 H5 ✕、H3 ✓、H4 判断非测量（行 69）', () => {
    const v = replay(105)
    const state = (id: string) => v.claims.find((c) => c.id === id)?.state
    expect(state('H3')).toBe('SUPPORTED')
    expect(state('H5')).toBe('REFUTED')
    const cell = (hid: string) => v.matrix.rows.find((r) => r.hid === hid)!.cells.find((c) => c.pid === 'P2')!
    expect(cell('H5').mark).toBe('kill')
    expect(cell('H3').mark).toBe('support')
    expect(cell('H4').judgmentSeq).toBe(69)
    expect(cell('H4').label).toContain('判断，非测量')
  })

  test('无 parent 时平铺并写"派生关系未记录"；annotations.parents 可补出派生树', () => {
    expect(replay(105).derivationNote).toBe('派生关系未记录')
    const annotated = replay(105, { annotations: { parents: { H4: 'H1', H5: 'H4' }, nodes: [] } as unknown as Annotations })
    expect(annotated.claims.find((c) => c.id === 'H5')?.depth).toBe(2)
    expect(annotated.derivationNote).toContain('审计注记')
  })

  test('回放模式：没有控制，标题含"回放 · 只读"', () => {
    const v = replay(63)
    expect(v.controls.buttons).toEqual([])
    expect(v.modeLabel).toContain('回放 · 只读')
  })

  test('有 annotations 时节点带双栏图标（当时 / 事后）', () => {
    const annotations = {
      nodes: [{ id: 'D6', seq: [67, 68], kind: 'refute', layer: '推理层', key: true, title_plain: '一次测量否定整个 T 型家族',
        at_time: { mark: 'no', text: '…' }, hindsight: { mark: 'no', text: '…' }, basis: [] }],
    } as unknown as Annotations
    const v = replay(105, { annotations })
    const h5 = v.claims.find((c) => c.id === 'H5')!
    expect(h5.verdicts).toEqual([{ node: 'D6', title: '一次测量否定整个 T 型家族', atTime: '✕', hindsight: '✕' }])
    expect(v.timeline.map((t) => t.id)).toEqual(['D6'])
    // 第 66 行时 D6 还没发生
    expect(replay(66, { annotations }).claims.find((c) => c.id === 'H5')!.verdicts).toEqual([])
  })

  test('节点详情 P2：带表、观测、宿主复核、两个仿真窗口、原始记录行', () => {
    const d = nodeDetail(one, { kind: 'prereg', id: 'P2' }, 105)!
    const body = text(d)
    expect(body).toContain('[10, 15.5]')
    expect(body).toContain('13')
    expect(body).toContain('宿主复核')
    expect(body).toContain('判断超出预登记分支')
    expect(d.rawLines.map((r) => r.seq)).toEqual(expect.arrayContaining([63, 65, 66, 67, 68]))
  })

  test('节点详情 H3：状态历史、针对它的攻击（作者未记录）', () => {
    const d = nodeDetail(one, { kind: 'claim', id: 'H3' }, 105)!
    const body = text(d)
    expect(body).toContain('SUPPORTED')
    expect(body).toContain('G2')
    expect(body).toContain('作者未记录')
  })
})

describe('canvas-view：P0R 子任务卡', () => {
  test('两个子任务末行不合契约 → "未按契约结束" + 末行前 80 字', () => {
    const p0r = loadRecord(P0R_DIR)
    const v = canvasView(p0r, { mode: 'replay', bridge: false })
    expect(v.children.length).toBe(2)
    for (const c of v.children) {
      expect(c.statusLabel).toBe('未按契约结束')
      expect(c.detail!.length).toBeLessThanOrEqual(80)
    }
  })

  test('P0R 第 47 行：测量失败 P1', () => {
    const p0r = loadRecord(P0R_DIR)
    expect(canvasView(p0r, { seq: 47, mode: 'replay', bridge: false }).focus.title).toBe('测量失败 P1')
  })
})

describe('recordFromFiles：渲染层离线解析（WebCrypto 预算哈希 → J1 parseBundle）', () => {
  test('与 node:crypto 解析结果一致，哈希链完好', async () => {
    const { recordFromFiles } = await import('./research-bridge')
    const files = readBundle(ONE_DIR)
    const rec = await recordFromFiles(files)
    expect(rec.integrity).toBe('ok')
    expect(rec.journalSha256).toBe(one.journalSha256)
    expect(rec.events.length).toBe(105)
  })

  test('改 journal 一字节 → integrity broken', async () => {
    const { recordFromFiles } = await import('./research-bridge')
    const files = readBundle(ONE_DIR)
    files['journal.jsonl'] = files['journal.jsonl']!.replace('"reps":1', '"reps":2')
    expect((await recordFromFiles(files)).integrity).toBe('broken')
  })
})

describe('canvas-view：ONE 归档的真实 annotations.json（轨道 J3）只读叠加', () => {
  test('派生树来自注记、H5 带 D6 双栏、时间条含关键节点', async () => {
    const { annotationsFromFiles } = await import('./research-bridge')
    const annotations = annotationsFromFiles(readBundle(ONE_DIR))
    if (!annotations) return // J3 未写注记时跳过（回放仍可用，只是没有叠加）
    const v = replay(105, { annotations })
    expect(v.derivationNote).toContain('审计注记')
    expect(v.claims.find((c) => c.id === 'H5')!.depth).toBe(2)
    expect(v.claims.find((c) => c.id === 'H5')!.verdicts.map((x) => x.node)).toContain('D6')
    expect(v.timeline.map((t) => t.id)).toContain('D6')
  })
})

describe('archivePickerView：示例 run 的来源（M-2 / LOW 列两次）', () => {
  const SAMPLE = 'research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound'
  test('主进程列出了同一个 run（绝对路径）：示例按钮走归档（运行时读注记），列表里不再重复', () => {
    const abs = `/home/u/crucible/${SAMPLE}`
    const other = { path: '/home/u/crucible/research/campaigns/x', run: 'x' }
    const v = archivePickerView([{ path: abs, run: 'r' }, other], { path: SAMPLE, bundled: true })
    expect(v.sample).toEqual({ kind: 'archive', path: abs })
    expect(v.archives).toEqual([other])
  })
  test('Windows 分隔符也认得出是同一个 run', () => {
    const abs = `C:\\crucible\\${SAMPLE.replaceAll('/', '\\')}`
    expect(archivePickerView([{ path: abs, run: 'r' }], { path: SAMPLE, bundled: false }).sample).toEqual({ kind: 'archive', path: abs })
  })
  test('没有归档、但示例随应用打包：用打包的示例', () => {
    expect(archivePickerView(null, { path: SAMPLE, bundled: true })).toEqual({ sample: { kind: 'sample' }, archives: [] })
  })
  test('docker 镜像：research/campaigns 被排除、glob 为空、也没有归档 → 不显示示例按钮', () => {
    expect(archivePickerView([], { path: SAMPLE, bundled: false })).toEqual({ sample: null, archives: [] })
    expect(archivePickerView(null, { path: SAMPLE, bundled: false }).sample).toBeNull()
  })
})

describe('canvas-view：主进程哈希链校验结果显示在画布上（M-4）', () => {
  const bad = '第 2 行的 prev 与第 1 行原文不符（此前内容被改动）'
  test('interventions 链断 → integrityNote 写明是干预记录、带主进程的原因', () => {
    const v = replay(105, { hostIntegrity: { journal: null, interventions: bad } })
    expect(v.integrityNote).toContain('interventions.jsonl')
    expect(v.integrityNote).toContain(bad)
  })
  test('主进程说 journal 断而本地解析没发现：照样显示', () => {
    expect(replay(105, { hostIntegrity: { journal: '第 3 行缺少 prev', interventions: null } }).integrityNote).toContain('第 3 行缺少 prev')
  })
  test('两条链都完好 → 没有 integrityNote', () => {
    expect(replay(105, { hostIntegrity: { journal: null, interventions: null } }).integrityNote).toBeUndefined()
    expect(replay(105).integrityNote).toBeUndefined()
  })
})

describe('latestTicket：异步哈希期间新快照到达，旧的不能覆盖新的（LOW 过期快照）', () => {
  test('只有最后一张票有效', async () => {
    const { latestTicket } = await import('./research-bridge')
    const next = latestTicket()
    const older = next()
    const newer = next()
    expect(older()).toBe(false)
    expect(newer()).toBe(true)
    next() // 换数据源也会作废在途的
    expect(newer()).toBe(false)
  })
})
