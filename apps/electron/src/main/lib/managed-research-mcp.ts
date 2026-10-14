import type { McpTransportType } from '@proma/shared'

export const MANAGED_RESEARCH_MCP_NAME = 'research'

interface RuntimeEnvironment {
  [key: string]: string | undefined
}

export interface ManagedResearchMcpCapability {
  name: string
  enabled: boolean
  type: McpTransportType
}

function normalizedValue(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function resolveStartupTimeout(value: string | undefined): number {
  const parsed = Number(normalizedValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30
}

/**
 * 研究会话 kernel 的 python：显式 PROMA_KERNEL_PYTHON > PRIME_AGENT_KERNEL_PYTHON >
 * Prime 默认 venv（PRIME_AGENT_KERNEL_VENV 或 ~/.prime/agent/kernel-venv）。
 * ponytail: 不跟 Prime 的 XDG 回落目录（只在主目录不可写时启用）；推错时 MCP 记 unavailable，不阻止。
 */
function resolveKernelPython(env: RuntimeEnvironment): string | undefined {
  const explicit = normalizedValue(env.PROMA_KERNEL_PYTHON) ?? normalizedValue(env.PRIME_AGENT_KERNEL_PYTHON)
  if (explicit) return explicit
  const venv = normalizedValue(env.PRIME_AGENT_KERNEL_VENV)
    ?? (normalizedValue(env.HOME) && `${normalizedValue(env.HOME)}/.prime/agent/kernel-venv`)
  return venv ? `${venv}/bin/python` : undefined
}

/**
 * 从部署环境构造 Research MCP。入口路径由交付环境提供，仓库不写死开发机路径；
 * cwd 则按每个 Agent 会话动态绑定，避免多个会话共享研究账本。
 */
export function buildManagedResearchMcpServer(
  agentCwd: string,
  env: RuntimeEnvironment = process.env,
): Record<string, unknown> | undefined {
  const entry = normalizedValue(env.PROMA_RESEARCH_MCP_ENTRY)
  if (!entry) return undefined

  const childEnv: Record<string, string> = {
    ...(normalizedValue(env.PATH) && { PATH: normalizedValue(env.PATH) }),
    PROMA_RESEARCH_CWD: agentCwd,
    ...(normalizedValue(env.PROMA_RESEARCH_RUN) && {
      PROMA_RESEARCH_RUN: normalizedValue(env.PROMA_RESEARCH_RUN),
    }),
    ...(normalizedValue(env.PROMA_RESEARCH_DENY) && {
      PROMA_RESEARCH_DENY: normalizedValue(env.PROMA_RESEARCH_DENY),
    }),
    ...(normalizedValue(env.NEURONBENCH_ROOT) && {
      NEURONBENCH_ROOT: normalizedValue(env.NEURONBENCH_ROOT),
    }),
    // 预算与计量入口是评测契约的一部分；漏传时 server 回落默认值，硬上限静默失效
    ...(normalizedValue(env.PROMA_EVAL_BUDGET) && {
      PROMA_EVAL_BUDGET: normalizedValue(env.PROMA_EVAL_BUDGET),
    }),
    ...(normalizedValue(env.PROMA_EVAL_METER) && {
      PROMA_EVAL_METER: normalizedValue(env.PROMA_EVAL_METER),
    }),
    // 02 SE7a：K0/K7 kernel 环境快照用的 python，与 Prime kernel/bootstrap 的解析顺序一致
    ...(resolveKernelPython(env) && { PROMA_KERNEL_PYTHON: resolveKernelPython(env) }),
  } as Record<string, string>

  return {
    type: 'stdio',
    command: normalizedValue(env.PROMA_RESEARCH_MCP_COMMAND) ?? 'bun',
    args: [entry],
    env: childEnv,
    required: true,
    startup_timeout_sec: resolveStartupTimeout(env.PROMA_RESEARCH_MCP_TIMEOUT_SEC),
  }
}

/** 将受管服务器合入工作区 MCP；同名用户配置不能覆盖部署方的隔离边界。 */
export function mergeManagedResearchMcpServer(
  servers: Record<string, Record<string, unknown>>,
  agentCwd: string,
  env: RuntimeEnvironment = process.env,
): Record<string, Record<string, unknown>> {
  const managed = buildManagedResearchMcpServer(agentCwd, env)
  if (managed) servers[MANAGED_RESEARCH_MCP_NAME] = managed
  return servers
}

/** 能力页只展示稳定名字和传输类型，不泄露入口、benchmark 或工作区路径。 */
export function listManagedResearchMcpCapability(
  env: RuntimeEnvironment = process.env,
): ManagedResearchMcpCapability | undefined {
  if (!normalizedValue(env.PROMA_RESEARCH_MCP_ENTRY)) return undefined
  return {
    name: MANAGED_RESEARCH_MCP_NAME,
    enabled: true,
    type: 'stdio',
  }
}
