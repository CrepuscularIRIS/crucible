import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'bun:test'
import {
  buildResearchIsolationConfig,
  classifyResearchToolCall,
  classifyRlmChildToolCall,
  resolveKernelVenvDir,
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

describe('rlm child 经 MCP 只读（P0 检查 ②）', () => {
  const stateChanging = [
    'attack_record', 'claim_propose', 'claim_transition', 'prereg_write',
    'probe_run', 'report_declare', 'world_forecast', 'world_observe', 'world_simulate',
  ]

  it('child（rlmDepth>0）调写状态的 research 工具被拒，并被告知改写 out.md', () => {
    for (const tool of stateChanging) {
      const decision = classifyRlmChildToolCall(`mcp__research__${tool}`, 1)
      expect(decision).toMatchObject({ block: true })
      expect(decision?.reason).toContain('out.md')
      expect(decision?.reason).toContain(tool)
    }
  })

  it('父会话（depth 0 / header 无 depth）放行同一调用', () => {
    expect(classifyRlmChildToolCall('mcp__research__attack_record', 0)).toBeUndefined()
    expect(classifyRlmChildToolCall('mcp__research__attack_record', undefined)).toBeUndefined()
  })

  it('child 的只读面与非 research 工具不受影响', () => {
    for (const tool of ['research_state', 'metric_recompute']) {
      expect(classifyRlmChildToolCall(`mcp__research__${tool}`, 1)).toBeUndefined()
    }
    expect(classifyRlmChildToolCall('ipython', 1)).toBeUndefined()
    expect(classifyRlmChildToolCall('mcp__context7__query-docs', 1)).toBeUndefined()
  })
})

describe('rlm 作业目录在状态根之外（N1）', () => {
  const config = buildResearchIsolationConfig(['/home/test/oss/neuronbench'], '/home/test/project')
  const job = '/home/test/project/.rlm-jobs/r1/certify/C2/7f3a'

  it.each([
    [`open('${job}/out.md','w').write('## SUMMARY\\nok\\nSTATUS: ok PATH: .rlm-jobs/r1/certify/C2/7f3a/out.md\\n')`],
    [`from pathlib import Path\nPath('${job}/out.md').write_text('x')`],
    [`job = Path('${job}-self')\njob.mkdir(parents=True)\n(job / 'out.md').write_text('x')`],
    [`job, name = research_kit.new_job("r1", "certify", "C2")\n(job / "brief.md").write_text(brief)`],
  ])('child 写 out.md、父会话写 brief.md / -self 放行: %s', (code) => {
    expect(classifyResearchToolCall('ipython', { code }, config)).toBeUndefined()
  })

  it.each([
    [`open('/home/test/project/.proma-research/r1/out.md','w')`],
    [`Path('/home/test/project/.proma-research/r1/journal.jsonl').write_text('x')`],
  ])('写 .proma-research 仍被拦: %s', (code) => {
    expect(classifyResearchToolCall('ipython', { code }, config)).toMatchObject({ block: true })
  })
})

describe('SE2a：02 §1.4 复测表逐行（state 根 + 宿主 state 根 + edit）', () => {
  const sdk = '/root/.proma/sdk-config'
  const hostRoots = [
    `${sdk}/session-artifacts`, `${sdk}/sessions`, `${sdk}/research-roles`,
    '/root/.prime/agent/harness', '/root/.prime/agent/kernel-venv', '/root/.proma/agent-workspaces/ws/skills',
  ]
  const config = buildResearchIsolationConfig(['/data/neuronbench'], '/root', hostRoots)

  it.each([
    ['ipython 写 research-work/<run>/REPORT.md（状态根之外的报告草稿）', 'ipython', { code: "open('/root/research-work/r1/REPORT.md','w').write('# R')" }],
    ['ipython 追加 research-work/<run>/lessons.md', 'ipython', { code: "open('/root/research-work/r1/lessons.md','a').write('- x')" }],
    ['bash heredoc 写 research-work/<run>/REPORT.md', 'bash', { command: 'cat > research-work/r1/REPORT.md <<EOF\n# Report\nEOF' }],
    ['已知上限：字符串拼接绕过字面路径检查（不追，靠 MCP 内存基线与哈希链）', 'ipython', {
      code: "p = '/root/' + '.prom' + 'a-research/r1/journal.jsonl'\nopen(p,'a').write('x')",
    }],
    ['edit 改 research-work/<run>/REPORT.md', 'edit', { path: 'research-work/r1/REPORT.md', edits: [] }],
  ] as const)('放行：%s', (_label, toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toBeUndefined()
  })

  it.each([
    ['bash >> 追加 journal.jsonl', 'bash', { command: 'echo x >> .proma-research/r1/journal.jsonl' }],
    ['ipython 追加 session-artifacts/…/events.jsonl', 'ipython', {
      code: `open('${sdk}/session-artifacts/s1/research-refine/events.jsonl','a').write('{}')`,
    }],
    ['ipython 用 uv 往 kernel venv 装包（subprocess 列表写法）', 'ipython', {
      code: "subprocess.run(['uv','pip','install','--python','/root/.prime/agent/kernel-venv/bin/python','-e','/tmp/rkit'])",
    }],
    ['ipython 写工作区 skills/foo/SKILL.md', 'ipython', {
      code: "Path('/root/.proma/agent-workspaces/ws/skills/foo/SKILL.md').write_text('x')",
    }],
    ['edit 改 journal.jsonl（path 参数）', 'edit', { path: '/root/.proma-research/r1/journal.jsonl', edits: [] }],
    ['状态根内不再有白名单：ipython 写 <run>/REPORT.md', 'ipython', { code: "open('/root/.proma-research/r1/REPORT.md','w').write('# R')" }],
    ['状态根内不再有白名单：ipython 追加 <run>/lessons.md', 'ipython', { code: "open('/root/.proma-research/r1/lessons.md','a').write('- x')" }],
    ['状态根内不再有白名单：bash heredoc 写 <run>/REPORT.md', 'bash', { command: 'cat > .proma-research/r1/REPORT.md <<EOF\n# Report\nEOF' }],
    ['状态根内不再有白名单：edit 改 <run>/REPORT.md', 'edit', { path: '.proma-research/r1/REPORT.md', edits: [] }],
  ] as const)('拒绝：%s', (_label, toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['ipython', { code: "import sys, subprocess\nsubprocess.run([sys.executable, '-m', 'pip', 'install', 'foo'])" }],
    ['ipython', { code: '%pip install foo' }],
    ['ipython', { code: "subprocess.check_call('uv add foo', shell=True)" }],
    ['bash', { command: 'uv pip install --python /root/.prime/agent/kernel-venv/bin/python foo' }],
    ['bash', { command: '/root/.prime/agent/kernel-venv/bin/pip install foo' }],
  ] as const)('装包进 kernel 环境被拒: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: 'cat .proma-research/r1/journal.jsonl > /tmp/journal-copy.jsonl' }],
    ['bash', { command: 'python analysis.py > figures/out.txt 2>&1' }],
    ['ipython', { code: 'print("if it fails, pip install foo")' }],
    ['ipython', { code: '%pip list' }],
    ['ipython', { code: "from pathlib import Path\nPath('research-work/r1/sim/a.json').write_text('{}')" }],
    ['edit', { file_path: '/root/notes.md', edits: [] }],
  ] as const)('不误伤：读账本后重定向到别处、普通文件、字符串里的装包文本: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toBeUndefined()
  })

  it.each([
    ['bash', { command: `echo '{}' > ${sdk}/sessions/s1.jsonl` }],
    ['bash', { command: 'echo x > /root/.prime/agent/harness/harness_state.json' }],
    ['bash', { command: 'f=.proma-research/r1/register.json; echo x > "$f"' }],
    ['edit', { file_path: `${sdk}/research-roles/proma-research-reviewer.md`, edits: [] }],
    ['edit', { path: '/data/neuronbench/worlds.py', edits: [] }],
    ['edit', { path: '@/root/.proma-research/r1/journal.jsonl', edits: [] }],
    ['edit', { path: '.proma-research/r1/sub/REPORT.md', edits: [] }],
  ] as const)('重定向 / edit 指向受保护根同样拒绝: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it('拒绝文本指向 nbsim（F1 之后的合法仿真出口）与 research-work 下的报告出口', () => {
    const reason = classifyResearchToolCall('ipython', { code: 'import neuronbench' }, config)?.reason
    expect(reason).toContain('world_* MCP')
    expect(reason).toContain('nbsim')
    expect(reason).toContain('research-work/<run>/REPORT.md')
    expect(reason).not.toContain('.proma-research/<run>/')
  })

  it('resolveResearchIsolationConfig 带上宿主 state 根', () => {
    expect(resolveResearchIsolationConfig({
      research: { env: { PROMA_RESEARCH_DENY: '/bench', PROMA_RESEARCH_CWD: '/p' } },
    }, '/p', undefined, ['/sdk/sessions'])).toEqual({
      cwd: '/p', denyRoots: ['/bench'], stateRoots: ['/p/.proma-research'], hostStateRoots: ['/sdk/sessions'],
    })
  })
})

