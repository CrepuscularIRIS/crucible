import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import {
  buildResearchIsolationConfig,
  classifyResearchToolCall,
} from '../src/main/lib/research-isolation-guard'
import {
  createResearchIsolationExtension,
  type ResearchIsolationObserver,
} from '../src/main/lib/adapters/pi-research-isolation-extension'
import {
  createResearchRefineRuntime,
  installResearchRefineToolTap,
  researchRefineArtifactDir,
} from '../src/main/lib/adapters/pi-research-refine-runtime'
import type { ResearchRefineMode } from '../src/main/lib/adapters/pi-research-refine-types'

export interface ResearchMcpEnvInput {
  baseEnv: NodeJS.ProcessEnv
  cwd: string
  run: string
  neuronbenchRoot: string
}

export interface ResearchArchiveEntry {
  source: string
  /** archiveDir 内的相对目标。 */
  target: string
  required: boolean
}

export interface ResearchDisposableSession {
  disposeAsync(): Promise<void>
}

export interface DisposeAndArchiveInput {
  session: ResearchDisposableSession
  /** dispose 前的收尾钩子（research refine promotion 等 C5 checkpoint）。 */
  beforeDispose?: () => Promise<void>
  archiveDir: string
  entries: ResearchArchiveEntry[]
}

export interface ResearchIpythonPermissionInput {
  input: Record<string, unknown>
}

export type ResearchIpythonPermissionResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string }

export function buildResearchMcpEnv(input: ResearchMcpEnvInput): NodeJS.ProcessEnv {
  return {
    ...input.baseEnv,
    PROMA_RESEARCH_CWD: input.cwd,
    PROMA_RESEARCH_RUN: input.run,
    PROMA_RESEARCH_DENY: input.neuronbenchRoot,
    NEURONBENCH_ROOT: input.neuronbenchRoot,
  }
}

export function requireEnvironmentSecret(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`缺少 ${name}；请由操作者显式注入进程环境，脚本不会读取 .env 文件`)
  return value
}

/** 无头评测的确定性父会话策略；liveness 仍负责检出变体与实际泄漏。 */
export async function authorizeResearchIpython(
  request: ResearchIpythonPermissionInput,
): Promise<ResearchIpythonPermissionResult> {
  const decision = classifyResearchToolCall(
    'ipython',
    request.input,
    buildResearchIsolationConfig([], process.cwd()),
  )
  if (decision) {
    return {
      behavior: 'deny',
      message: decision.reason,
    }
  }
  return { behavior: 'allow', updatedInput: request.input }
}

/** 为一场无头战役绑定真实 benchmark/cwd；父会话权限与 RLM 扩展使用同一边界。 */
export function createResearchIpythonAuthorizer(
  neuronbenchRoot: string,
  cwd: string,
): (request: ResearchIpythonPermissionInput) => Promise<ResearchIpythonPermissionResult> {
  const config = buildResearchIsolationConfig([neuronbenchRoot], cwd)
  return async (request) => {
    const decision = classifyResearchToolCall('ipython', request.input, config)
    if (decision) return { behavior: 'deny', message: decision.reason }
    return { behavior: 'allow', updatedInput: request.input }
  }
}

/**
 * 供 resourceLoaderOptions.extensionFactories 挂载：扩展经共享 ResourceLoader
 * 同时进入父会话与 rlm 子会话的 execution-before hook。只包父会话的
 * installSessionIpythonPermission 覆盖不到子会话——缺了这一挂载，无头脚本里
 * 子代理的 bash/ipython 不受任何隔离约束。
 */
export function researchIsolationExtension(
  neuronbenchRoot: string,
  cwd: string,
  observer?: ResearchIsolationObserver,
): ReturnType<typeof createResearchIsolationExtension> {
  return createResearchIsolationExtension(buildResearchIsolationConfig([neuronbenchRoot], cwd), observer)
}

