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

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  ResearchStateError,
  appendEvent,
  confined,
  recomputeMetric,
  replay,
  runDir,
  sanitizeRunName,
  sha256,
  stableStringify,
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
  return runDir(serverCwd(), sanitizeRunName(run))
}

function freshRegister(root: string): void {
  writeRegisterSnapshot(root)
}

function requireInit(root: string): void {
  if (!existsSync(join(root, 'journal.jsonl'))) {
    throw new ResearchStateError('run 尚未初始化，先调用 research_init')
  }
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

const BandSchema = z.tuple([z.number(), z.number()])

const ProbeSpecSchema = z.object({
  pid: z.string().regex(/^P\d+$/, '探针 id 形如 P1、P2'),
  question: z.string().min(1),
  evalCommand: z.string().min(1),
  metricKind: z.enum(['json', 'regex']),
  metricSpec: z.string().min(1),
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
    { name: 'proma-research', version: '0.1.0' },
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
    '登记一条新假设（PROPOSED→LIVE）。predicts 必须与现有 LIVE 假设可判别：不能是任一 LIVE 假设 predicts 的子集',
    {
      run: z.string(),
      id: z.string().regex(/^H\d+$/, '假设 id 形如 H1、H2'),
      statement: z.string().min(1),
      predicts: z.array(z.string()).min(1),
    },
    async ({ run, id, statement, predicts }) => {
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
          `${id} 的 predicts 是 LIVE 假设 ${redundant.id} 的子集，两者不可判别；先写出差异再登记`,
        )
      }
      appendEvent(root, 'claim.propose', { id, statement, predicts })
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
      if (to === 'SUPPORTED' || to === 'REFUTED' || to === 'SCOPED') {
        if (!byProbe) {
          throw new ResearchStateError('终态迁移必须点名依据探针（byProbe）')
        }
        const probe = state.probes.find((p) => p.pid === byProbe)
        if (!probe || probe.status !== 'LANDED') {
          throw new ResearchStateError(`终态迁移必须以已落地的探针为依据；${byProbe} 不是已落地探针`)
        }
        const spec = readFrozenSpec(root, byProbe)
        if (!spec.branches.some((b) => b.target === id)) {
          throw new ResearchStateError(
            `${byProbe} 的预登记分支从未提到 ${id}：终态结论必须能追溯到预登记时写下的分支`,
          )
        }
        const metric = probe.metric
        if (metric === undefined) throw new ResearchStateError('探针没有重算指标')
        if (!spec.branches.some((b) => b.target === id && inBand(metric, b.band))) {
          throw new ResearchStateError(
            `观测值 ${metric} 不落在任何针对 ${id} 的预登记分支频段内；不得事后解释`,
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
      validateProbeSpec(spec as ProbeSpec, state)
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
    '执行探针：只运行预登记时冻结的命令字符串（不接受新命令），记录 provenance 与 raw 输出，并从 raw 重算指标后落地。非零退出不予落地',
    { run: z.string(), pid: z.string() },
    async ({ run, pid }) => {
      const root = resolveRun(run)
      requireInit(root)
      const state = replay(root)
      const probe = state.probes.find((p) => p.pid === pid)
      if (!probe || probe.status !== 'PREREG') {
        throw new ResearchStateError(`探针 ${pid} 不存在或状态不允许执行（当前: ${probe?.status ?? '不存在'}）`)
      }
      const spec = readFrozenSpec(root, pid)
      appendEvent(root, 'probe.start', { pid })
      const probeDir = confined(root, join('probes', pid))
      const rawDir = join(probeDir, 'raw')
      mkdirSync(rawDir, { recursive: true })
      const startedAt = new Date().toISOString()
      const stdout = await new Promise<{ text: string; exitCode: number }>((resolveRunResult) => {
        let text = ''
        const child = spawn('/bin/sh', ['-c', spec.evalCommand], {
          cwd: serverCwd(),
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        })
        child.stdout.on('data', (chunk: Buffer) => { text += chunk.toString() })
        child.stderr.on('data', (chunk: Buffer) => { text += chunk.toString() })
        child.on('error', (error) => { text += `\n${String(error)}`; resolveRunResult({ text, exitCode: -1 }) })
        child.on('close', (code) => resolveRunResult({ text, exitCode: code ?? -1 }))
      })
      writeFileSync(join(rawDir, 'output.txt'), stdout.text, 'utf-8')
      const endedAt = new Date().toISOString()
      if (stdout.exitCode !== 0) {
        writeFileSync(join(probeDir, 'provenance.json'), `${JSON.stringify({
          pid, command: spec.evalCommand, exitCode: stdout.exitCode, startedAt, endedAt, landed: false,
        }, null, 2)}\n`, 'utf-8')
        appendEvent(root, 'probe.land', { pid, exit_code: stdout.exitCode, metric: null })
        freshRegister(root)
        throw new ResearchStateError(`探针 ${pid} 以退出码 ${stdout.exitCode} 结束，不予落地（崩溃与干净结果不可区分，一概拒绝）`)
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
    '声明报告文件（相对 run 目录的路径），gate 会按此 sha256 校验并对账其中引用的数字',
    { run: z.string(), path: z.string() },
    async ({ run, path }) => {
      const root = resolveRun(run)
      requireInit(root)
      const reportPath = confined(root, path)
      if (!existsSync(reportPath)) throw new ResearchStateError(`报告不存在: ${path}`)
      const digest = sha256(readFileSync(reportPath, 'utf-8'))
      appendEvent(root, 'report.declare', { path: path.replace(/\\/g, '/'), sha256: digest })
      freshRegister(root)
      return { content: [{ type: 'text', text: `报告已声明（sha256 ${digest.slice(0, 12)}…）` }] }
    },
  )

  return server
}

if (import.meta.main) {
  const server = buildServer()
  await server.connect(new StdioServerTransport())
}