describe('A5 回归（03 §10.1）：nbsim 放行、neuronbench 拒绝，父会话与 rlm child 同一判定', () => {
  const config = buildResearchIsolationConfig(['/data/neuronbench'], '/root')
  it.each([0, 1])('rlmDepth=%d', (depth) => {
    expect(classifyRlmChildToolCall('ipython', depth)).toBeUndefined()
    expect(classifyResearchToolCall('ipython', { code: 'import nbsim\nnbsim.simulate("m", [], 64, seed=1)' }, config)).toBeUndefined()
    expect(classifyResearchToolCall('ipython', { code: 'import neuronbench' }, config)).toMatchObject({ block: true })
    expect(classifyResearchToolCall('ipython', { code: 'from neuronbench.worlds import World' }, config)).toMatchObject({ block: true })
  })
})

describe('resolveKernelVenvDir：kernel venv 的位置与 Prime bootstrap 一致', () => {
  it('pin 的 python 在 venv 里 → 该 venv；不在 venv 里 → undefined；未 pin → PRIME_AGENT_KERNEL_VENV 或默认', () => {
    const root = mkdtempSync(join(tmpdir(), 'proma-kvenv-'))
    try {
      mkdirSync(join(root, 'v', 'bin'), { recursive: true })
      writeFileSync(join(root, 'v', 'pyvenv.cfg'), 'home = /usr/bin\n')
      expect(resolveKernelVenvDir({ PRIME_AGENT_KERNEL_PYTHON: join(root, 'v', 'bin', 'python') })).toBe(join(root, 'v'))
      expect(resolveKernelVenvDir({ PRIME_AGENT_KERNEL_PYTHON: '/usr/bin/python3' })).toBeUndefined()
      expect(resolveKernelVenvDir({ PRIME_AGENT_KERNEL_VENV: '/opt/kv' })).toBe('/opt/kv')
      expect(resolveKernelVenvDir({})).toBe(join(homedir(), '.prime', 'agent', 'kernel-venv'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('SE2a：带正文的 REPORT 写入（2026-08-27 归档里 5 次 heredoc 被误拦的形状）', () => {
  const config = buildResearchIsolationConfig(['/data/neuronbench'], '/root')
  const prose = '- H1 REFUTED（P1）：10.5 (P1) ∈ [0, 11] kill 带；参考模型 {extra:[],slow_na:false}\n证据见 .proma-research/r1/journal.jsonl，"无适应"区；未 rm 任何文件'

  it.each([
    ['bash', { command: `cat > /root/research-work/r1/REPORT.md << 'REPORT_EOF'\n${prose}\nREPORT_EOF\necho written` }],
    ['bash', { command: `mkdir -p research-work/r1 && cat >> research-work/r1/REPORT.md <<"EOF"\n${prose}\nEOF` }],
    ['bash', { command: `cat > research-work/r1/lessons.md <<EOF\n- kill 带要先算功效 {x}\nEOF` }],
    ['ipython', { code: `report = """# REPORT\n${prose}\n"""\nopen('/root/research-work/r1/REPORT.md','w').write(report)` }],
  ] as const)('放行：正文是数据，不当代码扫描 %s', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toBeUndefined()
  })

  it.each([
    ['heredoc 写的是 journal', 'bash', { command: `cat > .proma-research/r1/journal.jsonl <<'EOF'\n{}\nEOF` }],
    ['heredoc 喂给解释器（正文是代码）', 'bash', { command: "python3 - <<'EOF'\nopen('.proma-research/r1/journal.jsonl','a').write('x')\nEOF" }],
    ['未加引号的定界符里有命令替换', 'bash', { command: 'cat > research-work/r1/REPORT.md <<EOF\n$(rm -rf .proma-research/r1)\nEOF' }],
    ['状态根内的 REPORT heredoc 不再放行', 'bash', { command: `cat > .proma-research/r1/REPORT.md <<'EOF'\n${prose}\nEOF` }],
    ['heredoc 经管道交给 bash', 'bash', { command: "cat <<'EOF' | bash\nrm -rf .proma-research/r1\nEOF" }],
    ['三引号正文不掩护对账本的写', 'ipython', { code: 'x = """note"""\nopen(\'/root/.proma-research/r1/journal.jsonl\',\'a\').write(x)' }],
    ['只有写 REPORT/lessons 的 heredoc 正文才算数据（归档 ca_rebound-s0:230 的形状）', 'bash', {
      command: "cat > /tmp/update_register.py << 'EOF'\nimport json\nopen('/root/.proma-research/r1/register.json','w').write('{}')\nEOF",
    }],
    ['exec 三引号代码不剥离', 'ipython', { code: 'exec("""open(\'/root/.proma-research/r1/journal.jsonl\',\'a\').write(\'x\')""")' }],
  ] as const)('拒绝：%s', (_label, toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })
})

describe('SE2a：Grok 审查补漏', () => {
  const config = buildResearchIsolationConfig(['/data/neuronbench'], '/root', ['/root/.prime/agent/kernel-venv', '/root/.prime/agent/harness'])
  const prose = '- kill H1；{extra:[],slow_na:false}'

  it.each([
    ['bash', { command: 'echo x >| .proma-research/r1/journal.jsonl' }],
    ['bash', { command: 'echo x >& /root/.prime/agent/harness/harness_state.json' }],
    ['bash', { command: 'echo x >\\\n.proma-research/r1/journal.jsonl' }],
    ['bash', { command: 'uv pip sync --python /root/.prime/agent/kernel-venv/bin/python /tmp/req.txt' }],
    ['ipython', { code: "import pip\npip.main(['install', 'numpy'])" }],
    ['ipython', { code: "subprocess.run(['conda', 'install', '-y', 'numpy'])" }],
  ] as const)('拒绝: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: `cat > research-work/r1/REPORT.md <<'REPORT-EOF'\n${prose}\nREPORT-EOF` }],
    ['bash', { command: `cat draft.sh > research-work/r1/REPORT.md <<'EOF'\n${prose}\nEOF` }],
    ['ipython', { code: "subprocess.run(['python', 'analysis.py'])\n# TODO: uv add numpy if missing" }],
    ['ipython', { code: 'report = """\n%pip install matplotlib\n"""\nopen(\'/root/research-work/r1/REPORT.md\',\'w\').write(report)' }],
  ] as const)('放行: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toBeUndefined()
  })
})

describe('Wave 1 审查 H1：$HOME / 赋值 / 链接 / 拷贝 / 把 REPORT 当脚本', () => {
  const H = homedir()
  const config = buildResearchIsolationConfig([`${H}/oss/neuronbench`], '/root', [
    `${H}/.prime/agent/harness`, `${H}/.prime/agent/kernel-venv`,
  ])
  const venv = `${H}/.prime/agent/kernel-venv`

  it.each([
    ['bash', { command: 'cat $HOME/oss/neuronbench/neuronbench/worlds.py' }],
    ['bash', { command: 'cat ${HOME}/oss/neuronbench/neuronbench/worlds.py' }],
    ['bash', { command: 'cat "$HOME"/oss/neuronbench/neuronbench/worlds.py' }],
    ['bash', { command: `X=${H}/oss/neuronbench; cat $X/neuronbench/worlds.py` }],
    ['ipython', { code: "import os\nprint(open(os.environ['HOME']+'/oss/neuronbench/neuronbench/worlds.py').read())" }],
    ['ipython', { code: "from pathlib import Path\nprint((Path.home() / 'oss' / 'neuronbench' / 'worlds.py').read_text())" }],
    ['ipython', { code: "import os\nprint(open(os.path.join(os.path.expanduser('~'), 'oss', 'neuronbench', 'w.py')).read())" }],
  ] as const)('读 deny 根的变量 / 展开写法被拒: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: 'echo {} > $HOME/.prime/agent/harness/harness_state.json' }],
    ['bash', { command: 'echo {} > "${HOME}/.prime/agent/harness/harness_state.json"' }],
    ['bash', { command: `VIRTUAL_ENV=${venv} uv pip install scipy` }],
    ['bash', { command: `pip install --target=${venv}/lib/python3.12/site-packages scipy` }],
    ['bash', { command: `export V=${venv}; $V/bin/pip install scipy` }],
    ['bash', { command: '$HOME/.prime/agent/kernel-venv/bin/pip install scipy' }],
    ['ipython', { code: "import os\nopen(os.path.expanduser('~/.prime/agent/harness/harness_state.json'),'w').write('{}')" }],
    ['ipython', { code: "from pathlib import Path\n(Path.home()/'.prime'/'agent'/'harness'/'harness_state.json').write_text('{}')" }],
    ['ipython', { code: "open('/root/.proma-research/r1/journal.jsonl', mode='a').write('x')" }],
    ['ipython', { code: "with Path('/root/.proma-research/r1/journal.jsonl').open('a') as f:\n    f.write('x')" }],
  ] as const)('写宿主根 / 装包的变量与展开写法被拒: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['ipython', { code: "import shutil\nshutil.copy('/tmp/x', '.proma-research/r1/journal.jsonl')" }],
    ['ipython', { code: "import shutil\nshutil.copy2('/tmp/x', '/root/.proma-research/r1/register.json')" }],
    ['ipython', { code: "import shutil\nshutil.copyfile('/tmp/h.json', '~/.prime/agent/harness/harness_state.json')" }],
    ['ipython', { code: `import shutil\nshutil.copytree('/tmp/rk', '${venv}/lib/python3.12/site-packages/research_kit')` }],
    ['ipython', { code: "import shutil\nshutil.move('.proma-research/r1/journal.jsonl', '/tmp/j')" }],
    ['bash', { command: 'dd if=/tmp/x of=.proma-research/r1/journal.jsonl' }],
    ['bash', { command: 'ln -sf journal.jsonl .proma-research/r1/REPORT.md' }],
    ['bash', { command: 'ln .proma-research/r1/journal.jsonl .proma-research/r1/lessons.md' }],
    ['bash', { command: `ln -s ${H}/.prime/agent/harness/harness_state.json /tmp/h.json` }],
    ['ipython', { code: "import os\nos.symlink('journal.jsonl', '.proma-research/r1/REPORT.md')" }],
    ['ipython', { code: "p = '.proma-research/r1/REPORT.md'\nos.symlink('/tmp/x', p)" }],
    ['ipython', { code: "from pathlib import Path\nPath('.proma-research/r1/REPORT.md').symlink_to('journal.jsonl')" }],
  ] as const)('shutil / dd / 链接改写受保护状态被拒: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: 'bash .proma-research/r1/REPORT.md' }],
    ['bash', { command: 'sh /root/.proma-research/r1/lessons.md' }],
    ['bash', { command: 'source .proma-research/r1/REPORT.md' }],
    ['bash', { command: '. .proma-research/r1/REPORT.md' }],
    ['bash', { command: 'python3 .proma-research/r1/REPORT.md' }],
    ['bash', { command: 'cat .proma-research/r1/REPORT.md | bash' }],
    ['bash', { command: 'bash < .proma-research/r1/REPORT.md' }],
    ['bash', { command: 'eval "$(cat .proma-research/r1/REPORT.md)"' }],
    ['bash', { command: 'echo "$(bash .proma-research/r1/REPORT.md)"' }],
    ['bash', { command: 'env FOO=1 bash .proma-research/r1/REPORT.md' }],
    ['bash', { command: "cat > .proma-research/r1/REPORT.md <<'EOF'\nrm -rf .proma-research/r1\nEOF\nbash .proma-research/r1/REPORT.md" }],
    ['ipython', { code: "exec(open('.proma-research/r1/REPORT.md').read())" }],
    ['ipython', { code: '%run .proma-research/r1/REPORT.md' }],
    ['ipython', { code: "p = '.proma-research/r1/REPORT.md'\nsrc = open(p).read()\nexec(src)" }],
    ['ipython', { code: "import runpy\nrunpy.run_path('/root/.proma-research/r1/lessons.md')" }],
    ['bash', { command: 'bash research-work/r1/REPORT.md' }],
    ['bash', { command: 'cat research-work/r1/lessons.md | sh' }],
    ['bash', { command: "cat > research-work/r1/REPORT.md <<'EOF'\nrm -rf .proma-research/r1\nEOF\nbash research-work/r1/REPORT.md" }],
    ['ipython', { code: "exec(open('research-work/r1/REPORT.md').read())" }],
    ['ipython', { code: '%run research-work/r1/lessons.md' }],
  ] as const)('REPORT / lessons 当脚本执行被拒（正文不扫描，不能当未审脚本）: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: "cat > .proma-research/r1/REPORT.md <<'EOF'\n# R\nkill H1\nEOF" }],
    ['bash', { command: "echo '- note' >> .proma-research/r1/lessons.md" }],
    ['bash', { command: 'python3 make_report.py > .proma-research/r1/REPORT.md' }],
    ['bash', { command: 'python3 gen.py | tee -a .proma-research/r1/lessons.md' }],
    ['ipython', { code: "open('.proma-research/r1/REPORT.md','w').write('''# R\nkill H1 journal.jsonl\n''')" }],
    ['ipython', { code: "p = '.proma-research/r1/REPORT.md'\nopen(p,'w').write('x')" }],
    ['ipython', { code: "Path('.proma-research/r1/REPORT.md').write_text('x')" }],
  ] as const)('状态根内的 REPORT / lessons 写入一律被拒（回到 HEAD 严格度）: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: "cat > research-work/r1/REPORT.md <<'EOF'\n# R\nkill H1\nEOF" }],
    ['bash', { command: "python3 analysis.py > figures/out.txt\ncat > research-work/r1/REPORT.md <<'EOF'\n# R\nEOF" }],
    ['bash', { command: "echo '- note' >> research-work/r1/lessons.md" }],
    ['bash', { command: 'cat .proma-research/r1/REPORT.md' }],
    ['bash', { command: 'python3 make_report.py > research-work/r1/REPORT.md' }],
    ['bash', { command: 'python3 gen.py | tee -a research-work/r1/lessons.md' }],
    ['bash', { command: 'grep -n bash .proma-research/r1/REPORT.md' }],
    ['bash', { command: 'X=1; echo $X > research-work/r1/sim/n.txt' }],
    ['bash', { command: 'uv run python sim.py --out=research-work/r1/sim/a.json' }],
    ['bash', { command: "mkdir -p .rlm-jobs/r1/certify/C2/7f3a && cat > .rlm-jobs/r1/certify/C2/7f3a/brief.md <<'EOF'\nhi\nEOF" }],
    ['ipython', { code: "open('research-work/r1/REPORT.md','w').write('''# R\nkill H1 journal.jsonl\n''')" }],
    ['ipython', { code: "p = 'research-work/r1/REPORT.md'\nopen(p,'w').write('x')" }],
    ['ipython', { code: "import subprocess\nsubprocess.run(['python', 'sim.py'])\nPath('research-work/r1/REPORT.md').write_text('x')" }],
    ['ipython', { code: "import json\nopen('research-work/r1/sim/a.json','w').write(json.dumps({}))" }],
    ['ipython', { code: "import shutil\nshutil.copy('research-work/r1/sim/a.json', 'research-work/r1/sim/b.json')" }],
    ['ipython', { code: "import os\nprint(os.environ['HOME'])" }],
    ['ipython', { code: "job = Path('.rlm-jobs/r1/certify/C2/7f3a')\n(job / 'out.md').write_text('x')" }],
  ] as const)('正当写入仍放行: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toBeUndefined()
  })
})

