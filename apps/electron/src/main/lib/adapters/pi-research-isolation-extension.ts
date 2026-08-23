import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
  classifyResearchToolCall,
  type ResearchIsolationConfig,
} from '../research-isolation-guard'

/**
 * Prime execution-before 隔离扩展。
 *
 * ResourceLoader 同时供父会话和 RLM 子会话构建各自的 ExtensionRunner，故这里
 * 覆盖父 Bash/ipython 与 RLM 子 ipython；它不依赖 canUseTool 或权限模式。
 */
export function createResearchIsolationExtension(
  config: ResearchIsolationConfig,
): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.on('tool_call', (event) => classifyResearchToolCall(
      event.toolName,
      event.input as Record<string, unknown>,
      config,
    ))
  }
}
