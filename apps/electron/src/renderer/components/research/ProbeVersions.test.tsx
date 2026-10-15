import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProbeVersions } from './ProbeVersions'
import type { ProbeVersionView } from './workbench-view'

const versions: ProbeVersionView[] = [
  { id: 'rejections.jsonl:1', pid: 'P1', ts: '2026-10-15T03:16:08.050Z', seq: 2, status: 'rejected', path: '_P1.json', reason: '预测区间未冻结', sha256: '123abc' },
  { id: 'v2', pid: 'P1', seq: 3, status: 'edited', path: '_P1-v2.json' },
  { id: 'v3', pid: 'P1', seq: 4, status: 'accepted', path: '_P1-v3.json' },
  { id: 'v4', pid: 'P1', status: 'unrecorded' },
  { id: 'other', pid: 'P2', status: 'accepted', path: '_P2.json' },
]

describe('实验方案版本链', () => {
  test('Given 未选择实验，Then 提示选择且不展示其他实验版本', () => {
    const html = renderToStaticMarkup(<ProbeVersions versions={versions} />)
    expect(html).toContain('先选择一个实验')
    expect(html).not.toContain('_P1')
    expect(html).not.toContain('_P2')
  })
  test('Given 选择没有历史的实验，Then 明确缺失历史而不编造版本', () => {
    const html = renderToStaticMarkup(<ProbeVersions versions={versions} pid="P3" />)
    expect(html).toContain('P3 尚无可展示的版本历史')
    expect(html).toContain('没有记录不代表方案从未修改')
    expect(html).not.toContain('<li')
  })
  test('Given 已选实验，Then 只显示该实验真实状态、拒绝原因及来源', () => {
    const html = renderToStaticMarkup(<ProbeVersions versions={versions} pid="P1" />)
    for (const label of ['未通过', '已修改', '已接受', '未提交草稿', '预测区间未冻结', '事件 #2', '_P1.json', '123abc']) expect(html).toContain(label)
    expect(html).not.toContain('_P2.json')
    expect(html).toContain('未关联草稿')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('href=')
  })
  test('Given 提交与当前草稿并存，Then 明确内容局限、记录来源和指纹归属', () => {
    const html = renderToStaticMarkup(<ProbeVersions versions={versions} pid="P1" />)
    expect(html).toContain('不是当时提交的版本')
    expect(html).toContain('不能用来证明内容相同')
    expect(html).toContain('rejections.jsonl:1')
    expect(html).toContain('冻结登记文件指纹')
    expect(html).toContain('当前草稿文件指纹')
    expect(html).toContain('拒绝记录仅用于展示，不参与裁决')
    expect(html).toContain('11:16:08')
    expect(html).toContain('UTC+08')
  })
  test('Given 拒绝记录没有原因，Then 不补写推断原因', () => {
    const html = renderToStaticMarkup(<ProbeVersions versions={[{ id: 'missing', pid: 'P1', status: 'rejected' }]} pid="P1" />)
    expect(html).toContain('未记录具体拒绝原因')
    expect(html).toContain('事件序号未记录')
  })
})
