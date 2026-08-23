/**
 * Agent 权限服务
 *
 * 核心职责：
 * - 管理 pending 权限请求（Promise + Map 模式）
 * - 维护会话级白名单
 * - 工具/命令分类判断
 *
 * **权限模式口径（2026-08-23 定）**：生产只有 `bypassPermissions` 与 `plan` 两种模式，
 * 逐次权限询问不是产品路径。因此本服务在生产中的唯一入口是 `requestSingleApproval`
 * ——它服务于破坏性 planning 删除，是"即使全自动也要人点头"的最后边界。
 *
 * 曾经存在的 `createCanUseTool`（构造逐次询问 + 只读 classifier + 白名单短路）
 * 只被它自己的测试引用过，生产不可达；留着它等于代码库持续宣称一道并不存在的控制，
 * 已于 2026-08-23 审计后删除。若将来要恢复逐次询问，先加权限模式，再重建入口——
 * 不要复活一个没有调用者的回调。
 *
 * 参考 Craft Agents OSS 的 Promise + Map 异步等待模式。
 */

import { randomUUID } from 'node:crypto'
import type {
  PermissionRequest,
  DangerLevel,
} from '@proma/shared'
import {
  isDangerousCommand,
  hasDangerousStructure,
} from '@proma/shared'

/** SDK PermissionBehavior */
type PermissionBehavior = 'allow' | 'deny'

/** SDK PermissionUpdateDestination */
type PermissionUpdateDestination = 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg'

/** SDK 权限规则值 */
interface PermissionRuleValue {
  toolName: string
  ruleContent?: string
}

/** SDK PermissionUpdate（匹配 SDK 0.2.63） */
export type PermissionUpdate = {
  type: 'addRules' | 'replaceRules' | 'removeRules'
  rules: PermissionRuleValue[]
  behavior: PermissionBehavior
  destination: PermissionUpdateDestination
} | {
  type: 'setMode'
  mode: string
  destination: PermissionUpdateDestination
} | {
  type: 'addDirectories' | 'removeDirectories'
  directories: string[]
  destination: PermissionUpdateDestination
}

/** SDK PermissionDecisionClassification（匹配 SDK 0.2.120） */
type PermissionDecisionClassification = 'user_temporary' | 'user_permanent' | 'user_reject'

/** SDK PermissionResult（匹配 SDK 0.2.120） */
export type PermissionResult = {
  behavior: 'allow'
  updatedInput?: Record<string, unknown>
  updatedPermissions?: PermissionUpdate[]
  toolUseID?: string
  decisionClassification?: PermissionDecisionClassification
} | {
  behavior: 'deny'
  message: string
  interrupt?: boolean
  toolUseID?: string
  decisionClassification?: PermissionDecisionClassification
}

/** canUseTool 回调的 options 参数（匹配 SDK CanUseTool） */
export interface CanUseToolOptions {
  signal: AbortSignal
  suggestions?: PermissionUpdate[]
  blockedPath?: string
  decisionReason?: string
  decisionReasonType?: string
  classifierApprovable?: boolean
  toolUseID: string
  agentID?: string
  title?: string
  displayName?: string
  description?: string
}

/** 待处理的权限请求 */
interface PendingPermission {
  resolve: (result: PermissionResult) => void
  request: PermissionRequest
}

/** 会话级白名单 */
interface SessionWhitelist {
  /** 总是允许的工具名（如 'Write', 'Edit'） */
  allowedTools: Set<string>
  /** 总是允许的 Bash 基础命令（如 'git push', 'npm install'） */
  allowedBashCommands: Set<string>
}

/**
 * Agent 权限服务
 *
 * 单例模式，管理所有会话的权限状态。
 */
export class AgentPermissionService {
  /** 待处理的权限请求 Map（requestId → PendingPermission） */
  private pendingPermissions = new Map<string, PendingPermission>()

