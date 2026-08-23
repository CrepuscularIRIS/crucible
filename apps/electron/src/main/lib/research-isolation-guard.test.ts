import { describe, expect, it } from 'bun:test'
import {
  classifyResearchToolCall,
  resolveResearchIsolationConfig,
  type ResearchIsolationConfig,
} from './research-isolation-guard'

const isolation: ResearchIsolationConfig = {
  cwd: '/home/test/project',
  denyRoots: ['/home/test/oss/neuronbench'],
  stateRoots: ['/home/test/project/.proma-research'],
}

describe('研究评测产品路径隔离守卫', () => {
  it('仅在已启用 MCP 显式配置 PROMA_RESEARCH_DENY 时启用', () => {
    expect(resolveResearchIsolationConfig({
      ordinary: { type: 'stdio', env: { TOKEN: 'secret' } },
    }, '/home/test/project')).toBeUndefined()

    expect(resolveResearchIsolationConfig({
      research: {
        type: 'stdio',
        env: {
          PROMA_RESEARCH_DENY: '/home/test/oss/neuronbench',
          PROMA_RESEARCH_CWD: '/home/test/project',
        },
      },
    }, '/home/test/project')).toEqual(isolation)
  })

  it('合并多个 research MCP 的 denyRoots 与 stateRoots，不让最后一个 server 覆盖前者', () => {
    expect(resolveResearchIsolationConfig({
      a: { env: { PROMA_RESEARCH_DENY: '/bench/a', PROMA_RESEARCH_CWD: '/project/a' } },
      b: { env: { PROMA_RESEARCH_DENY: '/bench/b', PROMA_RESEARCH_CWD: '/project/b' } },
    }, '/workspace')).toEqual({
      cwd: '/workspace',
      denyRoots: ['/bench/a', '/bench/b'],
      stateRoots: ['/project/a/.proma-research', '/project/b/.proma-research'],
    })
  })

  it.each([
    ['bash', { command: 'python research/eval/world-meter.py observe z_rebound 0' }],
    ['bash', { command: "python -c 'import neuronbench'" }],
    ['bash', { command: 'cat /home/test/oss/neuronbench/worlds/z_rebound.py' }],
    ['bash', { command: 'kill 262267' }],
    ['bash', { command: 'pkill -f research-mcp' }],
    ['bash', { command: 'rm -rf /home/test/project/.proma-research/eval-run' }],
    ['ipython', { code: 'from neuronbench import World' }],
    ['ipython', { code: '%run research/eval/world-meter.py' }],
    ['ipython', { code: '%%bash\nkill 262267' }],
    ['ipython', { code: "import shutil\nshutil.rmtree('/home/test/project/.proma-research/eval-run')" }],
  ] as const)('在权限模式之外拒绝 %s 的隔离绕过: %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, isolation)).toEqual({
      block: true,
      reason: expect.stringContaining('world_* MCP'),
    })
  })

  it.each([
    ['bash', { command: 'rg -n "research-loop" research/skills' }],
    ['bash', { command: 'echo ok > /tmp/ordinary-output.txt' }],
    ['ipython', { code: 'import research_kit\nresearch_kit.anchor("/home/test/project/.proma-research/eval-run")' }],
    ['ipython', { code: 'values = [1, 2, 3]\nsum(values)' }],
    ['edit', { path: '/home/test/project/notes.md' }],
  ] as const)('允许不触碰真值和研究账本的普通 %s 调用: %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, isolation)).toBeUndefined()
  })

  it.each([
    ['ipython', {
      code: 'import research_kit\ns = research_kit.anchor("/home/test/project/.proma-research/eval-run")\ntitle = "H1".replace("H1", "H2")',
    }],
    ['ipython', {
      code: 'print("/home/test/project/.proma-research/eval-run")\nPath("figures/out.json").write_text("{}")',
    }],
    ['bash', { command: 'mkdir -p figures && ls .proma-research' }],
    ['bash', { command: 'pip install matplotlib && cat .proma-research/eval-run/journal.jsonl' }],
    ['bash', { command: 'sleep 10 & kill $!' }],
    ['bash', { command: 'python train.py & kill %1' }],
    ['ipython', { code: 'p = subprocess.Popen(["sleep", "10"]); p.kill()' }],
    ['bash', { command: 'rg neuronbench' }],
    ['ipython', { code: 'print("do not import neuronbench")' }],
    ['ipython', { code: '# see world-meter.py for protocol names\nvalue = 42' }],
  ] as const)('允许同一次调用里的普通操作，不因无关 research 文本误杀: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, isolation)).toBeUndefined()
  })

  it('按 cwd 解析相对 denyRoot，并使用路径边界避免兄弟目录误杀', () => {
    const config: ResearchIsolationConfig = {
      cwd: '/opt',
      denyRoots: ['/opt/hidden-bench'],
      stateRoots: [],
    }
    expect(classifyResearchToolCall('bash', { command: 'cat hidden-bench/worlds.py' }, config)).toBeDefined()
    expect(classifyResearchToolCall('bash', { command: 'cat ./hidden-bench/worlds.py' }, config)).toBeDefined()
    expect(classifyResearchToolCall('bash', { command: 'cat sub/../hidden-bench/worlds.py' }, config)).toBeDefined()
    expect(classifyResearchToolCall('bash', { command: 'cat /opt/hidden-bench-old/worlds.py' }, config)).toBeUndefined()
  })

  it.each([
    ['bash', { command: 'cd hidden-bench && cat worlds.py' }],
    ['bash', { command: 'command cd hidden-bench && cat worlds.py' }],
    ['bash', { command: '(cd hidden-bench && cat worlds.py)' }],
    ['bash', { command: 'd=hidden-bench; cd "$d"; cat worlds.py' }],
    ['ipython', { code: 'import os\nos.chdir("hidden-bench")\nopen("worlds.py").read()' }],
    ['ipython', { code: 'import os\nos.chdir(r"hidden-bench")\nopen("worlds.py").read()' }],
    ['ipython', { code: 'from pathlib import Path\nos.chdir(Path("hidden-bench"))\nopen("worlds.py").read()' }],
  ] as const)('目录切换不能绕过相对 denyRoot: %s', (toolName, input) => {
    const config: ResearchIsolationConfig = {
      cwd: '/opt',
      denyRoots: ['/opt/hidden-bench'],
      stateRoots: ['/opt/.proma-research'],
    }
    expect(classifyResearchToolCall(toolName, input, config)).toBeDefined()
  })

  it.each([
    ['bash', { command: 'cd .proma-research && rm -rf run' }],
    ['bash', { command: 'command cd .proma-research && rm -rf run' }],
    ['bash', { command: 'd=.proma-research; cd "$d"; rm -rf run' }],
    ['ipython', { code: 'import os, shutil\nos.chdir(".proma-research")\nshutil.rmtree("run")' }],
    ['ipython', { code: 'import os, shutil\nos.chdir(r".proma-research")\nshutil.rmtree("run")' }],
    ['ipython', { code: 'import os, shutil\np=".proma-research"\nos.chdir(p)\nshutil.rmtree("run")' }],
  ] as const)('目录切换后仍禁止改写 Research MCP 状态: %s', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, isolation)).toBeDefined()
  })

  it.each([
    ['ipython', { code: '!python research/eval/world-meter.py --help' }],
    ['ipython', { code: '!pkill -f research-mcp' }],
    ['ipython', { code: '!bash -c "python research/eval/world-meter.py --help"' }],
    ['ipython', { code: '!bash -c "pkill -f research-mcp"' }],
    ['ipython', { code: 'get_ipython().system("python research/eval/world-meter.py --help")' }],
    ['ipython', { code: 'get_ipython().system("pkill -f research-mcp")' }],
    ['ipython', { code: "!py''thon research/eval/world-meter.py --help" }],
    ['ipython', { code: "!k''ill 123" }],
    ['ipython', { code: 'os.killpg(123, 9)' }],
    ['ipython', { code: 'subprocess.run(["pkill", "-f", "research-mcp"])' }],
    ['ipython', { code: 'subprocess.run(["/usr/bin/pkill", "-f", "research-mcp"])' }],
    ['ipython', { code: 'subprocess.run("/usr/bin/pkill -f research-mcp", shell=True)' }],
    ['ipython', { code: 'subprocess.run(["sudo", "pkill", "-f", "research-mcp"])' }],
    ['ipython', { code: 'subprocess.run(["env", "pkill", "-f", "research-mcp"])' }],
    ['ipython', { code: 'subprocess.run(["/usr/bin/env", "/usr/bin/pkill", "-f", "research-mcp"])' }],
    ['ipython', { code: 'subprocess.run("sudo pkill -f research-mcp", shell=True)' }],
    ['ipython', { code: 'subprocess.run(["env", "-i", "pkill", "-f", "research-mcp"])' }],
    ['ipython', { code: 'subprocess.run(["/usr/bin/env", "--", "/usr/bin/pkill", "-f", "research-mcp"])' }],
    ['ipython', { code: 'subprocess.run("env -i pkill -f research-mcp", shell=True)' }],
    ['ipython', { code: 'subprocess.run(["sudo", "-n", "pkill", "-f", "research-mcp"])' }],
    ['ipython', { code: 'p.terminate()' }],
    ['ipython', { code: 'p.send_signal(9)' }],
    ['ipython', { code: 'p.kill(); p = subprocess.Popen(["sleep", "10"])' }],
    ['ipython', { code: 'note = "p = subprocess.Popen("\np.kill()' }],
    ['ipython', { code: 'p = subprocess.Popen(["sleep", "10"]); p = q; p.kill()' }],
    ['ipython', { code: 'p = subprocess.Popen(["sleep", "10"]); (p := q); p.kill()' }],
    ['ipython', { code: 'p = subprocess.Popen(["sleep", "10"]); p: object = q; p.kill()' }],
    ['ipython', { code: 'p = subprocess.Popen(["sleep", "10"]); (p) = q; p.kill()' }],
    ['ipython', { code: 'p = subprocess.Popen(["sleep", "10"]); p, q = q, p; p.kill()' }],
    ['ipython', { code: 'p = subprocess.Popen(["sleep", "10"]); [p] = [q]; p.terminate()' }],
    ['bash', { command: '/usr/bin/pkill -f research-mcp' }],
    ['bash', { command: '/bin/kill -9 123' }],
  ] as const)('拒绝 IPython shell escape 与未证明所有权的进程终止: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, isolation)).toBeDefined()
  })

  it('拒绝 Bash 静态 brace expansion 拼出 denyRoot 路径', () => {
    const config: ResearchIsolationConfig = {
      cwd: '/opt',
      denyRoots: ['/opt/hidden-bench'],
      stateRoots: [],
    }
    expect(classifyResearchToolCall('bash', {
      command: 'cat hidden-{bench}/worlds.py',
    }, config)).toBeDefined()
  })

  it.each([
    ['echo \'{"metric":1}\''],
    ['printf \'%s\\n\' \'{"metric":1}\''],
    ['# expected {metric}\necho ok'],
    ['# cd /tmp\necho ok'],
    ['echo "please cd /tmp"'],
    ['printf "next: pushd /tmp\\n"'],
  ])('引号和注释里的普通 Bash 文本不是可执行语法: %s', (command) => {
    expect(classifyResearchToolCall('bash', { command }, isolation)).toBeUndefined()
  })

  it.each([
    ['note = \'subprocess.run(["pkill", "-f", "research-mcp"])\''],
    ['# subprocess.run(["/usr/bin/pkill", "-f", "research-mcp"])\nvalue = 42'],
    ['subprocess.run(["echo", "ok"])\nnote = "/usr/bin/pkill"'],
    ['subprocess.run(["echo", "ok"]); print("kill")'],
  ])('字符串和注释里的 subprocess 示例不是进程控制: %s', (code) => {
    expect(classifyResearchToolCall('ipython', { code }, isolation)).toBeUndefined()
  })

  it('按执行顺序证明 Popen 所有权后允许清理同一进程', () => {
    expect(classifyResearchToolCall('ipython', {
      code: 'p = subprocess.Popen(["sleep", "10"]); p.terminate(); p.send_signal(9)',
    }, isolation)).toBeUndefined()
  })

  it.each([
    ['bash', { command: 'cat /opt/hidden-bench/..secret/worlds.py' }],
    ['bash', { command: 'cd hidden-bench/..secret && cat worlds.py' }],
    ['bash', { command: 'cd /opt/.proma-research/..run && rm -rf data' }],
  ] as const)('以双点开头的合法子目录仍属于隔离根: %s %j', (toolName, input) => {
    const config: ResearchIsolationConfig = {
      cwd: '/opt',
      denyRoots: ['/opt/hidden-bench'],
      stateRoots: ['/opt/.proma-research'],
    }
    expect(classifyResearchToolCall(toolName, input, config)).toBeDefined()
  })

  it('畸形输入确定性 fail closed 而不是抛异常', () => {
    expect(classifyResearchToolCall(
      'bash',
      undefined as unknown as Record<string, unknown>,
      isolation,
    )).toMatchObject({ block: true })
  })
})
