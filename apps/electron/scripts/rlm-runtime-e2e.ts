/**
 * P6.0b RLM 运行时隔离验收。
 *
 * 用 Node 跑（Bun 不能加载 zeromq NAPI）：
 *   node apps/electron/scripts/rlm-runtime-e2e.ts
 *
 * 不调外部模型、不读凭据。父会话与真实 RLM child 各执行一个 IPython cell，
 * disposeAsync 后核对两个 kernel snapshot；随后重建旧共享 customTool 机制作为
 * negative control，证明同一检测确实能看到 child 变量泄漏进父 kernel。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
} from '@earendil-works/pi-ai'
import type { AgentSession, ToolDefinition } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import {
  detectIpythonKernelSupply,
  installSessionIpythonPermission,
} from '../src/main/lib/adapters/pi-ipython-rlm.ts'
import {
  authorizeResearchIpython,
  disposeAndArchiveResearchSession,
} from './research-script-lifecycle.ts'

const REPO = dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname))))

process.env.PRIME_AGENT_KERNEL_PYTHON = join(
  process.env.HOME ?? '',
  '.proma-p0-venv',
  'bin',
  'python',
)
process.env.PRIME_AGENT_KERNEL_FORKSERVER = '0'

interface KernelManifest {
  savedNames: string[]
}

interface PrimeBaseToolHolder {
  _baseToolDefinitions?: Map<string, ToolDefinition>
}

interface BuiltSession {
  session: AgentSession
}

const packageRoot = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
const [servicesMod, sessionManagerMod] = await Promise.all([
  import(new URL('./core/agent-session-services.js', packageRoot).href),
  import(new URL('./core/session-manager.js', packageRoot).href),
])

function usage() {
  return {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function streamMessage(message: AssistantMessage) {
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => stream.push({ type: 'done', reason: message.stopReason, message }))
  return stream
}

function childStream(marker: string): StreamFn {
  return (model: Model, context) => {
    const hasToolResult = context.messages.some((message) => message.role === 'toolResult')
    const message: AssistantMessage = {
      role: 'assistant',
      content: hasToolResult
        ? [{ type: 'text', text: 'child cell completed' }]
        : [{
          type: 'toolCall',
          id: `cell-${marker}`,
          name: 'ipython',
          arguments: { code: `${marker} = 'child'` },
        }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: usage(),
      stopReason: hasToolResult ? 'stop' : 'toolUse',
      timestamp: Date.now(),
    }
    return streamMessage(message)
  }
}

async function buildSession(
  rootDir: string,
  caseName: string,
  childMarker: string,
  customTools: ToolDefinition[] = [],
): Promise<BuiltSession> {
  const cwd = join(rootDir, caseName)
  mkdirSync(cwd, { recursive: true })
  const services = await servicesMod.createAgentSessionServices({
    cwd,
    agentDir: join(rootDir, `agent-${caseName}`),
    noBuiltinHerdrReporter: true,
    telemetryDisabled: true,
  })
  services.modelRegistry.registerProvider('rlm-e2e', {
    name: 'rlm-e2e',
    baseUrl: 'http://127.0.0.1/unused',
    apiKey: 'offline-test-key',
    api: 'openai-completions',
    models: [{
      id: 'offline-child',
      name: 'offline-child',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 4096,
      maxTokens: 512,
    }],
  })
  const model = services.modelRegistry.find('rlm-e2e', 'offline-child')
  if (!model) throw new Error('离线 RLM 测试模型注册失败')
  const sessionManager = sessionManagerMod.SessionManager.create(
    cwd,
    join(rootDir, `sessions-${caseName}`),
  )
  const { session } = await servicesMod.createAgentSessionFromServices({
    services,
    sessionManager,
    model,
    noTools: 'builtin',
    initialActiveToolNames: ['ipython'],
    customTools,
  })
  session.agent.streamFn = childStream(childMarker)
  installSessionIpythonPermission(session, authorizeResearchIpython)
  return { session }
}

async function executeCell(session: AgentSession, code: string): Promise<void> {
  const definition = session.getToolDefinition('ipython')
  if (!definition?.execute) throw new Error('ipython 定义不可执行')
  await definition.execute(
    `direct-${Date.now()}`,
    { code },
    new AbortController().signal,
    undefined,
    {} as never,
  )
}

async function waitForChild(parent: AgentSession, childId: string): Promise<AgentSession> {
  const deadline = Date.now() + 60_000
  let published: AgentSession | undefined
  while (Date.now() < deadline) {
    const child = parent.getRlmChildSession(childId)
    if (child) published = child
    const toolResult = child?.messages.find((message) => message.role === 'toolResult')
    if (child && toolResult) {
      const listed = await parent.listRlmSubagents()
      const status = listed.subagents.find((entry) => entry.rlm_child_id === childId)?.status
      if (status === 'error') {
        throw new Error(`RLM child ${childId} 工具执行失败: ${JSON.stringify(toolResult)}`)
      }
      // list_subagents 会在 run.status='done' 时先显示 completed，但 Prime 随后才把
      // child 移入 retained registry。等 direct run 消失，才可安全 dispose/读 snapshot。
      if (status === 'completed' && parent.getRlmChildRunStatus(childId) === undefined) return child
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  const listed = await parent.listRlmSubagents()
  throw new Error(
    `等待 RLM child ${childId} 完成超时；status=${parent.getRlmChildRunStatus(childId) ?? 'unknown'}；`
    + `listed=${JSON.stringify(listed)}；roles=${published?.messages.map((message) => message.role).join(',') ?? 'unpublished'}；`
    + `last=${published?.getLastAssistantText() ?? 'none'}`,
  )
}

function manifestPath(session: AgentSession): string {
  return join(session.sessionManager.getSessionArtifactDir(), 'kernel-state.json')
}

function readManifest(session: AgentSession): KernelManifest {
  const path = manifestPath(session)
  if (!existsSync(path)) throw new Error(`kernel manifest 缺失: ${path}`)
  return JSON.parse(readFileSync(path, 'utf-8')) as KernelManifest
}

function assertIsolated(parent: KernelManifest, child: KernelManifest): void {
  if (!parent.savedNames.includes('parent_only_marker')) {
    throw new Error('父 snapshot 缺 parent_only_marker')
  }
  if (parent.savedNames.includes('child_only_marker')) {
    throw new Error('隔离失败：child_only_marker 泄漏到父 snapshot')
  }
  if (!child.savedNames.includes('child_only_marker')) {
    throw new Error('子 snapshot 缺 child_only_marker')
  }
  if (child.savedNames.includes('parent_only_marker')) {
    throw new Error('隔离失败：parent_only_marker 泄漏到子 snapshot')
  }
}

function sharedIpythonFixture(): {
  definition: ToolDefinition
  attach(target: ToolDefinition): void
} {
  let target: ToolDefinition | undefined
  const definition = {
    name: 'ipython',
    label: 'shared ipython negative control',
    description: '故意复现旧共享委托机制',
    parameters: Type.Object({ code: Type.String() }),
    executionMode: 'sequential' as const,
    async execute(toolCallId: string, params: { code: string }, signal?: AbortSignal) {
      if (!target?.execute) throw new Error('negative control 未接 parent ipython')
      return target.execute(toolCallId, params, signal, undefined, {} as never)
    },
  } as unknown as ToolDefinition
  return {
    definition,
    attach(next: ToolDefinition) { target = next },
  }
}

async function runPositive(rootDir: string): Promise<AgentSession> {
  const { session: parent } = await buildSession(rootDir, 'positive', 'child_only_marker')
  await executeCell(parent, "parent_only_marker = 'parent'")
  const spawned = await parent.runRlmChild('write child marker')
  const child = await waitForChild(parent, spawned.rlm_child_id)
  writeFileSync(
    join(rootDir, 'positive-rlm-subagents.json'),
    JSON.stringify(await parent.listRlmSubagents(), null, 2),
    'utf-8',
  )
  await child.disposeAsync()
  await parent.disposeAsync()
  assertIsolated(readManifest(parent), readManifest(child))
  return parent
}

async function runNegativeControl(rootDir: string): Promise<AgentSession> {
  const shared = sharedIpythonFixture()
  const { session: parent } = await buildSession(
    rootDir,
    'negative',
    'negative_child_marker',
    [shared.definition],
  )
  const base = (parent as unknown as PrimeBaseToolHolder)._baseToolDefinitions?.get('ipython')
  if (!base) throw new Error('negative control 取不到 parent base ipython')
  shared.attach(base)
  const spawned = await parent.runRlmChild('write leaked marker')
  const child = await waitForChild(parent, spawned.rlm_child_id)
  writeFileSync(
    join(rootDir, 'negative-rlm-subagents.json'),
    JSON.stringify(await parent.listRlmSubagents(), null, 2),
    'utf-8',
  )
  await child.disposeAsync()
  await parent.disposeAsync()
  const parentManifest = readManifest(parent)
  if (!parentManifest.savedNames.includes('negative_child_marker')) {
    throw new Error('negative control 无法复现旧共享 customTool 泄漏，隔离测试没有检测力')
  }
  return parent
}

const supply = detectIpythonKernelSupply()
if (!supply.available) throw new Error(`kernel 供给缺失: ${supply.detail}`)

const rootDir = mkdtempSync(join(tmpdir(), 'proma-rlm-e2e-'))
try {
  await runPositive(rootDir)
  console.log('RLM_PARENT_CHILD_ISOLATION_PASS')
  const negativeParent = await runNegativeControl(rootDir)
  console.log('RLM_SHARED_CUSTOM_TOOL_NEGATIVE_CONTROL_PASS')
  await disposeAndArchiveResearchSession({
    session: negativeParent,
    archiveDir: join(REPO, 'research', 'campaigns', '2026-08-23-rlm-runtime-e2e'),
    entries: [{ source: rootDir, target: 'runtime', required: true }],
  })
  console.log('RUNTIME_E2E_PASS')
} finally {
  rmSync(rootDir, { recursive: true, force: true })
}
