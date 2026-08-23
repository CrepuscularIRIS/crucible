import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const baseCompose = readFileSync(resolve(repoRoot, 'docker-compose.yml'), 'utf-8')
const evalCompose = readFileSync(resolve(repoRoot, 'docker-compose.eval.yml'), 'utf-8')
const dockerfile = readFileSync(resolve(repoRoot, 'docker/Dockerfile'), 'utf-8')

interface CanonicalComposeService {
  cap_add?: string[]
  security_opt?: string[]
  environment?: Record<string, string>
  volumes?: Array<{
    type?: string
    source?: string
    target?: string
    read_only?: boolean
  }>
}

interface CanonicalCompose {
  services?: Record<string, CanonicalComposeService>
}

function dockerComposeAvailable(): boolean {
  return spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0
}

function renderCanonicalCompose(): CanonicalCompose {
  // Snap 版 Docker CLI 无法读取系统 /tmp；临时 compose 工程放在仓库内并立即清理。
  const projectDir = mkdtempSync(resolve(repoRoot, '.compose-eval-test-'))
  try {
    copyFileSync(resolve(repoRoot, 'docker-compose.yml'), resolve(projectDir, 'docker-compose.yml'))
    copyFileSync(resolve(repoRoot, 'docker-compose.eval.yml'), resolve(projectDir, 'docker-compose.eval.yml'))
    writeFileSync(resolve(projectDir, '.env'), 'DASHSCOPE_API_KEY=compose-test\n')
    const result = spawnSync('docker', [
      'compose',
      '--project-directory', projectDir,
      '-f', resolve(projectDir, 'docker-compose.yml'),
      '-f', resolve(projectDir, 'docker-compose.eval.yml'),
      'config',
      '--format', 'json',
    ], {
      cwd: projectDir,
      env: {
        ...process.env,
        NEURONBENCH_HOST_ROOT: repoRoot,
        PROMA_RESEARCH_RUN: 'compose-contract-test',
      },
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'docker compose config 失败')
    }
    return JSON.parse(result.stdout) as CanonicalCompose
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
}

describe('Docker Research eval 覆盖层', () => {
  it('默认部署继续只发布回环端口，且不授予沙箱扩权能力', () => {
    expect(baseCompose).toContain('127.0.0.1:5173:5173')
    expect(baseCompose).toContain('127.0.0.1:5174:5174')
    expect(baseCompose).not.toContain('SYS_ADMIN')
    expect(baseCompose).not.toContain('seccomp:unconfined')
  })

  it('eval 覆盖层只读挂载 benchmark，并显式注入 fail-closed 路径', () => {
    expect(evalCompose).toContain('${NEURONBENCH_HOST_ROOT:?')
    expect(evalCompose).toContain(':/bench/neuronbench:ro')
    expect(evalCompose).toContain('NEURONBENCH_ROOT: "/bench/neuronbench"')
    expect(evalCompose).toContain('PROMA_RESEARCH_DENY: "/bench/neuronbench"')
    expect(evalCompose).toContain('PROMA_RESEARCH_RUN: "${PROMA_RESEARCH_RUN:?')
  })

  it('只有 eval 覆盖层开放 bubblewrap 所需能力', () => {
    expect(evalCompose).toContain('seccomp:unconfined')
    expect(evalCompose).toContain('apparmor:unconfined')
    expect(evalCompose).toContain('SYS_ADMIN')
    expect(evalCompose).toContain('NET_ADMIN')
  })

  it('产品镜像默认提供受管 Research MCP 入口，不依赖宿主机源码路径', () => {
    expect(dockerfile).toContain(
      'PROMA_RESEARCH_MCP_ENTRY=/crucible/packages/research-mcp/src/server.ts',
    )
    expect(dockerfile).not.toContain('/home/lingxufeng')
  })

  it.skipIf(!dockerComposeAvailable())('canonical config 保留只读挂载与完整 sandbox 能力', () => {
    const service = renderCanonicalCompose().services?.proma
    expect(service?.cap_add).toEqual(expect.arrayContaining(['SYS_ADMIN', 'NET_ADMIN']))
    expect(service?.security_opt).toEqual(expect.arrayContaining([
      'seccomp:unconfined',
      'apparmor:unconfined',
    ]))
    expect(service?.environment).toMatchObject({
      NEURONBENCH_ROOT: '/bench/neuronbench',
      PROMA_RESEARCH_DENY: '/bench/neuronbench',
      PROMA_RESEARCH_RUN: 'compose-contract-test',
    })
    const benchmarkMount = service?.volumes?.find((volume) => volume.target === '/bench/neuronbench')
    expect(benchmarkMount).toMatchObject({
      type: 'bind',
      read_only: true,
    })
    expect(benchmarkMount?.source?.startsWith('/')).toBe(true)
  })
})
