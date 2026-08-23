import { describe, expect, it } from 'bun:test'
import {
  classifyResearchToolCall,
  resolveResearchIsolationConfig,
  type ResearchIsolationConfig,
} from './research-isolation-guard'

const isolation: ResearchIsolationConfig = {
  denyRoots: ['/home/test/oss/neuronbench'],
  stateRoot: '/home/test/project/.proma-research',
}

describe('研究评测产品路径隔离守卫', () => {
  it('仅在已启用 MCP 显式配置 PROMA_RESEARCH_DENY 时启用', () => {
    expect(resolveResearchIsolationConfig({
      ordinary: { type: 'stdio', env: { TOKEN: 'secret' } },
    })).toBeUndefined()

    expect(resolveResearchIsolationConfig({
      research: {
        type: 'stdio',
        env: {
          PROMA_RESEARCH_DENY: '/home/test/oss/neuronbench',
          PROMA_RESEARCH_CWD: '/home/test/project',
        },
      },
    })).toEqual(isolation)
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
})
