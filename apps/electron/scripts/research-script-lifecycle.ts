import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import {
  buildResearchIsolationConfig,
  classifyResearchToolCall,
} from '../src/main/lib/research-isolation-guard'
import { createResearchIsolationExtension } from '../src/main/lib/adapters/pi-research-isolation-extension'

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
): ReturnType<typeof createResearchIsolationExtension> {
  return createResearchIsolationExtension(buildResearchIsolationConfig([neuronbenchRoot], cwd))
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
