import React from 'react'
import { useAtomValue } from 'jotai'
import { agentSessionStreamingStateAtomFamily } from '@/atoms/agent-atoms'
import type { ResearchCanvasSource } from '@/atoms/research-atoms'
import { RlmSupplyBadge } from '@/components/agent/RlmSupplyBadge'
import { RefineBadge } from '@/components/agent/RefineBadge'

interface ResearchRuntimeControlsProps {
  sessionId: string
  sourceKind?: ResearchCanvasSource['kind']
}

/** 能力入口属于当前会话；归档不能借用宿主状态或操作宿主经验。 */
export function ResearchRuntimeControls({ sessionId, sourceKind }: ResearchRuntimeControlsProps): React.ReactElement {
  if (sourceKind === 'archive' || sourceKind === 'sample') {
    return <div className="research-runtime-controls" role="region" aria-label="画布运行能力">
      <span className="font-medium">{sourceKind === 'archive' ? '归档' : '示例'} · 只读回放</span>
      <span className="text-muted-foreground">RLM 回报见「子任务」；Refine 历史经验尚未接入，不展示当前会话的经验策略。</span>
    </div>
  }
  return <SessionRuntimeControls key={sessionId} sessionId={sessionId} />
}

function SessionRuntimeControls({ sessionId }: { sessionId: string }): React.ReactElement {
  const streaming = useAtomValue(agentSessionStreamingStateAtomFamily(sessionId))
  return <div className="research-runtime-controls" role="region" aria-label="画布运行能力">
    <span className="font-medium">当前会话</span>
    <div className="flex items-center gap-1" role="group" aria-label="RLM 与 Refine">
      <RlmSupplyBadge />
      <RefineBadge sessionId={sessionId} streaming={streaming?.running ?? false} />
    </div>
    <span className="text-muted-foreground">RLM 任务与回报见「子任务」 · Refine 提炼记录见「实时」</span>
  </div>
}
