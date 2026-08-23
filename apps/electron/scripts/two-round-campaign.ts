/**
 * P5.1 · 两轮闭环战役（无头驱动；P13–P17 证据链的直接素材）。
 *   node apps/electron/scripts/two-round-campaign.ts
 *
 * 与首场战役（first-campaign.ts）的三点不同：
 * 1. 提示词不再喂 H1/H2——干净的研究问题让 research-loop 自己路由，
 *    第一轮结束后按 routing 夹具的观察点核对（宣告等级/宣告阶段/单技能加载）；
 * 2. 两轮结构是协议约束（第一轮只许一个探针），第二轮必须晚于
 *    第一轮落地+迁移+对抗攻击——journal 顺序就是 P11 的因果链证据；
 * 3. 工作区在 $HOME 下而不是 /tmp——避开沙箱 tmpfs 对 /tmp 的遮蔽
 *    （首场战役 P1–P5 因此失败）；PROMA_RESEARCH_RUN 钉死战役名。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

process.env.PRIME_AGENT_KERNEL_PYTHON = `${process.env.HOME}/.proma-p0-venv/bin/python`
process.env.PRIME_AGENT_KERNEL_FORKSERVER = '0'

const REPO = dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname))))
const RUN = 'p5-1-two-rounds'
const NEURONBENCH_ROOT = process.env.NEURONBENCH_ROOT ?? '/home/lingxufeng/oss/neuronbench'
const {
  authorizeResearchIpython,
  buildResearchMcpEnv,
  disposeAndArchiveResearchSession,
  requireEnvironmentSecret,
  researchIsolationExtension,
} = await import('./research-script-lifecycle.ts')

const DASHSCOPE_API_KEY = requireEnvironmentSecret(process.env, 'DASHSCOPE_API_KEY')

// ── 战役工作区：$HOME 下（沙箱 tmpfs 遮蔽 /tmp 的教训），确定性评测 ──
const campaignDir = join(process.env.HOME!, '.proma-campaign-runs', '2026-08-23-p5-1')
const cwd = join(campaignDir, 'project')
mkdirSync(cwd, { recursive: true })
writeFileSync(join(cwd, 'eval.py'), `import json, random, sys
argv = sys.argv[1:]
feature = argv[argv.index('--feature') + 1] if '--feature' in argv else 'none'
shuffle = '--shuffle' in argv
rng = random.Random(42)
n = 200
noise = random.Random(99)
xs = [rng.random() for _ in range(n)]
labels = [1 if x + noise.uniform(-0.12, 0.12) > 0.5 else 0 for x in xs]
if shuffle:
    random.Random(7).shuffle(labels)
correct = 0
for i, (x, label) in enumerate(zip(xs, labels)):
    if feature == 'pca':
        pred = 1 if x > 0.5 else 0
    else:
        pred = 1 if random.Random(i).random() > 0.5 else 0
    correct += pred == label
print(json.dumps({'metric': {'accuracy': round(correct / n, 4)}}))
`)

// ── 会话：7 个研究 skills + RLM + 真实 research MCP 子进程（钉死 RUN） ──
const packageRoot = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
const [servicesMod, sessionManagerMod] = await Promise.all([
  import(new URL('./core/agent-session-services.js', packageRoot).href),
  import(new URL('./core/session-manager.js', packageRoot).href),
])
const rlmModule = await import('../src/main/lib/adapters/pi-ipython-rlm.ts')

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
  env: buildResearchMcpEnv({
    baseEnv: process.env,
    cwd,
    run: RUN,
    neuronbenchRoot: NEURONBENCH_ROOT,
  }),
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


const skillPaths = ['research-loop', 'research-abduce', 'research-probe', 'research-grill', 'research-report', 'research-kit', 'research-moves']
  .map((name) => join(REPO, 'research', 'skills', name))
const services = await servicesMod.createAgentSessionServices({
  cwd,
  agentDir: join(campaignDir, 'agent-dir'),
  noBuiltinHerdrReporter: true,
  telemetryDisabled: true,
  resourceLoaderOptions: {
    additionalSkillPaths: skillPaths,
    // 隔离扩展经共享 ResourceLoader 进入父与 rlm 子会话的 execution-before hook；
    // installSessionIpythonPermission 只包父会话，覆盖不到子代理。
    extensionFactories: [researchIsolationExtension(NEURONBENCH_ROOT, cwd)],
  },
})
services.modelRegistry.registerProvider('dashscope', {
  name: 'dashscope',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: DASHSCOPE_API_KEY,
  api: 'openai-completions',
  models: [{
    id: 'qwen3.7-plus', name: 'qwen3.7-plus', reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 32768,
  }],
})
const sessionManager = sessionManagerMod.SessionManager.create(cwd, join(campaignDir, 'sessions'))
const { session } = await servicesMod.createAgentSessionFromServices({
  services,
  sessionManager,
  model: services.modelRegistry.find('dashscope', 'qwen3.7-plus'),
  noTools: 'builtin',
  // P6.0/1.2 接线：无 'ipython' customTool，激活会话自己的内置定义（子代理拿到自己的 kernel）
  initialActiveToolNames: ['ipython'],
  customTools: [...mcpTools],
})
rlmModule.installSessionIpythonPermission(session, authorizeResearchIpython)
console.log(`[wire] ipython 激活: ${session.getActiveToolNames().includes('ipython')}`)

// ── journal 观察：完成判定只看事件，不看模型口供 ──────────────────────
const runRoot = join(cwd, '.proma-research', RUN)
interface JournalEvent { op: string; [key: string]: unknown }
function journal(): JournalEvent[] {
  const file = join(runRoot, 'journal.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as JournalEvent)
}
async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return true
    await new Promise((r) => setTimeout(r, 3000))
  }
  return predicate()
}
async function stage(name: string, prompt: string, done: () => boolean, timeoutMs: number): Promise<boolean> {
  console.log(`[stage] ${name} 开始`)
  await session.prompt(prompt, { source: 'rpc' })
  const ok = await waitFor(done, timeoutMs)
  console.log(`[stage] ${name} ${ok ? '完成' : '超时'}（journal: ${journal().map((e) => e.op).join(' → ')}）`)
  return ok
}

const question = '研究一下：pca 特征工程对这个固定种子评测（项目根的 eval.py，`python3 eval.py --feature none|pca [--shuffle]`）的 accuracy 有没有实质提升？提升是真实信号还是评测伪影？'

const s1 = await stage(
  '第一轮（单探针协议）',
  `${question}
这是第一轮。按研究纪律推进本轮：登记假设、预登记探针并执行落地、按预登记分支更新信念状态。
本轮协议约束：只预登记并执行**一个**探针（判别力最高的那个）。第一轮证据落地且信念更新后停下，向我汇报第一轮结果与你的判断。`,
  () => {
    const ops = journal().map((e) => e.op)
    return ops.includes('probe.land') && ops.includes('claim.transition')
  },
  540_000,
)

// ── routing 验收（夹具观察点：立锚→宣告等级→宣告阶段→单技能加载） ────
function routingAcceptance(): void {
  const messages = session.messages as Array<{ role?: string; content?: unknown }>
  let assistantText = ''
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    const c = m.content
    if (typeof c === 'string') assistantText += c + '\n'
    else if (Array.isArray(c)) for (const p of c as Array<{ type?: string; text?: string }>) if (p.type === 'text' && p.text) assistantText += p.text + '\n'
  }
  const toolBlob = JSON.stringify(messages)
  const loadedSkills = new Set([...toolBlob.matchAll(/research\/skills\/(research-[a-z-]+)\/SKILL\.md/g)].map((m) => m[1]))
  const stageSkillsLoaded = ['research-abduce', 'research-probe', 'research-grill', 'research-report'].filter((s) => loadedSkills.has(s))
  const checks = {
    立锚: /anchor|research_kit/.test(toolBlob) || /research_state/.test(toolBlob),
    宣告等级: /遭遇战|会战/.test(assistantText),
    宣告阶段: /正在用 research-/.test(assistantText),
    单技能加载: stageSkillsLoaded.length <= 1,
    已加载技能: [...loadedSkills].join(', ') || '（未见 SKILL.md 路径——可能经 <available_skills> 描述路由，需人工看 transcript）',
  }
  const pass = checks.立锚 && checks.宣告等级 && checks.宣告阶段 && checks.单技能加载
  console.log(`[routing] ${pass ? 'ACCEPT' : 'DEVIATION'} ${JSON.stringify(checks)}`)
}

const s2 = await stage(
  'grill 对抗',
  `继续：把本轮该攻击的主张（按 research-grill 的落点契约：先选落点再拉起）交给对抗者，
逐条把站得住的攻击用 attack_record 落成 typed 证据（至少一条）。落完账向我汇报：哪些攻击站得住、它们暴露了什么判别缺口。`,
  () => journal().some((e) => e.op === 'attack.record'),
  540_000,
)

const s3 = await stage(
  '第二轮（必须由第一轮结果导致）',
  `继续第二轮：根据第一轮的具体实测结果与对抗者暴露的判别缺口，决定第二轮的调整——
登记/预登记并执行第二轮探针，按预登记分支更新信念。第二轮的调整必须能追溯到第一轮的哪一条结果（或哪条攻击）。完成后向我汇报。`,
  () => {
    const events = journal()
    const lands = events.map((e, i) => ({ i, e: e.op })).filter((x) => x.e === 'probe.land')
    return lands.length >= 2 && events.some((x, i) => x.op === 'claim.transition' && i > lands[lands.length - 1].i)
  },
  540_000,
)

const s4 = await stage(
  'report',
  `按 research-report 把 REPORT.md 写到 run 目录（相对路径 REPORT.md），数字必须来自 metric_recompute，
内容顺序八项（含项目根 RULINGS.md 的裁决汇总——若有裁决一行都没落过，就写"本场无裁决"）。
然后 report_declare 声明——红了就按理由修报告，直到全绿。`,
  () => journal().some((e) => e.op === 'gate.verdict'),
  540_000,
)

routingAcceptance()

await session.disposeAsync()
await mcpClient.close()

// ── P11 因果链核查：第二轮 prereg 晚于 第一轮落地+迁移+攻击 ────────────
function twoRoundChain(): boolean {
  const events = journal()
  const idx = (op: string, after = 0) => events.findIndex((e, i) => i >= after && e.op === op)
  const land1 = idx('probe.land')
  const trans1 = idx('claim.transition', land1 + 1)
  const attack = idx('attack.record', trans1 + 1)
  const lands = events.map((e, i) => ({ op: e.op, i })).filter((x) => x.op === 'probe.land')
  const land2 = lands.length >= 2 ? lands[lands.length - 1].i : -1
  const preregs = events.map((e, i) => ({ op: e.op, i })).filter((x) => x.op === 'prereg.write')
  const prereg2 = preregs.length >= 2 ? preregs[preregs.length - 1].i : -1
  const trans2 = idx('claim.transition', land2 + 1)
  const ok = land1 >= 0 && trans1 > land1 && attack > trans1 && prereg2 > attack && land2 > prereg2 && trans2 > land2
  console.log(`[P11] 因果链 ${ok ? '成立' : '不成立'}: probe.land@${land1} → transition@${trans1} → attack@${attack} → prereg@${prereg2} → probe.land@${land2} → transition@${trans2}`)
  return ok
}
const chainOk = twoRoundChain()

// ── 独立复跑三道 gate CLI ────────────────────────────────────────────
const gates = ['prereg', 'reconcile', 'trace'] as const
const gateResults: Array<{ gate: string; passed: boolean }> = []
for (const gate of gates) {
  const proc = spawnSync('bun', [join(REPO, 'packages', 'research-mcp', 'gates', `${gate}.ts`), runRoot], { encoding: 'utf-8' })
  gateResults.push({ gate, passed: proc.status === 0 })
  console.log(`[gate] ${gate}: ${proc.status === 0 ? 'PASS' : `FAIL\n${(proc.stderr ?? '').slice(0, 500)}`}`)
}

// ── 留档：project + sessions + session-artifacts（P6.0/1.1 无条件归档） ──
const archiveDir = join(REPO, 'research', 'campaigns', '2026-08-23-p5-1-two-rounds')
await disposeAndArchiveResearchSession({
  session,
  archiveDir,
  entries: [
    { source: cwd, target: 'project', required: true },
    { source: join(campaignDir, 'sessions'), target: 'sessions', required: true },
    { source: join(campaignDir, 'session-artifacts'), target: 'session-artifacts', required: false },
  ],
})
console.log(`[archive] 战役产物已留档: ${archiveDir}`)

rmSync(campaignDir, { recursive: true, force: true })
const pass = s1 && s2 && s3 && s4 && chainOk && gateResults.every((g) => g.passed)
console.log(pass ? 'P5_1_CAMPAIGN_PASS' : 'P5_1_CAMPAIGN_PARTIAL')
process.exit(pass ? 0 : 1)
