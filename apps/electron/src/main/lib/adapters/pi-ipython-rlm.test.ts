/**
 * P0.1/P6.0 集成测试：RLM（ipython kernel）注册与系统提示契约。
 *
 * 这些测试直接构建真实 AgentSession（经 createAgentSessionServices），锁住两件事：
 * 1. 新接线（P6.0/1.2）：customTools 中不注册 'ipython'，经
 *    `noTools:'builtin' + initialActiveToolNames:['ipython']` 激活会话自己的
 *    内置定义；两个会话的定义必须互异（这是每会话独立 kernel 的结构前提，
 *    真父子执行与 negative control 由 rlm-runtime-e2e.ts 验证）；权限 hook 在
 *    runtime reload 后仍保留；
 * 2. 不再使用 systemPromptOverride 时：系统提示包含 Prime 的 RLM 学说与
 *    子代理指引，Proma 的 append 段落在其后。
 * Prime 升级若改变任一契约，这里必须变红。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'

// zeromq 是原生 NAPI 模块，Bun 测试运行器加载即崩（uv_async_init 未支持）；
// 本文件不启动 kernel，用空壳替换后 SDK 才能在 bun test 里导入。
// Electron/Node 运行时不受影响。
mock.module('zeromq', () => ({
  Dealer: class Dealer {},
  Subscriber: class Subscriber {},
}))

import { createPromaManagedResourceLoaderOptions } from './pi-resource-loader-overrides'
import { createResearchIsolationExtension } from './pi-research-isolation-extension'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
  detectIpythonKernelSupply,
  installSessionIpythonPermission,
  resetIpythonKernelSupplyCacheForTest,
} from './pi-ipython-rlm'
import { shieldPrimeSessionCommands } from './pi-agent-adapter'

/**
 * 按需拼装的 SDK 视图。不 import 包根 '@earendil-works/pi-coding-agent'：
 * bun 的 mock.module 在收集期全局生效且无法解除（agent-session-manager.test.ts
 * 以桩替换了整个包），深路径 file-URL 导入不受其影响，也不受 exports map 限制。
 */
interface PiSdkUnderTest {
  createAgentSessionServices: typeof import('@earendil-works/pi-coding-agent')['createAgentSessionServices']
  createAgentSessionFromServices: typeof import('@earendil-works/pi-coding-agent')['createAgentSessionFromServices']
  SessionManager: typeof import('@earendil-works/pi-coding-agent')['SessionManager']
  createIpythonToolDefinition: typeof import('@earendil-works/pi-coding-agent')['createIpythonToolDefinition']
}

const RLM_DOCTRINE_MARKER = 'general purpose agent that uses code to solve tasks'
const RLM_CONTRACT_MARKER = 'A callable `rlm` is already in your global namespace'
const SUBAGENT_GUIDANCE_MARKER = '# Delegating to sub-agents'

let sdk: PiSdkUnderTest
let rootDir: string

async function loadSdkDeepModules(): Promise<PiSdkUnderTest> {
  const packageRoot = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
  const [services, sessionManager, tools] = await Promise.all([
    import(new URL('./core/agent-session-services.js', packageRoot).href),
    import(new URL('./core/session-manager.js', packageRoot).href),
    import(new URL('./core/tools/index.js', packageRoot).href),
  ])
  return {
    createAgentSessionServices: services.createAgentSessionServices,
    createAgentSessionFromServices: services.createAgentSessionFromServices,
    SessionManager: sessionManager.SessionManager,
    createIpythonToolDefinition: tools.createIpythonToolDefinition,
  }
}

beforeAll(async () => {
  sdk = await loadSdkDeepModules()
  rootDir = mkdtempSync(join(tmpdir(), 'proma-rlm-test-'))
})

