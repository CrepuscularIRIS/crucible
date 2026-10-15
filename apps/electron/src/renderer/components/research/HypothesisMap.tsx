import React from 'react'
import { CornerDownRight } from 'lucide-react'

import type { CanvasView, ClaimRow, NodeSelection } from './canvas-view'

/** 只展示投影里已记录的派生层级；缺失 parent 时每个假设单独成组，不从文字猜连线。 */
export function HypothesisMap({ claims, selectedId, onSelect }: {
  claims: CanvasView['claims']
  selectedId?: string
  onSelect: (selection: NodeSelection) => void
}): React.ReactElement {
  const branches: ClaimRow[][] = []
  for (const claim of claims) {
    if (claim.depth === 0 || branches.length === 0) branches.push([])
    branches[branches.length - 1]!.push(claim)
  }
  if (!claims.length) return <p className="py-6 text-center text-[13px] text-muted-foreground">还没有提出假设。研究开始后，竞争解释和各自的证据会显示在这里。</p>
  return (
    <div className="research-hypothesis-grid" role="group" aria-label="假设派生图">
      {branches.map((branch) => (
        <div key={branch[0]!.id} className="research-hypothesis-branch">
          {branch.map((claim) => (
            <div key={claim.id} className={claim.depth ? 'research-derived' : undefined} style={claim.depth ? { marginLeft: Math.min(claim.depth - 1, 4) * 12 } : undefined}>
              <button type="button" className="research-hypothesis-node" aria-pressed={selectedId === claim.id} onClick={() => onSelect({ kind: 'claim', id: claim.id })}>
                <span className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="flex items-center gap-1 font-mono text-muted-foreground">{claim.depth > 0 && <CornerDownRight className="size-3" aria-label="派生假设" />}{claim.id}</span>
                  <span className={claim.state === 'REFUTED' ? 'text-destructive' : 'text-muted-foreground'}>{claim.stateLabel}</span>
                </span>
                <span className="block text-[13px] font-medium leading-relaxed">{claim.name}</span>
                <span className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">{claim.statement}</span>
                {claim.verdicts.map((v) => <span key={v.node} className="mt-2 block text-[11px] text-muted-foreground">{v.node} 当时{v.atTime} · 事后{v.hindsight}</span>)}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
