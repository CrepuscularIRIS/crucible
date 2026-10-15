import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SDKMessage } from '@proma/shared'
import { childCards, describeTool, liveActions, liveSaying } from './live-view'
import { DELIVERY_DIR } from './test-fixtures'

const assistant = (content: unknown[]) => ({ type: 'assistant', message: { content } }) as unknown as SDKMessage
const user = (content: unknown[]) => ({ type: 'user', message: { content } }) as unknown as SDKMessage

describe('live-view：AI 正在做什么', () => {
  test('工具调用按先后列出；有结果的标完成 / 出错，没结果的是进行中', () => {
    const msgs = [
      assistant([{ type: 'tool_use', id: 'a', name: 'mcp__research__prereg_write', input: { spec: { pid: 'P3' } } }]),
      user([{ type: 'tool_result', tool_use_id: 'a', is_error: true }]),
      assistant([{ type: 'text', text: '预注册被拒，改带宽重写' }, { type: 'tool_use', id: 'b', name: 'mcp__research__claim_transition', input: { id: 'H4', to: 'REFUTED', byProbe: 'P2' } }]),
      user([{ type: 'tool_result', tool_use_id: 'b' }]),
      assistant([{ type: 'tool_use', id: 'c', name: 'ipython', input: { code: "job, name = research_kit.new_job(run, 'rivals', 'K1')\nawait rlm(f'读 {job}/brief.md', name=name)" } }]),
    ]
    expect(liveActions(msgs).map((a) => [a.label, a.detail, a.status])).toEqual([
      ['预注册实验', 'P3', 'error'],
      ['改判假设', 'H4 → REFUTED（依据 P2）', 'ok'],
      ['派出子任务', 'rivals · K1', 'running'],
    ])
    expect(liveActions(msgs, true, 1)).toHaveLength(1)
    // 会话已停：没等到结果的调用不再显示进行中
    expect(liveActions(msgs, false).at(-1)!.status).toBe('stopped')
    expect(liveSaying(msgs)).toBe('预注册被拒，改带宽重写')
  })

  test('普通 Python / 命令只取第一行非空代码；未知工具原名显示', () => {
    expect(describeTool('ipython', { code: '\nimport numpy as np\nx = 1' })).toEqual({ kind: 'code', label: '运行 Python', detail: 'import numpy as np' })
    expect(describeTool('bash', { command: 'ls /root\npwd' }).detail).toBe('ls /root')
    expect(describeTool('mystery', {})).toEqual({ kind: 'other', label: 'mystery', detail: '' })
  })
})

describe('live-view：子任务卡（交付 run 真实 out.md）', () => {
  test('任务 = brief 标题，带回的结论 = out.md 的 SUMMARY 段；运行中没有结论', () => {
    const job = join(DELIVERY_DIR, 'child-jobs', 'rivals', 'K1', '44d9')
    const files = {
      'child-jobs/rivals-K1-44d9/brief.md': readFileSync(join(job, 'brief.md'), 'utf8'),
      'child-jobs/rivals-K1-44d9/out.md': readFileSync(join(job, 'out.md'), 'utf8'),
      'child-jobs/w5-lessons-9999/brief.md': '# W5 教训综合\n\n正文',
    }
    const [done, running] = childCards([{ name: 'rivals-K1-44d9', status: 'ok' }, { name: 'w5-lessons-9999', status: 'running' }], files)
    expect(done!.task).toBe('K1 对手完整性审查 — ca-rebound（identify · I3）')
    expect(done!.finding.startsWith('对 W1 九族做结构化覆盖审计')).toBe(true)
    expect(done!.finding).not.toContain('STATUS:')
    expect(running).toMatchObject({ task: 'W5 教训综合', finding: '', status: 'running' })
  })
})
