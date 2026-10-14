import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
  classifyResearchToolCall,
  classifyRlmChildToolCall,
  type ResearchIsolationConfig,
} from '../research-isolation-guard'

export interface ResearchIsolationObserver {
  /** 隔离 guard 拒绝时旁路通知（记录 residual）；不影响判定本身。 */
  onDenied(toolName: string, reason: string): void
  /**
   * guard 判定的 bash/ipython/edit 调用通过时旁路通知（记录 success）。
   * 没有 success 就没有验证分母，guard 类 refinement 会永远 PENDING（审计 F1）。
   */
  onAllowed?(toolName: string): void
}

/**
 * Prime execution-before 隔离扩展。
 *
 * ResourceLoader 同时供父会话和 RLM 子会话构建各自的 ExtensionRunner，故这里
 * 覆盖父 Bash/ipython 与 RLM 子 ipython；它不依赖 canUseTool 或权限模式。
 * 分类逻辑留在 isolation guard；observer 只旁路记录拒绝（C1 的 guard 来源）。
 */
export function createResearchIsolationExtension(
  config: ResearchIsolationConfig,
  observer?: ResearchIsolationObserver,
): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.on('tool_call', (event) => {
      const decision = classifyResearchToolCall(
        event.toolName,
        event.input as Record<string, unknown>,
        config,
      )
      if (decision) {
        observer?.onDenied(event.toolName, decision.reason)
      } else {
        const tool = event.toolName.toLowerCase()
        if (tool === 'bash' || tool === 'ipython' || tool === 'edit') observer?.onAllowed?.(tool)
      }
      return decision
    })
  }
}

/**
 * rlm child 的 MCP 只读守卫（01-统一架构 §4.5 / §9.4，P0 检查 ②）。
 * 只要 RLM 可用就装，不依赖 PROMA_RESEARCH_DENY：父会话是唯一的研究状态写入者。
 * 同一 ResourceLoader 供父/子会话构建 ExtensionRunner，depth 取自各自的 session header。
 */
export function createRlmChildToolGuardExtension(): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.on('tool_call', (event, ctx) =>
      classifyRlmChildToolCall(event.toolName, ctx.sessionManager.getHeader()?.rlmDepth))
  }
}
