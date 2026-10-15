/**
 * @proma/research-mcp —— 研究层的确定性底座（stdio MCP server）。
 *
 * 分工（对齐 docs/plans/PLAN.md P2 与 ccf ARBOR 阅读）：
 * - skill 负责怎么想（阶段、判别性、对抗），模型是大脑；
 * - 本 server 负责怎么落（状态迁移、预登记、受认可执行、重算），不调 LLM；
 * - gates 负责裁决（宿主判定，退出码说话）。
 *
 * 四类确定性操作，只有这些：
 * 1. 信念状态读写：claim/probe 状态迁移，全部走只追加 journal；
 * 2. 从原始文件重算指标：json 点路径 / 正则，永不执行模型代码；
 * 3. 预登记落盘：时间戳 + sha256，先登记后执行；
 * 4. 受认可的执行路径：probe_run 只执行预登记时冻结的测量——世界任务是 observe
 *    （server 经 meter 计量，扣预算），其余是沙箱内的冻结命令字符串。
 *
 * 与 Arbor 的 MCP 一致做无状态化：每个工具显式携带 run 名（单一路径分量，
 * 钉死在 <cwd>/.proma-research/<run>/ 内），不跨目录泄漏。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, posix } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { requireSandbox, resolveResearchDenyRoots, runSandboxedEval } from './sandbox.js'
import { diffKernelEnv, takeKernelEnvSnapshot, treeSha256, type KernelEnvSnapshot } from './env-snapshot.js'
import { runPreregGate } from '../gates/prereg.js'
import { runReconcileGate } from '../gates/reconcile.js'
import { runTraceGate } from '../gates/trace.js'
import { inspectAudit, readNoFollow, verifySimCitations } from './files.js'
import { capLines, decideTransition, preregCapLines, type Cap } from './caps.js'
import { BUILTIN_H0, describeContract, planInit } from './contract.js'
import {
  ResearchStateError,
  appendEvent,
  assertJournalIntact,
  confined,
  isTerminal,
  recomputeMetric,
  readJournal,
  replay,
  runDir,
  sanitizeRunName,
  sha256,
  stableStringify,
  summarizeWorldJournal,
  observeCellMatches,
  validateProbeSpec,
  writeRegisterSnapshot,
  type Band,
  type JournalEvent,
  type ObserveSpec,
  type ProbeSpec,
  type SimCitation,
} from './state.js'

/**
 * 候选模式拒绝的首行固定前缀（02 §11.4 接口 6，D → A）：轨道 A 在 NON_LEARNABLE_MCP_RESIDUALS
 * 里匹配它——这条拒绝属于 integrity（拒绝文本本身就是出口），不可学。
 */
export const CANDIDATE_MOVED_PREFIX = '候选仿真已移到工作目录'

/** 01 §6.5：带外拒绝内联 triage 台阶全文（历史只有 5/9 会话打开过 triage.md）。 */
const TRIAGE_STEPS = '强制分诊（research-moves 的 references/triage.md），按台阶爬、不许跳：'
  + '① 指标伪影（重算路径取错了？换聚合还在吗）→ ② 实现 bug（命令或被测代码错了？）→ ③ 方差（换种子 / 切分还复现吗？残差在噪声带内吗）'
  + '→ ④ 已知现象（必须给出处线索，否则回 ⑤）→ ⑤ 真实意外。出口都是落账：伪影 / bug → 修好后 prereg_write 新探针；'
  + '方差 → 按 derive.md 重推频段宽度、新探针；已知 → attack_record(kind=constraint) 并在下个 prereg 加控制臂；真实意外 → claim_propose 一个产生该残差的机制'

/** 每次调用时解析：测试与宿主可在进程启动后变更工作目录。 */
function serverCwd(): string {
  return process.env.PROMA_RESEARCH_CWD ?? process.cwd()
}

function resolveRun(run: string): string {
  assertRunAllowed(run)
  return runDir(serverCwd(), sanitizeRunName(run))
}

/** agent 的工作目录 <cwd>/research-work/<run>/：REPORT.md、lessons.md、nbsim 都在这里，状态根之外。 */
function workDir(run: string): string {
  return join(serverCwd(), 'research-work', sanitizeRunName(run))
}

/** 宿主自己的文件：先摘掉同名（可能是链接），再 O_EXCL 新建，绝不写穿。 */
function writeFresh(file: string, text: string): void {
  rmSync(file, { force: true })
  writeFileSync(file, text, { encoding: 'utf-8', flag: 'wx' })
}

/**
 * 战役钉死：设了 PROMA_RESEARCH_RUN 后，所有工具只允许访问这一个 run。
 *
 * P4.3 实测的污染路径是——对抗子代理继承了可写 MCP，自行 research_init 出一个旁路战役，
 * 在里面登记假设、跑探针、落攻击。子代理与父代理在 MCP 这一侧不可区分（服务端看不到
 * agentID），所以收敛点只能是"这台服务只认这一个战役名"。写入既有 run 不受影响——
 * 那是可见的、会进 journal 的行为；凭空开新战役不是。
 */
function assertRunAllowed(run: string): void {
  const pinned = process.env.PROMA_RESEARCH_RUN
  if (!pinned) return
  if (sanitizeRunName(run) !== sanitizeRunName(pinned)) {
    throw new ResearchStateError(
      `本次会话已钉死战役 ${sanitizeRunName(pinned)}，拒绝访问 ${sanitizeRunName(run)}：` +
      `研究战役不由子代理凭空开新分支 → 用 research_state 读取 ${sanitizeRunName(pinned)}，` +
      `攻击写进你自己的 RLM_SESSION_DIR/attacks.md，由父代理经 attack_record 落账`,
    )
  }
}

/**
 * 01 §7 ④ 拒绝可见（[HC-Q4]）：被拒的调用在 throw 之前追加到 <run>/rejections.jsonl。
 * 不进哈希链、不参与 replay；run 目录还不存在（未 init）时不留痕。留痕失败绝不吞掉原拒绝。
 */
