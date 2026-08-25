/**
 * 研究运行的状态核心。
 *
 * 唯一事实源是只追加的 journal.jsonl；register.json 只是它的重放缓存。
 * 这是上一版研究运行时最贵的教训的直接产物：四道 gate 曾对一场完全
 * 捏造的战役全绿，因为所有 gate 都把模型可写的状态文件当事实读——
 * 现在 gate 重放 journal 来推导状态，手改 register 会被当场抓住。
 *
 * 五条实测过的科学约束在这里变成结构拒绝，而不是散文纪律：
 * 1. 互斥频段：预登记必须存在一对不重叠频段 + 至少一个 kill/scope 分支；
 * 2. 先登记后执行：probe_run 拒绝没有 prereg 的探针（时间戳先后）；
 * 3. 从原始文件重算：落地指标只能由冻结规约 + raw 产物重算得出；
 * 4. 终态可追溯：终态迁移必须点名一次已落地的 probe；
 * 5. graveyard 必须可见：research_state 永远带着已死假设。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** 频段：闭区间 [lo, hi]，lo <= hi。 */
export type Band = readonly [number, number]

/** 预登记分支：结果落在某频段时对某 claim 做什么。 */
export interface PreregBranch {
  /** 触发频段 */
  band: Band
  /** 对 claim 的处置 */
  action: 'kill' | 'scope' | 'support'
  /** 目标 claim id */
  target: string
  /** scope 时的适用范围说明 */
  scopeNote?: string
}

/** 预登记探针规约（冻结内容，sha256 锁定）。 */
export interface ProbeSpec {
  pid: string
  /** 这个探针要判别什么问题 */
  question: string
  /** 受认可执行路径：冻结的命令字符串（执行时不得改写） */
  evalCommand: string
  /** 指标重算方式：json 路径或正则；禁止模型代码（宿主不执行模型写的程序） */
  metricKind: 'json' | 'regex'
  /** json: 点路径（如 results.accuracy）；regex: 单捕获组 */
  metricSpec: string
  /** 每个 LIVE claim 的预测频段 */
  bands: Record<string, Band>
  /** 结果分支：至少一个 kill/scope，否则探针是装饰性的 */
  branches: PreregBranch[]
}

export interface JournalEvent {
  ts: string
  op:
    | 'run.init'
    | 'claim.propose'
    | 'claim.revive'
    | 'prereg.write'
    | 'probe.start'
    | 'probe.land'
    | 'claim.transition'
    | 'attack.record'
    | 'report.declare'
    | 'gate.verdict'
    | 'tamper.detected'
    // EVAL-PLAN §1.3 计量接口：世界只经 MCP 可达，四类操作各自留痕。
    // replay 不消费这些事件（它们不改变信念状态）；预算与终局约束由
    // summarizeWorldJournal 从完整性校验后的 journal 独立重放。
    | 'world.info'
    | 'world.observe'
    | 'world.simulate'
    | 'world.forecast'
  [key: string]: unknown
}

export type ClaimState = 'PROPOSED' | 'LIVE' | 'SUPPORTED' | 'REFUTED' | 'SCOPED' | 'CONTESTED'

export interface ClaimRecord {
  id: string
  statement: string
  predicts: string[]
  state: ClaimState
  /** 进入当前状态的依据：probe id */
  byProbe?: string
  note?: string
  /** 与 graveyard 的关系声明（Arbor 四行契约第 4 行）：graveyard 非空时登记必填 */
  conflicts?: string
}

export interface ProbeRecord {
  pid: string
  status: 'PREREG' | 'RUNNING' | 'LANDED' | 'FAILED'
  preregSha256?: string
  exitCode?: number
  metric?: number
}

export interface ResearchState {
  run: string
  claims: ClaimRecord[]
  probes: ProbeRecord[]
  attacks: Array<{ gid: string; target: string; kind: string; text: string; ts: string }>
  reports: Array<{ path: string; sha256: string; ts: string }>
  /** declare 时三道 gate 的内嵌裁决记录（P3.2） */
  gateVerdicts: Array<{ ts: string; passed: boolean; report: string }>
  /** server 侦测到的 journal 篡改（P3.3；重启后基线重置，见 README 天花板） */
  tampers: Array<{ ts: string; expected: string; actual: string }>
  /** 已进入终态（REFUTED/SCOPED/SUPPORTED）的 claim —— grill 对抗者必须看得到 */
  graveyard: ClaimRecord[]
}

export interface WorldJournalSummary {
  spent: number
  forecastCount: number
}

