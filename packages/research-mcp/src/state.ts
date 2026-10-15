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
  /** 01 K2-6：该分支命中时报告的第一句（HYPOTHETICAL）；mode run 里缺 → 该分支封顶 lead */
  headline?: string
}

/** 01 §3.0：run 的冻结字段（K0 写一次；切换 = 新 run）。没有它的 run 走 legacy 规则。 */
export type ResearchMode = 'open' | 'score' | 'identify'
export interface RunContract {
  mode: ResearchMode
  successPredicate: string
  depth: 'light' | 'full'
  recall: 'on' | 'off' | 'parametric-only'
}

/** IR-D3：prereg 引用的仿真记录（<cwd>/research-work/<run>/sim/*.json），宿主核对 sha256 后冻结。 */
export interface SimCitation {
  path: string
  /** 可省：宿主在预登记时算完整 sha256 并冻结；给了前缀就核对 */
  sha256?: string
}

/** 计量观测探针：测量本身即探针，由 server 经 meter 执行（扣预算），不经模型写的命令。 */
export interface ObserveSpec {
  world: string
  seed: number
  protocol: string
  reps?: number
  blockers?: string
}

/** 预登记探针规约（冻结内容，sha256 锁定）。evalCommand 与 observe 二选一。 */
export interface ProbeSpec {
  pid: string
  /** 这个探针要判别什么问题 */
  question: string
  /** 受认可执行路径：冻结的命令字符串（执行时不得改写）；非世界任务用 */
  evalCommand?: string
  /**
   * 世界任务唯一合法的探针形态。demo2r（2026-08-28）实测：沙箱按设计碰不到世界，
   * shell 探针只能回显常量或重读已发生的观测，预登记于是只约束了"重读"而非测量。
   */
  observe?: ObserveSpec
  /** 指标重算方式：json 路径或正则；禁止模型代码（宿主不执行模型写的程序） */
  metricKind: 'json' | 'regex'
  /** json: 点路径（如 results.accuracy）；regex: 单捕获组 */
  metricSpec: string
  /** 每个 LIVE claim 的预测频段 */
  bands: Record<string, Band>
  /** 01 K2-6 判别度（Δ/σ、r*）；mode run 里缺 → support 结论封顶 lead（只查存在，不查语义） */
  discrimination?: string
  /** 01 I4 band 出处：`sim:<记录>` / `measured:P#` / `asserted` / `invented`；未标按 asserted */
  provenance?: Record<string, string>
  /** IR-D3 仿真记录引用 */
  sims?: SimCitation[]
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
    // 02 SE7a：K0 kernel 环境快照（research_init）与 K7 重算出的漂移（report_declare，只封顶）。
    | 'env.snapshot'
    | 'env.drift'
    // 03 F1-T2：工作目录 nbsim 的生成记录（info）与 forecast 时的宿主复算（不符只封顶）。
    | 'world.env'
    | 'world.env.verify'
    // 审查 H1 余项：declare 的报告源是符号链接 / 多重硬链接（拒绝跟随；此后本 run 的声明封顶）。
    | 'report.link'
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
  /** IR-D1 派生关系 */
  parent?: string
  /** family（机制族）/ instance（参数点）；家族级 REFUTED 要 K3 审计 */
  level?: 'family' | 'instance'
  /** research_init 按 mode 自动登记的 H0 */
  builtin?: boolean
  /** SCOPED = narrowed（mode run）：收窄后仍存活的陈述 */
  scopedStatement?: string
  /** 被封顶的终态请求：claim 停在 CONTESTED，按 lead 读 */
  lead?: { requested: ClaimState; byProbe: string; caps: string[] }
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
  /** 已进入终态（REFUTED/SCOPED/SUPPORTED；mode run 里 SCOPED 是 narrowed，不进）的 claim —— grill 对抗者必须看得到 */
  graveyard: ClaimRecord[]
  /** 01 §3.0 冻结字段；legacy run 没有 */
  contract?: RunContract
  /** mode run：按 claim 计的未偿攻击债（new_h / constraint；点名该 claim 的 prereg 或 report_declare 清偿） */
  debts?: Array<{ gid: string; target: string; kind: string }>
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

function journalLines(root: string): string[] {
  const file = journalPath(root)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf-8').split('\n').filter((line) => line.trim() !== '')
}

/**
 * 哈希链校验：每条事件的 prev = 上一行原文的 sha256（首行对空串）。改任何一行，
 * 下一行的 prev 就对不上——server 重启、内存基线清空后照样能侦测。
 * 旧格式 journal（无 prev）照常可读：链从第一条带 prev 的事件开始，此后不许断。
 * ponytail: 没有外部锚点——重算整条链或截掉尾部仍可绕过；锚点可以是 report.declare 的 sha。
 * 返回第一处断链的说明；完好时返回 undefined。
 */
export function verifyJournalChain(root: string): string | undefined {
  const lines = journalLines(root)
  let started = false
  for (const [index, line] of lines.entries()) {
    const prev = (JSON.parse(line) as JournalEvent).prev
    if (prev === undefined) {
      if (started) return `第 ${index + 1} 行缺少 prev（链开始后不许断，疑似会话外手工追加）`
      continue
    }
    started = true
    if (prev !== sha256(index === 0 ? '' : lines[index - 1])) {
      return `第 ${index + 1} 行的 prev 与第 ${index} 行原文不符（此前内容被改动）`
    }
  }
  return undefined
}

export function appendEvent(root: string, op: JournalEvent['op'], payload: Record<string, unknown>): JournalEvent {
  assertJournalIntact(root)
  const lines = journalLines(root)
  const prev = sha256(lines.length === 0 ? '' : lines[lines.length - 1])
  const event: JournalEvent = { ts: new Date().toISOString(), op, ...payload, prev }
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
    // 首次见到（含 server 重启后）：内存基线为空，靠哈希链判断此前是否被改过
    const broken = verifyJournalChain(root)
    if (broken) {
      poisonRun(root, { reason: broken })
      throw new ResearchStateError(
        `journal 哈希链断裂：${broken}。已记录 tamper 事件并污染本 run——整轮作废，需重开 run。`,
      )
    }
    rememberJournalBaseline(root)
    return
  }
  const expected = journalBaselines.get(root) ?? ''
  const actual = sha256(readFileSync(file, 'utf-8'))
  if (expected === actual) return
  poisonRun(root, { expected: expected.slice(0, 16), actual: actual.slice(0, 16) })
  throw new ResearchStateError(
    `journal 在会话外被改动（期望 sha256 ${expected.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）；`
    + '已记录 tamper 事件并污染本 run（哈希链随之断裂，重启后同样拒绝）。',
  )
}

