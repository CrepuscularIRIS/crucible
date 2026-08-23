import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'

interface LifecycleModule {
  buildResearchMcpEnv(input: {
    baseEnv: NodeJS.ProcessEnv
    cwd: string
    run: string
    neuronbenchRoot: string
  }): NodeJS.ProcessEnv
  disposeAndArchiveResearchSession(input: {
    session: { disposeAsync(): Promise<void> }
    archiveDir: string
    entries: Array<{ source: string; target: string; required: boolean }>
  }): Promise<void>
  authorizeResearchIpython(input: {
    input: Record<string, unknown>
  }): Promise<
    | { behavior: 'allow'; updatedInput: Record<string, unknown> }
    | { behavior: 'deny'; message: string }
  >
  requireEnvironmentSecret(env: NodeJS.ProcessEnv, name: string): string
  createResearchIpythonAuthorizer(neuronbenchRoot: string, cwd: string): (input: {
    input: Record<string, unknown>
  }) => Promise<
    | { behavior: 'allow'; updatedInput: Record<string, unknown> }
    | { behavior: 'deny'; message: string }
  >
  assertResearchArchiveLayout(
    archiveDir: string,
    entries: Array<{ source: string; target: string; required: boolean }>,
  ): void
  researchIsolationExtension(neuronbenchRoot: string, cwd: string): (pi: {
    on(
      event: string,
      handler: (event: { toolName: string; input: Record<string, unknown> }) => unknown,
    ): void
  }) => void
}

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function loadLifecycle(): Promise<LifecycleModule | null> {
  try {
    return await import('./research-script-lifecycle') as LifecycleModule
  } catch (error) {
    if (error instanceof Error && /Cannot find module|ModuleNotFound/.test(error.message)) return null
    throw error
  }
}

