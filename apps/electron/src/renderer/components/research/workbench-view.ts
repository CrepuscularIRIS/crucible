/** 工作台展示契约：共享投影在 canvas-view.ts 单点适配；组件不解析 journal 或重做科学裁决。 */
export interface WorkbenchEvent {
  seq: number
  ts: string
  op: string
  title: string
  pid?: string
  hids: string[]
}

export interface ProbeCardView {
  pid: string
  question: string
  protocol: string
  blockers?: string
  reps: number
  metric?: string
  status: 'pending' | 'measured' | 'failed'
  bands: { hid: string; low: number; high: number }[]
  observed?: number
  changes: { seq: number; hid: string; from?: string; to: string; reason: string; requested?: string; lead?: string[] }[]
  note?: string
  /** 该轮判断已收口（之后登记了新实验或已声明报告）；未收口时不说"没有改变 / 保留" */
  closed?: boolean
}

export interface ProbeVersionView {
  id: string
  pid: string
  seq?: number
  ts?: string
  path?: string
  status: 'rejected' | 'edited' | 'accepted' | 'unrecorded'
  reason?: string
  sha256?: string
}

export interface WorkbenchView {
  events: WorkbenchEvent[]
  probes: ProbeCardView[]
  versions: ProbeVersionView[]
}

/** 实验的一行标题：编号 · 协议原文 · 阻断剂；只拼记录字段并压成一行，不改写、不翻译（缺阻断剂字段时不写）。 */
export function probeHeading({ pid, protocol, blockers }: { pid: string; protocol: string; blockers?: string }): string {
  const b = blockers?.trim()
  const blocker = b === undefined ? '' : !b || b.toLowerCase() === 'none' ? '，无阻断剂' : `，阻断剂 ${b}`
  return `${pid} · ${protocol.replace(/\s+/g, ' ').trim() || '实验协议未记录'}${blocker}`
}
