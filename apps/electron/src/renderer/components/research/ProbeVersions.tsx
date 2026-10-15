import type { ProbeVersionView } from './workbench-view'

interface ProbeVersionsProps {
  versions: ProbeVersionView[]
  pid?: string
}

const versionLabels: Record<ProbeVersionView['status'], string> = {
  rejected: '未通过', edited: '已修改', accepted: '已接受', unrecorded: '未提交草稿',
}

const versionTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** 版本链仅显示已有记录，文件路径是来源标识，不伪装成可打开的产物。 */
export function ProbeVersions({ versions, pid }: ProbeVersionsProps): JSX.Element {
  const selectedVersions = pid ? versions.filter((version) => version.pid === pid) : []
  return (
    <section aria-label="实验方案版本" className="min-w-0">
      <header className="mb-4">
        <h2 className="text-sm font-semibold">方案版本{pid ? ` · ${pid}` : ''}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">保留方案如何修改，以及当时为什么未通过。</p>
      </header>
      {!pid ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">先选择一个实验，再查看它的方案版本。</p>
      ) : selectedVersions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">{pid} 尚无可展示的版本历史。没有记录不代表方案从未修改。</p>
      ) : (
        <>
          <p className="mb-3 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">关联草稿仅保留当前文件，不是当时提交的版本；文件路径与冻结登记的指纹不能用来证明内容相同。</p>
          {selectedVersions.some((version) => version.status === 'rejected') && <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">拒绝记录仅用于展示，不参与裁决；被拒时的确切提交内容暂不提供打开。</p>}
          <ol className="space-y-3" aria-label={`${pid} 的方案版本链`}>
            {selectedVersions.map((version) => {
              const date = version.ts ? new Date(version.ts) : undefined
              const validTime = date !== undefined && !Number.isNaN(date.getTime())
              return (
                <li key={version.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${version.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'}`}>{versionLabels[version.status]}</span>
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{version.seq === undefined ? '事件序号未记录' : `事件 #${version.seq}`}</span>
                  </div>
                  {validTime && date && <p className="mt-2 text-[10px] text-muted-foreground"><time dateTime={version.ts}>{versionTime.format(date)}</time> · UTC+08</p>}
                  {version.reason ? (
                    <p className={`mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed ${version.status === 'rejected' ? 'border-l-2 border-destructive/50 pl-2' : ''}`}>
                      <span className="font-medium">{version.status === 'rejected' ? '未通过原因：' : '记录说明：'}</span>{version.reason}
                    </p>
                  ) : version.status === 'rejected' ? <p className="mt-3 text-xs text-muted-foreground">未记录具体拒绝原因。</p> : null}
                  <dl className="mt-3 space-y-2 text-[10px] leading-relaxed text-muted-foreground">
                    <div><dt>记录来源</dt><dd className="break-all font-mono">{version.id}</dd></div>
                    <div><dt>关联草稿 · 当前文件</dt><dd className="break-all font-mono">{version.path || '未关联草稿'}</dd></div>
                    <div><dt>{version.status === 'accepted' ? '冻结登记文件指纹' : version.status === 'unrecorded' ? '当前草稿文件指纹' : '记录指纹'} · SHA-256</dt><dd className="break-all font-mono">{version.sha256 || '未记录'}</dd></div>
                  </dl>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}
