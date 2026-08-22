import React from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AgentRlmSupplyState } from '@proma/shared'

/**
 * P0.1：RLM（ipython kernel）供给状态徽标。
 *
 * - 就绪：显示 RLM，tooltip 说明来源（uv / PRIME_AGENT_KERNEL_PYTHON）；
 * - 未就绪：显示 RLM 关闭态，tooltip 给出安装引导（uv 或钉死 Python）。
 *   供给缺失时本会话不会有 ipython 工具、/goal 与 rlm() 不可用——
 *   这个徽标就是为了不让"功能没生效"被静默吞掉。
 */
export const RlmSupplyBadge: React.FC = () => {
  const [state, setState] = React.useState<AgentRlmSupplyState | null>(null)

  React.useEffect(() => {
    let cancelled = false
    window.electronAPI.getRlmSupply()
      .then((next) => { if (!cancelled) setState(next) })
      .catch(() => { /* 主进程未就绪时静默 */ })
    return () => { cancelled = true }
  }, [])

  if (!state) return null

  const available = state.available
  const title = available
    ? `RLM 可用（${state.detail}）。ipython 工具经权限确认后可用，rlm() 子代理与 /goal 已开启。`
    : `RLM 不可用：${state.detail}。安装 uv（curl -LsSf https://astral.sh/uv/install.sh | sh）或设置 PRIME_AGENT_KERNEL_PYTHON 后重启应用，即可启用 ipython 内核、rlm() 子代理与 /goal。`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-6 px-2 text-[11px] ${available ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}
          disabled
          aria-label={available ? 'RLM 内核可用' : 'RLM 内核不可用'}
        >
          RLM{available ? '' : ' 未就绪'}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top"><p className="max-w-72">{title}</p></TooltipContent>
    </Tooltip>
  )
}