describe('Wave 1 审查 H1：磁盘上的链接（lstat / realpath）', () => {
  const root = mkdtempSync(join(tmpdir(), 'proma-guard-link-'))
  const cwd = join(root, 'proj')
  const run = join(cwd, '.proma-research', 'r1')
  const harness = join(root, 'harness')
  const bench = join(root, 'bench')
  mkdirSync(run, { recursive: true })
  mkdirSync(harness, { recursive: true })
  mkdirSync(bench, { recursive: true })
  writeFileSync(join(run, 'journal.jsonl'), '')
  writeFileSync(join(run, 'REPORT.md'), '# R\n')
  symlinkSync(join(run, 'journal.jsonl'), join(run, 'lessons.md'))
  writeFileSync(join(harness, 'harness_state.json'), '{}')
  writeFileSync(join(bench, 'worlds.py'), '')
  symlinkSync(join(harness, 'harness_state.json'), join(cwd, 'h.json'))
  symlinkSync(bench, join(cwd, 'nb'))
  const config = buildResearchIsolationConfig([bench], cwd, [harness])
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it.each([
    ['bash', { command: "echo '- x' >> .proma-research/r1/lessons.md" }],
    ['bash', { command: "cat > .proma-research/r1/lessons.md <<'EOF'\nx\nEOF" }],
    ['ipython', { code: "open('.proma-research/r1/lessons.md','a').write('x')" }],
    ['edit', { path: '.proma-research/r1/lessons.md', edits: [] }],
    ['bash', { command: 'echo {} > h.json' }],
    ['ipython', { code: "open('h.json','w').write('{}')" }],
    ['edit', { path: 'h.json', edits: [] }],
    ['bash', { command: 'cat nb/worlds.py' }],
  ] as const)('写目标是指向受保护文件的链接、或经链接读 deny 根被拒: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it('硬链接到 journal 的 REPORT.md 拒写（nlink>1）', () => {
    const hard = join(cwd, '.proma-research', 'hard')
    mkdirSync(hard)
    writeFileSync(join(hard, 'journal.jsonl'), '')
    linkSync(join(hard, 'journal.jsonl'), join(hard, 'REPORT.md'))
    expect(classifyResearchToolCall('bash', { command: 'echo x > .proma-research/hard/REPORT.md' }, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: "cat > .proma-research/r1/REPORT.md <<'EOF'\n# R\nEOF" }],
    ['ipython', { code: "open('.proma-research/r1/REPORT.md','w').write('# R')" }],
    ['edit', { path: '.proma-research/r1/REPORT.md', edits: [] }],
  ] as const)('状态根内的普通文件 REPORT.md 也拒写（宿主在 report_declare 时拷入）: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: "cat > research-work/r1/REPORT.md <<'EOF'\n# R\nEOF" }],
    ['ipython', { code: "open('research-work/r1/lessons.md','a').write('- x')" }],
    ['edit', { path: 'research-work/r1/REPORT.md', edits: [] }],
  ] as const)('research-work/<run>/ 下的 REPORT / lessons 放行: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toBeUndefined()
  })

  it('research-work/<run> 本身是指向 run 目录的链接时，写尚不存在的 REPORT.md 被拒', () => {
    mkdirSync(join(cwd, 'research-work'), { recursive: true })
    symlinkSync(run, join(cwd, 'research-work', 'linked'))
    for (const [toolName, input] of [
      ['bash', { command: "cat > research-work/linked/REPORT.md <<'EOF'\n# R\nEOF" }],
      ['ipython', { code: "open('research-work/linked/fresh.md','w').write('# R')" }],
      ['edit', { path: 'research-work/linked/new.md', edits: [] }],
    ] as const) {
      expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
    }
  })
})

