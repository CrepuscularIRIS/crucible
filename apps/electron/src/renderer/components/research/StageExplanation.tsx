import React from 'react'
import { ArrowRight, FileSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProbeExperiment } from './ProbeExperiment'
import type { ProbeCardView, WorkbenchEvent } from './workbench-view'

interface StageExplanationProps {
  probe: ProbeCardView | null
  probes: ProbeCardView[]
  /** 与 probe 相同回放时点的事件；不得传入完整运行的未来事件。 */
  events: WorkbenchEvent[]
  seq: number
  claimNames: Record<string, string>
  onSelectProbe: (pid: string, revealEvidence: boolean) => void
  onSelectClaim: (hid: string) => void
  onSeq?: (seq: number) => void
}

/** 仅按已登记的顺序找后续实验；相邻不代表有因果关系。 */
export function followingProbe(pid: string, probes: ProbeCardView[], events: WorkbenchEvent[], seq: number): ProbeCardView | undefined {
  const registered = events.filter((event) => event.seq <= seq && event.op === 'prereg.write')
  const index = registered.findIndex((event) => event.pid === pid)
  if (index < 0) return undefined
  const next = registered.slice(index + 1).find((event) => event.pid !== pid)
  return next ? probes.find((probe) => probe.pid === next.pid) : undefined
}

const OUTCOME = { pending: '已登记 · 尚无落地结果', measured: '已取得测量结果', failed: '已记录失败' }

/** 确定性解释页：引用已有问题、图表和迁移，不生成理由、不追加科学裁决。 */
export function StageExplanation({ probe, probes, events, seq, claimNames, onSelectProbe, onSelectClaim, onSeq }: StageExplanationProps): React.ReactElement {
  if (!probe) return <ProbeExperiment probe={null} />
  const prereg = events.find((event) => event.seq <= seq && event.op === 'prereg.write' && event.pid === probe.pid)
  const land = events.find((event) => event.seq <= seq && event.op === 'probe.land' && event.pid === probe.pid)
  const next = followingProbe(probe.pid, probes, events, seq)
  const changed = new Set(probe.changes.map((change) => change.hid)).size
  const evidence = (line: number, label: string) => onSeq
    ? <button type="button" className="stage-source-link" onClick={() => onSeq(line)}>{label} #{line}</button>
    : <span>{label} #{line}</span>

  return <article className="stage-explanation" aria-label={`${probe.pid} 本轮解释`}>
    <header className="stage-explanation-header">
      <div className="stage-explanation-kicker"><span>本轮解释 · {probe.pid}</span><span>截至记录 #{seq}</span></div>
      <h2>这一轮想分清什么？</h2>
      <p className="stage-explanation-caption">登记的问题与目的 · 研究 Agent 原文</p>
      {probe.question.length > 180 ? <details className="stage-question-detail" key={probe.pid}>
        <summary>{probe.question.slice(0, 180)}… <span>展开原文</span></summary>
        <p className="stage-question">{probe.question}</p>
      </details> : <p className="stage-question">{probe.question || '未记录研究问题。'}</p>}
      <div className="stage-reading-path" aria-label="本轮阅读顺序">
        <span><b>01</b> 问题</span><span><b>02</b> 预测与实测</span><span><b>03</b> 判断变化</span><span><b>04</b> 后续行动</span>
      </div>
      <div className="stage-source-row">
        <span>{prereg ? evidence(prereg.seq, '计划登记') : '登记行未定位'}{land && <> · {evidence(land.seq, '结果落地')}</>}</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => onSelectProbe(probe.pid, true)}><FileSearch className="mr-1 size-3.5" aria-hidden />查看原始证据</Button>
      </div>
    </header>

    <div className="stage-round-status" role="note">
      <span>{OUTCOME[probe.status]}</span>
      <span>{changed ? `${changed} 个假设有状态变更记录` : '尚无关联的判断变更记录'}</span>
      <span>记录可追溯 ≠ 科学结论已验证</span>
    </div>
    <ProbeExperiment probe={probe} claimNames={claimNames} onSelectClaim={onSelectClaim} embedded />

    <section className="stage-next" aria-label="后续行动">
      <div className="stage-explanation-kicker"><span>04 / 后续行动</span><span>按当前回放时点显示</span></div>
      {next ? <>
        <h3>{next.pid} · {OUTCOME[next.status]}</h3>
        <p>{next.protocol || '协议未记录'}</p>
        <details><summary>后续实验登记的目的 · 原文</summary><p>{next.question || '未记录目的。'}</p></details>
        <p className="stage-explanation-caption">这是时间上后续登记的实验；仅凭先后顺序，不能断言它由本轮结果促成。</p>
        <Button type="button" variant="outline" size="sm" onClick={() => onSelectProbe(next.pid, false)}>查看 {next.pid} 的实验与证据<ArrowRight className="ml-2 size-3.5" aria-hidden /></Button>
      </> : <>
        <h3>此时尚无后续实验登记</h3>
        <p>不把建议当作已执行，也不从后来的报告补写下一步。</p>
      </>}
    </section>
    <details className="stage-boundary">
      <summary>来源与解释边界</summary>
      <p>本页按记录整理，不重新判断科学真伪。预测区间不是置信区间；落入区间不等于假设成立。</p>
      <p>选择理由：这里只展示登记的问题与目的，尚未接入独立的“为什么优先选择它”字段。没有记录的理由不补写。</p>
      <p>局限：上述判断理由保留 Agent 原文，本页未做独立科学审查；未单列的限制不代表不存在。</p>
    </details>
  </article>
}
