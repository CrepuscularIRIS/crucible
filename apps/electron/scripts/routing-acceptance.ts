/**
 * P5.1 · routing 验收重跑（夹具 test-pressure-routing.md 的 GREEN 判定）。
 *   node apps/electron/scripts/routing-acceptance.ts
 *
 * 干净会话 + 单条"研究一下 X"提示词，一个回合后按夹具观察点核查：
 * 立锚（research_kit.anchor 而非只有 research_state）· 宣告等级 ·
 * 宣告阶段 · 单技能加载 · 无预览（prereg 之前不执行评测命令）。
 * 不驱动完整战役——routing 是唯一被测对象。
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

process.env.PRIME_AGENT_KERNEL_PYTHON = `${process.env.HOME}/.proma-p0-venv/bin/python`
process.env.PRIME_AGENT_KERNEL_FORKSERVER = '0'

const REPO = dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname))))
const RUN = 'routing-acceptance'
const {
  buildResearchMcpEnv,
  createHeadlessResearchRefine,
  createResearchIpythonAuthorizer,
  disposeAndArchiveResearchSession,
  requireEnvironmentSecret,
  researchIsolationExtension,
} = await import('./research-script-lifecycle.ts')

const DASHSCOPE_API_KEY = requireEnvironmentSecret(process.env, 'DASHSCOPE_API_KEY')
const NEURONBENCH_ROOT = requireEnvironmentSecret(process.env, 'NEURONBENCH_ROOT')

const campaignDir = join(process.env.HOME!, '.proma-campaign-runs', '2026-08-23-routing-acceptance')
const cwd = join(campaignDir, 'project')
const authorizeResearchIpython = createResearchIpythonAuthorizer(NEURONBENCH_ROOT, cwd)
rmSync(campaignDir, { recursive: true, force: true })
mkdirSync(cwd, { recursive: true })
writeFileSync(join(cwd, 'eval.py'), `import json, random, sys
argv = sys.argv[1:]
feature = argv[argv.index('--feature') + 1] if '--feature' in argv else 'none'
rng = random.Random(42)
n = 200
noise = random.Random(99)
xs = [rng.random() for _ in range(n)]
labels = [1 if x + noise.uniform(-0.12, 0.12) > 0.5 else 0 for x in xs]
correct = 0
for i, (x, label) in enumerate(zip(xs, labels)):
    pred = (1 if x > 0.5 else 0) if feature == 'pca' else (1 if random.Random(i).random() > 0.5 else 0)
    correct += pred == label
print(json.dumps({'metric': {'accuracy': round(correct / n, 4)}}))
`)
writeFileSync(join(cwd, 'PROMPT.md'), '# 战役题目\n\n固定种子评测 eval.py 量 accuracy：python3 eval.py --feature none|pca\n')

const packageRoot = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
const [servicesMod, sessionManagerMod] = await Promise.all([
  import(new URL('./core/agent-session-services.js', packageRoot).href),
  import(new URL('./core/session-manager.js', packageRoot).href),
])
const rlmModule = await import('../src/main/lib/adapters/pi-ipython-rlm.ts')

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Type } from 'typebox'
import type { TSchema } from 'typebox'

const mcpClient = new Client({ name: 'routing-acceptance', version: '1.0.0' })
await mcpClient.connect(new StdioClientTransport({
  command: 'bun',
  args: [join(REPO, 'packages', 'research-mcp', 'src', 'server.ts')],
  env: buildResearchMcpEnv({
    baseEnv: process.env,
    cwd,
    run: RUN,
    neuronbenchRoot: NEURONBENCH_ROOT,
  }),
  stderr: 'inherit',
}))
const listed = await mcpClient.listTools()

function jsonSchemaToTypebox(schema: Record<string, unknown>): ReturnType<typeof Type.Object> {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set((schema.required ?? []) as string[])
  const fields: Record<string, TSchema> = {}
  for (const [key, prop] of Object.entries(properties)) {
    const wrap = (t: TSchema) => (required.has(key) ? t : Type.Optional(t))
    if (prop.type === 'number' || prop.type === 'integer') fields[key] = wrap(Type.Number())
    else if (prop.type === 'boolean') fields[key] = wrap(Type.Boolean())
    else if (prop.type === 'array') fields[key] = wrap(Type.Array(Type.Any()))
    else if (prop.type === 'object' && prop.additionalProperties) fields[key] = wrap(Type.Record(Type.String(), Type.Any()))
    else if (prop.type === 'object' && prop.properties) fields[key] = wrap(jsonSchemaToTypebox(prop))
    else fields[key] = wrap(Type.Any())
  }
  return Type.Object(fields)
}

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

const skillPaths = ['research-loop', 'research-abduce', 'research-probe', 'research-grill', 'research-report', 'research-kit', 'research-moves']
  .map((name) => join(REPO, 'research', 'skills', name))
// 必须先于 ResourceLoader 创建：learning 臂的 observer 才能随扩展进入父/RLM child。
const researchRefine = createHeadlessResearchRefine({ run: RUN, campaignDir })
const services = await servicesMod.createAgentSessionServices({
  cwd,
  agentDir: join(campaignDir, 'agent-dir'),
  noBuiltinHerdrReporter: true,
  telemetryDisabled: true,
  resourceLoaderOptions: {
    additionalSkillPaths: skillPaths,
    // 隔离扩展经共享 ResourceLoader 进入父与 rlm 子会话的 execution-before hook；
    // installSessionIpythonPermission 只包父会话，覆盖不到子代理。
    extensionFactories: [researchIsolationExtension(NEURONBENCH_ROOT, cwd, researchRefine.isolationObserver)],
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
  ...(researchRefine.serializedRefine ? { serializedRefine: true } : {}),
  customTools: [...mcpTools],
})
researchRefine.install(session)
rlmModule.installSessionIpythonPermission(session, authorizeResearchIpython)

console.log('[stage] 干净会话单提示词 开始')
await session.prompt('研究一下：项目根的 eval.py 里 pca 特征工程对 accuracy 有没有实质提升？', { source: 'rpc' })
console.log('[stage] 回合结束，开始核查')

// ── 夹具观察点核查 ────────────────────────────────────────────────────
interface ToolCall { name: string; args: string }
const calls: ToolCall[] = []
let assistantText = ''
for (const m of session.messages as Array<{ role?: string; content?: unknown }>) {
  if (m.role !== 'assistant') continue
  const c = m.content
  if (typeof c === 'string') assistantText += c + '\n'
  else if (Array.isArray(c)) {
    for (const p of c as Array<{ type?: string; text?: string; name?: string; arguments?: unknown }>) {
      if (p.type === 'text' && p.text) assistantText += p.text + '\n'
      if (p.type === 'toolCall' && p.name) calls.push({ name: p.name, args: JSON.stringify(p.arguments ?? {}) })
    }
  }
}
const loadedSkills = new Set<string>()
const stageReadIdx: number[] = []
calls.forEach((call, i) => {
  for (const match of call.args.matchAll(/research\/skills\/(research-[a-z-]+)\/SKILL\.md/g)) {
    loadedSkills.add(match[1])
    if (['research-abduce', 'research-probe', 'research-grill', 'research-report'].includes(match[1])) stageReadIdx.push(i)
  }
})
const loopReadIdx = calls.findIndex((c) => c.args.includes('research-loop/SKILL.md'))
const firstMcpIdx = calls.findIndex((c) => c.name.startsWith('mcp__research__'))
const firstClaimIdx = calls.findIndex((c) => c.name.includes('claim_propose'))
const anchorUsed = calls.some((c) => /anchor|research_kit/.test(c.args))
const stateUsed = calls.some((c) => c.name.includes('research_state'))
const execPattern = /subprocess|%%bash|os\.system|Popen|check_output|python3?\s|!\s*python/
const firstEvalExecIdx = calls.findIndex((c) => (c.name === 'ipython' || c.name === 'bash') && c.args.includes('eval.py') && execPattern.test(c.args))
const preregIdx = calls.findIndex((c) => c.name.includes('prereg_write'))
const checks = {
  // 顺序加载语义：阶段卡按阶段先后读入合法（一个长回合跨阶段时会有多张），
  // 病态是"loop 没读 / 阶段卡没读就动手 / 预读全量"。P5.1 实测校准。
  loop先读: loopReadIdx !== -1 && loopReadIdx < firstMcpIdx,
  立锚: anchorUsed || (stateUsed && anchorUsed),
  宣告等级: /\[战役\].*等级|遭遇战|会战/.test(assistantText),
  宣告阶段: /\[阶段\].*正在用 research-|正在用 research-/.test(assistantText),
  阶段卡先于实质动作: stageReadIdx.length > 0 && firstClaimIdx !== -1 && stageReadIdx[0] < firstClaimIdx,
  无预览: firstEvalExecIdx === -1 || (preregIdx !== -1 && preregIdx < firstEvalExecIdx),
  已加载技能: [...loadedSkills].join(', ') || '(无)',
}
const pass = checks.loop先读 && checks.立锚 && checks.宣告等级 && checks.宣告阶段 && checks.阶段卡先于实质动作 && checks.无预览
console.log(`[routing] ${pass ? 'ACCEPT' : 'DEVIATION'} ${JSON.stringify(checks)}`)

await session.disposeAsync()
await mcpClient.close()

const archiveDir = join(REPO, 'research', 'campaigns', '2026-08-23-routing-acceptance')
rmSync(archiveDir, { recursive: true, force: true })
await disposeAndArchiveResearchSession({
  session,
  beforeDispose: () => researchRefine.beforeDispose?.() ?? Promise.resolve(),
  archiveDir,
  entries: [
    { source: cwd, target: 'project', required: true },
    { source: join(campaignDir, 'sessions'), target: 'sessions', required: true },
    { source: join(campaignDir, 'session-artifacts'), target: 'session-artifacts', required: false },
    ...researchRefine.archiveEntries(),
  ],
})
rmSync(campaignDir, { recursive: true, force: true })
console.log(pass ? 'ROUTING_ACCEPT' : 'ROUTING_DEVIATION')
process.exit(pass ? 0 : 1)
