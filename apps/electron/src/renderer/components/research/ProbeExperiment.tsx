import React, { useId } from 'react'
import { Button } from '@/components/ui/button'
import type { ProbeCardView } from './workbench-view'

interface ProbeExperimentProps {
  probe: ProbeCardView | null
  onSelectClaim?: (hid: string) => void
}

const STATUS = { pending: '等待测量', measured: '已记录测量', failed: '测量失败' }
const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const valueText = (value: number | undefined): string => value === undefined ? '未记录' : Number.isFinite(value) ? String(value) : '无效数值'
const tickText = (value: number): string => Math.abs(value) >= 1e7 || (value !== 0 && Math.abs(value) < 1e-4) ? value.toExponential(3) : String(Number(value.toPrecision(5)))
const validBand = (band: ProbeCardView['bands'][number]): boolean => finite(band.low) && finite(band.high) && band.low <= band.high

/** 展示预测与观测的关系；科学判断仅来自投影中的 changes，不根据图形位置推断。 */
export function ProbeExperiment({ probe, onSelectClaim }: ProbeExperimentProps): React.ReactElement {
  const chartId = useId()
  if (!probe) return <section className="rounded-xl border border-dashed border-border p-8 text-center" aria-label="实验产物">
    <h3 className="text-sm font-medium">实验产物将在这里生长</h3>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">选中一次实验，查看各个解释的预测、实测结果，以及这一轮改变了什么。</p>
  </section>

  const bands = probe.bands.filter(validBand)
  const invalid = probe.bands.filter((band) => !validBand(band))
  const observed = probe.status === 'measured' && finite(probe.observed) ? probe.observed : undefined
  const values = bands.flatMap((band) => [band.low, band.high])
  if (observed !== undefined) values.push(observed)
  // 先归一化再求差，避免极端有限数值相减溢出；单值范围固定放在数轴中央。
  const magnitude = values.reduce((largest, value) => Math.max(largest, Math.abs(value)), 1)
  const low = values.reduce((minimum, value) => Math.min(minimum, value), Infinity)
  const high = values.reduce((maximum, value) => Math.max(maximum, value), -Infinity)
  const span = high / magnitude - low / magnitude
  const x = (value: number): number => span === 0 ? 322 : 92 + (value / magnitude - low / magnitude) / span * 460
  const chartHeight = Math.max(1, bands.length) * 48 + 94
  const axisY = chartHeight - 36
  const tickValues = low === high ? [low] : [low, low / 2 + high / 2, high]

  return <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-background" aria-label={`${probe.pid} 实验产物`}>
    <header className="border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{probe.pid} · 实验对照</span>
        <span className={probe.status === 'failed' ? 'text-destructive' : ''}>{STATUS[probe.status]}</span>
      </div>
      <h3 className="mt-3 text-base font-semibold leading-relaxed">{probe.question || '这次实验能区分哪些解释？'}</h3>
      <p className="mt-2 break-words text-xs leading-6 text-muted-foreground">{probe.protocol || '协议未记录'} · 重复次数 {valueText(probe.reps)}</p>
      {probe.blockers !== undefined && <p className="break-words text-xs leading-6 text-muted-foreground">阻断剂：{!probe.blockers.trim() || probe.blockers.trim().toLowerCase() === 'none' ? '无' : probe.blockers}</p>}
    </header>
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h4 className="text-sm font-medium">预测与实测</h4><p className="mt-1 text-[11px] text-muted-foreground">{probe.metric || '观测值（单位未记录）'} · 同一数轴比较</p></div>
        <div className="text-right"><span className="text-[11px] text-muted-foreground">实测值</span><p className="font-mono text-xl font-semibold tabular-nums">{observed !== undefined ? valueText(observed) : '—'}</p></div>
      </div>
      {values.length > 0 ? <div className="mt-4 overflow-x-auto"><svg className="block h-auto w-full min-w-[440px] text-foreground" viewBox={`0 0 610 ${chartHeight}`} role="img" aria-labelledby={`${chartId}-title ${chartId}-desc`}>
        <title id={`${chartId}-title`}>{`${probe.pid} 各假设预测区间与实测值`}</title>
        <desc id={`${chartId}-desc`}>横线表示预测区间，菱形表示实测值。精确数值见下方数值表。落入区间不等于假设成立。</desc>
        {tickValues.map((tick, index) => <g key={index}>
          <line x1={x(tick)} x2={x(tick)} y1={18} y2={axisY} stroke="currentColor" strokeOpacity="0.1" />
          <text x={x(tick)} y={axisY + 20} textAnchor={index === 0 && tickValues.length > 1 ? 'start' : index === tickValues.length - 1 && tickValues.length > 1 ? 'end' : 'middle'} fill="currentColor" fontSize="11">{tickText(tick)}</text>
        </g>)}
        {bands.map((band, index) => {
          const y = index * 48 + 36
          return <g key={`${band.hid}-${index}`}>
            <text x={12} y={y + 4} fill="currentColor" fontSize="13" fontWeight="500">{band.hid}</text>
            <line x1={x(band.low)} x2={x(band.high)} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.2" strokeWidth="12" strokeLinecap="round" />
            <line x1={x(band.low)} x2={x(band.high)} y1={y} y2={y} stroke="currentColor" strokeWidth="2" />
            <line x1={x(band.low)} x2={x(band.low)} y1={y - 7} y2={y + 7} stroke="currentColor" />
            <line x1={x(band.high)} x2={x(band.high)} y1={y - 7} y2={y + 7} stroke="currentColor" />
            {observed !== undefined && <path data-observed={observed} d={`M ${x(observed)} ${y - 7} l 7 7 -7 7 -7 -7 Z`} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="1.5" />}
          </g>
        })}
        {observed !== undefined && <line x1={x(observed)} x2={x(observed)} y1={16} y2={axisY} stroke="hsl(var(--primary))" strokeDasharray="4 5" />}
        {!bands.length && observed !== undefined && <path data-observed={observed} d={`M ${x(observed)} 29 l 7 7 -7 7 -7 -7 Z`} fill="hsl(var(--primary))" />}
        <line x1={92} x2={552} y1={axisY} y2={axisY} stroke="currentColor" strokeOpacity="0.3" />
      </svg></div> : <p className="my-6 text-center text-sm text-muted-foreground">尚无可绘制的有效数值。</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span>━ 预测区间</span><span>◆ 实测值</span><span>区间不是置信概率，也不代表科学结论</span></div>
      {probe.status === 'pending' && <p className="mt-3 text-xs text-muted-foreground">测量尚未完成，图中只展示已记录的预测。</p>}
      {probe.status === 'failed' && <p className="mt-3 text-xs text-destructive">本轮测量失败，不将失败记为实测值 0。</p>}
      {probe.status === 'measured' && observed === undefined && <p className="mt-3 text-xs text-muted-foreground">本轮标记为已测量，但实测值{probe.observed === undefined ? '未记录' : '无效'}，暂不绘制实测点。</p>}
      {invalid.length > 0 && <p className="mt-3 text-xs leading-5 text-destructive">{invalid.map((band) => band.hid).join('、')} 的预测区间无效（非有限数值或上下界逆序），已从图中省略。</p>}
      {probe.note && <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">{probe.note}</p>}
      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">查看精确数值与假设</summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs tabular-nums">
          <caption className="sr-only">{probe.pid} 预测与观测数值表</caption>
          <thead className="text-muted-foreground"><tr><th className="py-2 font-normal">假设</th><th className="py-2 font-normal">预测区间</th><th className="py-2 font-normal">实测值</th></tr></thead>
          <tbody>{probe.bands.map((band, index) => <tr className="border-t border-border" key={`${band.hid}-${index}`}>
            <th scope="row" className="py-2 font-normal">{onSelectClaim ? <Button variant="ghost" size="sm" onClick={() => onSelectClaim(band.hid)} aria-label={`查看假设 ${band.hid}`}>{band.hid}</Button> : band.hid}</th>
            <td className="py-2">{valueText(band.low)} – {valueText(band.high)}{!validBand(band) && '（无效区间）'}</td>
            <td className="py-2">{observed !== undefined ? valueText(observed) : '未绘制'}</td>
          </tr>)}</tbody>
        </table></div>
        {!probe.bands.length && <p className="mt-2 text-xs text-muted-foreground">未记录假设预测区间。</p>}
      </details>
    </div>
    <footer className="border-t border-border bg-muted/20 px-5 py-4">
      <h4 className="text-sm font-medium">这一轮改变了什么</h4>
      {probe.changes.length ? <ul className="mt-3 space-y-3">{probe.changes.map((change, index) => <li key={`${change.seq}-${change.hid}-${index}`} className="text-xs leading-6">
        <span className="font-medium">{change.hid}</span><span className="ml-2 font-mono text-[11px] text-muted-foreground">{change.from || '此前状态未记录'} → {change.to}</span>
        {change.requested && <div className="mt-1 rounded-md border border-border bg-background px-3 py-2">
          <p className="font-medium">请求 {change.requested} → 实际 {change.to}</p>
          <p className="text-muted-foreground">状态迁移受到限制；原因：{change.lead?.length ? change.lead.join('、') : '未记录'}。以上实际状态为记录中的最终结果。</p>
        </div>}
        <p className="break-words text-muted-foreground">{change.reason || '未记录变化原因'}</p>
      </li>)}</ul> : <p className="mt-2 text-xs leading-6 text-muted-foreground">尚未记录假设状态的变化。图中的区间比较不会自动生成科学判断。</p>}
    </footer>
  </section>
}
