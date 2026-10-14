import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import type { ForkCandidate as RecordForkCandidate } from '@proma/shared/research-record'
import type { ResearchPauseGate } from '../research-control'
import { isResearchReadOnlyTool } from '../research-permission-policy'

/** 04 §3.6 F-a 命中：只凭一个 reps≤2 的探针否定一个假设。判定本身归 J1 `forkCandidate()`，形状同它。 */
export type ForkCandidate = Pick<RecordForkCandidate, 'hid' | 'pid' | 'reps'>

export interface ResearchPauseExtensionOptions {
  /** 由调用方注入（读 run 记录）；缺省 = F-a 永不触发。已有 fork_answer 的假设应返回 null。 */
  forkCandidate?: (input: Record<string, unknown>) => ForkCandidate | null
}

/**
 * 只读闸门放行（04 §3.7）：research MCP 的只读面（research_state / metric_recompute）、AskUserQuestion、CompactContext。
 * Prime 只有 bash / edit / ipython 三个内置工具，没有结构化的 Read/Grep（pi-agent-adapter buildBuiltinToolDefinitions）；
 * 隔离守卫也没有"这段 shell 只读"的判定（它只管拒绝根与 state 根），所以 bash / ipython 一律拦，
 * 拦截 reason 与"问"的消息都明说只能用 research_state。
 * ponytail: 想放只读 shell 时，先在隔离守卫里加一个通用只读分类器再在这里复用，别在这里写正则。
 */
const HOST_TOOLS_ALLOWED = new Set(['AskUserQuestion', 'CompactContext'])
const readOnlyAllowed = (toolName: string): boolean => HOST_TOOLS_ALLOWED.has(toolName) || isResearchReadOnlyTool(toolName)
const MAX_FA_PER_RUN = 2

/** `mcp__<server>__tool` → `tool`（前缀可有可无）。 */
function baseName(toolName: string): string {
  const i = toolName.lastIndexOf('__')
  return (i >= 0 ? toolName.slice(i + 2) : toolName).toLowerCase()
}

/**
 * 研究暂停扩展（04 §3.7，轨道 R2）：暂停 / 询问期间的只读 tool_call 闸门，外加 forks=wait 时的 F-a 拦截。
 *
 * 注册在 pi-agent-adapter.ts 的 extensionFactories 里——那是 Wave 1 轨道 C 的文件，接线作为 IR-C1：
 *   createResearchPauseExtension(() => researchControl.gate(sessionId))
 * 未注册时什么都不发生（画布退化为软暂停）；注册了但闸门打开时同样是无操作。
 * 子会话（rlmDepth ≥ 1）不受影响：暂停不停后台子任务（它们仍在花费）。
 */
export function createResearchPauseExtension(
  getGate: () => ResearchPauseGate,
  options: ResearchPauseExtensionOptions = {},
): (pi: ExtensionAPI) => void {
  // 放在工厂闭包里而不是 runner 里：同一会话重建 runner 时不重复问同一假设。
  const asked = new Set<string>()
  return (pi) => {
    pi.on('tool_call', (event, ctx) => {
      if (ctx.sessionManager.getHeader()?.rlmDepth) return undefined
      const g = getGate()
      const tool = baseName(event.toolName)
      if (g.readOnly && !readOnlyAllowed(event.toolName)) {
        return {
          block: true,
          reason: `研究已被用户暂停（${g.reason ?? 'U?'}）：结束本轮回答，不要发起新的研究动作。`
            + '暂停期间只能调用 research_state / metric_recompute 查记录（bash、ipython、edit 都会被拦）。',
        }
      }
      if (g.forks !== 'wait' || tool !== 'claim_transition' || !options.forkCandidate) return undefined
      const input = event.input as Record<string, unknown>
      if (input.to !== 'REFUTED') return undefined
      const hit = options.forkCandidate(input)
      if (!hit || asked.has(hit.hid) || asked.size >= MAX_FA_PER_RUN) return undefined
      asked.add(hit.hid)
      return {
        block: true,
        reason: `研究分叉 F-a：这一步只凭 ${hit.pid} 的 ${hit.reps} 次测量否定 ${hit.hid}。`
          + '先单独调用 AskUserQuestion（header 以"研究分叉 F-a"开头，同批不要放其他工具），'
          + '三个选项的 description 按"解决：…｜成本：…｜仍不确定：…"写，收到回答后再迁移。',
      }
    })
  }
}
