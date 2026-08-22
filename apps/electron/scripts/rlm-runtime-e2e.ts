/**
 * P0.1 运行时实证（一次性脚本，不入测试套件）：真实模型 + 真实 AgentSession + RLM ipython 委托定义。
 * 用 node 跑（bun 加载 zeromq 即崩）：
 *   node apps/electron/scripts/rlm-runtime-e2e.ts
 *
 * 密钥按约定运行时读取 /home/lingxufeng/ClawUI/.env 的 Dash-Model，绝不写入文件。
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function readDashScopeKey(): string {
  for (const line of readFileSync('/home/lingxufeng/ClawUI/.env', 'utf-8').split('\n')) {
    const match = /^Dash-Model\s*=\s*(\S+)/.exec(line.trim())
    if (match) return match[1]
  }
  throw new Error('ClawUI/.env 中未找到 Dash-Model 密钥')
}

const packageRoot = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
const [servicesMod, sessionManagerMod, toolsMod] = await Promise.all([
  import(new URL('./core/agent-session-services.js', packageRoot).href),
  import(new URL('./core/session-manager.js', packageRoot).href),
  import(new URL('./core/tools/index.js', packageRoot).href),
])
const rlmModule = await import('../src/main/lib/adapters/pi-ipython-rlm.ts')
const { createRlmIpythonToolDefinition, captureWiredIpythonDefinition, detectIpythonKernelSupply } = rlmModule

const supply = detectIpythonKernelSupply()
console.log(`[1] kernel 供给: ${supply.available ? 'OK' : 'MISSING'} (${supply.detail})`)
if (!supply.available) process.exit(1)

const rootDir = mkdtempSync(join(tmpdir(), 'proma-rlm-e2e-'))
const cwd = join(rootDir, 'case')
const wiring: rlmModule.RlmIpythonWiring = {}
const delegator = createRlmIpythonToolDefinition(
  { createIpythonToolDefinition: toolsMod.createIpythonToolDefinition },
  cwd,
  wiring,
)

const services = await servicesMod.createAgentSessionServices({
  cwd,
  agentDir: join(rootDir, 'agent-dir'),
  noBuiltinHerdrReporter: true,
  telemetryDisabled: true,
})
// provider 注册在 services 的 modelRegistry 上——会话 streamFn 从那里解析凭据
services.modelRegistry.registerProvider('dashscope', {
  name: 'dashscope',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: readDashScopeKey(),
  api: 'openai-completions',
  models: [{
    id: 'qwen3.7-plus',
    name: 'qwen3.7-plus',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
  }],
})

const sessionManager = sessionManagerMod.SessionManager.create(cwd, join(rootDir, 'sessions'))
const { session } = await servicesMod.createAgentSessionFromServices({
  services,
  sessionManager,
  model: services.modelRegistry.find('dashscope', 'qwen3.7-plus'),
  noTools: 'builtin',
  customTools: [delegator],
})
captureWiredIpythonDefinition(session, wiring)
console.log('[2] 会话构建 OK，ipython 激活:', session.getActiveToolNames().includes('ipython'))
console.log('[3] 系统提示含 RLM 契约:', session.systemPrompt.includes('`rlm` is already in your global namespace'))

let sawIpythonCall = false
let sawIpythonResult = false
const assistantTexts: string[] = []
session.agent.subscribe((event: { type: string; toolName?: string; message?: { role: string; content: Array<{ type: string; text?: string }> } }) => {
  if (event.type === 'tool_execution_start' && event.toolName === 'ipython') sawIpythonCall = true
  if (event.type === 'tool_execution_end' && event.toolName === 'ipython') sawIpythonResult = true
  if (event.type === 'message_end' && event.message?.role === 'assistant') {
    for (const block of event.message.content) {
      if (block.type === 'text' && block.text) assistantTexts.push(block.text)
    }
  }
})

await session.prompt('用 ipython 计算 6*7 并只回答结果数字。', { source: 'rpc' })
console.log(`[4] ipython 工具调用: ${sawIpythonCall ? 'OBSERVED' : 'NOT OBSERVED'}, 结果: ${sawIpythonResult ? 'OBSERVED' : 'NOT OBSERVED'}`)
console.log(`[5] 模型回复（尾 200 字）: ${assistantTexts.join(' ').slice(-200)}`)

const venv = join(process.env.HOME ?? '', '.prime', 'agent', 'kernel-venv')
console.log(`[6] kernel venv 存在: ${existsSync(venv)}`)

session.dispose()
rmSync(rootDir, { recursive: true, force: true })
const pass = sawIpythonCall && sawIpythonResult
console.log(pass ? 'RUNTIME_E2E_PASS' : 'RUNTIME_E2E_INCONCLUSIVE')
process.exit(pass ? 0 : 1)
