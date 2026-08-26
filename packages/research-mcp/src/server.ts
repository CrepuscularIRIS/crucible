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
 * 4. 受认可的执行路径：probe_run 只执行预登记时冻结的命令字符串。
 *
 * 与 Arbor 的 MCP 一致做无状态化：每个工具显式携带 run 名（单一路径分量，
 * 钉死在 <cwd>/.proma-research/<run>/ 内），不跨目录泄漏。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { requireSandbox, resolveResearchDenyRoots, runSandboxedEval } from './sandbox.js'
import { runPreregGate } from '../gates/prereg.js'
import { runReconcileGate } from '../gates/reconcile.js'
import { runTraceGate } from '../gates/trace.js'
import {
  ResearchStateError,
  appendEvent,
  assertJournalIntact,
  confined,
  recomputeMetric,
  readJournal,
  replay,
  runDir,
  sanitizeRunName,
  sha256,
  stableStringify,
  summarizeWorldJournal,
  validateProbeSpec,
  writeRegisterSnapshot,
  type Band,
  type ProbeSpec,
} from './state.js'

/** 每次调用时解析：测试与宿主可在进程启动后变更工作目录。 */
function serverCwd(): string {
  return process.env.PROMA_RESEARCH_CWD ?? process.cwd()
}

function resolveRun(run: string): string {
  assertRunAllowed(run)
  return runDir(serverCwd(), sanitizeRunName(run))
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

// zod 仅供 MCP 参数解包；严格的语义校验在 validateProbeSpec（state.ts）。
// 这里刻意避开 tuple-items / pattern / minLength 等 JSON Schema 关键字：
// 智谱 Anthropic 端点对工具 schema 严格校验，这类写法会整包 400（1210）。
const BandSchema = z.array(z.number())

const ProbeSpecSchema = z.object({
  pid: z.string(),
  question: z.string(),
  evalCommand: z.string(),
  metricKind: z.enum(['json', 'regex']),
  metricSpec: z.string(),
  bands: z.record(z.string(), BandSchema),
  branches: z.array(z.object({
    band: BandSchema,
    action: z.enum(['kill', 'scope', 'support']),
    target: z.string(),
    scopeNote: z.string().optional(),
  })),
})

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'proma-research', version: '0.2.4' },
    { capabilities: { tools: {} } },
  )

  // ── 类别 1：信念状态读写 ────────────────────────────────────────────

  server.tool(
    'research_init',
    '初始化一个研究 run（在 .proma-research/<run>/ 建立只追加 journal）',
    { run: z.string() },
    async ({ run }) => {
      const root = resolveRun(run)
      mkdirSync(root, { recursive: true })
      appendEvent(root, 'run.init', { run: sanitizeRunName(run) })
      freshRegister(root)
      return { content: [{ type: 'text', text: `run 已初始化: ${root}` }] }
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
    '登记一条新假设（PROPOSED→LIVE）。predicts 必须与现有 LIVE 假设可判别：不能是任一 LIVE 假设 predicts 的子集。graveyard 非空时必须给 conflicts（"none — 攻击未探索的轴"或"graveyard 的 H# 死于 X；本假设以 Y 反驳/绕开"）',
    {
      run: z.string(),
      id: z.string().regex(/^H\d+$/, '假设 id 形如 H1、H2'),
      statement: z.string().min(1),
      predicts: z.array(z.string()).min(1),
      conflicts: z.string().optional(),
    },
    async ({ run, id, statement, predicts, conflicts }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      if (state.claims.some((c) => c.id === id)) {
        throw new ResearchStateError(`假设 ${id} 已存在`)
      }
      const redundant = state.claims
        .filter((c) => c.state === 'LIVE')
        .find((claim) => {
          const set = new Set(claim.predicts)
          return predicts.every((p) => set.has(p))
        })
      if (redundant) {
        throw new ResearchStateError(
          `${id} 的 predicts 是 LIVE 假设 ${redundant.id} 的子集，两者不可判别；先写出差异再登记 → research-abduce：重写 predicts 使两条假设有互斥落点`,
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
      })
      freshRegister(root)
      return { content: [{ type: 'text', text: `${id} 已登记为 LIVE` }] }
    },
  )

  server.tool(
    'claim_transition',
    '迁移假设状态。终态（SUPPORTED/REFUTED/SCOPED）必须点名一个已落地探针，且观测值落在该探针预登记时写下的针对此假设的分支频段内',
    {
      run: z.string(),
      id: z.string(),
      to: z.enum(['CONTESTED', 'LIVE', 'SUPPORTED', 'REFUTED', 'SCOPED']),
      byProbe: z.string().optional(),
      note: z.string().optional(),
    },
    async ({ run, id, to, byProbe, note }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      const claim = state.claims.find((c) => c.id === id)
      if (!claim) throw new ResearchStateError(`未知 claim: ${id}`)
      // P3.5：graveyard 复活必须点名新证据来源——没有新证据的复活是对死人的鞭尸
      const TERMINAL = ['SUPPORTED', 'REFUTED', 'SCOPED'] as const
      if (to === 'LIVE' && (TERMINAL as readonly string[]).includes(claim.state)) {
        if (!note || note.trim() === '') {
          throw new ResearchStateError(
            `${id} 已是终态（${claim.state}），复活必须带 note 点名新证据来源（哪个探针/哪条攻击推翻了原结论）`,
          )
        }
      }
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
        if (!spec.branches.some((b) => b.target === id && inBand(metric, b.band))) {
          throw new ResearchStateError(
            `观测值 ${metric} 不落在任何针对 ${id} 的预登记分支频段内；不得事后解释 → 强制分诊：打开 research-moves 的 references/triage.md，按台阶（伪影→bug→方差→已知→真实意外）判定后以三种落地之一终结`,
          )
        }
      }
      appendEvent(root, 'claim.transition', { id, to, ...(byProbe ? { by_probe: byProbe } : {}), ...(note ? { note } : {}) })
      freshRegister(root)
      return { content: [{ type: 'text', text: `${id} → ${to}` }] }
    },
  )

  // ── 类别 3：预登记落盘 ──────────────────────────────────────────────

  server.tool(
    'prereg_write',
    '预登记一个探针（时间戳 + sha256 冻结）。结构性拒绝装饰性探针：必须有互斥频段对与 kill/scope 分支。必须在 probe_run 之前',
    { run: z.string(), spec: ProbeSpecSchema },
    async ({ run, spec }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      validateProbeSpec(spec as unknown as ProbeSpec, state)
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
      })
      freshRegister(root)
      return { content: [{ type: 'text', text: `${spec.pid} 已预登记（sha256 ${digest.slice(0, 12)}…）` }] }
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
    '记录一次对抗性质疑（typed）：new_h（混合/总体替代解释）/ constraint（被忽略的约束）/ no_change（结果其实不改变信念）',
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
      return { content: [{ type: 'text', text: `${gid} 已记录` }] }
    },
  )

  server.tool(
    'report_declare',
    '声明报告并当庭过三道 gate（P3.2：declare 即裁决）：prereg/reconcile/trace 全绿才写入声明与 gate.verdict；任何一道红则拒绝声明并逐条给出理由',
    { run: z.string(), path: z.string() },
    async ({ run, path }) => {
      const root = resolveRun(run)
      requireInit(root)
      const normalizedPath = path.replace(/\\/g, '/')
      const reportPath = confined(root, normalizedPath)
      if (!existsSync(reportPath)) throw new ResearchStateError(`报告不存在: ${path}`)
      const digest = sha256(readFileSync(reportPath, 'utf-8'))

      // 先裁决后落笔：红报告不产生任何 journal 事件（声明失败 ≠ 声明了一个坏报告）
      const verdicts = [
        runPreregGate(root),
        runReconcileGate(root, { path: normalizedPath, sha256: digest }),
        runTraceGate(root),
      ]
      const failures = verdicts.flatMap((v) => v.failures)
      if (failures.length > 0) {
        const lines = failures.map((f) => `✗ [${f.gate}] ${f.reason}`)
        throw new ResearchStateError(
          `报告未通过 gate，拒绝声明：\n${lines.join('\n')}`
          + '\n→ 逐条修复 REPORT.md（或回 research-probe 补实验）后重调 report_declare'
          + '（Proma 工具名 mcp__research__report_declare）；终局只能由 declare 裁决',
        )
      }

      appendEvent(root, 'report.declare', { path: normalizedPath, sha256: digest })
      appendEvent(root, 'gate.verdict', { passed: true, report: normalizedPath, prereg: true, reconcile: true, trace: true })
      freshRegister(root)
      return {
        content: [{ type: 'text', text: `报告已声明（sha256 ${digest.slice(0, 12)}…）；三道 gate 全绿：prereg ✓ reconcile ✓ trace ✓` }],
      }
    },
  )

  // ── EVAL-PLAN §1.3 · 计量接口：世界只经 meter 可达 ─────────────────────
  // meter 在 server 进程内执行（沙箱外）：真值（worlds.py 的 novel 通道参数）
  // 从不出现在工具返回里。PROMA_RESEARCH_DENY 是 world 工具注册的 fail-closed
  // 前置；kernel 无法结构性沙箱化，因此评测脚本另以权限策略阻断直连，并由
  // liveness 把实际 benchmark 读取/import 当作泄漏指标。预算与终局以 journal 为准。
  let worldIsolationReady = true
  try {
    resolveResearchDenyRoots()
  } catch (error) {
    worldIsolationReady = false
    console.error(`[proma-research] world_* 未注册（fail closed）：${error instanceof Error ? error.message : String(error)}`)
  }

  if (worldIsolationReady) {
    const METER = process.env.PROMA_EVAL_METER
      ?? new URL('../../../research/eval/world-meter.py', import.meta.url).pathname
    const EVAL_BUDGET = Number(process.env.PROMA_EVAL_BUDGET ?? 40)

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
      const requestedReps = reps ?? 1
      const worldState = summarizeWorldJournal(readJournal(root))
      if (worldState.forecastCount > 0) {
        throw new ResearchStateError('终局已裁决；world_observe 不再开放——下一步：report_declare')
      }
      if (worldState.spent + requestedReps > EVAL_BUDGET) {
        throw new ResearchStateError(
          `budget exhausted: spent=${worldState.spent} + reps=${requestedReps} > budget=${EVAL_BUDGET}；`
          + '下一步：用已落地的观测收窄假设，或 report_declare 终局',
        )
      }
      const ledger = join(root, 'world-ledger.jsonl')
      const args = ['observe', world, String(seed), protocol]
      if (reps) args.push('--reps', String(reps))
      if (blockers) args.push('--blockers', blockers)
      const proc = spawnSync(
        'python3',
        [METER, '--ledger', ledger, '--budget', String(EVAL_BUDGET), '--budget-spent', String(worldState.spent), ...args],
        { encoding: 'utf-8', timeout: 120_000 },
      )
      if (proc.status !== 0) {
        throw new ResearchStateError(`${proc.stderr?.trim() || proc.stdout?.trim() || 'meter 执行失败'} → 用已落地的观测收窄假设（research-probe），或 report_declare 终局`)
      }
      const result = JSON.parse(proc.stdout) as Record<string, unknown>
      appendEvent(root, 'world.observe', {
        world, seed, protocol, reps: reps ?? 1,
        cost: result.cost, spike_count: result.spike_count,
      })
      return { content: [{ type: 'text', text: proc.stdout }] }
    },
  )

    server.tool(
      'world_simulate',
    '对自提候选机制跑生成模型（免费、不触真细胞、不扣预算）：给出 {extra:[{name,g,E,mvh,mk,mtau,mpow,hvh?,hk?,htau?,hpow?}], slow_na} 与协议标签，返回候选的 test 窗尖峰数。mode=info 时返回题面（text_prior、协议池、held-out 标签、参考模型）',
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
        return { content: [{ type: 'text', text: proc.stdout }] }
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