describe('Wave 1 复审：状态根内无 REPORT 白名单，文件放置（mv/cp/os.replace…）一律被拒', () => {
  const H = homedir()
  const config = buildResearchIsolationConfig([`${H}/oss/neuronbench`], '/root', [`${H}/.prime/agent/harness`])
  const hostCwd = buildResearchIsolationConfig([`${H}/oss/neuronbench`], `${H}/proj`, [`${H}/.prime/agent/harness`])
  const R = '.proma-research/r1/REPORT.md'

  it.each([
    ['bash', { command: `ln -s journal.jsonl /tmp/l; mv /tmp/l ${R}; echo '{"forged":1}' >> ${R}` }],
    ['bash', { command: `cp -P /tmp/l ${R}` }],
    ['bash', { command: 'rsync -l /tmp/l .proma-research/r1/lessons.md' }],
    ['bash', { command: `install /tmp/l ${R}` }],
    ['bash', { command: `X=${R}; mv /tmp/l $X` }],
    ['ipython', { code: `import os\nos.symlink('journal.jsonl','/tmp/l'); os.replace('/tmp/l', '${R}'); open('${R}','a').write('{}')` }],
    ['ipython', { code: `import os\nos.rename('/tmp/l', '/root/${R}')` }],
    ['ipython', { code: `import shutil\nshutil.copy('/tmp/l', '${R}', follow_symlinks=False)` }],
    ['ipython', { code: `import shutil\nshutil.move('/tmp/l', '${R}')` }],
    ['ipython', { code: `p = '${R}'\nPath('/tmp/l').replace(p)` }],
    ['ipython', { code: `from pathlib import Path\nPath('/tmp/l').rename('${R}')` }],
    // 复审 N1：HEAD 拦、上一轮放行的五种写法
    ['ipython', { code: `from pathlib import Path\nPath('/tmp/l').replace(Path('${R}'))` }],
    ['ipython', { code: `p = Path('${R}')\nPath('/tmp/l').replace(str(p))` }],
    ['ipython', { code: `r = Path('${R}')\nPath('/tmp/l').replace(r.resolve())` }],
    ['ipython', { code: `import os as o; o.replace('/tmp/l', '${R}')` }],
    ['ipython', { code: `from os import replace\nreplace('/tmp/l', '${R}')` }],
    ['ipython', { code: `import shutil as s\ns.move('/tmp/l', '${R}')` }],
    ['bash', { command: `\\mv /tmp/l ${R}` }],
  ] as const)('把预建链接搬进 REPORT/lessons 被拒: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it('宿主根变体（cwd 在 $HOME 下，相对链接按 REPORT 目录解析到 harness）被拒', () => {
    const command = `ln -s ../../../.prime/agent/harness/harness_state.json /tmp/l2; mv /tmp/l2 ${R}; echo '{}' > ${R}`
    expect(classifyResearchToolCall('bash', { command }, hostCwd)).toMatchObject({ block: true })
    const code = `import os as o\no.symlink('../../../.prime/agent/harness/harness_state.json', '/tmp/l3')\no.replace('/tmp/l3', '${R}')`
    expect(classifyResearchToolCall('ipython', { code }, hostCwd)).toMatchObject({ block: true })
  })

  const W = 'research-work/r1/REPORT.md'
  it.each([
    ['ipython', { code: `import re\nopen('${W}','w').write(re.compile(r'H\\d').sub('H', 'H1'))` }],
    ['ipython', { code: `open('${W}','w').write(str(model.eval()))` }],
    ['ipython', { code: `text = 'a\\tb'\nopen('${W}','w').write(text.replace('\\t', ' '))` }],
    ['bash', { command: `cp research-work/r1/sim/a.json research-work/r1/sim/b.json && cat ${R}` }],
    // research-work 里的 REPORT 不是状态：宿主 report_declare 只拷普通文件、不跟链接
    ['bash', { command: `mv /tmp/draft.md ${W}` }],
    ['ipython', { code: `import shutil\nshutil.copy('/tmp/draft.md', '${W}')` }],
  ] as const)('正当写入不误杀（.compile/.eval 方法、str.replace）: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toBeUndefined()
  })

  it.each([
    ['ipython', { code: `__builtins__.eval(open('${R}').read())` }],
    ['ipython', { code: `exec(compile(open('${R}').read(), 'r', 'exec'))` }],
    ['ipython', { code: `__builtins__.eval(open('research-work/r1/REPORT.md').read())` }],
  ] as const)('REPORT 当脚本执行仍被拒: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })
})

