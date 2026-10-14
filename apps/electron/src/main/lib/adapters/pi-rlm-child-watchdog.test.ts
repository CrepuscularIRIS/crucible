import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installRlmChildWatchdog } from './pi-rlm-child-watchdog'

const LIMIT = 60_000

function fakeSession() {
  let listener: ((event: unknown) => void) | undefined
  const cancelled: Array<{ id: string; reason?: string }> = []
  const session = {
    subscribe(fn: (event: unknown) => void) { listener = fn; return () => { listener = undefined } },
    cancelRlmChildRun(id: string, reason?: string) { cancelled.push({ id, reason }); return true },
  }
  const child = (id: string, status: string, label = 'p') =>
    listener?.({ type: 'rlm_child_update', child: { id, status, sessionName: `n-${id}`, label } })
  return { session, cancelled, child }
}

describe('rlm child 宿主 watchdog', () => {
  let run: string
  beforeEach(() => {
    jest.useFakeTimers()
    run = mkdtempSync(join(tmpdir(), 'wd-'))
  })
  afterEach(() => {
    jest.useRealTimers()
    rmSync(run, { recursive: true, force: true })
  })

  test('超过墙钟上限 → cancelRlmChildRun + failures.jsonl 一行 timeout', () => {
    const job = join(run, '.rlm-jobs', 'r1', 'certify', 'C2', '7f3a')
    mkdirSync(job, { recursive: true })
    const { session, cancelled, child } = fakeSession()
    installRlmChildWatchdog(session as never, { limitMs: LIMIT })

    child('c1', 'queued', `读 ${job}/brief.md 并逐字执行；写 ${job}/out.md，末行写 STATUS 行`)
    child('c1', 'running')
    jest.advanceTimersByTime(LIMIT - 1)
    expect(cancelled).toEqual([])
    jest.advanceTimersByTime(1)
    expect(cancelled.map((c) => c.id)).toEqual(['c1'])
    expect(cancelled[0]!.reason).toContain('watchdog')

    const lines = readFileSync(join(run, '.rlm-jobs', 'r1', 'failures.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const record = JSON.parse(lines[0]!)
    expect(record).toMatchObject({ kind: 'timeout', source: 'host-watchdog', job: '.rlm-jobs/r1/certify/C2/7f3a', name: 'n-c1', cancelled: true })
    expect(record.ts).toBeTruthy()
  })

  test('上限内结束的 child 不被取消；prompt 里没有 job 目录时只取消不写文件', () => {
    const { session, cancelled, child } = fakeSession()
    const dispose = installRlmChildWatchdog(session as never, { limitMs: LIMIT })
    child('ok', 'queued')
    child('ok', 'done')
    child('free', 'running', 'no job dir here')
    jest.advanceTimersByTime(LIMIT)
    expect(cancelled.map((c) => c.id)).toEqual(['free'])
    expect(existsSync(join(run, '.rlm-jobs'))).toBe(false)

    child('late', 'queued')
    dispose()
    jest.advanceTimersByTime(LIMIT)
    expect(cancelled.map((c) => c.id)).toEqual(['free'])
  })
})
