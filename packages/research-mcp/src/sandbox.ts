/**
 * probe_run 的执行沙箱（P3.1，红线修复）。
 *
 * 契约（与 research/skills/research-probe 的"命令纪律"一一对应）：
 * - `--clearenv` 后只给 PATH / HOME=/tmp / LANG——探针看不到宿主环境变量（含密钥）；
 * - `--ro-bind / /` 只读根——工作区、journal、register 对探针只读；
 * - `--tmpfs /tmp` 唯一可写位置——中间文件只能写这里，结果走 stdout；
 * - `--unshare-net` 断网——与"无网络依赖"的命令纪律一致；
 * - `--unshare-pid --die-with-parent`——探针进程不逃逸、不遗留；
 * - 超时按非零退出处理，不予落地。
 *
 * fail closed：找不到 bwrap（或非 Linux）时 probe_run 结构性拒绝并给安装引导，
 * **绝不回落裸宿主执行**——回落等于把"预登记冻结"降级成一句提示。
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { delimiter as pathDelimiter, resolve, sep } from 'node:path'

export interface SandboxSupply {
  available: boolean
  /** available 时为 bwrap 路径；不可用时为面向用户的引导说明。 */
  detail: string
}

export interface SandboxedEvalResult {
  /** 合并后的 stdout+stderr（server 在沙箱外捕获，探针自己不写 raw） */
  text: string
  exitCode: number
  timedOut: boolean
  /** 沙箱见证：写进 provenance，让审阅者读产物即可判断探针确实在隔离环境里跑过 */
  attestation: SandboxAttestation
}

/**
 * 沙箱见证。模板 P9 要求"原始结果如何保存并与模型生成内容区分"，且
 * "应让评审能够判断作品确实完成了相应实验……而不是仅展示预制结果"——
 * 没有这条记录，审阅者读 provenance 分不出沙箱执行与宿主执行。
 */
export interface SandboxAttestation {
  engine: 'bubblewrap'
  /** 实际用于 spawn 的 bwrap 可执行文件路径 */
  binary: string
  /** 传给 bwrap 的隔离参数原样记录（不含被执行的命令本身） */
  isolation: readonly string[]
}

export const PROBE_EVAL_TIMEOUT_MS = 10 * 60_000

let cachedSupply: SandboxSupply | undefined

/** 检测 bwrap 供给（进程内记忆化；PROMA_RESEARCH_BWRAP 可显式指定路径）。 */
export function detectSandboxSupply(): SandboxSupply {
  if (cachedSupply) return cachedSupply
  if (process.platform !== 'linux') {
    cachedSupply = {
      available: false,
      detail: `probe 沙箱仅支持 Linux（bubblewrap）；当前平台 ${process.platform}，probe_run 结构性拒绝`,
    }
    return cachedSupply
  }
  const explicit = process.env.PROMA_RESEARCH_BWRAP
  if (explicit) {
    if (existsSync(explicit)) {
      cachedSupply = { available: true, detail: explicit }
      return cachedSupply
    }
    cachedSupply = { available: false, detail: `PROMA_RESEARCH_BWRAP 指向的 ${explicit} 不存在` }
    return cachedSupply
  }
  const version = spawnSync('bwrap', ['--version'], { timeout: 10_000 })
  if (version.status === 0) {
    cachedSupply = { available: true, detail: 'bwrap (PATH)' }
    return cachedSupply
  }
  cachedSupply = {
    available: false,
    detail: '未找到 bwrap。安装后可用：apt install bubblewrap（或设 PROMA_RESEARCH_BWRAP 指向其路径）',
  }
  return cachedSupply
}

/** 仅供测试重置记忆化。 */
export function resetSandboxSupplyCacheForTest(): void {
  cachedSupply = undefined
}

export function requireSandbox(): void {
  const supply = detectSandboxSupply()
  if (!supply.available) {
    throw new Error(`probe 沙箱不可用：${supply.detail}。拒绝在宿主执行探针（fail closed）。`)
  }
}

/**
 * 验证 world meter 的真值 deny 配置。
 *
 * 普通 probe 可以不依赖 benchmark，因此 denyEntries 仍允许空配置；只有注册
 * world_* 时要求显式 deny 覆盖整个 NeuronBench 根，缺失即不注册（fail closed）。
 */
