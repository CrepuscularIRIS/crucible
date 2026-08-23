/**
 * RLM（Prime ipython kernel）供给检测与工具接线。
 *
 * Prime 的 RLM 全链路（rlm 子代理、goal.*、refine、kernel 快照）挂在 AgentSession
 * 私有构建的内置 ipython 定义里：provisioner 持有 hostHandlers，会话持有 provisioner，
 * 且每个会话（含 rlm 子代理）各建各的 kernel——隔离是 Prime 自己的结构保证。
 *
 * Proma 的接线方式（P6.0/1.2，取代早期的同名 customTool 委托）：
 * - 不注册 'ipython' customTool。customTools 会被 Prime 按引用拷进每个 rlm 子代理
 *   （agent-session `_createRlmSubagentRuntimeOptions` 的 `customTools: [...this._customTools]`），
 *   共享的委托对象会按同名覆盖子会话自己的接线——子代理因此在父 kernel 里执行，
 *   对抗信息不对称与 RLM_MAX_DEPTH 同时失效（2026-08-23 审计实测）。
 * - 用 `initialActiveToolNames: ['ipython']` 激活会话自己的内置定义；
 * - 会话创建后 `installSessionIpythonPermission` 原地用权限包装替换 base 表中的
 *   定义并刷新注册表——父会话受权限管辖，子会话不受（与 Prime CLI 对子代理的
 *   语义一致：子代理是 agent 自己的延伸，不经过宿主逐次审批）。
 */

import { spawnSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentSession } from '@earendil-works/pi-coding-agent'

export interface IpythonKernelSupply {
  available: boolean
  /** available 时：供给来源；不可用时：面向用户的原因说明。 */
  detail: string
}

export interface SessionIpythonPermissionRequest {
  toolCallId: string
  input: Record<string, unknown>
  signal: AbortSignal
  displayName?: string
  description?: string
}

export type SessionIpythonPermissionResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string }

export type SessionIpythonPermission = (
  request: SessionIpythonPermissionRequest,
) => Promise<SessionIpythonPermissionResult>

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
 * 在父会话 Agent 的执行 hook 上安装 ipython 权限。
 *
 * 前提：会话以 `noTools:'builtin' + initialActiveToolNames:['ipython']` 创建，
 * 且 customTools 中**没有** 'ipython' 条目（否则共享的 customTool 会重新覆盖
 * 回来，子代理隔离随之失效——这正是本函数取代的旧机制）。
 *
 * hook 属于 session.agent，不会被 Prime `_buildRuntime()` 替换，因此 reload 与
 * heartbeat controller 重建工具表后仍有效。RLM child 创建自己的 Agent，不会继承
 * 父 hook；这保留了 Prime 的子会话隔离，也避免共享同名 customTool。
 */
export function installSessionIpythonPermission(
  session: AgentSession,
  authorize: SessionIpythonPermission,
): void {
  const candidate = session as unknown as Partial<Pick<AgentSession, 'agent' | 'getToolDefinition'>>
  const agent = candidate.agent
  if (!agent || typeof candidate.getToolDefinition !== 'function') {
    throw new Error(
      'Prime 会话未暴露 Agent 或已接线的 ipython 定义（内部结构可能已变化），RLM 注册中止；'
      + '需要按新版 Prime 重新适配 pi-ipython-rlm。',
    )
  }
  const wired = candidate.getToolDefinition('ipython')
  if (!wired) {
    throw new Error(
      'Prime 会话未暴露 Agent 或已接线的 ipython 定义（内部结构可能已变化），RLM 注册中止；'
      + '需要按新版 Prime 重新适配 pi-ipython-rlm。',
    )
  }
  const previousBeforeToolCall = agent.beforeToolCall
  agent.beforeToolCall = async (context, signal) => {
    const previousResult = await previousBeforeToolCall?.(context, signal)
    if (previousResult?.block || context.toolCall.name !== 'ipython') return previousResult
    if (!context.args || typeof context.args !== 'object' || Array.isArray(context.args)) {
      return { block: true, reason: 'ipython 参数不是对象，权限检查拒绝执行' }
    }
    const input = context.args as Record<string, unknown>
    const decision = await authorize({
      toolCallId: context.toolCall.id,
      input,
      signal: signal ?? new AbortController().signal,
      displayName: wired.label,
      description: wired.description,
    })
    if (decision.behavior === 'deny') {
      return { block: true, reason: decision.message }
    }
    for (const key of Object.keys(input)) delete input[key]
    Object.assign(input, decision.updatedInput)
    return previousResult
  }
}
