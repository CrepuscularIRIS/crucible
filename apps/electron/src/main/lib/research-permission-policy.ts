/**
 * research MCP 的权限分类。
 *
 * 与 planning-permission-policy 同构，但动机不同：planning 保护的是用户本地数据，
 * research 保护的是**证据链**——journal 只追加，写下即成事实，没有回滚。
 *
 * `probe_run` 还会 spawn bwrap 子进程执行预登记时冻结的 shell 命令，因此它同时是
 * 执行面。计划模式（"仅规划不执行"）必须拒绝这一整类，否则"只读"的名义下既执行了
 * 命令、又改变了信念状态。
 */

/** 会改写 journal 或执行探针的 research 工具（不含 tool 名前缀）。 */
const RESEARCH_MUTATING_TOOLS = new Set([
  'research_init',
  'claim_propose',
  'claim_transition',
  'prereg_write',
  'probe_run',
  'attack_record',
  'report_declare',
  'world_observe',
  'world_simulate',
  'world_forecast',
])

/** 只读：research_state 重放 journal，metric_recompute 从 raw 产物重算，都不落账。 */
const RESEARCH_READ_ONLY_TOOLS = new Set([
  'research_state',
  'metric_recompute',
])

/**
 * 从 `mcp__<server>__<tool>` 中取出 research 服务的工具名。
 * 服务名以 research 结尾（proma-research），但用户可能自行改名，故只要求包含 research。
 */
function researchToolName(toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) return null
  const rest = toolName.slice('mcp__'.length)
  const separator = rest.indexOf('__')
  if (separator === -1) return null
  const server = rest.slice(0, separator)
  const tool = rest.slice(separator + '__'.length)
  if (!server.toLowerCase().includes('research')) return null
  return tool
}

/** 该调用是否会改写研究信念状态或执行探针。 */
export function isResearchMutatingTool(toolName: string): boolean {
  const tool = researchToolName(toolName)
  return tool !== null && RESEARCH_MUTATING_TOOLS.has(tool)
}

/** 该调用是否为 research 的只读面（计划模式下可放行）。 */
export function isResearchReadOnlyTool(toolName: string): boolean {
  const tool = researchToolName(toolName)
  return tool !== null && RESEARCH_READ_ONLY_TOOLS.has(tool)
}