export interface HeadlessResearchRefine {
  readonly mode: ResearchRefineMode
  /** learning 时传给 createAgentSessionFromServices 的 serializedRefine。 */
  serializedRefine: boolean
  /** ResourceLoader 创建前传给隔离扩展，保证父/RLM child 的 guard 结果进入 C1。 */
  isolationObserver?: ResearchIsolationObserver
  /** 会话创建后调用：装 reviewer（经私有字段，见注释）、tool tap、refine 事件订阅。 */
  install(
    session: {
      sessionId: string
      subscribe(listener: (event: { type: string; result?: { id: string; rollbackOf?: string; scope?: 'local' | 'global'; appliedEdits?: unknown[] } }) => void): unknown
      agent: { afterToolCall?: unknown }
      refine(options?: { instructions?: string; rollbackId?: string; global?: boolean }): Promise<unknown>
    },
  ): void
  /** 传给 disposeAndArchiveResearchSession 的 beforeDispose（C5 promotion）。 */
  beforeDispose?(): Promise<void>
  /** 归档 entries 追加项（learning 时 refine 证据进 bundle）。 */
  archiveEntries(): Array<{ source: string; target: string; required: boolean }>
}

/**
 * 无头战役脚本的 research refine 装配（审计 F2：C5 此前零调用方）。
 *
 * 臂选择：环境变量 RESEARCH_REFINE（off/frozen/learning），缺省 off——历史
 * evidence 脚本行为不变；E-refine runner 显式设 learning。
 *
 * ponytail: reviewer 经私有字段 `_autoRefineReviewer` 注入——
 * createAgentSessionFromServices 未暴露该选项。升级路径：Prime 公开
 * post-creation setter 后改走公开 API。frozen 臂的 global 快照由 harness
 * 目录本身承载，不装 runtime。
 */
export function createHeadlessResearchRefine(input: {
  mode?: ResearchRefineMode
  run?: string
  /** 战役目录（session-artifacts 的父目录）。 */
  campaignDir: string
}): HeadlessResearchRefine {
  const requestedMode = input.mode ?? process.env.RESEARCH_REFINE ?? 'off'
  if (requestedMode !== 'off' && requestedMode !== 'frozen' && requestedMode !== 'learning') {
    throw new Error(`RESEARCH_REFINE 必须是 off/frozen/learning，收到: ${requestedMode}`)
  }
  const mode: ResearchRefineMode = requestedMode
  if (mode !== 'learning') {
    return { mode, serializedRefine: false, install: () => {}, archiveEntries: () => [] }
  }
  let sessionId: string | undefined
  let refineTarget: Parameters<NonNullable<ReturnType<typeof createResearchRefineRuntime>['beforeDispose']>>[0] | undefined
  const runtime = createResearchRefineRuntime({
    mode: 'learning',
    run: input.run,
    artifactDir: () => {
      if (!sessionId) throw new Error('research refine 会话尚未安装')
      return researchRefineArtifactDir(join(input.campaignDir, 'session-artifacts'), sessionId)
    },
  })
  const recordGuardOutcome = (
    outcome: Parameters<NonNullable<typeof runtime.onToolOutcome>>[0],
  ): void => {
    if (!runtime.onToolOutcome || !refineTarget) {
      console.error('[research-refine] guard outcome 早于会话安装，已拒绝静默丢弃')
      return
    }
    void runtime.onToolOutcome(outcome, refineTarget)
      .catch((error) => console.error('[research-refine] guard 结算失败:', error))
  }
  const isolationObserver: ResearchIsolationObserver = {
    onDenied: (tool, reason) => recordGuardOutcome({
      kind: 'residual', source: 'guard', tool, ruleId: 'isolation-guard', messageExcerpt: reason,
    }),
    onAllowed: (tool) => recordGuardOutcome({ kind: 'success', source: 'guard', tool }),
  }
  return {
    mode,
    serializedRefine: true,
    isolationObserver,
    install(session: Parameters<HeadlessResearchRefine['install']>[0]) {
      sessionId = session.sessionId
      refineTarget = session as never
      // cast 注入 reviewer（见函数注释）
      ;(session as unknown as Record<string, unknown>)._autoRefineReviewer = runtime.autoRefineReviewer
      installResearchRefineToolTap(session.agent, runtime, session as never)
      session.subscribe((event) => {
        if (event.type === 'refine_failed') {
          runtime.onRefineFailed?.()
          console.warn('[research-refine] refine 失败事件')
          return
        }
        if (!runtime.onRefineComplete || event.type !== 'refine_complete' || event.result?.rollbackOf) return
        void runtime.onRefineComplete(
          {
            id: event.result?.id ?? '',
            appliedEdits: (event.result?.appliedEdits ?? []) as Parameters<typeof runtime.onRefineComplete>[0]['appliedEdits'],
            scope: event.result?.scope,
          },
          session as never,
        ).catch((error) => console.error('[research-refine] 结算失败:', error))
      })
    },
    async beforeDispose() {
      if (runtime.beforeDispose && refineTarget) await runtime.beforeDispose(refineTarget)
    },
    archiveEntries() {
      return sessionId && runtime.archiveSource
        ? [{ source: runtime.archiveSource, target: 'research-refine', required: false }]
        : []
    },
  }
}

