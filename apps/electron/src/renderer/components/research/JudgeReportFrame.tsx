import React from 'react'
import { BookOpen, FileCheck2, FileSearch } from 'lucide-react'

import type { ResearchJudgeReportResult } from '@/types/research-record'
import './research-canvas.css'

/**
 * 评委报告生成器的输出是页面片段（无 doctype/head，靠宿主包壳，见 research/report/template.ts）。
 * 这里补齐壳：charset + 主题（模板认 :root[data-theme]）。
 * <base href="about:srcdoc">：srcdoc 里的 #锚点默认按父页面 URL 解析，目录链接会把 iframe 导航到应用自己的页面。
 */
export function judgeReportDocument(html: string, dark: boolean): string {
  return `<!doctype html><html lang="zh-CN" data-theme="${dark ? 'dark' : 'light'}"><head><base href="about:srcdoc"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`
}

/**
 * 评委视图：报告放进 sandbox="" 的 iframe——不跑脚本、不同源、不能弹窗或提交表单。
 * 报告契约是关掉 JS 内容不变（证据抽屉用原生 <details>），所以沙箱不损失内容。
 */
export function JudgeReportFrame({ result, dark }: { result: ResearchJudgeReportResult | null; dark: boolean }): React.ReactElement {
  if (!result || 'error' in result) return (
    <div className="research-report-state"><section aria-live="polite" aria-busy={!result}>
      <FileSearch className="mb-6 size-7 text-muted-foreground" aria-hidden />
      <p className="research-eyebrow">RESEARCH REVIEW</p>
      <h2 className="mt-3 text-xl font-semibold">{result ? '这份记录还不能生成评委报告' : '正在生成评委报告…'}</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{result && 'error' in result ? result.error : '从同一份研究记录整理关键决策、证据与结论边界。'}</p>
      <div className="mt-6 border-t border-border pt-4 text-[12px] leading-relaxed text-muted-foreground">研究问题 → 为什么这样选择 → 实际结果 → 判断如何改变<br />缺少审查依据时保留缺口，不生成替代结论。</div>
    </section></div>
  )
  return <div className="research-report-shell">
    <div className="research-report-toolbar"><span className="flex items-center gap-2 font-medium text-foreground"><BookOpen className="size-4" aria-hidden />评委阅读画布</span><span className="flex items-center gap-1.5"><FileCheck2 className="size-3.5" aria-hidden />只读 HTML · 生成时快照 · 展开查看证据</span></div>
    <iframe title="评委报告" sandbox="" srcDoc={judgeReportDocument(result.html, dark)} className="min-h-0 w-full flex-1 border-0 bg-background" />
  </div>
}
