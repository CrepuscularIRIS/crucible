/**
 * C1+C4 · Research Episode Stream（plan §1.1，采纳 audit 修正：单一事件流）。
 *
 * - 单写者（adapter / runtime helper），append-only JSONL。
 * - 状态（open class、PENDING refinement、验证分母）从事件重放，无第二份事实源。
 * - 纯函数 replayResearchRefineEvents 不触文件系统，供 reviewer 与单测复用。
 * - 判定输入不可伪造（02 H2，SE3）：重放只用宿主内存里的事件；磁盘只是持久化。
 *   磁盘内容与宿主写过的字节对不上 → 追加 `tamper`，本会话臂 contaminated，不再 VALIDATED。
 *   首次打开时从磁盘恢复（续跑会话；坏行跳过并计数），此后磁盘只认宿主自己写的字节。
 *   ponytail（L4）：首次打开信任磁盘。正常 dispose 经 beforeDispose → stagePromotionCandidates
 *   → state() 做最后一次比对，所以没被比对过的伪造行只可能出现在宿主崩溃前的那段窗口里；
 *   这段窗口靠 guard 把 session-artifacts 列为宿主根兜底。升级路径：基线 sha 存到模型够不着的地方。
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
  let contaminated = false
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
      case 'tamper':
        contaminated = true
        break
      case 'success':
        break
    }
  }
  return { classes, refinements, residualRefineCount, contaminated, events }
}

/**
 * 每条 success 是"同参数连续调用"的第几次（1 = 不是重复）。上一条事件（不分来源）
 * 若是同 source、同 tool、同 fp 的 success，就算重复；任何别的事件——包括 guard 记的
 * ipython/bash 调用（它们可能改了状态）——都打断连续（L3；stagnation residual 本身不打断）。
 * 没有 fp 的 success 一律记 1（guard 来源从不带 fp，所以分块 research_kit.wait 不会停滞）。
 * ponytail: "状态不变"近似为"两次调用之间本会话没有别的工具事件"；child 经
 * 自己的会话写 journal 时看不见。升级路径是把 journal head 一并纳入指纹。
 */
export function successRunLengths(events: ResearchRefineEvent[]): Map<number, number> {
  const runs = new Map<number, number>()
  let last: { source: string; tool: string; fp?: string; run: number } | undefined
  for (const event of events) {
    if (event.type === 'success') {
      const run = event.fp && last && last.source === event.source && last.tool === event.tool && last.fp === event.fp ? last.run + 1 : 1
      runs.set(event.seq, run)
      last = { source: event.source, tool: event.tool, fp: event.fp, run }
    } else if (event.type === 'residual' && !event.classId.includes('§stagnation§')) {
      last = undefined
    }
  }
  return runs
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
  const runs = successRunLengths(state.events)
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
        } else if (event.type === 'success' && event.tool === tool && event.source === source && (runs.get(event.seq) ?? 1) === 1) {
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
    // 被污染的会话不再产生 VALIDATED（H2）；复发回滚照常。
    if (allReached && !state.contaminated) actions.push({ action: 'validate', refinementId: ref.refinementId, evidenceSeqs: evidence })
  }
  return actions
}

export function createResearchEpisodeStream(artifactDir: string): ResearchEpisodeStream {
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })
  const eventsPath = join(artifactDir, 'events.jsonl')
  const readDisk = (): string => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8') : '')
  // 内存基线：宿主写过的全部字节。比对原文与比对其 sha256 等价，文件只有会话级大小。
  let expected = readDisk()
  const events: ResearchRefineEvent[] = []
  let skippedLines = 0
  for (const line of expected.split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as ResearchRefineEvent)
    } catch {
      skippedLines += 1
    }
  }
  const write = (event: ResearchRefineEventInput): ResearchRefineEvent => {
    const maxSeq = events.reduce((max, candidate) => Math.max(max, candidate.seq ?? 0), 0)
    const full = { ...event, ts: new Date().toISOString(), seq: maxSeq + 1 } as ResearchRefineEvent
    const line = `${JSON.stringify(full)}\n`
    appendFileSync(eventsPath, line, 'utf8')
    events.push(full)
    expected += line
    return full
  }
  const checkTamper = (): void => {
    const disk = readDisk()
    if (disk === expected) return
    // 不把磁盘上的内容读进状态：伪造行永远进不了重放。基线前移到当前磁盘，避免同一处篡改重复报。
    expected = disk
    write({ type: 'tamper', reason: 'events.jsonl 与宿主内存基线不符' })
  }
  return {
    eventsPath,
    append(event) {
      checkTamper()
      return write(event)
    },
    state() {
      checkTamper()
      return { ...replayResearchRefineEvents([...events]), skippedLines }
    },
  }
}
