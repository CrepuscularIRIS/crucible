/**
 * P3.6 · 首场真实战役（无头演练；UI 版留给用户在 Proma 里跑）。
 *   node apps/electron/scripts/first-campaign.ts
 *
 * 完整链路：真模型（qwen3.7-plus）× research skills × research MCP server
 * （真实 stdio 子进程）× bwrap 沙箱探针 × declare 内嵌三道 gate。
 * 结束后由本脚本独立复跑三道 gate CLI，并把战役产物留档到仓库。
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

process.env.PRIME_AGENT_KERNEL_PYTHON = `${process.env.HOME}/.proma-p0-venv/bin/python`
process.env.PRIME_AGENT_KERNEL_FORKSERVER = '0'

// import.meta.dir 是 bun 专属；node 下从 import.meta.url 推导
const REPO = dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname)))) // .../apps/electron/scripts/x.ts → crucible 根

function readDashScopeKey(): string {
  for (const line of readFileSync('/home/lingxufeng/ClawUI/.env', 'utf-8').split('\n')) {
    const match = /^Dash-Model\s*=\s*(\S+)/.exec(line.trim())
    if (match) return match[1]
  }
  throw new Error('ClawUI/.env 中未找到 Dash-Model 密钥')
}

// ── 战役工作区：确定性评测（固定种子、离线、沙箱安全） ──────────────
const campaignDir = mkdtempSync(join(tmpdir(), 'proma-campaign-'))
const cwd = join(campaignDir, 'project')
mkdirSync(cwd, { recursive: true })
writeFileSync(join(cwd, 'eval.py'), `import json, random, sys
# 固定种子的合成评测：pca 特征有效（H1 真），none 基线较低（H2 假）
feature = sys.argv[sys.argv.index('--feature') + 1] if '--feature' in sys.argv else 'none'
rng = random.Random(42)
n = 200
correct = 0
for i in range(n):
    signal = rng.random()
    if feature == 'pca':
        correct += signal > 0.12   # 强可分：期望 accuracy ≈ 0.88
    else:
        correct += signal > 0.38   # 弱基线：期望 accuracy ≈ 0.62
print(json.dumps({'metric': {'accuracy': round(correct / n, 4)}}))
`)
writeFileSync(join(cwd, 'PROMPT.md'), '# 战役题目\n\n种子评测 eval.py 在固定数据上量 accuracy：`python3 eval.py --feature none|pca`。\n')

// ── 会话：skills + RLM 委托 + 真实 research MCP 子进程 ────────────────
const packageRoot = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
const [servicesMod, sessionManagerMod, toolsMod] = await Promise.all([
  import(new URL('./core/agent-session-services.js', packageRoot).href),
  import(new URL('./core/session-manager.js', packageRoot).href),
  import(new URL('./core/tools/index.js', packageRoot).href),
])
const rlmModule = await import('../src/main/lib/adapters/pi-ipython-rlm.ts')

// node 下不能直接 import pi-mcp-tools（仓库内相对导入无扩展名）；
// 这里内联一个最小 MCP 桥：连接真实 stdio server、listTools、包成 Pi customTools。
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Type } from 'typebox'

function jsonSchemaToTypebox(schema: Record<string, unknown>): ReturnType<typeof Type.Object> {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set((schema.required ?? []) as string[])
  const fields: Record<string, ReturnType<typeof Type.String>> = {}
  for (const [key, prop] of Object.entries(properties)) {
    const wrap = (t: ReturnType<typeof Type.String>) => (required.has(key) ? t : Type.Optional(t))
    if (prop.type === 'number' || prop.type === 'integer') fields[key] = wrap(Type.Number())
    else if (prop.type === 'boolean') fields[key] = wrap(Type.Boolean())
    else if (prop.type === 'array') fields[key] = wrap(Type.Array(Type.Any()))
    else if (prop.type === 'object' && prop.additionalProperties) fields[key] = wrap(Type.Record(Type.String(), Type.Any()))
    else if (prop.type === 'object' && prop.properties) fields[key] = wrap(jsonSchemaToTypebox(prop))
    else fields[key] = wrap(Type.Any())
  }
  return Type.Object(fields)
}

const mcpClient = new Client({ name: 'campaign-bridge', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: 'bun',
  args: [join(REPO, 'packages', 'research-mcp', 'src', 'server.ts')],
  env: { ...process.env, PROMA_RESEARCH_CWD: cwd },
  stderr: 'inherit',
})
await mcpClient.connect(transport)
const listed = await mcpClient.listTools()
const mcpTools = listed.tools.map((tool) => ({
  name: `mcp__research__${tool.name}`,
  label: tool.name,
  description: tool.description ?? tool.name,
  parameters: jsonSchemaToTypebox((tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>),
  async execute(_id: string, params: unknown) {
    const result = await mcpClient.callTool({ name: tool.name, arguments: params as Record<string, unknown> })
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>
    const text = content.map((c) => c.text ?? '').join('')
    if (result.isError) throw new Error(text)
    return { content: [{ type: 'text' as const, text }] }
  },
}))
console.log(`[wire] research MCP 工具: ${mcpTools.map((t) => t.name).join(', ')}`)

const wiring: rlmModule.RlmIpythonWiring = {}
const delegator = rlmModule.createRlmIpythonToolDefinition(
  { createIpythonToolDefinition: toolsMod.createIpythonToolDefinition },
  cwd,
  wiring,
)

const skillPaths = ['research-loop', 'research-abduce', 'research-probe', 'research-grill', 'research-report']
  .map((name) => join(REPO, 'research', 'skills', name))
const services = await servicesMod.createAgentSessionServices({
  cwd,
  agentDir: join(campaignDir, 'agent-dir'),
  noBuiltinHerdrReporter: true,
  telemetryDisabled: true,
  resourceLoaderOptions: { additionalSkillPaths: skillPaths },
})
services.modelRegistry.registerProvider('dashscope', {
  name: 'dashscope',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: readDashScopeKey(),
  api: 'openai-completions',
  models: [{
    id: 'qwen3.7-plus', name: 'qwen3.7-plus', reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 8192,
  }],
})
const sessionManager = sessionManagerMod.SessionManager.create(cwd, join(campaignDir, 'sessions'))
const { session } = await servicesMod.createAgentSessionFromServices({
  services,
  sessionManager,
  model: services.modelRegistry.find('dashscope', 'qwen3.7-plus'),
  noTools: 'builtin',
  customTools: [delegator, ...mcpTools],
})
rlmModule.captureWiredIpythonDefinition(session, wiring)
console.log(`[wire] ipython 激活: ${session.getActiveToolNames().includes('ipython')}`)

const runRoot = join(cwd, '.proma-research', 'first-campaign')
function journalOps(): string[] {
  const file = join(runRoot, 'journal.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l).op as string)
}
async function waitForOps(predicate: (ops: string[]) => boolean, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate(journalOps())) return true
    await new Promise((r) => setTimeout(r, 3000))
  }
  return predicate(journalOps())
}

// ── 三段式推进（每段完成判定看 journal，不看模型口供） ────────────────
async function stage(name: string, prompt: string, done: (ops: string[]) => boolean, timeoutMs: number): Promise<boolean> {
  console.log(`[stage] ${name} 开始`)
  await session.prompt(prompt, { source: 'rpc' })
  const ok = await waitForOps(done, timeoutMs)
  console.log(`[stage] ${name} ${ok ? '完成' : '超时'}（journal: ${journalOps().join(' → ')}）`)
  return ok
}

const goal = `你在一场研究战役里。打开 research-loop skill 按它的纪律走。run 名固定为 first-campaign。
战役问题：pca 特征工程对这个固定种子评测的 accuracy 有没有实质提升？`

const s1 = await stage(
  'abduce+probe',
  `${goal}
第一步：按 research-abduce 登记两条可判别假设（H1: pca 使 accuracy ≥ 0.8；H2: 无实质提升，accuracy ≤ 0.65），
然后按 research-probe 预登记探针 P1（命令用 python3 eval.py --feature pca，指标 json 路径 metric.accuracy，
频段按两条假设的预测写，分支必须含 kill）并执行落地，按预登记分支更新假设状态。`,
  (ops) => ops.includes('probe.land') && ops.includes('claim.transition'),
  420_000,
)

const s2 = await stage(
  'grill',
  `第二步：按 research-grill，先用 research_state 拿完整状态（含 graveyard），用 rlm() 拉起名为 grill-adversary
的对抗子代理攻击存活假设，把站得住的攻击用 attack_record 落成 typed 证据（至少一条）。`,
  (ops) => ops.includes('attack.record'),
  420_000,
)

const s3 = await stage(
  'report',
  `第三步：按 research-report 把 REPORT.md 写到 .proma-research/first-campaign/REPORT.md
（相对 run 目录路径 REPORT.md），数字必须来自 metric_recompute，然后调用 report_declare 声明——
它会当庭跑三道 gate，红了就按理由修报告再declare，直到全绿。`,
  (ops) => ops.includes('gate.verdict'),
  420_000,
)

session.dispose()
await mcpClient.close()

// ── 独立复跑三道 gate CLI（与 declare 内嵌裁决同源，但由宿主进程执行） ──
const gates = ['prereg', 'reconcile', 'trace'] as const
const gateResults: Array<{ gate: string; passed: boolean }> = []
for (const gate of gates) {
  const proc = spawnSync('bun', [join(REPO, 'packages', 'research-mcp', 'gates', `${gate}.ts`), runRoot], { encoding: 'utf-8' })
  gateResults.push({ gate, passed: proc.status === 0 })
  console.log(`[gate] ${gate}: ${proc.status === 0 ? 'PASS' : `FAIL\n${(proc.stderr ?? '').slice(0, 500)}`}`)
}

// ── 留档到仓库 ──────────────────────────────────────────────────────
const archiveDir = join(REPO, 'research', 'campaigns', '2026-08-23-first')
mkdirSync(archiveDir, { recursive: true })
cpSync(runRoot, archiveDir, { recursive: true })
console.log(`[archive] 战役产物已留档: ${archiveDir}`)

rmSync(campaignDir, { recursive: true, force: true })
const pass = s1 && s2 && s3 && gateResults.every((g) => g.passed)
console.log(pass ? 'FIRST_CAMPAIGN_PASS' : 'FIRST_CAMPAIGN_PARTIAL')
process.exit(pass ? 0 : 1)