export function resolveResearchDenyRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.PROMA_RESEARCH_DENY
  if (!raw?.trim()) throw new Error('PROMA_RESEARCH_DENY 未配置')
  const roots = raw.split(pathDelimiter).filter((entry) => entry.trim() !== '').map((entry) => resolve(entry))
  if (roots.length === 0) throw new Error('PROMA_RESEARCH_DENY 为空')
  const missing = roots.find((entry) => !existsSync(entry))
  if (missing) throw new Error(`PROMA_RESEARCH_DENY 包含不存在路径: ${missing}`)

  const configuredBenchmarkRoot = env.NEURONBENCH_ROOT?.trim()
  if (!configuredBenchmarkRoot) throw new Error('NEURONBENCH_ROOT 未配置')
  const benchmarkRoot = resolve(configuredBenchmarkRoot)
  if (!existsSync(benchmarkRoot)) throw new Error('NEURONBENCH_ROOT 不存在')
  const coversBenchmark = roots.some((entry) => (
    entry === benchmarkRoot || benchmarkRoot.startsWith(`${entry}${sep}`)
  ))
  if (!coversBenchmark) throw new Error('PROMA_RESEARCH_DENY 未覆盖 NEURONBENCH_ROOT')
  return roots
}

/**
 * PROMA_RESEARCH_DENY 的展开结果（实测校准）：
 * - 文件 → `--ro-bind /dev/null <path>`：沙箱内读该路径得 Permission denied（真值不可达）；
 * - 目录 → `--tmpfs <path>`：整棵子树变空目录（文件 bind 到目录会 Not a directory）。
 * 只展开确实存在的路径——bwrap 对不存在路径会整体失败，静默掉所有探针。
 */
export function denyEntries(): string[] {
  const raw = process.env.PROMA_RESEARCH_DENY
  if (!raw) return []
  const entries: string[] = []
  for (const path of raw.split(pathDelimiter).filter(Boolean)) {
    if (!existsSync(path)) continue
    if (statSync(path).isDirectory()) entries.push('--tmpfs', path)
    else entries.push('--ro-bind', '/dev/null', path)
  }
  return entries
}

/**
 * 在沙箱内执行冻结的 eval 命令。
 * 超时 kill 整个进程组，按非零退出上报（timedOut=true）。
 */
export function runSandboxedEval(
  command: string,
  timeoutMs: number = PROBE_EVAL_TIMEOUT_MS,
): Promise<SandboxedEvalResult> {
  const supply = detectSandboxSupply()
  if (!supply.available) {
    return Promise.reject(new Error(`probe 沙箱不可用：${supply.detail}`))
  }
  // 显式路径供给时必须真的用它执行——PATH 上可能根本没有 bwrap
  const bwrap = process.env.PROMA_RESEARCH_BWRAP ?? 'bwrap'
  const isolation = [
    '--ro-bind', '/', '/',
    '--dev', '/dev',
    '--proc', '/proc',
    '--tmpfs', '/tmp',
    '--unshare-net',
    '--unshare-pid',
    '--die-with-parent',
    '--clearenv',
    '--setenv', 'PATH', '/usr/local/bin:/usr/bin:/bin',
    '--setenv', 'HOME', '/tmp',
    '--setenv', 'LANG', 'C.UTF-8',
    // EVAL-PLAN §1.3：把评测真值源挡在探针之外——`--ro-bind /dev/null <path>`
    // 使该路径可打开但内容为空（import 即失败、cat 为空）。路径表来自
    // PROMA_RESEARCH_DENY（os 路径分隔符分隔），由评测接线注入（如 neuronbench 源码树）。
    ...denyEntries(),
  ]
  const attestation: SandboxAttestation = { engine: 'bubblewrap', binary: bwrap, isolation }
  return new Promise((resolve) => {
    let text = ''
    let timedOut = false
    const child = spawn(bwrap, [...isolation, '/bin/sh', '-c', command])
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { text += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { text += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ text: `${text}\n${String(error)}`, exitCode: -1, timedOut, attestation })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ text, exitCode: timedOut ? 124 : (code ?? -1), timedOut, attestation })
    })
  })
}
