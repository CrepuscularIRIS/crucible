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
