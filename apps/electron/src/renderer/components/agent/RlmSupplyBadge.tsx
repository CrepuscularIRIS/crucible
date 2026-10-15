import React from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AgentRlmSupplyState } from '@proma/shared'

/** 内核供给是能力状态；点击只解释，不派发任务或改变权限。 */
export const RlmSupplyBadge: React.FC = () => {
  const [state, setState] = React.useState<AgentRlmSupplyState | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  React.useEffect(() => {
    let cancelled = false
    setFailed(false)
    setState(null)
    window.electronAPI.getRlmSupply().then(
      (next) => { if (!cancelled) setState(next) },
      () => { if (!cancelled) setFailed(true) },
    )
    return () => { cancelled = true }
  }, [revision])
  const label = `RLM · ${state ? state.available ? '可用' : '未就绪' : '未确认'}`
  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground" aria-label={`${label}，查看 RLM 运行能力`}>{label}</Button></PopoverTrigger>
    <PopoverContent side="top" align="start" className="w-80 space-y-3 text-[12px]">
      <RlmSupplyDetails state={state} failed={failed} onRefresh={() => setRevision((value) => value + 1)} />
    </PopoverContent>
  </Popover>
}

/** 状态说明独立呈现，读取失败与缓存未就绪是两种不同情况。 */
export function RlmSupplyDetails({ state, failed, onRefresh }: {
  state: AgentRlmSupplyState | null
  failed: boolean
  onRefresh: () => void
}): React.ReactElement {
  return <>
      <h3 className="font-semibold">子任务运行能力 · RLM</h3>
      <p>{state ? state.available ? '内核供给已就绪；子任务由主代理按研究需要派发。' : '内核供给未就绪，当前不能使用 RLM 子任务。' : failed ? '能力状态读取失败。' : '正在检查内核供给…'}</p>
      {state && <p className="break-words text-muted-foreground">{state.detail}</p>}
      {state && !state.available && <p>安装 uv 或设置 PRIME_AGENT_KERNEL_PYTHON 后需重启应用。</p>}
      <p className="text-muted-foreground">供给检测结果在本次应用进程中缓存；刷新只重新读取状态，不重新检测环境。</p>
      <p className="text-muted-foreground">可用不代表已经执行。已派发任务的任务书、状态和回报可在研究画布的「子任务」中查看。</p>
      <Button size="sm" variant="outline" onClick={onRefresh}>刷新状态</Button>
  </>
}