describe('研究脚本生命周期', () => {
  it('先等待 disposeAsync 刷盘，再归档必需证据；可选目录缺失不报错', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return

    const root = mkdtempSync(join(tmpdir(), 'proma-script-lifecycle-'))
    tempRoots.push(root)
    const source = join(root, 'session-artifacts')
    const archive = join(root, 'archive')
    let disposed = false
    await lifecycle.disposeAndArchiveResearchSession({
      session: {
        async disposeAsync() {
          await Promise.resolve()
          writeFileSync(join(root, 'snapshot.txt'), 'flushed', 'utf-8')
          disposed = true
        },
      },
      archiveDir: archive,
      entries: [
        { source: join(root, 'snapshot.txt'), target: 'snapshot.txt', required: true },
        { source, target: 'session-artifacts', required: false },
      ],
    })

    expect(disposed).toBe(true)
    expect(readFileSync(join(archive, 'snapshot.txt'), 'utf-8')).toBe('flushed')
    expect(existsSync(join(archive, 'session-artifacts'))).toBe(false)
  })

  it('必需证据缺失时拒绝生成部分归档', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return

    const root = mkdtempSync(join(tmpdir(), 'proma-script-required-'))
    tempRoots.push(root)
    const archive = join(root, 'archive')
    await expect(lifecycle.disposeAndArchiveResearchSession({
      session: { async disposeAsync() {} },
      archiveDir: archive,
      entries: [{ source: join(root, 'missing'), target: 'missing', required: true }],
    })).rejects.toThrow('必需证据缺失')
    expect(existsSync(archive)).toBe(false)
  })

  it('成功归档会替换旧证据集，不保留上一次运行的陈旧文件', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return

    const root = mkdtempSync(join(tmpdir(), 'proma-script-replace-'))
    tempRoots.push(root)
    const source = join(root, 'current')
    const archive = join(root, 'archive')
    mkdirSync(source, { recursive: true })
    mkdirSync(archive, { recursive: true })
    writeFileSync(join(source, 'current.txt'), 'current', 'utf-8')
    writeFileSync(join(archive, 'stale.txt'), 'stale', 'utf-8')

    await lifecycle.disposeAndArchiveResearchSession({
      session: { async disposeAsync() {} },
      archiveDir: archive,
      entries: [{ source, target: 'runtime', required: true }],
    })

    expect(readFileSync(join(archive, 'runtime', 'current.txt'), 'utf-8')).toBe('current')
    expect(existsSync(join(archive, 'stale.txt'))).toBe(false)
  })

  it('MCP 环境同时固定 cwd、run、deny 与 benchmark 根', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return

    expect(lifecycle.buildResearchMcpEnv({
      baseEnv: { KEEP_ME: 'yes' },
      cwd: '/campaign/project',
      run: 'fixed-run',
      neuronbenchRoot: '/bench/neuronbench',
    })).toMatchObject({
      KEEP_ME: 'yes',
      PROMA_RESEARCH_CWD: '/campaign/project',
      PROMA_RESEARCH_RUN: 'fixed-run',
      PROMA_RESEARCH_DENY: '/bench/neuronbench',
      NEURONBENCH_ROOT: '/bench/neuronbench',
    })
  })

  it('无头评测的 ipython 策略拒绝 benchmark/meter 直连，普通研究代码可执行', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return
    expect(typeof lifecycle.authorizeResearchIpython).toBe('function')
    if (!lifecycle.authorizeResearchIpython) return

    await expect(lifecycle.authorizeResearchIpython({
      input: { code: 'import neuronbench' },
    })).resolves.toMatchObject({ behavior: 'deny' })
    await expect(lifecycle.authorizeResearchIpython({
      input: { code: '%%bash\npython3 research/eval/world-meter.py forecast' },
    })).resolves.toMatchObject({ behavior: 'deny' })
    await expect(lifecycle.authorizeResearchIpython({
      input: { code: 'result = 6 * 7' },
    })).resolves.toEqual({ behavior: 'allow', updatedInput: { code: 'result = 6 * 7' } })
  })

  it('无头 authorizer 使用真实 renamed denyRoot，而不是只靠 neuronbench 静态词形', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return
    expect(typeof lifecycle.createResearchIpythonAuthorizer).toBe('function')
    if (!lifecycle.createResearchIpythonAuthorizer) return

    const authorize = lifecycle.createResearchIpythonAuthorizer('/bench/hidden-truth', '/campaign/project')
    await expect(authorize({
      input: { code: 'open("/bench/hidden-truth/worlds.py").read()' },
    })).resolves.toMatchObject({ behavior: 'deny' })
    await expect(authorize({ input: { code: 'result = 6 * 7' } })).resolves.toMatchObject({ behavior: 'allow' })
  })

  it.each([
    ['archive 位于 source 内', 'source', 'source/archive'],
    ['以双点开头的真实子目录仍位于 source 内', 'source', 'source/..archive'],
    ['archive 等于 source', 'source', 'source'],
    ['source 位于 archive 内', 'archive/source', 'archive'],
  ] as const)('归档布局预检拒绝目录重叠：%s', async (_label, sourceRel, archiveRel) => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return
    expect(typeof lifecycle.assertResearchArchiveLayout).toBe('function')
    if (!lifecycle.assertResearchArchiveLayout) return

    const root = mkdtempSync(join(tmpdir(), 'proma-script-layout-'))
    tempRoots.push(root)
    expect(() => lifecycle.assertResearchArchiveLayout(join(root, archiveRel), [{
      source: join(root, sourceRel),
      target: 'runtime',
      required: true,
    }])).toThrow('重叠')
  })

  it('归档布局预检解引用 symlink 别名，拒绝真实路径落回 source', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return

    const root = mkdtempSync(join(tmpdir(), 'proma-script-layout-link-'))
    tempRoots.push(root)
    const source = join(root, 'source')
    const alias = join(root, 'source-alias')
    mkdirSync(source)
    symlinkSync(source, alias, 'dir')

    expect(() => lifecycle.assertResearchArchiveLayout(join(alias, 'archive'), [{
      source,
      target: 'runtime',
      required: true,
    }])).toThrow('重叠')
  })

  it('归档解引用 symlink，删除 live target 后证据仍独立可读', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return

    const root = mkdtempSync(join(tmpdir(), 'proma-script-symlink-'))
    tempRoots.push(root)
    const source = join(root, 'source')
    const target = join(root, 'live-target.txt')
    const archive = join(root, 'archive')
    mkdirSync(source)
    writeFileSync(target, 'portable evidence', 'utf-8')
    symlinkSync(target, join(source, 'via-link.txt'))

    await lifecycle.disposeAndArchiveResearchSession({
      session: { async disposeAsync() {} },
      archiveDir: archive,
      entries: [{ source, target: 'runtime', required: true }],
    })
    rmSync(target)
    const archived = join(archive, 'runtime', 'via-link.txt')
    expect(lstatSync(archived).isSymbolicLink()).toBe(false)
    expect(readFileSync(archived, 'utf-8')).toBe('portable evidence')
  })

  it('隔离扩展工厂带真实 denyRoots 注册 tool_call 守卫（父与 rlm 子会话共用）', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return
    expect(typeof lifecycle.researchIsolationExtension).toBe('function')
    if (!lifecycle.researchIsolationExtension) return

    let handler: ((event: { toolName: string; input: Record<string, unknown> }) => unknown) | undefined
    lifecycle.researchIsolationExtension('/bench/neuronbench-renamed', '/campaign/project')({
      on(event, next) {
        expect(event).toBe('tool_call')
        handler = next
      },
    })
    expect(handler).toBeDefined()
    // 真实 denyRoots：即便树名不含静态正则的 'neuronbench' 词形也拦得住
    expect(await handler?.({
      toolName: 'bash',
      input: { command: 'cat /bench/neuronbench-renamed/worlds.py' },
    })).toMatchObject({ block: true })
    expect(await handler?.({
      toolName: 'ipython',
      input: { code: 'values = [1, 2, 3]\nsum(values)' },
    })).toBeUndefined()
  })

  it('模型凭据只从显式进程环境读取，缺失时 fail closed', async () => {
    const lifecycle = await loadLifecycle()
    expect(lifecycle).not.toBeNull()
    if (!lifecycle) return
    expect(typeof lifecycle.requireEnvironmentSecret).toBe('function')
    if (!lifecycle.requireEnvironmentSecret) return
    expect(lifecycle.requireEnvironmentSecret({ DASH_KEY: '  secret  ' }, 'DASH_KEY')).toBe('secret')
    expect(() => lifecycle.requireEnvironmentSecret({}, 'DASH_KEY')).toThrow('DASH_KEY')
  })
})
