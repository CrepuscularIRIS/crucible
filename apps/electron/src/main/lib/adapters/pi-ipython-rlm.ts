/**
 * RLM（Prime ipython kernel）供给检测与工具接线。
 *
 * Prime 的 RLM 全链路（rlm 子代理、goal.*、refine、kernel 快照）挂在 AgentSession
 * 私有构建的内置 ipython 定义里：provisioner 持有 hostHandlers，会话持有 provisioner。
 * Proma 以 customTools 同名注册的方式取得权限包装，但 execute 必须委托给会话内
 * 已接线的那个定义——自建 `createIpythonToolDefinition(cwd)` 会生成一个没有
 * hostHandlers 的裸 provisioner，RLM 整条链不可达。
 */

import { spawnSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentSession, ToolDefinition } from '@earendil-works/pi-coding-agent'

type PiSdk = typeof import('@earendil-works/pi-coding-agent')

export interface IpythonKernelSupply {
  available: boolean
  /** available 时：供给来源；不可用时：面向用户的原因说明。 */
  detail: string
}

/** 委托目标：createAgentSession 返回后回填，首个工具调用前必须就位。 */
export interface RlmIpythonWiring {
  wiredDefinition?: ToolDefinition
}

/**
 * AgentSession 私有基座工具表的最小结构视图。
 *
 * 这是本文件唯一触碰 Prime 私有字段的地方：读取失败必须 fail loud（拒绝执行），
 * 绝不能退化成自建裸定义——那等于给用户一个没有 RLM 也不受控的空壳。
 */
interface PrimeBaseToolDefinitionsHolder {
  _baseToolDefinitions?: Map<string, ToolDefinition>
}

let cachedSupply: IpythonKernelSupply | undefined

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function probeUv(): string | undefined {
  const version = spawnSync('uv', ['--version'], { timeout: 15_000, windowsHide: true })
  if (version.status === 0) return 'uv (PATH)'
  // Prime bootstrap 自身的回退位置；与它保持一致避免两边判定不同。
  const localUv = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv')
  if (isExecutableFile(localUv)) return localUv
  return undefined
}

/**
 * 检测 ipython kernel 供给（进程生命周期内记忆化）。
 *
 * 供给三来源，与 Prime kernel/bootstrap.ts 的解析顺序一致：
 * 1. `PRIME_AGENT_KERNEL_PYTHON` 指向自带 ipykernel 的 python（完全跳过 uv）；
 * 2. PATH 或 ~/.local/bin 上的 uv（首次装配由 Prime 用 uv 完成，装配进度经工具
 *    working message 显示在会话流里）；
 * 3. 都没有 → 不注册 ipython（否则 Prime 会在无 TTY 的 Electron 主进程里走
 *    readline 交互确认安装 uv，直接挂死），由 UI 引导用户安装。
 */
export function detectIpythonKernelSupply(): IpythonKernelSupply {
  if (cachedSupply) return cachedSupply
  const pinned = process.env.PRIME_AGENT_KERNEL_PYTHON
  if (pinned) {
    if (isExecutableFile(pinned)) {
      cachedSupply = { available: true, detail: `PRIME_AGENT_KERNEL_PYTHON → ${pinned}` }
      return cachedSupply
    }
    cachedSupply = {
      available: false,
      detail: `PRIME_AGENT_KERNEL_PYTHON 指向的 ${pinned} 不可执行`,
    }
    return cachedSupply
  }
  const uv = probeUv()
  if (uv) {
    cachedSupply = { available: true, detail: uv }
    return cachedSupply
  }
  cachedSupply = {
    available: false,
    detail: '未找到 uv，也未设置 PRIME_AGENT_KERNEL_PYTHON',
  }
  return cachedSupply
}

/** 仅供测试重置记忆化。 */
export function resetIpythonKernelSupplyCacheForTest(): void {
  cachedSupply = undefined
}

/**
 * 从会话私有基座工具表捕获已接线的内置 ipython 定义。
 *
 * 找不到即抛错：Prime 内部结构变化时宁可让 RLM 注册失败，也不静默降级。
 */
export function captureWiredIpythonDefinition(
  session: AgentSession,
  wiring: RlmIpythonWiring,
): void {
  const holder = session as unknown as PrimeBaseToolDefinitionsHolder
  const wired = holder._baseToolDefinitions?.get('ipython')
  if (!wired) {
    throw new Error(
      'Prime 会话未暴露已接线的 ipython 定义（内部结构可能已变化），RLM 注册中止；'
      + '需要按新版 Prime 重新适配 pi-ipython-rlm。',
    )
  }
  wiring.wiredDefinition = wired
}

/**
 * 构建委托给会话内置定义的 ipython 工具（含权限包装前的原始形态）。
 *
 * 静态元数据（schema/描述/promptSnippet）取自 SDK 模板以跟随版本升级；
 * 模板自带的裸 provisioner 不会启动 kernel（kernel 仅在 execute 时懒启动）。
 */
export function createRlmIpythonToolDefinition(
  sdk: PiSdk,
  cwd: string,
  wiring: RlmIpythonWiring,
): ToolDefinition {
  const template = sdk.createIpythonToolDefinition(cwd)
  // 泛型 ToolDefinition 与模板的具体参数类型在 renderCall 上逆变不兼容，
  // 与 pi-agent-adapter 现有做法一致地经 unknown 归一。
  const definition = {
    ...template,
    // kernel 单线程：与 Prime 自身约定一致，批次内不并行执行 cell。
    executionMode: 'sequential',
    async execute(toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown, ctx?: unknown) {
      const wired = wiring.wiredDefinition
      if (!wired) {
        throw new Error('RLM ipython 尚未接线（会话构建未完成或 Prime 结构变化），本次调用被拒绝。')
      }
      return wired.execute(
        toolCallId,
        params as never,
        signal,
        onUpdate as never,
        ctx as never,
      )
    },
  }
  return definition as unknown as ToolDefinition
}