  /** 会话级白名单 Map（sessionId → SessionWhitelist） */
  private sessionWhitelists = new Map<string, SessionWhitelist>()

  /**
   * 为破坏性操作创建不可白名单化的单次确认请求。
   * 即使会话处于 bypassPermissions，调用方也可用此入口保留最后的用户确认边界。
   */
  requestSingleApproval(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: CanUseToolOptions,
    sendToRenderer: (request: PermissionRequest) => void,
  ): Promise<PermissionResult> {
    const request: PermissionRequest = {
      ...this.buildPermissionRequest(sessionId, toolName, input, options),
      dangerLevel: 'dangerous',
      allowAlways: false,
    }
    sendToRenderer(request)
    return new Promise<PermissionResult>((resolve) => {
      this.pendingPermissions.set(request.requestId, { resolve, request })
      options.signal.addEventListener('abort', () => {
        if (!this.pendingPermissions.has(request.requestId)) return
        this.pendingPermissions.delete(request.requestId)
        resolve({ behavior: 'deny' as const, message: '操作已中止' })
      }, { once: true })
    })
  }

  /**
   * 响应权限请求（由 IPC handler 调用）
   *
   * @returns 对应的 sessionId，用于向渲染进程发送 resolved 事件；未找到请求时返回 null
   */
  respondToPermission(requestId: string, behavior: 'allow' | 'deny', alwaysAllow: boolean): string | null {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) return null

    const sessionId = pending.request.sessionId

    // "总是允许"选项：加入会话白名单
    if (alwaysAllow && behavior === 'allow' && pending.request.allowAlways !== false) {
      this.addToWhitelist(sessionId, pending.request.toolName, pending.request.toolInput)
    }

