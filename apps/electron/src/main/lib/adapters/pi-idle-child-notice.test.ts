import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractStatusLine, installIdleChildNoticePolicy } from './pi-idle-child-notice'

function fakeSession() {
  let listener: ((event: unknown) => void) | undefined
  let running = false
  const pauses: Array<{ released: boolean }> = []
  const session = {
    subscribe(fn: (event: unknown) => void) { listener = fn; return () => {} },
    hasRunningRlmChildren: () => running,
    acquireQueuedWorkPause() {
      const pause = { released: false }
      pauses.push(pause)
      return { release: () => { pause.released = true } }
    },
  }
  const child = (id: string, status: string, answerPreview?: string) =>
    listener?.({ type: 'rlm_child_update', child: { id, status, sessionName: `n-${id}`, answerPreview } })
  return { session, pauses, child, setRunning: (value: boolean) => { running = value } }
}

/** Prime 的预览：最后一段 assistant 文本压成一行后取前 160 字符（PA agent-session.ts:1018、:9864）。 */
function primePreview(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length <= 160 ? compact : `${compact.slice(0, 157).trimEnd()}...`
}

describe('空闲时的 rlm 完成通知（§12 Q2 c）', () => {
  test('query 仍订阅时不干预；query 结束且有 child 在跑 → 暂停 Prime 自动开轮，终态只转 UI', () => {
    const { session, pauses, child, setRunning } = fakeSession()
    const notices: unknown[] = []
    const policy = installIdleChildNoticePolicy(session as never, (notice) => notices.push(notice))

    child('a', 'done', 'STATUS: ok PATH: .rlm-jobs/r1/x/out.md')
    expect(notices).toEqual([])
    expect(pauses).toHaveLength(0)

    setRunning(true)
    policy.queryEnded()
    policy.queryEnded()
    expect(pauses).toHaveLength(1)

    child('b', 'done', 'STATUS: ok PATH: .rlm-jobs/r1/certify/C2/7f3a/out.md ## SUMMARY body')
    expect(notices).toEqual([{
      id: 'b',
      sessionName: 'n-b',
      status: 'done',
      statusLine: 'STATUS: ok PATH: .rlm-jobs/r1/certify/C2/7f3a/out.md',
    }])

    policy.beforePrompt()
    expect(pauses[0]!.released).toBe(true)
    child('c', 'error')
    expect(notices).toHaveLength(1)
  })

  test('query 结束时没有 child 在跑 → 不暂停（不影响 Prime 其他续跑）', () => {
    const { session, pauses } = fakeSession()
    installIdleChildNoticePolicy(session as never, () => {}).queryEnded()
    expect(pauses).toHaveLength(0)
  })

  test('⑥ child 最后一条消息首行的 STATUS 出现在 Prime 预览里，且与 out.md 末行一致', () => {
    const outLastLine = 'STATUS: blocked SELF_REVIEWED PATH: .rlm-jobs/r1/certify/C2/7f3a-self/out.md'
    const lastMessage = `${outLastLine}\n\nSUMMARY: the probe could not be built because ${'x'.repeat(300)}`
    expect(extractStatusLine(primePreview(lastMessage))).toBe(outLastLine)
    expect(extractStatusLine('no status here')).toBeUndefined()
  })

  test('STATUS 解析与 Python parse_status 一样宽容：markdown 强调、大小写、空白、尾随标点', () => {
    expect(extractStatusLine('**STATUS: ok** PATH: x/out.md')).toBe('STATUS: ok PATH: x/out.md')
    expect(extractStatusLine('STATUS: OK PATH: x/out.md')).toBe('STATUS: OK PATH: x/out.md')
    expect(extractStatusLine('`STATUS: ok PATH: x/out.md`')).toBe('STATUS: ok PATH: x/out.md')
    expect(extractStatusLine('status:blocked  self_reviewed   PATH:x/out.md.')).toBe('status:blocked  self_reviewed   PATH:x/out.md')
  })
})

/**
 * 审查 MEDIUM 10：用户 prompt 先占 Prime 准入 FIFO 的保证，依赖 beforePrompt() 与 session.prompt()
 * 之间没有任何 await（否则停住的 child 通知可能先开轮）。适配器级行为测试要拉起整套会话，
 * ponytail: 这里只做源码守卫——beforePrompt() 的下一条语句必须就是 `await session.prompt(`。
 */
function beforePromptSitesAreSynchronous(source: string): boolean[] {
  const sites = [...source.matchAll(/idleChildNotice\?\.beforePrompt\(\)\s*\n([^\n]*)/g)]
  return sites.map((site) => /^\s*await session\.prompt\(/.test(site[1] ?? ''))
}

describe('beforePrompt 与 session.prompt 同一同步段（审查 MEDIUM 10）', () => {
  const adapter = readFileSync(join(import.meta.dir, 'pi-agent-adapter.ts'), 'utf8')

  test('适配器里唯一的 beforePrompt() 紧接着 await session.prompt(…)', () => {
    expect(beforePromptSitesAreSynchronous(adapter)).toEqual([true])
  })

  test('守卫自检：在两者之间插入 await 会被抓到', () => {
    const broken = adapter.replace(
      /(idleChildNotice\?\.beforePrompt\(\)\s*\n)/,
      '$1              await Promise.resolve()\n',
    )
    expect(broken).not.toBe(adapter)
    expect(beforePromptSitesAreSynchronous(broken)).toEqual([false])
  })
})
