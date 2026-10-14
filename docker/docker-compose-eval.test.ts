import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const baseCompose = readFileSync(resolve(repoRoot, 'docker-compose.yml'), 'utf-8')
const evalCompose = readFileSync(resolve(repoRoot, 'docker-compose.eval.yml'), 'utf-8')
const dockerfile = readFileSync(resolve(repoRoot, 'docker/Dockerfile'), 'utf-8')
const dockerignore = readFileSync(resolve(repoRoot, '.dockerignore'), 'utf-8')
const entrypoint = readFileSync(resolve(repoRoot, 'docker/entrypoint.sh'), 'utf-8')

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

/** .dockerignore 一行 → 正则（moby patternmatcher 语义：`*` 不跨 /，`**` 跨任意层，模式从上下文根算起）。 */
function dockerignoreRegex(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!
    if (c === '*' && pattern[i + 1] === '*') {
      i++
      if (pattern[i + 1] === '/') { i++; re += '(?:.*/)?' } else re += '.*'
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

const ignoreRules = dockerignore.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
  const negate = l.startsWith('!')
  return { negate, re: dockerignoreRegex(l.slice(negate ? 1 : 0).replace(/^\/+|\/+$/g, '')) }
})

/** 与 docker 一致：路径本身或任一祖先目录命中即算命中，最后一条命中的规则说了算。 */
function ignored(rel: string): boolean {
  const parts = rel.split('/')
  const candidates = parts.map((_, i) => parts.slice(0, i + 1).join('/'))
  let out = false
  for (const rule of ignoreRules) if (candidates.some((c) => rule.re.test(c))) out = !rule.negate
  return out
}

/** 构建上下文里会被 `COPY . .` 带进镜像的文件（被排除的目录整棵剪掉）。 */
function buildContextFiles(dir = repoRoot, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const rel = relative(repoRoot, abs)
    if (ignored(rel)) continue
    const st = statSync(abs, { throwIfNoEntry: false })
    if (st?.isDirectory()) buildContextFiles(abs, out)
    else if (st?.isFile()) out.push(rel)
  }
  return out
}

/** 真相口令：从归档 annotations.json 的 case.truth.text 现取（按标点切段、去空白），测试里不写字面量。 */
function truthTokens(): string[] {
  const campaigns = resolve(repoRoot, 'research/campaigns')
  const tokens = new Set<string>()
  for (const run of readdirSync(campaigns)) {
    const file = join(campaigns, run, 'annotations.json')
    const text = (() => { try { return readFileSync(file, 'utf-8') } catch { return undefined } })()
    if (text === undefined) continue
    const parsed = JSON.parse(text) as { case?: { truth?: { text?: string; markers?: string[] } } }
    const truth = parsed.case?.truth?.text ?? ''
    // 改写式泄漏（真相机制名加后缀）整段匹配抓不到；markers 是短标记，读自归档而非字面量。
    for (const marker of parsed.case?.truth?.markers ?? []) tokens.add(marker.replace(/\s+/g, ''))
    for (const part of truth.split(/[，：；。（）()、,:;]+/)) {
      const token = part.replace(/\s+/g, '')
      if (token.length >= 4) tokens.add(token)
    }
  }
  return [...tokens]
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
    expect(baseCompose).toContain('"127.0.0.1:${PROMA_WEB_PORT:-5173}:5173"')
    expect(baseCompose).toContain('"127.0.0.1:${PROMA_BRIDGE_PORT:-5174}:5174"')
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

  it('Prime 使用 Node/npm 独立构建，并在 Bun 安装前带着 dist 进入最终镜像', () => {
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS prime-builder')
    expect(dockerfile).toContain('npm ci --ignore-scripts')
    expect(dockerfile).toContain('npm run build')
    expect(dockerfile).toContain('COPY --from=prime-builder /oss/prime-agent /oss/prime-agent')
    expect(dockerfile.indexOf('COPY --from=prime-builder')).toBeLessThan(
      dockerfile.indexOf('bun install --frozen-lockfile'),
    )
  })

  it('镜像构建和每次启动都真实加载 Prime 与 zeromq，不再用 Web health 代替后端验收', () => {
    expect(dockerfile).toContain('Prime runtime import smoke: ok')
    expect(dockerfile).toContain('import("@earendil-works/pi-coding-agent")')
    expect(dockerfile).toContain('node_modules/.bun/node_modules/zeromq')
    expect(entrypoint).toContain('Prime + zeromq 运行时自检通过')
    expect(entrypoint).toContain('Prime/Electron 运行时产物不完整，拒绝启动')
  })

  it('产品镜像不打包比赛原始材料，提交模板只留在宿主仓库', () => {
    expect(dockerignore.split(/\r?\n/)).toContain('Race')
  })

  it('带真相的宿主产物（答辩页、历史评测轨迹、标注归档）不进构建上下文', () => {
    for (const path of ['deploy/defense/index.html', 'deploy/defense/report/s0.html', 'research/arft/runs', 'research/campaigns', 'mindset']) {
      expect(ignored(path)).toBe(true)
    }
    expect(ignored('apps/electron/dist/renderer/main.js')).toBe(true)
    expect(ignored('.env.example')).toBe(false)
    expect(ignored('packages/research-mcp/src/server.ts')).toBe(false)
  })

  it('构建上下文里没有任何文件含 annotations 真相口令（agent 在容器里 grep 不到真相）', () => {
    const tokens = truthTokens()
    expect(tokens.length).toBeGreaterThan(0)
    const leaks: string[] = []
    for (const rel of buildContextFiles()) {
      const st = statSync(join(repoRoot, rel))
      if (st.size > 20_000_000) continue
      const text = readFileSync(join(repoRoot, rel), 'utf-8').replace(/\s+/g, '')
      for (const token of tokens) if (text.includes(token)) leaks.push(`${rel}: ${token}`)
    }
    expect(leaks).toEqual([])
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