    pending.resolve(
      behavior === 'allow'
        ? { behavior: 'allow' as const, updatedInput: pending.request.toolInput }
        : { behavior: 'deny' as const, message: '用户拒绝了此操作' }
    )
    this.pendingPermissions.delete(requestId)
    return sessionId
  }

  /**
   * 清除指定会话的所有待处理请求（会话结束或中止时调用）
   */
  clearSessionPending(sessionId: string): void {
    for (const [requestId, pending] of this.pendingPermissions) {
      if (pending.request.sessionId === sessionId) {
        pending.resolve({ behavior: 'deny' as const, message: '会话已结束' })
        this.pendingPermissions.delete(requestId)
      }
    }
  }

  /**
   * 获取当前所有待处理的权限请求（用于渲染进程重载后恢复状态）
   */
  getPendingRequests(): PermissionRequest[] {
    return [...this.pendingPermissions.values()].map((p) => p.request)
  }

  /**
   * 清除指定会话的白名单（会话结束时调用）
   */
  clearSessionWhitelist(sessionId: string): void {
    this.sessionWhitelists.delete(sessionId)
  }

  // ===== 工具分类判断 =====

  /**
   * 将工具/命令加入会话白名单
   */
  private addToWhitelist(sessionId: string, toolName: string, input: Record<string, unknown>): void {
    const whitelist = this.getOrCreateWhitelist(sessionId)

    if (toolName !== 'Bash') {
      whitelist.allowedTools.add(toolName)
    } else {
      const command = typeof input.command === 'string' ? input.command : ''
      const baseCommand = this.extractBaseCommand(command)
      if (baseCommand) {
        whitelist.allowedBashCommands.add(baseCommand)
      }
    }
  }

  /**
   * 获取或创建会话白名单
   */
  private getOrCreateWhitelist(sessionId: string): SessionWhitelist {
    const existing = this.sessionWhitelists.get(sessionId)
    if (existing) return existing

    const whitelist: SessionWhitelist = {
      allowedTools: new Set(),
      allowedBashCommands: new Set(),
    }
    this.sessionWhitelists.set(sessionId, whitelist)
    return whitelist
  }

  /**
   * 提取 Bash 命令的基础命令（用于白名单匹配）
   *
   * 提取前两个词（如 "git push"、"npm install"）或第一个词（如 "ls"）。
   */
  private extractBaseCommand(command: string): string {
    const parts = command.trim().split(/\s+/)
    // 两词组合命令（git push, npm install 等）
    if (parts.length >= 2 && ['git', 'npm', 'bun', 'yarn', 'pnpm'].includes(parts[0]!)) {
      return `${parts[0]} ${parts[1]}`
    }
    return parts[0] ?? ''
  }

  /**
   * 构建权限请求对象
   */
  private buildPermissionRequest(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: CanUseToolOptions,
  ): PermissionRequest {
    const command = toolName === 'Bash' && typeof input.command === 'string'
      ? input.command
      : undefined

    return {
      requestId: randomUUID(),
      sessionId,
      toolName,
      toolInput: input,
      description: this.buildDescription(toolName, input),
      command,
      dangerLevel: this.assessDangerLevel(toolName, input),
      decisionReason: options.decisionReason,
      decisionReasonType: options.decisionReasonType,
      classifierApprovable: options.classifierApprovable,
      sdkDisplayName: options.displayName,
      sdkTitle: options.title,
      sdkDescription: options.description,
    }
  }

  /**
   * 生成人类可读的操作描述
   */
  private buildDescription(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case 'Bash':
        return typeof input.command === 'string'
          ? `执行命令: ${input.command.slice(0, 200)}`
          : '执行 Bash 命令'
      case 'Write':
        return typeof input.file_path === 'string'
          ? `写入文件: ${input.file_path}`
          : '写入文件'
      case 'Edit':
        return typeof input.file_path === 'string'
          ? `编辑文件: ${input.file_path}`
          : '编辑文件'
      case 'NotebookEdit':
        return typeof input.notebook_path === 'string'
          ? `编辑 Notebook: ${input.notebook_path}`
          : '编辑 Notebook'
      case 'Task':
        return typeof input.description === 'string'
          ? `启动子任务: ${input.description}`
          : '启动子任务'
      case 'REPL':
        return typeof input.description === 'string'
          ? `执行 REPL: ${input.description}`
          : '执行 REPL 代码'
      case 'Workflow':
        return typeof input.name === 'string'
          ? `运行工作流: ${input.name}`
          : '运行工作流'
      case 'ScheduleWakeup':
        return typeof input.reason === 'string'
          ? `安排会话唤醒: ${input.reason}`
          : '安排会话唤醒'
      case 'Monitor':
        return typeof input.description === 'string'
          ? `启动监控任务: ${input.description}`
          : '启动监控任务'
      case 'PushNotification':
        return typeof input.message === 'string'
          ? `发送通知: ${input.message}`
          : '发送通知'
      default:
        return `使用工具: ${toolName}`
    }
  }

  /**
   * 评估操作的危险等级
   */
  private assessDangerLevel(toolName: string, input: Record<string, unknown>): DangerLevel {
    if (toolName === 'Bash') {
      const command = typeof input.command === 'string' ? input.command : ''
      if (isDangerousCommand(command)) return 'dangerous'
      if (hasDangerousStructure(command)) return 'normal'
      return 'normal'
    }

    // 文件写入操作默认为 normal
    if (['Write', 'Edit', 'NotebookEdit'].includes(toolName)) return 'normal'

    // Task 工具默认为 normal
    if (toolName === 'Task') return 'normal'

    // 新 SDK 的后台/定时/通知/脚本能力都可能产生会话外影响，需要明确审批
    if (['REPL', 'Workflow', 'ScheduleWakeup', 'Monitor', 'PushNotification', 'CronCreate', 'CronDelete', 'RemoteTrigger'].includes(toolName)) {
      return 'normal'
    }

    return 'normal'
  }
}

/** 全局权限服务实例 */
export const permissionService = new AgentPermissionService()
