import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { buildReport, readArchive, renderJudgeReport } from './judge-report'
import { elements } from './check-two-minute'

describe('会议报告的首次阅读边界', () => {
  test('Given 仿真历史归档 When 生成首屏 Then 先区分仿真、回放与事后审计', () => {
    const html = buildReport(join(import.meta.dir, '../campaigns/2026-10-14-glm53flash-oneline-ca_rebound'))
    const first = elements(html, 'section')[0]!
    expect(first).toContain('不是生物细胞实验')
    expect(first).toContain('不是现场重新执行')
    expect(first).toContain('不代表系统在运行时已自动发现')
    expect(html).not.toContain('画布上线前')
    expect(html).toContain('时间相邻本身不能证明选择的因果关系')
    expect(first).toContain('缺少 4 份原始测量输出')
    expect(html).toContain('probes/P1/raw/output.txt</code> 未提供')
    expect(html).toContain('此处不是本次重新执行检查的结果')
    expect(first).not.toContain('8 次真实测量')
    expect(first).toContain('8 次计费仿真观测')
  })

  test('Given 输入捆包含输出文件 When 生成 Then 只标存在、不冒充已复算', () => {
    const files = readArchive(join(import.meta.dir, '../campaigns/2026-10-14-glm53flash-oneline-ca_rebound'))
    for (const pid of ['P1', 'P2', 'P3', 'P4']) files[`probes/${pid}/raw/output.txt`] = '测试夹具，仅测试文件存在，不代表真实观测'
    const html = renderJudgeReport(files, { archive: '测试夹具' })
    expect(html).toContain('原始输出归档覆盖 4/4')
    expect(html).not.toContain('data-kind="archive-warning"')
    expect(html).toContain('不代表内容正确或已重跑实验')
  })
})
