import { delimiter, join, resolve } from 'node:path'

export interface ResearchIsolationConfig {
  /** Agent 工具不可直接读取的 benchmark / 真值根。 */
  denyRoots: string[]
  /** Research MCP 独占写入的追加式状态根。 */
  stateRoot?: string
}

export interface ResearchToolBlock {
  block: true
  reason: string
}

const DIRECT_RESEARCH_SOURCE = /(?:world-meter\.py|\b(?:import|from)\s+neuronbench\b|\bNEURONBENCH_ROOT\b|\bPROMA_RESEARCH_DENY\b|(?:^|[^a-z0-9_])neuronbench(?:[\\/]|$))/i
const PROCESS_CONTROL = /(?:^|[\s;&|()])(?:sudo\s+)?(?:kill|killall|pkill)\b|\b(?:os|process)\.kill\b|\.kill\s*\(/i
const STATE_MUTATION = /(?:^|[\s;&|()])(?:rm|rmdir|mkdir|mv|cp|install|truncate|unlink|shred|tee)\b|\bsed\s+-i\b|\bperl\s+-i\b|\bshutil\.rmtree\b|\bos\.(?:remove|unlink|rmdir|rename|replace)\b|\.(?:unlink|rename|replace|write_text|write_bytes)\s*\(|\bopen\s*\([^)]*,\s*['"][wax+]/i
const DENIAL_REASON = '研究评测隔离拒绝直接访问 benchmark、meter、Research MCP 进程或改写研究账本；请使用 world_* MCP 与 research MCP 工具。'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function normalizeForMatch(value: string): string {
  return value.replaceAll('\\', '/').toLowerCase()
}

function textContainsPath(text: string, path: string): boolean {
  const needle = normalizeForMatch(resolve(path)).replace(/\/$/, '')
  if (!needle) return false
  return normalizeForMatch(text).includes(needle)
}

/**
 * 从已启用、已规范化的 workspace MCP 配置中提取隔离边界。
 *
 * PROMA_RESEARCH_DENY 是显式 opt-in：普通工作区没有此键时不启用守卫。
 * 这里只读取已知的非凭据键，不能把任意 MCP env 注入 Agent shell。
 */
export function resolveResearchIsolationConfig(
  mcpServers: Record<string, Record<string, unknown>>,
  pathDelimiter: string = delimiter,
): ResearchIsolationConfig | undefined {
  const denyRoots = new Set<string>()
  let stateRoot: string | undefined

  for (const server of Object.values(mcpServers)) {
    const env = asRecord(server.env)
    const rawDeny = typeof env?.PROMA_RESEARCH_DENY === 'string'
      ? env.PROMA_RESEARCH_DENY.trim()
      : ''
    if (!rawDeny) continue

    for (const entry of rawDeny.split(pathDelimiter)) {
      const trimmed = entry.trim()
      if (trimmed) denyRoots.add(resolve(trimmed))
    }
    const researchCwd = typeof env?.PROMA_RESEARCH_CWD === 'string'
      ? env.PROMA_RESEARCH_CWD.trim()
      : ''
    if (researchCwd) stateRoot = resolve(researchCwd, '.proma-research')
  }

  if (denyRoots.size === 0) return undefined
  return {
    denyRoots: [...denyRoots],
    ...(stateRoot && { stateRoot }),
  }
}

/**
 * 对工具执行做确定性 fail-closed 分类。
 *
 * 该守卫不是提示词：调用方必须把结果接到 Prime 的 execution-before tool_call
 * hook，确保 bypassPermissions 与 RLM 子会话也不能越过它。
 */
export function classifyResearchToolCall(
  toolName: string,
  input: Record<string, unknown>,
  config: ResearchIsolationConfig,
): ResearchToolBlock | undefined {
  const normalizedTool = toolName.toLowerCase()
  if (normalizedTool !== 'bash' && normalizedTool !== 'ipython') return undefined

  const source = normalizedTool === 'bash' ? input.command : input.code
  if (typeof source !== 'string' || !source.trim()) {
    return { block: true, reason: '研究评测隔离无法验证空的 Bash/ipython 输入，已拒绝执行。' }
  }

  if (DIRECT_RESEARCH_SOURCE.test(source) || config.denyRoots.some((root) => textContainsPath(source, root))) {
    return { block: true, reason: DENIAL_REASON }
  }
  if (PROCESS_CONTROL.test(source)) {
    return { block: true, reason: DENIAL_REASON }
  }

  const touchesState = source.includes('.proma-research')
    || (config.stateRoot !== undefined && textContainsPath(source, config.stateRoot))
  if (touchesState && STATE_MUTATION.test(source)) {
    return { block: true, reason: DENIAL_REASON }
  }
  return undefined
}

export function buildResearchIsolationConfig(
  denyRoots: string[],
  researchCwd?: string,
): ResearchIsolationConfig {
  return {
    denyRoots: denyRoots.map((root) => resolve(root)),
    ...(researchCwd && { stateRoot: join(resolve(researchCwd), '.proma-research') }),
  }
}
