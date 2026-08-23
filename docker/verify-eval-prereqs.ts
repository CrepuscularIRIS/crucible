import { spawnSync } from 'node:child_process'

interface DockerInspect {
  State?: { Health?: { Status?: string } }
  Config?: { Env?: string[] }
  HostConfig?: {
    CapAdd?: string[]
    SecurityOpt?: string[]
  }
  Mounts?: Array<{
    Source?: string
    Destination?: string
    RW?: boolean
  }>
}

function fail(message: string): never {
  throw new Error(`[Docker eval 前置验收] ${message}`)
}

function runDocker(args: string[]): string {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) fail(result.stderr || result.stdout || `docker ${args.join(' ')} 失败`)
  return result.stdout.trim()
}

const container = process.env.PROMA_VERIFY_CONTAINER ?? 'proma'
const inspected = JSON.parse(runDocker(['inspect', container])) as DockerInspect[]
const state = inspected[0]
if (!state) fail(`找不到容器 ${container}`)
if (state.State?.Health?.Status !== 'healthy') fail(`容器不健康: ${state.State?.Health?.Status ?? 'unknown'}`)

const capabilities = new Set(state.HostConfig?.CapAdd ?? [])
if (!capabilities.has('CAP_SYS_ADMIN') || !capabilities.has('CAP_NET_ADMIN')) {
  fail('缺少 bubblewrap 所需 CAP_SYS_ADMIN/CAP_NET_ADMIN')
}
const securityOptions = new Set(state.HostConfig?.SecurityOpt ?? [])
if (!securityOptions.has('seccomp:unconfined') || !securityOptions.has('apparmor:unconfined')) {
  fail('seccomp/AppArmor 未按 eval 覆盖层解除')
}

const benchmarkMount = state.Mounts?.find((mount) => mount.Destination === '/bench/neuronbench')
if (!benchmarkMount || benchmarkMount.RW !== false) fail('benchmark 未以只读方式挂载')
if (!benchmarkMount.Source?.startsWith('/')) fail('benchmark 宿主路径不是绝对路径')

const imageEnv = new Set(state.Config?.Env ?? [])
if (![...imageEnv].some((item) => item === 'PROMA_RESEARCH_MCP_ENTRY=/crucible/packages/research-mcp/src/server.ts')) {
  fail('镜像缺少受管 Research MCP 入口')
}

const smokeOutput = runDocker([
  'exec',
  '-w', '/crucible/apps/electron',
  container,
  'bun', 'scripts/docker-eval-prereq-smoke.ts',
])
console.log(`[Docker eval 前置验收] 通过 ${container}: ${smokeOutput}`)