export class ResearchStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResearchStateError'
  }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`
}

/** run 名只允许单一路径分量，杜绝路径逃逸。 */
export function sanitizeRunName(run: string): string {
  const cleaned = run.replace(/[^A-Za-z0-9_.-]/g, '-').replace(/^\.+/, '')
  if (!cleaned) throw new ResearchStateError('run 名不能为空')
  return cleaned
}

export function runDir(cwd: string, run: string): string {
  return resolve(cwd, '.proma-research', sanitizeRunName(run))
}

/** 把模型给的路径钉死在 run 目录内（拒绝 ../ 逃逸与绝对路径注入）。 */
export function confined(root: string, relative: string): string {
  const resolved = resolve(root, relative)
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new ResearchStateError(`路径越出 run 目录: ${relative}`)
  }
  return resolved
}

export function journalPath(root: string): string {
  return join(root, 'journal.jsonl')
}

export function readJournal(root: string): JournalEvent[] {
  const file = journalPath(root)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf-8').split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as JournalEvent)
}

/** 从权威 journal 计算世界预算与终局次数；展示 ledger 不参与准入。 */
export function summarizeWorldJournal(events: JournalEvent[]): WorldJournalSummary {
  return events.reduce<WorldJournalSummary>((summary, event) => {
    if (event.op === 'world.observe') {
      const cost = Number(event.cost)
      if (!Number.isFinite(cost) || cost < 0) {
        throw new ResearchStateError('journal 损坏：world.observe 的 cost 非法')
      }
      summary.spent += cost
    }
    if (event.op === 'world.forecast') summary.forecastCount += 1
    return summary
  }, { spent: 0, forecastCount: 0 })
}

/** 会话内 journal 基线（root → sha256）。server 重启即重置——天花板见 README。 */
const journalBaselines = new Map<string, string>()
/** 一旦侦测到篡改即永久污染该 run（本 server 生命周期内），不因 tamper 事件自身改基线而"洗白"。 */
const poisonedRoots = new Set<string>()

function rememberJournalBaseline(root: string): void {
  const file = journalPath(root)
  journalBaselines.set(root, existsSync(file) ? sha256(readFileSync(file, 'utf-8')) : '')
}

export function appendEvent(root: string, op: JournalEvent['op'], payload: Record<string, unknown>): JournalEvent {
  assertJournalIntact(root)
  const event: JournalEvent = { ts: new Date().toISOString(), op, ...payload }
  mkdirSync(root, { recursive: true })
  appendFileSync(journalPath(root), `${JSON.stringify(event)}\n`, 'utf-8')
  rememberJournalBaseline(root)
  return event
}

/**
 * P3.3 防篡改：journal 与 server 记住的基线不符时，记 tamper 事件并污染该 run
 * ——此后所有工具调用（含只读）一律拒绝，直到 server 重启。首次见到某个 run
 * 时以当前文件为基线（重启后的重置语义，天花板见 README）。
 */
export function assertJournalIntact(root: string): void {
  if (poisonedRoots.has(root)) {
    throw new ResearchStateError('journal 已被污染（此前侦测到会话外改动）：本 run 的全部工具在本 server 生命周期内拒绝服务。')
  }
  const file = journalPath(root)
  if (!existsSync(file)) return
  if (!journalBaselines.has(root)) {
    rememberJournalBaseline(root)
    return
  }
  const expected = journalBaselines.get(root) ?? ''
  const actual = sha256(readFileSync(file, 'utf-8'))
  if (expected === actual) return
  // 篡改现场先留痕（这条追加是 server 侧诚实记录），再污染并拒绝当次操作
  const event: JournalEvent = {
    ts: new Date().toISOString(),
    op: 'tamper.detected',
    expected: expected.slice(0, 16),
    actual: actual.slice(0, 16),
  }
  appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf-8')
  journalBaselines.set(root, sha256(readFileSync(file, 'utf-8')))
  poisonedRoots.add(root)
  throw new ResearchStateError(
    `journal 在会话外被改动（期望 sha256 ${expected.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）；`
    + '已记录 tamper 事件并污染本 run。若确为人工修复，请重启 server 后以当前文件为新基线。',
  )
}

const TERMINAL_STATES: ReadonlySet<ClaimState> = new Set(['SUPPORTED', 'REFUTED', 'SCOPED'])

/** 从 journal 重放整个状态。gate 与 MCP 共用这一份实现——改这里两边同步变。 */
export function replay(root: string): ResearchState {
  const events = readJournal(root)
  const state: ResearchState = {
    run: '',
    claims: [],
    probes: [],
    attacks: [],
    reports: [],
    gateVerdicts: [],
    tampers: [],
    graveyard: [],
  }
  for (const event of events) {
    switch (event.op) {
      case 'run.init':
        state.run = String(event.run ?? '')
        break
      case 'claim.propose': {
        const id = String(event.id ?? '')
        if (!id) throw new ResearchStateError('journal 损坏：claim.propose 缺 id')
        state.claims.push({
          id,
          statement: String(event.statement ?? ''),
          predicts: Array.isArray(event.predicts) ? event.predicts.map(String) : [],
          state: 'LIVE',
          ...(event.conflicts ? { conflicts: String(event.conflicts) } : {}),
        })
        break
      }
      case 'claim.revive': {
        const claim = state.claims.find((c) => c.id === event.id)
        if (claim && TERMINAL_STATES.has(claim.state)) claim.state = 'LIVE'
        break
      }
      case 'prereg.write': {
        const pid = String(event.pid ?? '')
        if (state.probes.some((p) => p.pid === pid && p.status !== 'PREREG')) {
          throw new ResearchStateError(`journal 损坏：${pid} 出现二次预登记`)
        }
        if (!state.probes.some((p) => p.pid === pid)) {
          state.probes.push({ pid, status: 'PREREG', preregSha256: String(event.spec_sha256 ?? '') })
        }
        break
      }
      case 'probe.start': {
        const probe = state.probes.find((p) => p.pid === event.pid)
        if (!probe || probe.status !== 'PREREG') {
          throw new ResearchStateError(`journal 损坏：${String(event.pid)} 在非预登记状态被启动`)
        }
        probe.status = 'RUNNING'
        break
      }
      case 'probe.land': {
        const probe = state.probes.find((p) => p.pid === event.pid)
        if (!probe || probe.status !== 'RUNNING') {
          throw new ResearchStateError(`journal 损坏：${String(event.pid)} 在非运行状态被落地`)
        }
        // 非零退出的 probe.land 是失败归因留痕，不是落地：崩溃探针绝不能
        // 变成终态迁移的 LANDED 依据（metric null 也绝不能被读成 0）
        const exitCode = Number(event.exit_code ?? -1)
        probe.exitCode = exitCode
        if (exitCode === 0) {
          probe.status = 'LANDED'
          probe.metric = Number(event.metric)
        } else {
          probe.status = 'FAILED'
        }
        break
      }
      case 'claim.transition': {
        const claim = state.claims.find((c) => c.id === event.id)
        if (!claim) throw new ResearchStateError(`journal 损坏：未知 claim ${String(event.id)}`)
        const to = String(event.to) as ClaimState
        const byProbe = event.by_probe ? String(event.by_probe) : undefined
        if (TERMINAL_STATES.has(to)) {
          const probe = state.probes.find((p) => p.pid === byProbe)
          if (!probe || probe.status !== 'LANDED') {
            throw new ResearchStateError(`journal 损坏：${claim.id} 终态迁移没有已落地 probe 依据`)
          }
          claim.byProbe = byProbe
          state.graveyard.push({ ...claim, state: to })
        }
        claim.state = to
        claim.note = event.note ? String(event.note) : claim.note
        break
      }
      case 'attack.record':
        state.attacks.push({
          gid: String(event.gid ?? ''),
          target: String(event.target ?? ''),
          kind: String(event.kind ?? ''),
          text: String(event.text ?? ''),
          ts: event.ts,
        })
        break
      case 'report.declare':
        state.reports.push({
          path: String(event.path ?? ''),
          sha256: String(event.sha256 ?? ''),
          ts: event.ts,
        })
        break
      case 'gate.verdict':
        state.gateVerdicts.push({
          ts: event.ts,
          passed: event.passed === true,
          report: String(event.report ?? ''),
        })
        break
      case 'tamper.detected':
        state.tampers.push({
          ts: event.ts,
          expected: String(event.expected ?? ''),
          actual: String(event.actual ?? ''),
        })
        break
    }
  }
  return state
}

/** 派生 register.json（缓存，永远以 replay 为准）。 */
export function writeRegisterSnapshot(root: string): void {
  const state = replay(root)
  writeFileSync(join(root, 'register.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}

/** 频段是否两两存在不重叠的一对（互斥频段约束的机械判定）。 */
export function hasDisjointBandPair(bands: Record<string, Band>): boolean {
  const entries = Object.entries(bands)
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [, [loA, hiA]] = entries[i]
      const [, [loB, hiB]] = entries[j]
      if (hiA < loB || hiB < loA) return true
    }
  }
  return false
}

/** 预登记的结构性检查：互斥频段 + kill/scope 分支 + 分支目标存在。 */
export function validateProbeSpec(spec: ProbeSpec, state: ResearchState): void {
  if (!spec.pid || !spec.question || !spec.evalCommand) {
    throw new ResearchStateError('prereg 缺少 pid / question / evalCommand')
  }
  if (!/^P\d+$/.test(spec.pid)) {
    throw new ResearchStateError(`探针 id 形如 P1、P2（收到: ${spec.pid}）`)
  }
  const allBands = [...Object.values(spec.bands ?? {}), ...(spec.branches ?? []).map((b) => b.band)]
  for (const band of allBands) {
    if (Array.isArray(band) && band.length !== 2) {
      throw new ResearchStateError(`频段必须是 [lo, hi] 数值对（收到: ${JSON.stringify(band)}）`)
    }
  }
  if (spec.metricKind !== 'json' && spec.metricKind !== 'regex') {
    throw new ResearchStateError('metricKind 只允许 json 或 regex（宿主不执行模型代码）')
  }
  if (!spec.metricSpec) throw new ResearchStateError('缺少 metricSpec')
  const bandEntries = Object.entries(spec.bands ?? {})
  if (bandEntries.length < 2) {
    throw new ResearchStateError('bands 必须覆盖至少两个 LIVE claim——单假设探针无法判别')
  }
  for (const [claimId, band] of bandEntries) {
    const claim = state.claims.find((c) => c.id === claimId)
    if (!claim || (claim.state !== 'LIVE' && claim.state !== 'CONTESTED')) {
      throw new ResearchStateError(`bands 引用了非 LIVE claim: ${claimId}`)
    }
    const [lo, hi] = band
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) {
      throw new ResearchStateError(`${claimId} 的频段非法: [${lo}, ${hi}]`)
    }
    // 退化频段（零宽点预测）是"答案已知"的结构性自白：离散未知量上没有人能把预测
    // 收敛成一个点，除非他已经看过结果。这条挡不住蓄意造假，但挡住了最常见的那次——
    // 先用 Bash 预览、再回来把频段写成观测值。模板 P14 的红线："不要根据结果反向补写
    // 预期观测或停止条件"。
    // ponytail: 类型检查器判不出"H2 是 H1 的取反"（那是语义），只判得出点预测与单假设探针；
    // 语义层的竞争解释由 research-abduce 的措辞与 grill 兜底。
    if (lo === hi) {
      throw new ResearchStateError(
        `${claimId} 的频段是零宽点预测 [${lo}, ${hi}]：没有容差的预测不是预测，是回忆。` +
        `预登记必须留出容差区间 → research-probe：按你执行前真实的不确定性重写频段`,
      )
    }
  }
  if (!hasDisjointBandPair(spec.bands)) {
    throw new ResearchStateError(
      '所有频段两两重叠：无论结果落在哪，信念都不会改变，这是装饰性探针。至少要有一对互斥频段。',
    )
  }
  const killOrScope = (spec.branches ?? []).filter((b) => b.action === 'kill' || b.action === 'scope')
  if (killOrScope.length === 0) {
    throw new ResearchStateError('branches 缺少 kill/scope 分支——探针必须有能力否定某个假设')
  }
  for (const branch of spec.branches ?? []) {
    if (!state.claims.some((c) => c.id === branch.target)) {
      throw new ResearchStateError(`分支目标不存在: ${branch.target}`)
    }
  }
}

/**
 * 从 raw 产物重算指标（约束 3：永不采信报告里的数字）。
 * 只支持 json 点路径与单捕获组正则——确定性、可重放、不执行代码。
 */
export function recomputeMetric(
  rawText: string,
  kind: 'json' | 'regex',
  spec: string,
): number {
  if (kind === 'json') {
    let value: unknown
    try {
      value = JSON.parse(rawText)
    } catch {
      throw new ResearchStateError('raw 输出不是合法 JSON')
    }
    for (const segment of spec.split('.')) {
      if (value === null || typeof value !== 'object') {
        throw new ResearchStateError(`json 路径 ${spec} 在 ${segment} 处断裂`)
      }
      value = (value as Record<string, unknown>)[segment]
    }
    const metric = Number(value)
    if (!Number.isFinite(metric)) throw new ResearchStateError(`json 路径 ${spec} 不是数字`)
    return metric
  }
  const match = new RegExp(spec).exec(rawText)
  if (!match || match[1] === undefined) throw new ResearchStateError(`正则 ${spec} 在 raw 输出中无匹配`)
  const metric = Number(match[1])
  if (!Number.isFinite(metric)) throw new ResearchStateError(`正则捕获组不是数字: ${match[1]}`)
  return metric
}
