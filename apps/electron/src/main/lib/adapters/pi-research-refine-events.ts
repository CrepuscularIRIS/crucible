/**
 * C1+C4 · Research Episode Stream（plan §1.1，采纳 audit 修正：单一事件流）。
 *
 * - 单写者（adapter / runtime helper），append-only JSONL，坏行显式跳过并计数。
 * - 状态（open class、PENDING refinement、验证分母）从事件重放，无第二份事实源。
 * - 纯函数 replayResearchRefineEvents 不触文件系统，供 reviewer 与单测复用。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ResearchRefineClassState,
  type ResearchRefineEvent,
  type ResearchRefineEventInput,
  type ResearchRefinementState,
  type ResearchRefineState,
} from './pi-research-refine-types'

export interface ResearchEpisodeStream {
  readonly eventsPath: string
  append(event: ResearchRefineEventInput): ResearchRefineEvent
  /** 读取并重放；坏行（策略固定：跳过并计数）不会抛错。 */
  state(): ResearchRefineState & { skippedLines: number }
}

/** 从事件序列重放 refine 状态（纯函数）。 */
export function replayResearchRefineEvents(events: ResearchRefineEvent[]): ResearchRefineState {
  const classes = new Map<string, ResearchRefineClassState>()
  const refinements = new Map<string, ResearchRefinementState>()
  const ensureClass = (classId: string) => {
    let cls = classes.get(classId)
    if (!cls) {
      cls = { classId, openResiduals: [], refutedRefinementIds: [] }
      classes.set(classId, cls)
    }
    return cls
  }
  let residualRefineCount = 0
  for (const event of events) {
    switch (event.type) {
      case 'residual': {
        // openResiduals 只累计；refined 事件发生时清空（消费）。
        ensureClass(event.classId).openResiduals.push({
          seq: event.seq,
          messageExcerpt: event.messageExcerpt,
        })
        break
      }
      case 'refined': {
        for (const classId of event.attributedClassIds) ensureClass(classId).openResiduals = []
        residualRefineCount += 1
        refinements.set(event.refinementId, {
          refinementId: event.refinementId,
          status: 'PENDING',
          attributedClassIds: [...event.attributedClassIds],
          postSeq: event.seq,
        })
        break
      }
      case 'validated': {
        const ref = refinements.get(event.refinementId)
        if (ref && ref.status === 'PENDING') ref.status = 'VALIDATED'
        break
      }
      case 'rolled_back': {
        const ref = refinements.get(event.refinementId)
        if (ref && (ref.status === 'PENDING' || ref.status === 'VALIDATED')) {
          ref.status = 'ROLLED_BACK'
          ref.rolledBackReason = event.reason
          if (event.reason === 'refuted' || event.reason === 'lint') {
            for (const classId of ref.attributedClassIds) {
              ensureClass(classId).refutedRefinementIds.push(event.refinementId)
            }
          }
        }
        break
      }
      case 'promoted': {
        const ref = refinements.get(event.refinementId)
        if (ref && ref.status === 'VALIDATED') ref.status = 'PROMOTED'
        break
      }
      case 'success':
        break
    }
  }
  return { classes, refinements, residualRefineCount, events }
}

/**
 * 验证判定（plan §5）：refinement 处于 PENDING 且每个归因 class 在 postSeq 之后
 * 有 ≥k 次 eligible action（同 source×tool 的 success/residual 事件）、且零复发
 * → 应转移 VALIDATED；任一归因 class 复发 → 应回滚（refuted）。
 */
export function evaluateRefinementTransitions(
  state: ResearchRefineState,
  validationK: number,
): Array<
  | { action: 'validate'; refinementId: string; evidenceSeqs: number[] }
  | { action: 'rollback'; refinementId: string; classId: string; seq: number }
> {
  const actions: Array<
    | { action: 'validate'; refinementId: string; evidenceSeqs: number[] }
    | { action: 'rollback'; refinementId: string; classId: string; seq: number }
  > = []
  for (const ref of state.refinements.values()) {
    if (ref.status !== 'PENDING') continue
    let evidence: number[] = []
    let allReached = ref.attributedClassIds.length > 0
    for (const classId of ref.attributedClassIds) {
      const cls = state.classes.get(classId)
      const tool = classId.split('§')[2]
      const source = classId.split('§')[0]
      let eligible = 0
      let recurred: { seq: number } | undefined
      for (const event of state.events) {
        if (event.seq <= ref.postSeq) continue
        if (event.type === 'residual' && event.classId === classId) {
          recurred = recurred && recurred.seq < event.seq ? recurred : event
        } else if (event.type === 'success' && event.tool === tool && event.source === source) {
          eligible += 1
          evidence = [...evidence, event.seq]
        }
      }
      if (recurred) {
        actions.push({ action: 'rollback', refinementId: ref.refinementId, classId, seq: recurred.seq })
        allReached = false
        break
      }
      if (eligible < validationK) allReached = false
    }
    if (allReached) actions.push({ action: 'validate', refinementId: ref.refinementId, evidenceSeqs: evidence })
  }
  return actions
}

export function createResearchEpisodeStream(artifactDir: string): ResearchEpisodeStream {
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })
  const eventsPath = join(artifactDir, 'events.jsonl')
  const readEvents = (): { events: ResearchRefineEvent[]; skippedLines: number } => {
    if (!existsSync(eventsPath)) return { events: [], skippedLines: 0 }
    const events: ResearchRefineEvent[] = []
    let skippedLines = 0
    for (const line of readFileSync(eventsPath, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        events.push(JSON.parse(line) as ResearchRefineEvent)
      } catch {
        skippedLines += 1
      }
    }
    return { events, skippedLines }
  }
  return {
    eventsPath,
    append(event) {
      const { events } = readEvents()
      const maxSeq = events.reduce((max, candidate) => Math.max(max, candidate.seq ?? 0), 0)
      const full = {
        ...event,
        ts: new Date().toISOString(),
        seq: maxSeq + 1,
      } as ResearchRefineEvent
      appendFileSync(eventsPath, `${JSON.stringify(full)}\n`, 'utf8')
      return full
    },
    state() {
      const { events, skippedLines } = readEvents()
      return { ...replayResearchRefineEvents(events), skippedLines }
    },
  }
}