function archiveTarget(archiveDir: string, target: string): string {
  const normalized = normalize(target)
  if (!normalized || normalized === '.' || isAbsolute(normalized) || normalized.startsWith('..')) {
    throw new Error(`归档目标必须是 archiveDir 内的相对路径: ${target}`)
  }
  return join(archiveDir, normalized)
}

function pathsOverlap(a: string, b: string): boolean {
  const rel = relative(a, b)
  return rel === '' || (!!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function resolveGuardedRealPath(path: string): string {
  const resolved = resolve(path)
  let existing = resolved
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) return resolved
    existing = parent
  }
  const realExisting = realpathSync(existing)
  const tail = relative(existing, resolved)
  return tail ? resolve(realExisting, tail) : realExisting
}

/** 归档与任一来源重叠会导致递归复制或替换时删除 live evidence，必须先拒绝。 */
export function assertResearchArchiveLayout(
  archiveDir: string,
  entries: ResearchArchiveEntry[],
): void {
  const archive = resolveGuardedRealPath(archiveDir)
  for (const entry of entries) {
    const source = resolveGuardedRealPath(entry.source)
    if (pathsOverlap(source, archive) || pathsOverlap(archive, source)) {
      throw new Error(`归档目录与证据来源重叠: source=${source}, archive=${archive}`)
    }
  }
}

/** 等 Prime 排空 refine/kernel 后再归档；完整 staging 成功后才替换旧证据集。 */
export async function disposeAndArchiveResearchSession(
  input: DisposeAndArchiveInput,
): Promise<void> {
  // C5 promotion 必须在 dispose 之前：dispose 后 local harness 已随会话销毁，
  // 未 promote 的 refinement 由 dispose 本身隔离（plan §5 EXPIRED = 无代码检疫）。
  await input.beforeDispose?.()
  await input.session.disposeAsync()
  assertResearchArchiveLayout(input.archiveDir, input.entries)
  for (const entry of input.entries) {
    archiveTarget(input.archiveDir, entry.target)
    if (entry.required && !existsSync(entry.source)) {
      throw new Error(`必需证据缺失: ${entry.source}`)
    }
  }
  const parent = dirname(input.archiveDir)
  const name = basename(input.archiveDir)
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(join(parent, `.${name}-staging-`))
  let previous: string | undefined
  let preserveStaging = false
  try {
    for (const entry of input.entries) {
      if (!existsSync(entry.source)) continue
      cpSync(entry.source, archiveTarget(staging, entry.target), { recursive: true, dereference: true })
    }
    if (existsSync(input.archiveDir)) {
      previous = join(parent, `.${name}-previous-${process.pid}-${Date.now()}`)
      renameSync(input.archiveDir, previous)
    }
    try {
      renameSync(staging, input.archiveDir)
    } catch (error) {
      if (previous && existsSync(previous)) {
        try {
          renameSync(previous, input.archiveDir)
        } catch (restoreError) {
          preserveStaging = true
          throw new Error(
            `归档切换和旧证据恢复均失败；新证据保留在 ${staging}，旧证据保留在 ${previous}`,
            { cause: restoreError },
          )
        }
      }
      throw error
    }
    if (previous) rmSync(previous, { recursive: true, force: true })
  } catch (error) {
    if (!preserveStaging && existsSync(staging)) rmSync(staging, { recursive: true, force: true })
    throw error
  }
}
