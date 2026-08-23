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
