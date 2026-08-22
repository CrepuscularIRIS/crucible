/**
 * P0.1/P0.2 集成测试：RLM（ipython kernel）注册与系统提示契约。
 *
 * 这些测试直接构建真实 AgentSession（经 createAgentSessionServices），锁住两件事：
 * 1. customTools 同名注册 'ipython' 后：会话基座里已接线的定义可被捕获、
 *    委托定义被激活且优先于基座定义；
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

import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import { createPromaManagedResourceLoaderOptions } from './pi-resource-loader-overrides'
import {
  captureWiredIpythonDefinition,
  createRlmIpythonToolDefinition,
  detectIpythonKernelSupply,
  resetIpythonKernelSupplyCacheForTest,
  type RlmIpythonWiring,
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
  wiring: RlmIpythonWiring
  delegator: ToolDefinition
}

/** 复刻 createResidentSession 的注册方式：customTools 同名注册 + 权限由外层包装（测试直接用原始定义）。 */
async function buildSessionWithRlmIpython(appendText?: string): Promise<BuiltSession> {
  const cwd = join(rootDir, 'case')
  const agentDir = join(rootDir, 'agent-dir')
  const sessionDir = join(rootDir, 'sessions')
  const wiring: RlmIpythonWiring = {}
  const delegator = createRlmIpythonToolDefinition(sdk, cwd, wiring)
  const services = await sdk.createAgentSessionServices({
    cwd,
    agentDir,
    noBuiltinHerdrReporter: true,
    telemetryDisabled: true,
    resourceLoaderOptions: {
      ...createPromaManagedResourceLoaderOptions(),
      ...(appendText !== undefined && { appendSystemPromptOverride: () => [appendText] }),
    },
  })
  const sessionManager = sdk.SessionManager.create(cwd, sessionDir)
  const { session } = await sdk.createAgentSessionFromServices({
    services,
    sessionManager,
    noTools: 'builtin',
    customTools: [delegator],
  })
  return { session, wiring, delegator }
}

describe('P0.1 RLM ipython 注册', () => {
  it('customTools 同名注册后：ipython 激活、注册表取到的是委托定义、基座接线可捕获', async () => {
    const { session, wiring, delegator } = await buildSessionWithRlmIpython()

    expect(session.getActiveToolNames()).toContain('ipython')
    expect(session.getToolDefinition('ipython')).toBe(delegator)

    captureWiredIpythonDefinition(session, wiring)
    expect(wiring.wiredDefinition).toBeDefined()
    // 委托目标必须是基座里另一个（已接线）定义，不能是委托自身
    expect(wiring.wiredDefinition).not.toBe(delegator)
    expect(typeof wiring.wiredDefinition?.execute).toBe('function')

    session.dispose()
  })

  it('反向验证：wiring 缺失时 execute 拒绝执行而不是静默空转', async () => {
    const cwd = join(rootDir, 'case-refuse')
    const unwired = createRlmIpythonToolDefinition(sdk, cwd, {})
    await expect(
      // ExtensionContext 仅由运行时注入，拒绝路径在触达它之前抛出
      unwired.execute?.('call-1', { code: '1+1' }, new AbortController().signal, undefined, {} as never),
    ).rejects.toThrow(/尚未接线/)
  })

  it('反向验证：Prime 结构变化导致基座不可读时，capture fail loud', () => {
    const fakeSession = {} as Parameters<typeof captureWiredIpythonDefinition>[0]
    expect(() => captureWiredIpythonDefinition(fakeSession, {})).toThrow(/重新适配/)
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
