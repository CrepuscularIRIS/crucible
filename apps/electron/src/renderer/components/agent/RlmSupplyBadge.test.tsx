import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { RlmSupplyDetails } from './RlmSupplyBadge'

describe('RLM 供给状态说明', () => {
  test('Given 未就绪 When 查看说明 Then 给出安装重启方法且不伪称重查环境', () => {
    const html = renderToStaticMarkup(<RlmSupplyDetails state={{ available: false, detail: '未找到 uv' }} failed={false} onRefresh={() => {}} />)
    expect(html).toContain('安装 uv 或设置 PRIME_AGENT_KERNEL_PYTHON 后需重启应用')
    expect(html).toContain('不重新检测环境')
    expect(html).toContain('刷新状态')
    expect(html).not.toContain('重新检查')
  })
  test('Given 读取失败或已就绪 When 查看说明 Then 不混淆读取失败与缺少依赖', () => {
    const failed = renderToStaticMarkup(<RlmSupplyDetails state={null} failed onRefresh={() => {}} />)
    expect(failed).toContain('能力状态读取失败')
    expect(failed).not.toContain('安装 uv')
    const ready = renderToStaticMarkup(<RlmSupplyDetails state={{ available: true, detail: 'uv' }} failed={false} onRefresh={() => {}} />)
    expect(ready).toContain('内核供给已就绪')
    expect(ready).toContain('可用不代表已经执行')
    expect(ready).not.toContain('安装 uv')
  })
})
