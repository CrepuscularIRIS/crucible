import type { AgentRefineState } from '@proma/shared'

export const REFINE_MODES: Record<string, string> = {
  off: '关闭模式：本次研究不进行经验提炼。',
  frozen: '冻结模式：本次研究不允许提炼更新，已有记录仍可查看。',
  learning: '学习模式：允许按研究策略提炼操作经验，效果需另行验证。',
}

/** 与主进程许可保持一致；未知策略不开放写操作。 */
export function refineBlockReason(state: AgentRefineState | null, streaming: boolean, busy: boolean): string | undefined {
  if (busy) return '提炼请求处理中，请勿重复提交。'
  if (!state) return '经验状态尚未确认。'
  if (!state.resident) return '会话已释放，当前不能手动提炼。'
  if (streaming) return '请等待本轮结束后再手动提炼。'
  if (state.arm && state.arm.mode !== 'learning') return REFINE_MODES[state.arm.mode] ?? '经验策略未确认，暂不能提炼。'
  return undefined
}
