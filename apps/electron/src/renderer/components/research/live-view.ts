/**
 * 实时面板的视图模型（纯函数）：本轮 SDK 消息 → "AI 正在做什么"，记录里的子任务文件 → 子任务卡。
 * 数据都是已有的：本轮消息来自 liveMessagesMapAtom，子任务 brief/out 来自研究记录快照的 files。
 */
import type { SDKAssistantMessage, SDKMessage, SDKToolResultBlock, SDKToolUseBlock, SDKUserMessage } from '@proma/shared'
import type { ChildJob } from '@proma/shared/research-record'

export type LiveActionKind = 'research' | 'child' | 'code' | 'shell' | 'other'

export interface LiveAction {
  id: string
  kind: LiveActionKind
  label: string
  detail: string
  /** stopped = 会话已不在运行，但这次调用没等到结果（中断 / 中止） */
  status: 'running' | 'ok' | 'error' | 'stopped'
}

const RESEARCH_LABELS: Record<string, string> = {
  research_init: '开局建档',
  research_state: '读研究状态',
  world_simulate: '跑仿真',
  world_observe: '仿真观测（扣预算）',
  world_forecast: '提交预报',
  claim_propose: '提出假设',
  claim_transition: '改判假设',
  prereg_write: '预注册实验',
  probe_run: '执行实验',
  metric_recompute: '复算指标',
  attack_record: '记录反驳',
  report_declare: '提交报告',
}

const firstLine = (v: unknown, n = 90): string =>
  typeof v === 'string' ? (v.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, n) : ''

function researchDetail(tool: string, input: Record<string, unknown>): string {
  const spec = input.spec as Record<string, unknown> | undefined
  if (tool === 'claim_transition') return [input.id, input.to].filter((x) => typeof x === 'string').join(' → ') + (typeof input.byProbe === 'string' ? `（依据 ${input.byProbe}）` : '')
  if (tool === 'claim_propose') return [input.id, firstLine(input.statement, 60)].filter(Boolean).join(' · ')
  if (tool === 'prereg_write') return typeof spec?.pid === 'string' ? spec.pid : ''
  if (tool === 'world_simulate' || tool === 'world_observe') return [input.mode, input.protocol].filter((x) => typeof x === 'string').join(' · ')
  if (tool === 'attack_record') return [input.kind, input.target].filter((x) => typeof x === 'string').join(' · ')
  return [input.pid, input.id, input.path].find((x): x is string => typeof x === 'string') ?? ''
}

/** 一次工具调用 → 人话标签。子任务在 ipython 里派发（research_kit.new_job + rlm），按代码识别。 */
export function describeTool(name: string, input: Record<string, unknown>): Pick<LiveAction, 'kind' | 'label' | 'detail'> {
  const research = /^mcp__research__(.+)$/.exec(name)?.[1]
  if (research) return { kind: 'research', label: RESEARCH_LABELS[research] ?? research, detail: researchDetail(research, input) }
  if (name === 'ipython') {
    const code = typeof input.code === 'string' ? input.code : ''
    const job = /new_job\(\s*[^,]+,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/.exec(code)
    if (job || /\bawait\s+rlm\(/.test(code)) return { kind: 'child', label: '派出子任务', detail: job ? `${job[1]} · ${job[2]}` : firstLine(code) }
    if (/research_kit\.wait\(/.test(code)) return { kind: 'child', label: '等子任务返回', detail: firstLine(code) }
    return { kind: 'code', label: '运行 Python', detail: firstLine(code) }
  }
  if (name.toLowerCase() === 'bash') return { kind: 'shell', label: '运行命令', detail: firstLine(input.command) }
  if (name === 'TaskCreate' || name === 'TaskUpdate') return { kind: 'other', label: '更新任务清单', detail: firstLine(input.subject ?? input.status) }
  if (name === 'AskUserQuestion') return { kind: 'other', label: '向你提问', detail: '' }
  return { kind: 'other', label: name, detail: '' }
}

/** 本轮最近的工具调用（旧→新），带完成 / 出错状态 */
export function liveActions(messages: readonly SDKMessage[], running = true, limit = 12): LiveAction[] {
  const results = new Map<string, boolean>()
  for (const msg of messages) {
    if (msg.type !== 'user') continue
    const blocks = (msg as SDKUserMessage).message?.content
    if (!Array.isArray(blocks)) continue
    for (const b of blocks) if (b.type === 'tool_result') results.set((b as SDKToolResultBlock).tool_use_id, (b as SDKToolResultBlock).is_error === true)
  }
  const out: LiveAction[] = []
  for (const msg of messages) {
    if (msg.type !== 'assistant') continue
    const blocks = (msg as SDKAssistantMessage).message?.content
    if (!Array.isArray(blocks)) continue
    for (const b of blocks) {
      if (b.type !== 'tool_use') continue
      const tu = b as SDKToolUseBlock
      const err = results.get(tu.id)
      out.push({ id: tu.id, ...describeTool(tu.name, (tu.input ?? {}) as Record<string, unknown>), status: err === undefined ? (running ? 'running' : 'stopped') : err ? 'error' : 'ok' })
    }
  }
  return out.slice(-limit)
}

/** 本轮最后一段 AI 说的话（仅对用户可见的正文），截断 */
export function liveSaying(messages: readonly SDKMessage[], n = 280): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    if (msg.type !== 'assistant') continue
    const blocks = (msg as SDKAssistantMessage).message?.content
    if (!Array.isArray(blocks)) continue
    for (let j = blocks.length - 1; j >= 0; j--) {
      const b = blocks[j] as { type: string; text?: unknown; thinking?: unknown }
      const text = b.type === 'text' ? b.text : undefined
      if (typeof text === 'string' && text.trim()) return text.trim().replace(/\s+/g, ' ').slice(0, n)
    }
  }
  return ''
}

export interface ChildCard {
  name: string
  status: ChildJob['status']
  /** brief 标题：派它去做什么 */
  task: string
  /** out.md 的 SUMMARY 段（没有就取标题后的第一段）：它带回了什么 */
  finding: string
  brief?: string
  out?: string
}

const title = (md: string | undefined): string => (md?.split('\n').find((l) => /^#\s/.test(l)) ?? '').replace(/^#\s+/, '').trim()

function summaryOf(out: string): string {
  const lines = out.split('\n')
  const at = lines.findIndex((l) => /^##\s*(SUMMARY|摘要|结论)/i.test(l))
  const body = at >= 0 ? lines.slice(at + 1) : lines.filter((l) => !/^#\s/.test(l))
  const para: string[] = []
  for (const l of body) {
    if (/^#/.test(l) || /^STATUS:/.test(l)) { if (para.length) break; continue }
    if (!l.trim()) { if (para.length) break; continue }
    para.push(l.trim())
  }
  return para.join(' ').slice(0, 420)
}

/** 子任务卡：状态来自 record.childJobs，内容来自同一快照的 child-jobs/<name>/{brief,out}.md */
export function childCards(jobs: readonly ChildJob[], files: Readonly<Record<string, string>>): ChildCard[] {
  return jobs.map((job) => {
    const brief = files[`child-jobs/${job.name}/brief.md`]
    const out = files[`child-jobs/${job.name}/out.md`]
    return {
      name: job.name,
      status: job.status,
      task: title(brief) || title(out) || job.name,
      finding: out ? summaryOf(out) : '',
      ...(brief !== undefined ? { brief } : {}),
      ...(out !== undefined ? { out } : {}),
    }
  })
}
