import React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { BookOpen, FlaskConical } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { researchCanvasSourceMapAtom, researchTabViewMapAtom, type ResearchTabView } from '@/atoms/research-atoms'
import { createResearchTabId } from '@/atoms/tab-atoms'
import { resolvedThemeAtom } from '@/atoms/theme'
import { useCloseTab } from '@/hooks/useCloseTab'
import type { ResearchJudgeReportResult } from '@/types/research-record'
import { JudgeReportFrame } from './JudgeReportFrame'
import { ResearchCanvasPane } from './ResearchCanvasPane'
import { researchBridge } from './research-bridge'
import './research-canvas.css'

const VIEWS: [ResearchTabView, string][] = [['progress', '科研进度'], ['judge', '评委报告']]

/**
 * 评委视图：当前数据源（画布里选的实时 run / 归档）交给主进程，用 research/report/judge-report.ts 生成。
 * 报告要审计注记 annotations.json，实时 run 与未注记的归档会得到原因说明。
 */
function JudgeReportPane({ sessionId, onBackToResearch }: { sessionId: string; onBackToResearch: () => void }): React.ReactElement {
  const source = useAtomValue(researchCanvasSourceMapAtom).get(sessionId)
  const dark = useAtomValue(resolvedThemeAtom) === 'dark'
  const [result, setResult] = React.useState<ResearchJudgeReportResult | null>(null)
  const archivePath = source?.kind === 'archive' ? source.path : undefined

  React.useEffect(() => {
    setResult(null)
    if (!source) return
    if (source.kind === 'sample') {
      setResult({ error: '随应用打包的示例 run 不带审计注记，生成不了评委报告；在「科研进度」里换成同名归档即可。' })
      return
    }
    const get = researchBridge().getResearchJudgeReport
    if (!get) {
      setResult({ error: '当前环境没有评委报告接口（旧版 preload）。' })
      return
    }
    let cancelled = false
    get({ sessionId, ...(archivePath ? { archivePath } : {}) }).then(
      (r) => { if (!cancelled) setResult(r) },
      (e) => { if (!cancelled) setResult({ error: `评委报告生成失败：${e instanceof Error ? e.message : String(e)}` }) },
    )
    return () => { cancelled = true }
  }, [archivePath, sessionId, source])

  if (!source) return <JudgeReportFrame result={{ error: '先在「科研进度」里选择一份研究记录（实时或归档）。评委报告会使用同一份记录中的证据与审查注记。' }} dark={dark} onBackToResearch={onBackToResearch} />
  return <JudgeReportFrame result={result} dark={dark} onBackToResearch={onBackToResearch} />
}

/** 顶部研究 Tab：同一份 run 记录的两种读法——科研进度（研究者画布，运行中实时）/ 评委（评委报告） */
export function ResearchTabContent({ sessionId }: { sessionId: string }): React.ReactElement {
  const [viewMap, setViewMap] = useAtom(researchTabViewMapAtom)
  const view = viewMap.get(sessionId) ?? 'progress'
  const { requestClose } = useCloseTab()
  const setView = (next: ResearchTabView) => setViewMap((prev) => new Map(prev).set(sessionId, next))

  return (
    <Tabs value={view} onValueChange={(next) => setView(next as ResearchTabView)} className="research-workspace flex h-full min-h-0 flex-col bg-content-area">
      <div className="research-view-bar titlebar-no-drag">
        <div className="research-brand"><FlaskConical className="size-4" aria-hidden /><span>CRUCIBLE<span className="research-brand-caption">研究工作台</span></span></div>
        <TabsList aria-label="研究 Tab 视图" className="h-10 rounded-md border border-border/60 bg-background/50 p-1">
          {VIEWS.map(([key, label]) => (
            <TabsTrigger key={key} value={key} className="gap-2 px-4 text-[12px] transition-none data-[state=active]:bg-card">
              {key === 'progress' ? <FlaskConical className="size-3.5" aria-hidden /> : <BookOpen className="size-3.5" aria-hidden />}{label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="progress" className="m-0 min-h-0 flex-1 overflow-hidden">
        <ResearchCanvasPane sessionId={sessionId} onClose={() => requestClose(createResearchTabId(sessionId))} />
      </TabsContent>
      <TabsContent value="judge" className="m-0 min-h-0 flex-1 overflow-hidden">
        <JudgeReportPane sessionId={sessionId} onBackToResearch={() => setView('progress')} />
      </TabsContent>
    </Tabs>
  )
}