afterAll(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

interface BuiltSession {
  session: Awaited<ReturnType<PiSdkUnderTest['createAgentSessionFromServices']>>['session']
}

/** 复刻 createResidentSession 的接线方式（P6.0/1.2）：无 ipython customTool，内置定义经 initialActiveToolNames 激活。 */
async function buildSessionWithRlmIpython(
  appendText?: string,
  caseName = 'case',
  extensionFactories: Array<(pi: ExtensionAPI) => void> = [],
): Promise<BuiltSession> {
  const cwd = join(rootDir, caseName)
  const agentDir = join(rootDir, 'agent-dir')
  const sessionDir = join(rootDir, `sessions-${caseName}`)
  const services = await sdk.createAgentSessionServices({
    cwd,
    agentDir,
    noBuiltinHerdrReporter: true,
    telemetryDisabled: true,
    resourceLoaderOptions: {
      ...createPromaManagedResourceLoaderOptions(),
      ...(appendText !== undefined && { appendSystemPromptOverride: () => [appendText] }),
      ...(extensionFactories.length > 0 && { extensionFactories }),
    },
  })
  const sessionManager = sdk.SessionManager.create(cwd, sessionDir)
  const { session } = await sdk.createAgentSessionFromServices({
    services,
    sessionManager,
    noTools: 'builtin',
    initialActiveToolNames: ['ipython'],
    customTools: [],
  })
  return { session }
}

describe('P6.0/1.2 RLM ipython 接线结构与权限稳定性', () => {
  it('initialActiveToolNames 激活内置 ipython：激活集中含 ipython，且激活的不是任何 customTool', async () => {
    const { session } = await buildSessionWithRlmIpython(undefined, 'case-activate')
    expect(session.getActiveToolNames()).toContain('ipython')
    // customTools 为空——激活的定义只能来自会话自己的基座接线
    expect(session.getToolDefinition('ipython')).toBeDefined()
    expect(typeof session.getToolDefinition('ipython')?.execute).toBe('function')
    session.dispose()
  })

  it('结构前提：两个父会话的 ipython 定义互异', async () => {
    const a = await buildSessionWithRlmIpython(undefined, 'case-iso-a')
    const b = await buildSessionWithRlmIpython(undefined, 'case-iso-b')
    // rlm 子代理经 initialActiveToolNames 继承父的活跃集、经 customTools 继承
    // 自定义工具——customTools 不含 'ipython' 时，每个会话（父或子）拿到的
    // 都是自己的接线。这里不冒充父子隔离证明；真实父子 cell/snapshot 在
    // apps/electron/scripts/rlm-runtime-e2e.ts 中验证。
    expect(a.session.getToolDefinition('ipython')).not.toBe(b.session.getToolDefinition('ipython'))
    a.session.dispose()
    b.session.dispose()
  })

  async function invokeBeforeIpython(
    session: BuiltSession['session'],
    args: Record<string, unknown>,
    toolName = 'ipython',
  ): Promise<{ block?: boolean; reason?: string } | undefined> {
    const hook = session.agent.beforeToolCall
    if (!hook) throw new Error('beforeToolCall hook 未安装')
    const toolCall = {
      type: 'toolCall' as const,
      id: 'call-ipython-permission',
      name: toolName,
      arguments: args,
    }
    return hook({
      assistantMessage: {
        role: 'assistant',
        content: [toolCall],
        api: 'openai-completions',
        provider: 'test',
        model: 'test',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'toolUse',
        timestamp: Date.now(),
      },
      toolCall,
      args,
      context: { systemPrompt: '', messages: [], tools: [] },
    })
  }

  it('installSessionIpythonPermission：拒绝在 runtime reload 前后都生效', async () => {
    const { session } = await buildSessionWithRlmIpython(undefined, 'case-install')
    installSessionIpythonPermission(session, async () => ({
      behavior: 'deny',
      message: '测试拒绝 ipython',
    }))

    expect(await invokeBeforeIpython(session, { code: '1+1' })).toEqual({
      block: true,
      reason: '测试拒绝 ipython',
    })
    await session.reload()
    expect(await invokeBeforeIpython(session, { code: '2+2' })).toEqual({
      block: true,
      reason: '测试拒绝 ipython',
    })
    expect(session.getActiveToolNames()).toContain('ipython')
    await session.disposeAsync()
  })

  it('installSessionIpythonPermission：批准时原地应用 updatedInput', async () => {
    const { session } = await buildSessionWithRlmIpython(undefined, 'case-install-update')
    const args: Record<string, unknown> = { code: 'old_code' }
    installSessionIpythonPermission(session, async () => ({
      behavior: 'allow',
      updatedInput: { code: 'approved_code' },
    }))
    expect(await invokeBeforeIpython(session, args)).toBeUndefined()
    expect(args).toEqual({ code: 'approved_code' })
    await session.disposeAsync()
  })

  it('research execution-before 扩展由 RLM 子会话继承，父子 ipython 均不可直连 meter', async () => {
    const extension = createResearchIsolationExtension({
      denyRoots: ['/home/test/oss/neuronbench'],
      stateRoot: '/home/test/project/.proma-research',
    })
    const { session } = await buildSessionWithRlmIpython(
      undefined,
      'case-research-isolation-parent-child',
      [extension],
    )
    const forbidden = { code: '%run research/eval/world-meter.py' }
    expect(await invokeBeforeIpython(session, forbidden)).toEqual({
      block: true,
      reason: expect.stringContaining('world_* MCP'),
    })

    const internal = session as unknown as {
      _createInlineRlmSubagentRuntime(options: unknown): { session: BuiltSession['session'] }
    }
    const childRuntime = internal._createInlineRlmSubagentRuntime({
      parentSession: session,
      id: 'research-isolation-child',
      prompt: '测试隔离继承',
      sessionName: 'research-isolation-child',
      sessionDir: join(rootDir, 'sessions-research-isolation-child'),
      model: session.model,
      thinkingLevel: session.thinkingLevel,
      serviceTier: session.serviceTier,
      scopedModels: [],
      activeToolNames: session.getActiveToolNames(),
      customTools: [],
      includeGoals: true,
      includeCompactSkill: true,
      rlmDepth: 1,
      rlmMaxDepth: 2,
      rlmParentNodeId: 'research-isolation-child',
    })
    expect(await invokeBeforeIpython(childRuntime.session, forbidden)).toEqual({
      block: true,
      reason: expect.stringContaining('world_* MCP'),
    })
    expect(await invokeBeforeIpython(
      childRuntime.session,
      { command: 'kill 262267' },
      'bash',
    )).toEqual({
      block: true,
      reason: expect.stringContaining('world_* MCP'),
    })
    await childRuntime.session.disposeAsync()
    await session.disposeAsync()
  })

  it('反向验证：Prime 结构变化导致 agent hook 不可读时 install fail loud', () => {
    const fakeSession = {} as Parameters<typeof installSessionIpythonPermission>[0]
    expect(() => installSessionIpythonPermission(fakeSession, async ({ input }) => ({
      behavior: 'allow', updatedInput: input,
    }))).toThrow(/重新适配/)
  })
})

describe('P0.2 系统提示契约', () => {
  it('默认提示分支：RLM 学说、rlm 契约、子代理指引齐备，Proma append 在其后', async () => {
    const appendMarker = 'PROMA_TEST_APPEND_MARKER'
    const { session } = await buildSessionWithRlmIpython(appendMarker)
    const prompt = session.systemPrompt

    const doctrineIndex = prompt.indexOf(RLM_DOCTRINE_MARKER)
    const contractIndex = prompt.indexOf(RLM_CONTRACT_MARKER)
    const guidanceIndex = prompt.indexOf(SUBAGENT_GUIDANCE_MARKER)
    const appendIndex = prompt.indexOf(appendMarker)

    expect(doctrineIndex).toBeGreaterThanOrEqual(0)
    expect(contractIndex).toBeGreaterThan(doctrineIndex)
    expect(guidanceIndex).toBeGreaterThan(contractIndex)
    expect(appendIndex).toBeGreaterThan(guidanceIndex)

    session.dispose()
  })

  it('反向验证：不注入 append 段时提示仍含 RLM 契约（append 不是契约的载体）', async () => {
    const { session } = await buildSessionWithRlmIpython()
    expect(session.systemPrompt).toContain(RLM_CONTRACT_MARKER)
    session.dispose()
  })
})

describe('kernel 供给检测', () => {
  const originalPinned = process.env.PRIME_AGENT_KERNEL_PYTHON

  it('PRIME_AGENT_KERNEL_PYTHON 指向可执行文件 → 可用', () => {
    process.env.PRIME_AGENT_KERNEL_PYTHON = process.execPath
    resetIpythonKernelSupplyCacheForTest()
    expect(detectIpythonKernelSupply().available).toBe(true)
  })

  it('PRIME_AGENT_KERNEL_PYTHON 指向不存在路径 → 不可用（显式钉死优先，不回退 uv）', () => {
    process.env.PRIME_AGENT_KERNEL_PYTHON = '/nonexistent/python-for-test'
    resetIpythonKernelSupplyCacheForTest()
    const supply = detectIpythonKernelSupply()
    expect(supply.available).toBe(false)
    expect(supply.detail).toContain('不可执行')
  })

  it('shieldPrimeSessionCommands：RLM 可用时放行 /goal，不可用时仍 shield；/compact 恒 shield', () => {
    process.env.PRIME_AGENT_KERNEL_PYTHON = process.execPath
    resetIpythonKernelSupplyCacheForTest()
    expect(shieldPrimeSessionCommands('/goal finish the task')).toBe('/goal finish the task')
    expect(shieldPrimeSessionCommands('/compact')).toBe(' /compact')

    process.env.PRIME_AGENT_KERNEL_PYTHON = '/nonexistent/python-for-test'
    resetIpythonKernelSupplyCacheForTest()
    expect(shieldPrimeSessionCommands('/goal finish the task')).toBe(' /goal finish the task')
    expect(shieldPrimeSessionCommands('普通消息 /goal 不受影响')).toBe('普通消息 /goal 不受影响')
  })

  it('无 env 时：结果与 PATH/回退位置上是否存在 uv 一致', () => {
    delete process.env.PRIME_AGENT_KERNEL_PYTHON
    resetIpythonKernelSupplyCacheForTest()
    expect(detectIpythonKernelSupply().available).toBe(true) // 本机开发环境应有 uv
  })

  it('每个用例后清理 env 并重置缓存', () => {
    if (originalPinned === undefined) delete process.env.PRIME_AGENT_KERNEL_PYTHON
    else process.env.PRIME_AGENT_KERNEL_PYTHON = originalPinned
    resetIpythonKernelSupplyCacheForTest()
    expect(detectIpythonKernelSupply().detail.length).toBeGreaterThan(0)
  })
})