function recordRejection(op: string, input: Record<string, unknown>, error: unknown): void {
  try {
    const root = runDir(serverCwd(), sanitizeRunName(process.env.PROMA_RESEARCH_RUN ?? String(input.run ?? '')))
    if (!existsSync(root)) return
    const args = JSON.parse(JSON.stringify(input, (_key, value) => (
      typeof value === 'string' && value.length > 200 ? `${value.slice(0, 200)}…` : value)))
    const message = error instanceof Error ? error.message : String(error)
    appendFileSync(join(root, 'rejections.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), op, args, error: message.slice(0, 2000) })}\n`, 'utf-8')
  } catch { /* 留痕是旁注 */ }
}

function freshRegister(root: string): void {
  writeRegisterSnapshot(root)
}

function requireInit(root: string): void {
  if (!existsSync(join(root, 'journal.jsonl'))) {
    throw new ResearchStateError('run 尚未初始化，先调用 research_init')
  }
  // P3.3：每个工具调用先校验 journal 完整性（含只读工具）
  assertJournalIntact(root)
}

/** 读回预登记并校验 sha256 与 journal 记录一致（文件被改过即拒绝）。 */
function readFrozenSpec(root: string, pid: string): ProbeSpec {
  const file = confined(root, join('prereg', `${pid}.json`))
  if (!existsSync(file)) throw new ResearchStateError(`没有 ${pid} 的预登记文件`)
  const parsed = JSON.parse(readFileSync(file, 'utf-8')) as ProbeSpec & { frozenAt?: string }
  const digest = sha256(stableStringify({ ...parsed }))
  const probe = replay(root).probes.find((p) => p.pid === pid)
  if (probe?.preregSha256 && probe.preregSha256 !== digest) {
    throw new ResearchStateError(`${pid} 的预登记文件与登记时的 sha256 不符（被改动过），拒绝使用`)
  }
  return parsed
}

function inBand(value: number, band: Band): boolean {
  return value >= band[0] && value <= band[1]
}

/** 宿主复算 nbsim 树 sha：目录没了记 missing；万一仍抛记 unreadable——verify 必须落 journal（审查 H-A）。 */
function currentTreeSha(path: string): string {
  try {
    return treeSha256(path) ?? 'missing'
  } catch (error) {
    return `unreadable:${error instanceof Error ? error.message : String(error)}`
  }
}

/** K0 基线：第一条可用的 env.snapshot（之后再 init 不覆盖它）。 */
function kernelEnvBaseline(events: JournalEvent[]): KernelEnvSnapshot | undefined {
  return events.find((event) => event.op === 'env.snapshot' && !('unavailable' in event)) as KernelEnvSnapshot | undefined
}

interface ReportCap {
  /** 写进 gate.verdict.caps 的机器码 */
  code: 'env_drift' | 'world_env_mismatch' | 'forecast_missing' | 'report_link'
  /** 报告里已有这段就不再追加（重复 declare 不叠行） */
  marker: string
  /** 追加到报告末尾的宿主文本：不带小数、不带 H#，以后离线重跑 reconcile 也不会红 */
  line: string
}

/**
 * K7 的封顶项（gate 通过之后算；只封顶，不拒）：
 * - env_drift（02 SE7a）：K0 快照与现在的 kernel 环境不同，写 env.drift，结论按 lead 读；
 *   K7 时拿不到快照也算漂移（无法核对 = 不能当没变）。K0 本就不可用时不核对、不封顶。
 * - world_env_mismatch（03 A6）：forecast 时宿主复算 nbsim 树 sha 不符。
 * - forecast_missing：碰过 world 的 run 没有 world.forecast——三道 gate 不看终局，
 *   不能让一份没有 held-out 预报的报告静默地以"完整"结束。
 * - report_link（审查 H1 余项）：declare 的报告源是符号链接或多重硬链接——拒绝跟随（不复制），
 *   记 report.link；此后本 run 每次声明都封顶（有人试过让报告与别的文件共享内容）。
 */
function reportCaps(root: string): ReportCap[] {
  const caps: ReportCap[] = []
  const baseline = kernelEnvBaseline(readJournal(root))
  if (baseline) {
    const now = takeKernelEnvSnapshot(process.env.PROMA_KERNEL_PYTHON, serverCwd())
    const changed = now.available ? diffKernelEnv(baseline, now.snapshot) : [`unavailable: ${now.reason}`]
    if (changed.length > 0) {
      // 重复 declare：同一漂移只记一次，封顶行指向那一条
      let seq = readJournal(root).findLastIndex((event) => event.op === 'env.drift'
        && JSON.stringify(event.changed) === JSON.stringify(changed)) + 1
      if (seq === 0) {
        appendEvent(root, 'env.drift', { changed })
        seq = readJournal(root).length
      }
      const marker = '⚠ kernel 环境在 run 中变化'
      caps.push({ code: 'env_drift', marker, line: `${marker}（journal seq ${seq}）：本报告的结论按 \`lead\` 读` })
    }
  }
  const events = readJournal(root)
  // 任何一次不符都封顶：篡改后再 info 重建出同 sha 的树，最后一次 verify 会是 match:true（审查 H3）
  const verifyIndex = events.findIndex((event) => event.op === 'world.env.verify' && event.match === false)
  if (verifyIndex >= 0) {
    const marker = '⚠ 工作目录里的 nbsim 在 run 中被改动'
    caps.push({ code: 'world_env_mismatch', marker, line: `${marker}（journal seq ${verifyIndex + 1}）：由它仿真得出的数字按 \`lead\` 读` })
  }
  const linkIndex = events.findIndex((event) => event.op === 'report.link')
  if (linkIndex >= 0) {
    const marker = '⚠ 报告文件是链接'
    caps.push({ code: 'report_link', marker, line: `${marker}（journal seq ${linkIndex + 1}）：本 run 曾试图从链接声明报告，结论按 \`lead\` 读` })
  }
  if (events.some((event) => event.op.startsWith('world.')) && !events.some((event) => event.op === 'world.forecast')) {
    const marker = '⚠ 本 run 未提交 world_forecast'
    caps.push({ code: 'forecast_missing', marker, line: `${marker}：报告不含 held-out 终局预报，按未完成的 world 任务读` })
  }
  return caps
}

// zod 仅供 MCP 参数解包；严格的语义校验在 validateProbeSpec（state.ts）。
// 这里刻意避开 tuple-items / pattern / minLength 等 JSON Schema 关键字：
// 智谱 Anthropic 端点对工具 schema 严格校验，这类写法会整包 400（1210）。
const BandSchema = z.array(z.number())

const ObserveSpecSchema = z.object({
  world: z.string(),
  seed: z.number().int(),
  protocol: z.string(),
  reps: z.number().int().optional(),
  blockers: z.string().optional(),
})

const ProbeSpecSchema = z.object({
  pid: z.string(),
  question: z.string(),
  // 二选一（语义校验在 validateProbeSpec）：世界任务只收 observe
  evalCommand: z.string().optional(),
  observe: ObserveSpecSchema.optional(),
  metricKind: z.enum(['json', 'regex']),
  metricSpec: z.string(),
  bands: z.record(z.string(), BandSchema),
  branches: z.array(z.object({
    band: BandSchema,
    action: z.enum(['kill', 'scope', 'support']),
    target: z.string(),
    scopeNote: z.string().optional(),
    headline: z.string().optional(),
  })),
  discrimination: z.string().optional(),
  provenance: z.record(z.string(), z.string()).optional(),
  sims: z.array(z.object({ path: z.string(), sha256: z.string().optional() })).optional(),
})

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'proma-research', version: '0.3.1' },
    { capabilities: { tools: {} } },
  )
  // 一处拦截：每个工具的 handler 抛错都先落 rejections.jsonl（调用点保持 `server.tool(` 字面，RDS 按它解析工具名）
  const registerTool = server.tool.bind(server) as (...args: unknown[]) => unknown
  ;(server as unknown as { tool: (...args: unknown[]) => unknown }).tool = (...args: unknown[]) => {
    const handler = args.pop() as (input: Record<string, unknown>, extra: unknown) => Promise<unknown>
    return registerTool(...args, async (input: Record<string, unknown>, extra: unknown) => {
      try {
        return await handler(input, extra)
      } catch (error) {
        recordRejection(String(args[0]), input, error)
        throw error
      }
    })
  }
  // schema 层拒绝（zod 入参校验）发生在 handler 之前，上面的拦截看不到 → 包 SDK 的校验步骤。
  // ponytail: 依赖 SDK 1.29 私有方法 validateToolInput；改名后只告警、不包装（schema 拒绝不进 rejections.jsonl），
  // 不让整个 research MCP 起不来。由 mode-semantics.test 的 schema 拒绝用例兜住。
  const sdk = server as unknown as { validateToolInput?: (tool: unknown, args: unknown, name: string) => Promise<unknown> }
  if (typeof sdk.validateToolInput !== 'function') {
    console.warn('[research-mcp] SDK 没有 validateToolInput：schema 层拒绝不会写入 rejections.jsonl')
  } else {
    const validateToolInput = sdk.validateToolInput.bind(server)
    sdk.validateToolInput = async (tool, input, name) => {
      try {
        return await validateToolInput(tool, input, name)
      } catch (error) {
        recordRejection(name, (input ?? {}) as Record<string, unknown>, error)
        throw error
      }
    }
  }

  // meter 在 server 进程内执行（沙箱外）：真值（worlds.py 的 novel 通道参数）
  // 从不出现在工具返回里。PROMA_RESEARCH_DENY 是 world 工具注册的 fail-closed
  // 前置；kernel 无法结构性沙箱化，因此评测脚本另以权限策略阻断直连，并由
  // liveness 把实际 benchmark 读取/import 当作泄漏指标。预算与终局以 journal 为准。
  let worldIsolationReady = true
  let budgetValid = true
  try {
    resolveResearchDenyRoots()
  } catch (error) {
    worldIsolationReady = false
    console.error(`[proma-research] world_* 未注册（fail closed）：${error instanceof Error ? error.message : String(error)}`)
  }
  const METER = process.env.PROMA_EVAL_METER
    ?? new URL('../../../research/eval/world-meter.py', import.meta.url).pathname
  // 回落值与 NeuronBench 官方 baseline 对齐（agent.py budget=8）；曾为 40，漏传 env 时硬上限静默放宽
  const EVAL_BUDGET = Number(process.env.PROMA_EVAL_BUDGET?.trim() || 8)
  if (!Number.isInteger(EVAL_BUDGET) || EVAL_BUDGET < 1) {
    // NaN 会让 `spent + reps > budget` 恒假——非法预算必须 fail closed，而不是不设上限。
    // 只关计量；worldTask（shell 探针禁令）仍由 deny 根决定，不随预算放开
    budgetValid = false
    console.error(`[proma-research] world_* 未注册（fail closed）：PROMA_EVAL_BUDGET 非正整数（${process.env.PROMA_EVAL_BUDGET}）`)
  }

  /** 计量前置检查（不写 journal）：终局后关闭；预算以权威 journal 为准。 */
  function assertObserveAllowed(root: string, reps: number): void {
    const worldState = summarizeWorldJournal(readJournal(root))
    if (worldState.forecastCount > 0) {
      throw new ResearchStateError('终局已裁决；world_observe 不再开放——下一步：report_declare')
    }
    if (worldState.spent + reps > EVAL_BUDGET) {
      throw new ResearchStateError(
        `budget exhausted: spent=${worldState.spent} + reps=${reps} > budget=${EVAL_BUDGET}；`
        + '下一步：用已落地的观测收窄假设，或 report_declare 终局',
      )
    }
  }

  /**
   * 先登记后测量的结构保证：同一 (world, seed, protocol, blockers) 的计量是确定性的
   * （实测同格三次均为 32.0），看过的格子再登记，频段就是照着答案画的。
   */
  function assertCellUnobserved(root: string, observe: ObserveSpec): void {
    const blockers = observe.blockers ?? ''
    const seen = readJournal(root).some((event) => event.op === 'world.observe' && observeCellMatches(event, observe))
    if (seen) {
      throw new ResearchStateError(
        `该格子已观测过（${observe.world}/seed ${observe.seed}/${observe.protocol}${blockers ? `/${blockers}` : ''}）：`
        + '同格计量是确定性的，看过再登记等于给已知答案画频段 → research-probe：换一个未观测的协议/阻断剂组合，'
        + '或先免费仿真比较候选再登记（仿真入口见 world_simulate 的 mode=info）',
      )
    }
  }

  /**
   * 一个格子只许一个预登记，且登记后只能由 probe_run 测量：否则可以先登记多份矛盾频段、
   * 再自由观测、最后只跑与答案相符的那份（第二轮评审实测路径）。
   */
  function assertCellUnreserved(root: string, observe: ObserveSpec): void {
    const events = readJournal(root)
    const holder = replay(root).probes.find((probe) => {
      // meter 没测成（FAILED 且没有入账的观测）不算占用：什么都没看见，换新 pid 重登记是正当的
      if (probe.status === 'FAILED'
        && !events.some((event) => event.op === 'world.observe' && event.pid === probe.pid)) return false
      const file = join(root, 'prereg', `${probe.pid}.json`)
      if (!existsSync(file)) return false
      const frozen = JSON.parse(readFileSync(file, 'utf-8')) as ProbeSpec
      return frozen.observe !== undefined
        && frozen.observe.world === observe.world && frozen.observe.seed === observe.seed
        && frozen.observe.protocol === observe.protocol
        && (frozen.observe.blockers ?? '') === (observe.blockers ?? '')
    })
    if (holder) {
      throw new ResearchStateError(
        `该格子已有预登记 ${holder.pid}（${observe.world}/seed ${observe.seed}/${observe.protocol}）：`
        + `一个格子只测一次，且只能经 probe_run ${holder.pid} 测量 → 换一个协议/阻断剂组合`,
      )
    }
  }

  /** 唯一的计量执行路径：world_observe 与 observe 探针共用。返回 meter stdout（原始记录）。 */
  function runMeterObserve(root: string, observe: ObserveSpec, pid?: string): string {
    const spent = summarizeWorldJournal(readJournal(root)).spent
    const args = ['observe', observe.world, String(observe.seed), observe.protocol]
    if (observe.reps) args.push('--reps', String(observe.reps))
    if (observe.blockers) args.push('--blockers', observe.blockers)
    const proc = spawnSync(
      'python3',
      [METER, '--ledger', join(root, 'world-ledger.jsonl'), '--budget', String(EVAL_BUDGET), '--budget-spent', String(spent), ...args],
      { encoding: 'utf-8', timeout: 120_000 },
    )
    if (proc.status !== 0) {
      throw new ResearchStateError(`${proc.stderr?.trim() || proc.stdout?.trim() || 'meter 执行失败'} → 用已落地的观测收窄假设（research-probe），或 report_declare 终局`)
    }
    const result = JSON.parse(proc.stdout) as Record<string, unknown>
    appendEvent(root, 'world.observe', {
      world: observe.world, seed: observe.seed, protocol: observe.protocol, reps: observe.reps ?? 1,
      blockers: observe.blockers ?? '',
      cost: result.cost, spike_count: result.spike_count,
      ...(pid ? { pid } : {}),
    })
    return proc.stdout
  }

  /**
   * F1-T2：经 meter 的 `env` 子命令在 <cwd>/research-work/<run>/nbsim 生成 / 复用剥离真相的仿真包，
   * 宿主自己复算树 sha 写进 world.env（同一份不重复记）。meter 没有 env 子命令（轨道 E 未合入）
   * 或生成失败 → 返回 undefined，info 与候选模式都按旧行为走（接口 7 的回落）。
   */
  function ensureSimEnv(root: string, run: string, world: string, seed: number, ledger: string) {
    const out = join(workDir(run), 'nbsim')
    mkdirSync(dirname(out), { recursive: true })
    // 审查 H3：meter 会把改过 / 删掉的树换成干净的同 sha 树，forecast 时的 verify 就看不见篡改。
    // 重建前宿主先复算上一份 world.env；不符就在这里记 verify{match:false}（meter 的 replaced 只作附注）
    const prev = readJournal(root).findLast((event) => event.op === 'world.env')
    const before = prev ? currentTreeSha(String(prev.path)) : undefined
    const proc = spawnSync(
      'python3',
      [METER, '--ledger', ledger, '--budget', String(EVAL_BUDGET), 'env', world, String(seed), '--out', out],
      { encoding: 'utf-8', timeout: 120_000 },
    )
    let meta: Record<string, unknown> = {}
    try {
      if (proc.status === 0) meta = JSON.parse(proc.stdout) as Record<string, unknown>
    } catch { /* 输出不是 JSON：与失败同样回落 */ }
    const replaced = typeof meta.replaced === 'string' ? meta.replaced : undefined
    // 换 world 时 meter 也会挪开旧树（task.json 不同）：那不是篡改，篡改已由 before 复算看见（审查 MEDIUM）
    if (prev && (before !== prev.sha256 || (replaced && prev.world === world))) {
      appendEvent(root, 'world.env.verify', {
        match: false, expected: prev.sha256, actual: before, at: 'info', ...(replaced ? { replaced } : {}),
      })
    }
    const path = typeof meta.path === 'string' ? meta.path : undefined
    const digest = path ? treeSha256(path) : undefined
    if (!path || !digest) {
      console.error(`[proma-research] nbsim 未生成，world_simulate 按旧行为（候选模式可用）：${proc.stderr?.trim().split('\n').pop() ?? proc.error?.message ?? 'meter env 无输出'}`)
      return undefined
    }
    const last = readJournal(root).findLast((event) => event.op === 'world.env')
    if (last?.sha256 !== digest || last?.path !== path) {
      appendEvent(root, 'world.env', {
        world, seed, path, sha256: digest,
        nb_commit: meta.nb_commit, generator_version: meta.generator_version,
        ...(typeof meta.sha256 === 'string' && meta.sha256 !== digest ? { meter_sha256: meta.sha256 } : {}),
      })
    }
    // 只给 sys.path，不给 pip install -e：后者会触发 SE7a 的 env.drift 封顶与 guard 的装包拒绝
    const importHint = `import sys; sys.path.insert(0, ${JSON.stringify(dirname(path))}); import ${basename(path)}`
    return { path, sha256: digest, import_hint: importHint }
  }

  // ── 类别 1：信念状态读写 ────────────────────────────────────────────

  server.tool(
    'research_init',
    '初始化一个研究 run（在 .proma-research/<run>/ 建立只追加 journal）。K0 确认后带 mode（open | score | identify）、'
    + 'success_predicate、depth（light | full）、recall（on | off | parametric-only）：init 时冻结，切换 = 开新 run；'
    + 'identify / score 自动登记内置 H0。不带 mode = legacy 规则',
    {
      run: z.string(),
      mode: z.enum(['open', 'score', 'identify']).optional(),
      success_predicate: z.string().optional(),
      depth: z.enum(['light', 'full']).optional(),
      recall: z.enum(['on', 'off', 'parametric-only']).optional(),
    },
    async ({ run, ...contractInput }) => {
      const root = resolveRun(run)
      const existing = existsSync(join(root, 'journal.jsonl')) ? (requireInit(root), replay(root)) : undefined
      const plan = planInit(existing, contractInput)
      mkdirSync(root, { recursive: true })
      // K0 信封里的工作目录：草稿、仿真记录、报告都写这里；score 任务没有仿真包时以前从没人建它
      mkdirSync(workDir(run), { recursive: true })
      appendEvent(root, 'run.init', { run: sanitizeRunName(run), ...plan.fields })
      const h0 = plan.fresh && plan.contract ? BUILTIN_H0[plan.contract.mode] : undefined
      if (h0) appendEvent(root, 'claim.propose', { id: 'H0', ...h0, builtin: true })
      // SE7a K0：kernel 环境快照进 journal（受哈希链保护）；已有可用快照的 run 不重拍，免得重开洗掉漂移
      let envNote = ''
      if (!kernelEnvBaseline(readJournal(root))) {
        const snap = takeKernelEnvSnapshot(process.env.PROMA_KERNEL_PYTHON, serverCwd())
        appendEvent(root, 'env.snapshot', snap.available ? { ...snap.snapshot } : { unavailable: snap.reason })
        if (!snap.available) envNote = `\n⚠ kernel 环境快照不可用（${snap.reason}）：本 run 的环境漂移无法核对`
      }
      freshRegister(root)
      const contractNote = plan.contract
        ? `\n契约（已冻结）：${describeContract(plan.contract)}${plan.fields.defaults ? `（${(plan.fields.defaults as string[]).join(', ')} 取默认）` : ''}`
          + (h0 ? '\n内置 H0 已登记为 LIVE：任何单假设探针都能拿 H0 做互斥的一方' : '')
        : ''
      return { content: [{ type: 'text', text: `run 已初始化: ${root}${contractNote}${envNote}` }] }
    },
  )

  server.tool(
    'research_state',
    '读取完整信念状态：LIVE 假设、探针、攻击记录、报告。graveyard（已死假设）永远包含在内——对抗者必须看得到它',
    { run: z.string() },
    async ({ run }) => {
      const root = resolveRun(run)
      requireInit(root)
      return { content: [{ type: 'text', text: JSON.stringify(replay(root), null, 2) }] }
    },
  )

  server.tool(
    'claim_propose',
    '登记一条新假设（PROPOSED→LIVE）。predicts 必须与现有 LIVE/SUPPORTED 假设可判别：不能是其中任一假设 predicts 的子集。graveyard 非空时必须给 conflicts（"none — 攻击未探索的轴"或"graveyard 的 H# 死于 X；本假设以 Y 反驳/绕开"）。'
    + '可选 parent（派生自哪个 H#：候选的朴素基线 H0′、方向下的变体）与 level（family 机制族 | instance 参数点；identify 下无 parent 默认 family，家族级 REFUTED 要 K3 审计）',
    {
      run: z.string(),
      id: z.string().regex(/^H\d+$/, '假设 id 形如 H1、H2'),
      statement: z.string().min(1),
      predicts: z.array(z.string()).min(1),
      conflicts: z.string().optional(),
      parent: z.string().optional(),
      level: z.enum(['family', 'instance']).optional(),
    },
    async ({ run, id, statement, predicts, conflicts, parent, level }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      if (state.claims.some((c) => c.id === id)) {
        throw new ResearchStateError(`假设 ${id} 已存在${state.claims.find((c) => c.id === id)?.builtin ? '（内置 H0，init 时按 mode 自动登记）' : ''}`)
      }
      if (parent !== undefined && !state.claims.some((c) => c.id === parent)) {
        throw new ResearchStateError(`parent ${parent} 不存在：派生关系只能指向已登记的 claim`)
      }
      const redundant = state.claims
        .filter((c) => c.state === 'LIVE' || c.state === 'SUPPORTED')
        .find((claim) => {
          const set = new Set(claim.predicts)
          return predicts.every((p) => set.has(p))
        })
      if (redundant) {
        throw new ResearchStateError(
          `${id} 的 predicts 是 ${redundant.state} 假设 ${redundant.id} 的子集，两者不可判别；先写出差异再登记 → research-abduce：重写 predicts 使两条假设有互斥落点`,
        )
      }
      // Arbor constraints-block 教训的结构化：坟场非空时，新假设必须声明与死者的关系
      // ——换装重提共享同一隐藏假设的想法，正是长程 agent 的既证失败模式
      if (state.graveyard.length > 0 && (!conflicts || conflicts.trim() === '')) {
        const dead = state.graveyard.map((g) => `${g.id}(${g.state})`).join(' ')
        throw new ResearchStateError(
          `graveyard 非空（${dead}），登记新假设必须带 conflicts：写 "none — 攻击未探索的轴"，`
          + '或点名死者与死因并说明本假设如何反驳/绕开它 → research-abduce：先读 graveyard 再写',
        )
      }
      appendEvent(root, 'claim.propose', {
        id, statement, predicts,
        ...(conflicts ? { conflicts } : {}),
        ...(parent ? { parent } : {}),
        ...(level ? { level } : {}),
      })
      freshRegister(root)
      return { content: [{ type: 'text', text: `${id} 已登记为 LIVE` }] }
    },
  )

  server.tool(
    'claim_transition',
    '迁移假设状态。终态（SUPPORTED/REFUTED/SCOPED）必须点名一个已落地探针，且观测值落在该探针预登记时写下的针对此假设的分支频段内。'
    + 'mode run：迁移必须执行预登记写的动作（support→SUPPORTED、kill→REFUTED、scope→SCOPED）；SCOPED 必须带 scoped_statement（narrowed，仍留在竞争里）；'
    + 'SUPPORTED 与家族级 REFUTED 带 audit（K3 审计产物 .rlm-jobs/<run>/…/out.md）。缺 audit、support 带与对手不互斥、频段只有手写出处、缺 headline / discrimination → 不拒，落成 CONTESTED + lead',
    {
      run: z.string(),
      id: z.string(),
      to: z.enum(['CONTESTED', 'LIVE', 'SUPPORTED', 'REFUTED', 'SCOPED']),
      byProbe: z.string().optional(),
      note: z.string().optional(),
      scoped_statement: z.string().optional(),
      audit: z.string().optional(),
    },
    async ({ run, id, to, byProbe, note, scoped_statement: scopedStatement, audit }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      const contract = state.contract
      const claim = state.claims.find((c) => c.id === id)
      if (!claim) throw new ResearchStateError(`未知 claim: ${id}`)
      // P3.5：graveyard 复活必须点名新证据来源——没有新证据的复活是对死人的鞭尸（narrowed 放宽回 LIVE 同理）
      const TERMINAL = ['SUPPORTED', 'REFUTED', 'SCOPED'] as const
      if (to === 'LIVE' && (TERMINAL as readonly string[]).includes(claim.state)) {
        if (!note || note.trim() === '') {
          throw new ResearchStateError(
            `${id} 已是终态（${claim.state}），复活必须带 note 点名新证据来源（哪个探针/哪条攻击推翻了原结论）`,
          )
        }
      }
      if (to === claim.state && isTerminal(to, contract)) {
        throw new ResearchStateError(`${id} 已是 ${to}，终态不能自迁移`)
      }
      if (contract && to === 'SCOPED' && !scopedStatement?.trim()) {
        throw new ResearchStateError(
          `SCOPED = narrowed（${id} 收窄后仍留在竞争里、可再入 bands）：必须带 scoped_statement 写明收窄后仍存活的陈述 → 补上后重调`,
        )
      }
      let caps: Cap[] = []
      let auditRecord: SimCitation | undefined
      if (to === 'SUPPORTED' || to === 'REFUTED' || to === 'SCOPED') {
        if (!byProbe) {
          throw new ResearchStateError('终态迁移必须点名依据探针（byProbe）')
        }
        const probe = state.probes.find((p) => p.pid === byProbe)
        if (!probe || probe.status !== 'LANDED') {
          throw new ResearchStateError(`终态迁移必须以已落地的探针为依据；${byProbe} 不是已落地探针 → 先 prereg_write 再 probe_run，用它落地后才能迁移`)
        }
        const spec = readFrozenSpec(root, byProbe)
        if (!spec.branches.some((b) => b.target === id)) {
          throw new ResearchStateError(
            `${byProbe} 的预登记分支从未提到 ${id}：终态结论必须能追溯到预登记时写下的分支 → research-probe：为 ${id} 预登记一个点名它的新探针`,
          )
        }
        const metric = probe.metric
        if (metric === undefined) throw new ResearchStateError('探针没有重算指标')
        const inBandBranches = spec.branches.filter((b) => b.target === id && inBand(metric, b.band))
        if (inBandBranches.length === 0) {
          throw new ResearchStateError(`观测值 ${metric} 不落在任何针对 ${id} 的预登记分支频段内；不得事后解释 → ${TRIAGE_STEPS}`)
        }
        if (contract) {
          ;({ caps, audit: auditRecord } = decideTransition(
            spec, claim, to, metric, inBandBranches, state, audit ? inspectAudit(serverCwd(), run, audit) : undefined,
          ))
        }
      }
      const capped = caps.length > 0
      appendEvent(root, 'claim.transition', {
        id,
        to: capped ? 'CONTESTED' : to,
        ...(byProbe ? { by_probe: byProbe } : {}),
        ...(note ? { note } : {}),
        ...(capped ? { requested: to, lead: caps.map((cap) => cap.code) } : {}),
        ...(contract && to === 'SCOPED' ? { scoped_statement: scopedStatement } : {}),
        ...(auditRecord ? { audit: auditRecord } : {}),
      })
      freshRegister(root)
      const text = capped
        ? `${id} → CONTESTED（lead：请求的 ${to} 被封顶。封顶不是拒绝：${id} 留在竞争里，结论按 lead 读）\n${capLines(caps)}`
        : `${id} → ${to}`
      return { content: [{ type: 'text', text }] }
    },
  )

  // ── 类别 3：预登记落盘 ──────────────────────────────────────────────

  server.tool(
    'prereg_write',
    '预登记一个探针（时间戳 + sha256 冻结）。结构性拒绝装饰性探针：必须有互斥频段对与 kill/scope 分支。bands 至少两个 claim：LIVE/CONTESTED，或 SUPPORTED 作为被挑战对手（至少一个须是 LIVE/CONTESTED；落地后可凭此探针把 SUPPORTED 迁到 REFUTED/SCOPED；迁到 CONTESTED 不需要探针）。必须在 probe_run 之前。'
    + 'mode run 另收：discrimination（判别度 d/σ/r*）、branches[].headline（该分支命中时报告首句）、provenance{H#: sim:<记录>|measured:P#|asserted|invented}、'
    + 'sims[{path: "sim/<id>.json", sha256?}]（research-work/<run>/sim/ 下的仿真记录；宿主算 sha256 并冻结，给了前缀就核对）；缺项不拒，只让相应结论封顶 lead（返回值里列出）；内置 H0 可入 bands，SCOPED（narrowed）也可',
    { run: z.string(), spec: ProbeSpecSchema },
    async ({ run, spec: input }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      const spec = input.sims ? { ...input, sims: verifySimCitations(serverCwd(), run, input.sims) } : input
      validateProbeSpec(spec as unknown as ProbeSpec, state, { worldTask: worldIsolationReady })
      if (spec.observe) {
        assertCellUnobserved(root, spec.observe)
        assertCellUnreserved(root, spec.observe)
        // 登记即占格子：一份永远跑不动的登记会把格子永久锁死，所以预算在登记时先过一遍
        const remaining = EVAL_BUDGET - summarizeWorldJournal(readJournal(root)).spent
        if ((spec.observe.reps ?? 1) > remaining) {
          throw new ResearchStateError(
            `budget exhausted: reps=${spec.observe.reps ?? 1} > 剩余预算 ${remaining}（budget=${EVAL_BUDGET}）→ 降低 reps 或 report_declare 终局`,
          )
        }
      }
      if (state.probes.some((p) => p.pid === spec.pid)) {
        throw new ResearchStateError(`探针 ${spec.pid} 已存在`)
      }
      const frozen = { ...spec, frozenAt: new Date().toISOString() }
      const digest = sha256(stableStringify(frozen))
      mkdirSync(join(root, 'prereg'), { recursive: true })
      writeFileSync(join(root, 'prereg', `${spec.pid}.json`), `${JSON.stringify(frozen, null, 2)}\n`, 'utf-8')
      appendEvent(root, 'prereg.write', {
        pid: spec.pid,
        spec_sha256: digest,
        prereg_path: `prereg/${spec.pid}.json`,
        // 点名的 claim：清偿这些 claim 的攻击债（01 §7.2，债按 claim 计）
        claims: [...new Set([...Object.keys(spec.bands), ...spec.branches.map((b) => b.target)])].sort(),
      })
      freshRegister(root)
      const capNote = state.contract ? preregCapLines(spec as unknown as ProbeSpec, state) : []
      return { content: [{ type: 'text', text: [`${spec.pid} 已预登记（sha256 ${digest.slice(0, 12)}…）`, ...capNote].join('\n') }] }
    },
  )

  // ── 类别 4：受认可的执行路径 ────────────────────────────────────────

  server.tool(
    'probe_run',
    '在 bwrap 沙箱内执行探针：只运行预登记时冻结的命令（不接受新命令）。沙箱契约：只读文件系统（中间文件写 /tmp）、无网络、环境变量只有 PATH/HOME/LANG、结果走 stdout。非零退出或超时不予落地',
    { run: z.string(), pid: z.string() },
    async ({ run, pid }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      const probe = state.probes.find((p) => p.pid === pid)
      if (!probe || probe.status !== 'PREREG') {
        throw new ResearchStateError(`探针 ${pid} 不存在或状态不允许执行（当前: ${probe?.status ?? '不存在'}）→ 先 prereg_write 登记探针，再 probe_run`)
      }
      const spec = readFrozenSpec(root, pid)
      if (spec.observe) return runObserveProbe(root, pid, spec, spec.observe)
      if (!spec.evalCommand) throw new ResearchStateError(`${pid} 的预登记既无 evalCommand 也无 observe`)
      // 红线：模型写的命令只在沙箱执行；bwrap 缺失时结构性拒绝（fail closed）
      requireSandbox()
      appendEvent(root, 'probe.start', { pid })
      const probeDir = confined(root, join('probes', pid))
      const rawDir = join(probeDir, 'raw')
      mkdirSync(rawDir, { recursive: true })
      const startedAt = new Date().toISOString()
      const stdout = await runSandboxedEval(spec.evalCommand)
      // raw 由 server 在沙箱外捕获落盘：沙箱内零可写挂载（除 tmpfs /tmp）
      writeFileSync(join(rawDir, 'output.txt'), stdout.text, 'utf-8')
      const endedAt = new Date().toISOString()
      if (stdout.exitCode !== 0) {
        writeFileSync(join(probeDir, 'provenance.json'), `${JSON.stringify({
          pid, command: spec.evalCommand, exitCode: stdout.exitCode, startedAt, endedAt, landed: false,
          sandbox: stdout.attestation,
        }, null, 2)}\n`, 'utf-8')
        appendEvent(root, 'probe.land', { pid, exit_code: stdout.exitCode, metric: null })
        freshRegister(root)
        throw new ResearchStateError(`探针 ${pid} 以退出码 ${stdout.exitCode}${stdout.timedOut ? '（超时）' : ''} 结束，不予落地（崩溃、超时与干净结果不可区分，一概拒绝）`)
      }
      const metric = recomputeMetric(stdout.text, spec.metricKind, spec.metricSpec)
      writeFileSync(join(probeDir, 'provenance.json'), `${JSON.stringify({
        pid,
        command: spec.evalCommand,
        exitCode: stdout.exitCode,
        startedAt,
        endedAt,
        landed: true,
        metric,
        metricSource: { kind: spec.metricKind, spec: spec.metricSpec, raw: 'raw/output.txt' },
        sandbox: stdout.attestation,
      }, null, 2)}\n`, 'utf-8')
      appendEvent(root, 'probe.land', { pid, exit_code: stdout.exitCode, metric })
      freshRegister(root)
      return { content: [{ type: 'text', text: `${pid} 已落地，重算指标 = ${metric}` }] }
    },
  )

  // ── 类别 2：从原始文件重算指标 ──────────────────────────────────────

  server.tool(
    'metric_recompute',
    '从 raw 产物按冻结规约重算指标（报告里的任何数字都应来自这里，而不是转述）',
    { run: z.string(), pid: z.string() },
    async ({ run, pid }) => {
      const root = resolveRun(run)
      requireInit(root)
      const spec = readFrozenSpec(root, pid)
      const rawPath = confined(root, join('probes', pid, 'raw', 'output.txt'))
      if (!existsSync(rawPath)) throw new ResearchStateError(`${pid} 没有 raw 产物`)
      const metric = recomputeMetric(readFileSync(rawPath, 'utf-8'), spec.metricKind, spec.metricSpec)
      return { content: [{ type: 'text', text: JSON.stringify({ pid, metric }) }] }
    },
  )

  // ── grill 对抗证据 ──────────────────────────────────────────────────

  server.tool(
    'attack_record',
    '记录一次对抗性质疑（typed）：new_h（混合/总体替代解释）/ constraint（被忽略的约束）/ no_change（结果其实不改变信念）。target 是被攻击的 H#：mode run 里 new_h / constraint 记为该 claim 的攻击债，只有点名它的 prereg 或 report_declare 能清偿',
    {
      run: z.string(),
      target: z.string(),
      kind: z.enum(['new_h', 'constraint', 'no_change']),
      text: z.string().min(1),
    },
    async ({ run, target, kind, text }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      const known = state.claims.some((c) => c.id === target)
      if (!known) throw new ResearchStateError(`attack 目标不存在: ${target}`)
      const gid = `G${state.attacks.length + 1}`
      appendEvent(root, 'attack.record', { gid, target, kind, text })
      freshRegister(root)
      const owed = replay(root).debts?.filter((debt) => debt.target === target).map((debt) => debt.gid) ?? []
      const debtNote = owed.length > 0
        ? `；${target} 未偿攻击债 ${owed.length} 条（${owed.join(' ')}）：点名 ${target} 的 prereg 清偿，或在报告 scope 段写明；登记别的 claim 清不掉`
        : ''
      return { content: [{ type: 'text', text: `${gid} 已记录${debtNote}` }] }
    },
  )

  server.tool(
    'report_declare',
    '声明报告并当庭过三道 gate（P3.2：declare 即裁决）：path 是 <cwd>/research-work/<run>/ 下的报告文件（默认写 REPORT.md）；'
    + '宿主把它复制进 run 目录（不跟随链接）再跑 prereg/reconcile/trace，全绿才写入声明与 gate.verdict；任何一道红则拒绝声明并逐条给出理由',
    { run: z.string(), path: z.string() },
    async ({ run, path }) => {
      const root = resolveRun(run)
      requireInit(root)
      // path 相对 research-work/<run>/；agent 常把这段前缀也带上（交付 run D18：报错回显嵌套路径，它照写出嵌套副本）
      const workPrefix = `research-work/${sanitizeRunName(run)}/`
      const given = posix.normalize(path.replace(/\\/g, '/'))
      const normalizedPath = given.startsWith(workPrefix) ? given.slice(workPrefix.length) : given
      const workPath = `${workPrefix}${normalizedPath}`
      // agent 只在 research-work 写；run 目录里已有的普通文件只认旧 run（迁移前写在状态根内的报告）
      const found = readNoFollow(serverCwd(), confined(workDir(run), normalizedPath)) ?? readNoFollow(serverCwd(), confined(root, normalizedPath))
      if (!found) {
        throw new ResearchStateError(
          `报告不存在：先把报告写成 ${workPath}（研究工作目录内、.proma-research/ 之外），再调 report_declare；`
          + `path 相对 ${workPrefix}（例 path: "REPORT.md"）`,
        )
      }
      if ('link' in found) {
        appendEvent(root, 'report.link', { path: found.source, link: found.link })
        throw new ResearchStateError(
          `报告源是${found.link === 'symlink' ? '符号链接' : '多重硬链接'}，拒绝跟随：${found.source}。`
          + `把正文直接写成普通文件 ${workPath} 后重调 report_declare；已记 report.link，本 run 之后的声明按 \`lead\` 封顶（report_link）`,
        )
      }

      // 先在 run 目录里落一份暂存副本，gate 就跑在它上面；红则删掉——run 目录里的 REPORT.md 永远是最后一次声明的
      const copy = join(root, 'REPORT.md')
      const staging = join(root, '.REPORT.md.declaring')
      try {
        writeFresh(staging, found.text)
        const verdicts = [
          runPreregGate(root),
          runReconcileGate(root, { path: basename(staging), sha256: sha256(found.text) }),
          runTraceGate(root),
        ]
        const failures = verdicts.flatMap((v) => v.failures)
        if (failures.length > 0) {
          const lines = failures.map((f) => `✗ [${f.gate}] ${f.reason}`)
          throw new ResearchStateError(
            `报告未通过 gate，拒绝声明：\n${lines.join('\n')}`
            + `\n→ 逐条修复 ${workPath}（或回 research-probe 补实验）后重调 report_declare`
            + '（Proma 工具名 mcp__research__report_declare）；终局只能由 declare 裁决',
          )
        }

        // K7 封顶（gate 只封顶结论，不拒）：理由进 journal，宿主文本在算 sha256 之前追加到副本末尾（源不动）
        const caps = reportCaps(root)
        const missing = caps.filter((cap) => !found.text.includes(cap.marker))
        const declaredText = missing.length > 0
          ? `${found.text.trimEnd()}\n\n${missing.map((cap) => cap.line).join('\n')}\n`
          : found.text
        if (missing.length > 0) writeFresh(staging, declaredText)
        renameSync(staging, copy) // 换名：copy 处原有的链接只是被替换，不被写穿
        const declaredDigest = sha256(declaredText)
        appendEvent(root, 'report.declare', { path: 'REPORT.md', sha256: declaredDigest, source: found.source })
        appendEvent(root, 'gate.verdict', {
          passed: true, report: 'REPORT.md', prereg: true, reconcile: true, trace: true,
          ...(caps.length > 0 ? { caps: caps.map((cap) => cap.code) } : {}),
        })
        freshRegister(root)
        const capNote = caps.length > 0
          ? `\n封顶（结论按 lead 读或报告不完整；宿主文本已追加到 run 目录的 REPORT.md 末尾）：${caps.map((cap) => cap.code).join(', ')}`
          : ''
        return {
          content: [{ type: 'text', text: `报告已声明（sha256 ${declaredDigest.slice(0, 12)}…）；三道 gate 全绿：prereg ✓ reconcile ✓ trace ✓${capNote}` }],
        }
      } finally {
        rmSync(staging, { force: true })
      }
    },
  )

  /**
   * observe 探针：预登记冻结的那次观测由 server 经 meter 执行（扣同一份预算）。
   * 先登记后测量在结构上成立——探针的 raw 就是这次测量本身，不存在可回显的中间层；
   * 已观测过的格子不可登记（assertCellUnobserved），因为同格计量是确定性的。
   */
  function runObserveProbe(root: string, pid: string, spec: ProbeSpec, observe: ObserveSpec) {
    if (!worldIsolationReady) {
      throw new ResearchStateError('本 server 未注册世界计量（PROMA_RESEARCH_DENY 未配置），observe 探针无法执行')
    }
    if (!budgetValid) {
      throw new ResearchStateError(`PROMA_EVAL_BUDGET 非正整数（${process.env.PROMA_EVAL_BUDGET}），世界计量已关闭`)
    }
    assertObserveAllowed(root, observe.reps ?? 1)
    // 落盘目录先备好：probe.start 之后到 probe.land 之间不做可失败的准备工作，避免探针卡在 RUNNING
    const probeDir = confined(root, join('probes', pid))
    mkdirSync(join(probeDir, 'raw'), { recursive: true })
    appendEvent(root, 'probe.start', { pid })
    const startedAt = new Date().toISOString()
    let stdout: string
    let metric: number
    try {
      stdout = runMeterObserve(root, observe, pid)
      // 内存里先重算并落 journal，再写旁路文件：测量一旦入账，探针就不能因写盘失败被烧掉
      metric = recomputeMetric(stdout, spec.metricKind, spec.metricSpec)
    } catch (error) {
      appendEvent(root, 'probe.land', { pid, exit_code: 1, metric: null })
      freshRegister(root)
      writeProvenance(probeDir, { pid, observe, executor: 'world-meter', startedAt, endedAt: new Date().toISOString(), landed: false })
      throw error
    }
    appendEvent(root, 'probe.land', { pid, exit_code: 0, metric })
    freshRegister(root)
    writeFileSync(join(probeDir, 'raw', 'output.txt'), stdout, 'utf-8')
    writeProvenance(probeDir, {
      pid,
      observe,
      executor: 'world-meter',
      startedAt,
      endedAt: new Date().toISOString(),
      landed: true,
      metric,
      metricSource: { kind: spec.metricKind, spec: spec.metricSpec, raw: 'raw/output.txt' },
    })
    return { content: [{ type: 'text' as const, text: `${pid} 已落地（计量观测），重算指标 = ${metric}` }] }
  }

  /** provenance 是 journal 的旁注副本；journal 先落，provenance 后写，写失败不影响裁决。 */
  function writeProvenance(probeDir: string, record: Record<string, unknown>): void {
    writeFileSync(join(probeDir, 'provenance.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf-8')
  }

  // ── EVAL-PLAN §1.3 · 计量接口：世界只经 meter 可达 ─────────────────────
  if (worldIsolationReady && budgetValid) {

    server.tool(
      'world_observe',
    `真细胞的计量观测（扣预算，默认总预算 ${EVAL_BUDGET}）。返回带噪偏观测（spike_count + 降采样电压）。预算由 meter 独立记账：超额拒绝。协议标签先用 world_simulate 的 mode=info 获取`,
    {
      run: z.string(),
      world: z.string(),
      seed: z.number().int(),
      protocol: z.string().min(1),
      reps: z.number().int().min(1).max(20).optional(),
      blockers: z.string().optional(),
    },
    async ({ run, world, seed, protocol, reps, blockers }) => {
      const root = resolveRun(run)
      requireInit(root)
      assertObserveAllowed(root, reps ?? 1)
      assertCellUnreserved(root, { world, seed, protocol, blockers })
      const stdout = runMeterObserve(root, { world, seed, protocol, reps, blockers })
      return { content: [{ type: 'text', text: stdout }] }
    },
  )

    server.tool(
      'world_simulate',
    'mode=info（默认）返回题面（text_prior、协议池、held-out 标签、参考模型），可用时另给 sim_env：工作目录里剥离真相的 nbsim 仿真包（任意协议段、阻断剂、held-out，reps 不设上限，免费）。mode=candidate 是旧的候选仿真（给 {extra:[{name,g,E,mvh,mk,mtau,mpow,hvh?,hk?,htau?,hpow?}], slow_na} 与协议标签），本 run 已有 sim_env 时拒绝并指向 nbsim',
    {
      run: z.string(),
      world: z.string(),
      seed: z.number().int(),
      protocol: z.string().optional(),
      mechanism: z.string().optional(),
      mode: z.enum(['candidate', 'info']).optional(),
      reps: z.number().int().min(1).max(20).optional(),
      blockers: z.string().optional(),
    },
    async ({ run, world, seed, protocol, mechanism, mode, reps, blockers }) => {
      const root = resolveRun(run)
      requireInit(root)
      const worldState = summarizeWorldJournal(readJournal(root))
      if (worldState.forecastCount > 0) {
        throw new ResearchStateError('终局已裁决；world_simulate 不再开放——下一步：report_declare')
      }
      const ledger = join(root, 'world-ledger.jsonl')
      if ((mode ?? 'info') === 'info') {
        const proc = spawnSync(
          'python3',
          [METER, '--ledger', ledger, '--budget', String(EVAL_BUDGET), 'info', world, String(seed)],
          { encoding: 'utf-8', timeout: 120_000 },
        )
        if (proc.status !== 0) throw new ResearchStateError(proc.stderr?.trim() || 'meter info 失败')
        appendEvent(root, 'world.info', { world, seed })
        const simEnv = ensureSimEnv(root, run, world, seed, ledger)
        // problem() 原样透传；sim_env 只加在返回包装上（03 §5：不扩张 meter 的 info 键集合）
        const text = simEnv ? JSON.stringify({ ...JSON.parse(proc.stdout), sim_env: simEnv }) : proc.stdout
        return { content: [{ type: 'text', text }] }
      }
      // 两条仿真路径会给出不同的数（MCP 版只认标签、reps ≤20、无种子）；本 run 有 nbsim 就只留一条。拒绝不写 journal
      const simEnvEvent = readJournal(root).findLast((event) => event.op === 'world.env')
      if (simEnvEvent) {
        throw new ResearchStateError(
          `${CANDIDATE_MOVED_PREFIX}：import nbsim（路径见 world_simulate(mode=info) 的 sim_env；本 run：${String(simEnvEvent.path)}）；`
          + 'nbsim.simulate(mech, segments, reps, seed=…, block=…)，reps 不设上限，可仿真任意协议段与 held-out',
        )
      }
      if (!protocol || !mechanism) {
        throw new ResearchStateError('候选模拟需要 protocol 与 mechanism（JSON 字符串）→ 先 mode=info 拿协议标签')
      }
      const args = ['simulate', world, String(seed), protocol, '--mechanism', mechanism]
      if (reps) args.push('--reps', String(reps))
      if (blockers) args.push('--blockers', blockers)
      const proc = spawnSync(
        'python3',
        [METER, '--ledger', ledger, '--budget', String(EVAL_BUDGET), ...args],
        { encoding: 'utf-8', timeout: 120_000 },
      )
      if (proc.status !== 0) {
        throw new ResearchStateError(`${proc.stderr?.trim() || 'meter simulate 失败'} → 检查 mechanism JSON 与协议标签`)
      }
      const result = JSON.parse(proc.stdout) as Record<string, unknown>
      appendEvent(root, 'world.simulate', {
        world, seed, protocol, mode: 'candidate',
        mean_spike_count: result.mean_spike_count,
      })
      return { content: [{ type: 'text', text: proc.stdout }] }
    },
  )

    server.tool(
      'world_forecast',
    '提交 held-out 协议预测并做一次终局评分。同一 run 只允许一次，唯一性由权威 journal 判定。',
    {
      run: z.string(),
      world: z.string(),
      seed: z.number().int(),
      counts: z.record(z.string(), z.number()),
    },
    async ({ run, world, seed, counts }) => {
      const root = resolveRun(run)
      requireInit(root)
      const worldState = summarizeWorldJournal(readJournal(root))
      if (worldState.forecastCount > 0) {
        throw new ResearchStateError('forecast 已裁决过一次；终局不可重复——下一步：report_declare')
      }
      const ledger = join(root, 'world-ledger.jsonl')
      const proc = spawnSync(
        'python3',
        [
          METER,
          '--ledger', ledger,
          '--budget', String(EVAL_BUDGET),
          '--budget-spent', String(worldState.spent),
          'forecast', world, String(seed),
          '--counts', JSON.stringify(counts),
        ],
        { encoding: 'utf-8', timeout: 120_000 },
      )
      if (proc.status !== 0) {
        throw new ResearchStateError(proc.stderr?.trim() || proc.stdout?.trim() || 'meter forecast 失败')
      }
      const result = JSON.parse(proc.stdout) as Record<string, unknown>
      appendEvent(root, 'world.forecast', {
        world,
        seed,
        counts,
        spike_forecast_mse: result.spike_forecast_mse,
        budget_spent: worldState.spent,
      })
      // 03 A6：forecast 时宿主复算工作目录 nbsim 的树 sha；不符只在 declare 时封顶，不拒。
      // ponytail: info 之后篡改、仿真、再还原，到 forecast 时树已复原——按设计看不见；
      // 上限是只在 info / forecast 两个时点复算，升级路径是 kernel 侧每次 import nbsim 时上报树 sha。
      const simEnvEvent = readJournal(root).findLast((event) => event.op === 'world.env')
      if (simEnvEvent) {
        const actual = currentTreeSha(String(simEnvEvent.path))
        appendEvent(root, 'world.env.verify', { match: actual === simEnvEvent.sha256, expected: simEnvEvent.sha256, actual })
      }
      // 邻近反馈：forecast 成功 ≠ 终局。机器可读的下一步指令，避免长上下文里遗忘 declare。
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            next_required_action: 'report_declare',
            proma_tool_name: 'mcp__research__report_declare',
            next_step_hint: '终局唯一成立条件：写 REPORT.md 后真实调用 mcp__research__report_declare 并收到 gate 裁决；自评"gate 全绿"无效',
          }),
        }],
      }
    },
    )
  }

  return server
}

if (import.meta.main) {
  const server = buildServer()
  await server.connect(new StdioServerTransport())
}