/** 篡改现场先留痕（server 侧诚实记录，不接链——断链本身就是证据），再污染。 */
function poisonRun(root: string, detail: Record<string, string>): void {
  const file = journalPath(root)
  const event = { ts: new Date().toISOString(), op: 'tamper.detected', ...detail }
  appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf-8')
  journalBaselines.set(root, sha256(readFileSync(file, 'utf-8')))
  poisonedRoots.add(root)
}

/** 测试用：模拟 server 重启（内存基线与污染标记清空）。 */
export function resetJournalBaselinesForTest(): void {
  journalBaselines.clear()
  poisonedRoots.clear()
}

const TERMINAL_STATES: ReadonlySet<ClaimState> = new Set(['SUPPORTED', 'REFUTED', 'SCOPED'])

/** 终态：mode run 里 SCOPED 是 narrowed（留在 LIVE 竞争，01 §12 Q1=(a)），legacy 沿用旧语义。 */
export function isTerminal(claimState: ClaimState, contract?: RunContract): boolean {
  return contract && claimState === 'SCOPED' ? false : TERMINAL_STATES.has(claimState)
}

/** 仍在竞争的 claim：可入 bands、是 support 互斥检查的对手。 */
export function isAlive(claimState: ClaimState, contract?: RunContract): boolean {
  return claimState === 'LIVE' || claimState === 'CONTESTED' || claimState === 'SUPPORTED'
    || (contract !== undefined && claimState === 'SCOPED')
}

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
        // 契约只认第一条带 mode 的 run.init（server 拒绝改写；重开不带字段）
        if (event.mode && !state.contract) {
          state.contract = {
            mode: event.mode as ResearchMode,
            successPredicate: String(event.success_predicate ?? ''),
            depth: event.depth as RunContract['depth'],
            recall: event.recall as RunContract['recall'],
          }
          state.debts = []
        }
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
          ...(event.parent ? { parent: String(event.parent) } : {}),
          ...(event.level ? { level: event.level as ClaimRecord['level'] } : {}),
          ...(event.builtin ? { builtin: true } : {}),
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
        if (state.debts && Array.isArray(event.claims)) {
          const named = new Set(event.claims.map(String))
          state.debts = state.debts.filter((debt) => !named.has(debt.target))
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
        if (TERMINAL_STATES.has(to) || Array.isArray(event.lead)) {
          const probe = state.probes.find((p) => p.pid === byProbe)
          if (!probe || probe.status !== 'LANDED') {
            throw new ResearchStateError(`journal 损坏：${claim.id} 终态迁移没有已落地 probe 依据`)
          }
          claim.byProbe = byProbe
        }
        delete claim.lead
        if (Array.isArray(event.lead)) {
          claim.lead = { requested: String(event.requested) as ClaimState, byProbe: String(byProbe), caps: event.lead.map(String) }
        }
        if (to === 'SCOPED' && event.scoped_statement) claim.scopedStatement = String(event.scoped_statement)
        if (isTerminal(to, state.contract)) {
          // 同一 claim 二次终态（如 SUPPORTED→REFUTED）只保留最后一次；note 取迁移前的（legacy register 逐字不变）
          state.graveyard = [...state.graveyard.filter((g) => g.id !== claim.id), { ...claim, state: to }]
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
        if (state.debts && (event.kind === 'new_h' || event.kind === 'constraint')) {
          state.debts.push({ gid: String(event.gid ?? ''), target: String(event.target ?? ''), kind: String(event.kind) })
        }
        break
      case 'report.declare':
        // 余债落成报告的 scope 段（01 §7.2 合法出口）
        if (state.debts) state.debts = []
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

/** 恒等回显探针（E1 r4 实测）：整条命令只打印一个常数——输出与任何输入无关，不是测量。 */
const NUM = String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`
const CONSTANT_OUTPUT_COMMANDS = [
  new RegExp(`^(?:python|python3)\\s+-c\\s+(['"])\\s*print\\s*\\(\\s*${NUM}\\s*\\)\\s*\\1$`),
  new RegExp(`^echo\\s+${NUM}$`),
  new RegExp(`^printf\\s+['"]?${NUM}['"]?\\s*$`),
]

function isConstantOutputCommand(command: string): boolean {
  const trimmed = command.trim()
  return CONSTANT_OUTPUT_COMMANDS.some((re) => re.test(trimmed))
}

/** predicts 方向词；只在可无歧义推断时执法（双方向、无方向或否定方向 → 跳过）。
 *  短语两侧钉 \b，避免 enterprise→rise、furthermore→more、fallback→fall、setup→up 的子串误配；
 *  否定短语（不低于/不超过/no less than/increase does not occur）保守跳过——
 *  边界词或被否定的趋势不是可安全机械推断的方向。 */
const PREDICTS_UP = /(higher|increas(?:e|es|ing)|above|\bris(?:e|es|ing)\b|larger|greater|\bmore\b|\bup\b|升|上升|超过|更高|更多|增大)/i
const PREDICTS_DOWN = /(lower|decreas(?:e|es|ing)|below|\bfall(?:s|ing)?\b|smaller|fewer|\bless\b|\bdown\b|降|下降|低于|更低|更少|减小)/i
const NEGATED_DIRECTION = [
  /不(?:会|再|能|得|曾|将)?\s*(?:低于|超过|上升|下降|增加|减少|升高|降低|更高|更低|更多|更少|增大|减小|升|降)/,
  /(?:没有|并未|未见|无)(?:明显)?\s*(?:上升|下降|增加|减少|升高|降低|增大|减小)/,
  /(?:上升|下降|增加|减少|升高|降低|增大|减小)\s*(?:并)?(?:不|未)(?:明显|发生|出现)/,
  /\b(?:no|not|never|hardly|without)\s+(?:expected\s+to\s+)?(?:less|more|higher|lower|above|below|increas\w*|decreas\w*|ris\w+|fall\w+)/i,
  /\b(?:increas\w*|decreas\w*|ris\w+|fall\w+)\s+(?:does|did|will|would|is|was)\s+not\b/i,
]

function predictsDirection(predicts: string[]): 'up' | 'down' | undefined {
  const text = predicts.join(' ')
  if (NEGATED_DIRECTION.some((re) => re.test(text))) return undefined
  const up = PREDICTS_UP.test(text)
  const down = PREDICTS_DOWN.test(text)
  return up === down ? undefined : (up ? 'up' : 'down')
}

/**
 * world.observe 事件是否落在这个计量格子（world, seed, protocol, blockers）上。
 * 旧事件（0.3.0 之前）不记 blockers：不知道当时阻断了什么，对该协议的任何 blockers 都算看过。
 */
export function observeCellMatches(
  event: JournalEvent,
  cell: { world: string; seed: number; protocol: string; blockers?: string },
): boolean {
  if (event.world !== cell.world || event.seed !== cell.seed || event.protocol !== cell.protocol) return false
  if (!('blockers' in event)) return true
  return String(event.blockers) === (cell.blockers ?? '')
}

function validateObserveSpec(observe: ObserveSpec, metricKind: string, metricSpec: string): void {
  if (typeof observe.world !== 'string' || observe.world.trim() === ''
    || typeof observe.protocol !== 'string' || observe.protocol.trim() === '') {
    throw new ResearchStateError('observe 探针缺少 world / protocol（协议标签先用 world_simulate 的 mode=info 获取）')
  }
  if (!Number.isInteger(observe.seed)) throw new ResearchStateError('observe.seed 必须是整数')
  if (observe.reps !== undefined && (!Number.isInteger(observe.reps) || observe.reps < 1 || observe.reps > 20)) {
    throw new ResearchStateError('observe.reps 必须是 1–20 的整数')
  }
  // meter 返回里只有 spike_count 是测量；cost/reps/test_start_index 是登记时就已知的常量
  if (metricKind !== 'json' || metricSpec !== 'spike_count') {
    throw new ResearchStateError('observe 探针只能取 metricKind=json、metricSpec=spike_count（其余字段是已知常量，取它们等于回显）')
  }
}

/**
 * 预登记的结构性检查：互斥频段 + kill/scope 分支 + 分支目标存在。
 * worldTask：本 server 注册了世界计量时为真——此时探针只能是 observe。
 */
export function validateProbeSpec(
  spec: ProbeSpec,
  state: ResearchState,
  options: { worldTask?: boolean } = {},
): void {
  if (!spec.pid || !spec.question) {
    throw new ResearchStateError('prereg 缺少 pid / question')
  }
  if (Boolean(spec.evalCommand) === Boolean(spec.observe)) {
    throw new ResearchStateError('prereg 必须且只能给出 evalCommand 或 observe 之一')
  }
  if (options.worldTask && !spec.observe) {
    throw new ResearchStateError(
      '世界任务的探针必须是计量观测（spec.observe = {world, seed, protocol, reps}）：'
      + '沙箱碰不到世界，shell 命令只能回显或重读已发生的观测，预登记就约束不到测量本身 '
      + '→ research-probe：把要判别的那次观测写进 observe，由 probe_run 执行并扣预算',
    )
  }
  if (spec.observe) validateObserveSpec(spec.observe, spec.metricKind, spec.metricSpec)
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
    throw new ResearchStateError('bands 必须覆盖至少两个 claim（LIVE/CONTESTED，或作为被挑战对手的 SUPPORTED）——单假设探针无法判别')
  }
  // SUPPORTED 可进 bands 当被挑战的对手（GLM ca-rebound-s0：H5 SUPPORTED 后唯一 LIVE 的 H7
  // 无从判别）；但至少要有一个 LIVE/CONTESTED——全是 SUPPORTED 的探针只是在确认已信之事。
  // mode run：SCOPED 是 narrowed，照常入 bands（GLM：P2=34 恰等于 null 却把 null 收窄出局，[HC-Q2]）
  const contract = state.contract
  const isOpen = (s?: ClaimState) => s !== undefined && s !== 'SUPPORTED' && isAlive(s, contract)
  for (const [claimId, band] of bandEntries) {
    const claim = state.claims.find((c) => c.id === claimId)
    if (!claim || !isAlive(claim.state, contract)) {
      throw new ResearchStateError(contract
        ? `bands 引用了已死 claim: ${claimId}（REFUTED 须先带 note 复活；SCOPED/narrowed 可直接入 bands）`
        : `bands 引用了非 LIVE claim: ${claimId}（只收 LIVE/CONTESTED/SUPPORTED；REFUTED/SCOPED 须先带 note 复活）`)
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
  if (!bandEntries.some(([id]) => isOpen(state.claims.find((c) => c.id === id)?.state))) {
    throw new ResearchStateError(
      'bands 全是 SUPPORTED claim：这是确认性探针，只会重复已信之事 → research-abduce：至少放进一个 LIVE/CONTESTED 的竞争假设',
    )
  }
  if (!hasDisjointBandPair(spec.bands)) {
    throw new ResearchStateError(
      '所有频段两两重叠：无论结果落在哪，信念都不会改变，这是装饰性探针。至少要有一对互斥频段。'
      + '选择原则（experimental-tactics）：先写对手的预测差、单一承重干预、最强的平凡对照、先测上下界'
      + ' → 加 H0（mode run 已内置）做互斥的一方，或换协议',
    )
  }
  validateProvenance(spec, state)
  const killOrScope = (spec.branches ?? []).filter((b) => b.action === 'kill' || b.action === 'scope')
  if (killOrScope.length === 0) {
    throw new ResearchStateError('branches 缺少 kill/scope 分支——探针必须有能力否定某个假设')
  }
  for (const branch of spec.branches ?? []) {
    if (!state.claims.some((c) => c.id === branch.target)) {
      throw new ResearchStateError(`分支目标不存在: ${branch.target}`)
    }
  }
  // 恒等回显探针（ARFT C.1 预登记剧场）：常量输出让频段必中，SUPPORTED 是结构性保送。
  // 这条挡不住复杂蓄意造假（语义层由 trace/对抗证据兜底），挡住的是最常见的那次——
  // 把已观测数字直接 print 回来。band-direction 检查同理：只判结构可判的倒置。
  if (spec.evalCommand && isConstantOutputCommand(spec.evalCommand)) {
    throw new ResearchStateError(
      `${spec.pid} 的 evalCommand 是常量输出（${spec.evalCommand}）：不读输入、不算数的命令不是测量，`
      + '频段必中等于没有判别力 → research-probe：改成真正读取数据/执行对比的命令',
    )
  }
  // 稻草人假设（ARFT A.6）：predicts 说升、频段却整体落在预测降的对侧——注册即注定 kill。
  // observe 探针不执法：predicts 分协议/阻断剂写，这个协议上的方向从文本推不出来（误杀过合法 prereg）。
  // world 任务只允许 observe 探针，所以 A.6 实际只覆盖 evalCommand 跑法。
  if (spec.observe) return
  const directions = Object.entries(spec.bands ?? {})
    .map(([claimId, band]) => ({
      claimId,
      band,
      dir: predictsDirection(state.claims.find((c) => c.id === claimId)?.predicts ?? []),
    }))
    .filter((d) => d.dir !== undefined)
  for (let i = 0; i < directions.length; i += 1) {
    for (let j = i + 1; j < directions.length; j += 1) {
      const a = directions[i]
      const b = directions[j]
      if (a.dir === b.dir) continue
      const [aLo, aHi] = a.band
      const [bLo, bHi] = b.band
      const inverted = a.dir === 'up' ? aHi <= bLo : bHi <= aLo
      if (inverted) {
        throw new ResearchStateError(
          `频段方向与 predicts 相反：${a.claimId} 预测方向为${a.dir === 'up' ? '升' : '降'}，`
          + `频段 [${aLo}, ${aHi}] 却整体落在预测为${b.dir === 'up' ? '升' : '降'}的 ${b.claimId} `
          + `[${bLo}, ${bHi}] 的对侧——注册即注定 kill，是稻草人假设 → research-abduce：修正 predicts 或重写频段，使两者方向一致`,
        )
      }
    }
  }
}

/** sim 出处标签能指向的引用：完整路径、或 sim/ 下的文件名（去不去 .json 都行）。 */
export function simRefMatches(ref: string, citation: SimCitation): boolean {
  const file = citation.path.split('/').pop() ?? ''
  return ref === citation.path || ref === file || ref === file.replace(/\.json$/, '') || citation.path.endsWith(`/${ref}`)
}

/**
 * band 出处标签里可核对的两种必须属实：`measured:P#` 的 P# 已落地，`sim:<ref>` 指向本 prereg 引用的仿真记录。
 * 其余（asserted / invented / 自由文本 / 未标）都按 asserted 处理——只封顶，不拒（01 §7.5-4）。
 */
function validateProvenance(spec: ProbeSpec, state: ResearchState): void {
  for (const [claimId, raw] of Object.entries(spec.provenance ?? {})) {
    const tag = String(raw).trim()
    const measured = /^measured:(P\d+)$/.exec(tag)
    if (measured && state.probes.find((p) => p.pid === measured[1])?.status !== 'LANDED') {
      throw new ResearchStateError(`${claimId} 的频段出处 ${tag}：${measured[1]} 不是已落地探针 → 改标 asserted，或引用已落地的 P#`)
    }
    const sim = /^sim:(.+)$/.exec(tag)
    if (sim && !(spec.sims ?? []).some((citation) => simRefMatches(sim[1], citation))) {
      throw new ResearchStateError(
        `${claimId} 的频段出处 ${tag} 没有对应的仿真记录引用 → 在 spec.sims 里列出 {path: "sim/<id>.json"}（research-work/<run>/sim/ 下），或改标 asserted`,
      )
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
