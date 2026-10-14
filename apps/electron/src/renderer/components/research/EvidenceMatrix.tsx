import React from 'react'

import { cn } from '@/lib/utils'
import type { CanvasView, MatrixCell, NodeSelection } from './canvas-view'

const MARK_CLASS: Partial<Record<MatrixCell['mark'], string>> = {
  kill: 'text-destructive',
  failed: 'text-destructive',
  outside: 'text-muted-foreground',
  unbanded: 'text-muted-foreground',
  pending: 'text-muted-foreground',
}

function CellText({ cell }: { cell: MatrixCell }): React.ReactElement {
  return (
    <span
      className={cn('inline-block rounded px-1', MARK_CLASS[cell.mark], cell.judgmentSeq && 'border border-dashed border-border')}
      title={cell.judgmentSeq ? '无探针的迁移：判断，非测量' : undefined}
    >
      {cell.label}
    </span>
  )
}

/** 假设派生树（行）× 实验（列，按时间）的证据格（04 §3.3）；窄于 420px 时转为纵向列表 */
export function EvidenceMatrix({ view, narrow, onSelect }: {
  view: CanvasView
  narrow: boolean
  onSelect: (sel: NodeSelection) => void
}): React.ReactElement {
  const { claims, matrix } = view
  if (claims.length === 0) return <p className="text-[13px] text-muted-foreground">还没有提出假设。</p>

  const claimButton = (id: string, label: React.ReactNode) => (
    <button type="button" className="text-left hover:underline" onClick={() => onSelect({ kind: 'claim', id })}>{label}</button>
  )

  if (narrow) {
    return (
      <ul className="space-y-2 text-[13px]">
        {claims.map((c, i) => (
          <li key={c.id} style={{ paddingLeft: c.depth * 12 }}>
            {claimButton(c.id, <><span className="font-medium">{c.id}</span> {c.name} · {c.stateLabel}</>)}
            <ul className="mt-0.5 text-[12px]">
              {matrix.rows[i]!.cells.map((cell) => (
                <li key={cell.pid}>
                  <button type="button" className="hover:underline" onClick={() => onSelect({ kind: 'prereg', id: cell.pid })}>{cell.pid}</button>：<CellText cell={cell} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground">
            <th className="py-1 pr-2 font-normal">假设（派生）</th>
            <th className="py-1 pr-2 font-normal">状态</th>
            {matrix.columns.map((col) => (
              <th key={col.pid} className="whitespace-nowrap py-1 pr-2 font-normal">
                <button type="button" className="hover:underline" onClick={() => onSelect({ kind: 'prereg', id: col.pid })}>{col.label}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {claims.map((c, i) => (
            <tr key={c.id} className="border-t border-border/60 align-top">
              <td className="py-1 pr-2" style={{ paddingLeft: c.depth * 14 }}>
                {claimButton(c.id, <>{c.depth > 0 && <span className="text-muted-foreground">└ </span>}<span className="font-medium">{c.id}</span> <span title={c.statement}>{c.name}</span></>)}
                {c.verdicts.map((v) => (
                  <span key={v.node} className="ml-1 whitespace-nowrap text-[11px] text-muted-foreground" title={`${v.node} ${v.title}（审计注记，只读）`}>
                    {v.node} 当时{v.atTime} 事后{v.hindsight}
                  </span>
                ))}
              </td>
              <td className="whitespace-nowrap py-1 pr-2">{c.stateLabel}</td>
              {matrix.rows[i]!.cells.map((cell) => (
                <td key={cell.pid} className="whitespace-nowrap py-1 pr-2 tabular-nums">
                  <button type="button" onClick={() => onSelect({ kind: 'prereg', id: cell.pid })}><CellText cell={cell} /></button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