describe('Wave 1 复审：经 glob 或递归工具读 deny 根', () => {
  const H = homedir()
  const config = buildResearchIsolationConfig([`${H}/oss/neuronbench`], '/root')

  it.each([
    ['bash', { command: 'cat ~/oss/neuron*/neuronbench/worlds.py' }],
    ['bash', { command: 'cat $HOME/oss/neuronbenc?/neuronbench/worlds.py' }],
    ['bash', { command: 'cat ~/oss/[n]euronbench/neuronbench/worlds.py' }],
    ['bash', { command: 'cat ~/*/neuronbench/neuronbench/worlds.py' }],
    ['bash', { command: 'find ~/oss -name worlds.py -exec cat {} +' }],
    ['bash', { command: 'find / -name worlds.py' }],
    ['bash', { command: 'grep -r MT ~/oss/ --include=worlds.py' }],
    ['bash', { command: 'grep -rn MT ~/oss' }],
    ['bash', { command: 'rg MT ~/oss' }],
    ['bash', { command: 'cp -r ~/oss /tmp/o' }],
    ['ipython', { code: "import glob, os\nglob.glob(os.path.expanduser('~/oss/neuro*/**'), recursive=True)" }],
    ['ipython', { code: "import os\nfor d, _, fs in os.walk(os.path.expanduser('~/oss')): pass" }],
    ['ipython', { code: "from pathlib import Path\nlist(Path(os.path.expanduser('~/oss')).rglob('*.py'))" }],
    // 复审 N2：建链接指向 deny 根的祖先、变量里存祖先再拼 glob、zip/7z 打包
    ['bash', { command: 'ln -s ~/oss /tmp/o && cat /tmp/o/neuronbench/neuronbench/worlds.py' }],
    ['bash', { command: 'ln -s $HOME /tmp/h' }],
    ['bash', { command: 'ln -s / /tmp/r' }],
    ['ipython', { code: "import os\nos.symlink(os.path.expanduser('~/oss'), '/tmp/o')" }],
    ['bash', { command: 'D=~/oss; cat $D/neuron*/neuronbench/worlds.py' }],
    ['bash', { command: 'export D="$HOME/oss"\ncat "${D}"/neuronbenc?/neuronbench/worlds.py' }],
    ['bash', { command: 'D=~/oss; find $D -name worlds.py' }],
    ['ipython', { code: "import glob, os\nd = os.path.expanduser('~/oss')\nglob.glob(d + '/neuron*/**', recursive=True)" }],
    ['ipython', { code: "import os\nd = os.path.expanduser('~/oss')\nprint(open(d + '/neuronbench/neuronbench/worlds.py').read())" }],
    ['ipython', { code: "from pathlib import Path\nd = Path.home() / 'oss'\nprint((d / 'neuronbench' / 'x.py').read_text())" }],
    ['ipython', { code: "import os\nd = os.path.expanduser('~')\nfor x in os.walk(d, topdown=True): pass" }],
    ['bash', { command: 'zip -qr /tmp/a.zip ~/oss && unzip -p /tmp/a.zip oss/neuronbench/neuronbench/worlds.py' }],
    ['bash', { command: '7z a /tmp/a.7z ~/oss' }],
  ] as const)('被拒: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toMatchObject({ block: true })
  })

  it.each([
    ['bash', { command: 'ls figures/*.png' }],
    ['bash', { command: 'cat ~/oss/*.md' }],
    ['bash', { command: 'grep -rn foo research/' }],
    ['bash', { command: 'find . -name "*.py"' }],
    ['bash', { command: 'rg -n "research-loop" research/skills' }],
    ['ipython', { code: "import glob\nglob.glob('research-work/r1/sim/*.json')" }],
    ['bash', { command: 'ln -s research-work/r1/sim latest-sim' }],
    ['bash', { command: 'D=~/oss; ls $D/*.md' }],
    ['bash', { command: 'zip -r /tmp/figs.zip figures/' }],
    ['ipython', { code: "import os\nd = os.path.expanduser('~/oss')\nprint(os.listdir(d + '/notes'))" }],
    ['ipython', { code: "import os\nd = os.path.expanduser('~')\nfor x in os.walk(d + '/proj', topdown=True): pass" }],
    ['bash', { command: 'H=$HOME; ls $H/proj' }],
  ] as const)('不误杀: %s %j', (toolName, input) => {
    expect(classifyResearchToolCall(toolName, input, config)).toBeUndefined()
  })
})
