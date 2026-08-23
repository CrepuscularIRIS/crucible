import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface ResearchIsolationConfig {
  cwd: string
  denyRoots: string[]
  stateRoots: string[]
}

export interface ResearchToolBlock {
  block: true
  reason: string
}

const PYTHON_RESEARCH_IMPORT = /^\s*(?:import\s+neuronbench(?:\s|$)|from\s+neuronbench(?:[.\s]|$))/im
const PYTHON_METER_RUN = /^\s*%run\s+\S*world-meter\.py\b/im
const BASH_METER_RUN = /(?:^|[\s;&|'"`])(?:python[23]?|bun|node)\s+[^\n;&|]*world-meter\.py\b/i
const BASH_RESEARCH_IMPORT = /(?:^|[\s;&|])python[23]?\s+(?:-[^\s]+\s+)*-c\s+(['"])[^\n]*\b(?:import\s+neuronbench|from\s+neuronbench)\b[^\n]*\1/i
const RESEARCH_ENV_EXPANSION = /\$(?:\{)?(?:NEURONBENCH_ROOT|PROMA_RESEARCH_DENY)(?:\})?/i
const PROCESS_CONTROL = /(?:^|[!\s;&|()])(?:sudo\s+)?(?:[^\s;&|()]+\/)?(?:kill|killall|pkill)\b|\bos\.kill(?:pg)?\b|\bprocess\.kill\b|\.(?:kill|terminate|send_signal)\s*\(/i
const BASH_DIRECTORY_CHANGE = /(?:^|[\s;&|()])(?:(?:command|builtin)\s+(?:--\s+)?)?(?:cd|pushd)\b/i
const PYTHON_DIRECTORY_CHANGE = /\b(?:os\.)?chdir\s*\(/i
const IPYTHON_SYSTEM_ESCAPE = /\bget_ipython\s*\(\s*\)\s*\.system\s*\(/i
const PYTHON_PROCESS_COMMAND = /^\s*subprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*(?:args\s*=\s*)?(?:[[(]\s*(?:['"](?:[^'"]*\/)?(?:sudo|env)['"]\s*,\s*(?:['"](?:--?[^'"]*|[A-Za-z_][A-Za-z0-9_]*=[^'"]*)['"]\s*,\s*)*)*['"](?:[^'"]*\/)?(?:kill|killall|pkill)['"]|['"](?:(?:[^'"\s]*\/)?(?:sudo|env)(?:\s+(?:--?\S+|[A-Za-z_][A-Za-z0-9_]*=\S+))*\s+)*(?:[^'"\s]*\/)?(?:kill|killall|pkill)(?:\s|['"]))/i
const STATIC_SHELL_BRACE_EXPANSION = /(^|[^$])\{[^}\r\n]+\}/
const STATE_MUTATION = /(?:^|[\s;&|()])(?:rm|rmdir|mkdir|mv|cp|install|truncate|unlink|shred|tee)\b|\bsed\s+-i\b|\bperl\s+-i\b|\bshutil\.rmtree\b|\bos\.(?:remove|unlink|rmdir|rename|replace)\b|\.(?:unlink|rename|replace|write_text|write_bytes)\s*\(|\bopen\s*\([^)]*,\s*['"][wax+]/i
const DENIAL_REASON = '研究评测隔离拒绝直接访问 benchmark、meter、Research MCP 进程或改写研究账本；请使用 world_* MCP 与 research MCP 工具。'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isPathWithin(candidate: string, root: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function stripToken(value: string): string {
  return value.trim().replace(/^['"`]+|['"`,)\]}]+$/g, '').replace(/^(?:file:\/\/)+/i, '')
}

function expandCandidatePath(value: string, cwd: string): string | undefined {
  let candidate = stripToken(value)
  if (!candidate || candidate.includes('\n') || candidate.includes('\0')) return undefined
  if (candidate === '~') candidate = homedir()
  else if (candidate.startsWith('~/') || candidate.startsWith('~\\')) candidate = join(homedir(), candidate.slice(2))
  if (!isAbsolute(candidate) && !candidate.includes('/') && !candidate.includes('\\')) return undefined
  return resolve(cwd, candidate)
}

function pathCandidates(source: string): string[] {
  const candidates: string[] = []
  const quoted = /(['"`])([^'"`\r\n]+)\1/g
  for (const match of source.matchAll(quoted)) {
    const candidate = match[2]
    if (candidate) candidates.push(candidate)
  }
  for (const token of source.split(/[\s;&|()<>]+/)) {
    if (token.includes('/') || token.includes('\\') || token.startsWith('~')) candidates.push(token)
  }
  return candidates
}

function sourceTouchesRoots(source: string, roots: string[], cwd: string): boolean {
  for (const rawCandidate of pathCandidates(source)) {
    const candidate = expandCandidatePath(rawCandidate, cwd)
    if (candidate && roots.some((root) => isPathWithin(candidate, root))) return true
  }
  return false
}

function directoryChangeTarget(unit: string, cwd: string): string | undefined {
  const bashMatch = /^\s*(?:(?:command|builtin)\s+(?:--\s+)?)?(?:cd|pushd)\s+(?:--\s+)?(.+?)\s*$/i.exec(unit)
  const pythonMatch = /\b(?:os\.)?chdir\s*\(\s*(?:[rRuUbB]{1,2})?(['"])([^'"]+)\1\s*\)/i.exec(unit)
  const raw = pythonMatch?.[2] ?? bashMatch?.[1]
  if (!raw || /[$`]/.test(raw)) return undefined
  let candidate = stripToken(raw)
  if (candidate === '~') candidate = homedir()
  else if (candidate.startsWith('~/') || candidate.startsWith('~\\')) candidate = join(homedir(), candidate.slice(2))
  return resolve(cwd, candidate)
}

function sourceTouchesRootsFollowingDirectoryChanges(source: string, roots: string[], cwd: string): boolean {
  let currentCwd = cwd
  for (const unit of splitExecutionUnits(source)) {
    if (roots.some((root) => isPathWithin(currentCwd, root))) return true
    if (sourceTouchesRoots(unit, roots, currentCwd)) return true
    const nextCwd = directoryChangeTarget(unit, currentCwd)
    if (nextCwd) {
      currentCwd = nextCwd
      if (roots.some((root) => isPathWithin(currentCwd, root))) return true
    }
  }
  return false
}

/** 只在顶层换行/分号/管道处分片；字符串或括号里的分隔符保持原样。 */
function splitExecutionUnits(source: string): string[] {
  const units: string[] = []
  let current = ''
  let quote: "'" | '"' | '`' | undefined
  let escaped = false
  let depth = 0
  const flush = (): void => {
    const trimmed = current.trim()
    if (trimmed) units.push(trimmed)
    current = ''
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      current += char
      escaped = true
      continue
    }
    if (quote) {
      current += char
      if (char === quote) quote = undefined
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      current += char
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1)

    if (depth === 0 && (char === '\n' || char === ';' || char === '|')) {
      flush()
      if (char === '|' && next === '|') index += 1
      continue
    }
    if (depth === 0 && char === '&') {
      flush()
      if (next === '&') index += 1
      continue
    }
    current += char
  }
  flush()
  return units
}

function matchingOuterPair(value: string, open: '(' | '[', close: ')' | ']'): boolean {
  if (!value.startsWith(open) || !value.endsWith(close)) return false
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === open) depth += 1
    else if (char === close) depth -= 1
    if (depth === 0 && index < value.length - 1) return false
  }
  return depth === 0
}

function splitTopLevelTargets(value: string): string[] {
  const targets: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    else if (char === ',' && depth === 0) {
      targets.push(value.slice(start, index))
      start = index + 1
    }
  }
  targets.push(value.slice(start))
  return targets
}

function collectAssignmentTargetNames(target: string, names: Set<string>): void {
  let value = target.trim()
  if (!value) return
  while (
    matchingOuterPair(value, '(', ')')
    || matchingOuterPair(value, '[', ']')
  ) {
    value = value.slice(1, -1).trim()
  }
  const parts = splitTopLevelTargets(value)
  if (parts.length > 1) {
    for (const part of parts) collectAssignmentTargetNames(part, names)
    return
  }
  value = value.replace(/^\*+/, '').trim()
  const annotation = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(value)
  if (annotation?.[1]) {
    names.add(annotation[1])
    return
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) names.add(value)
}

function assignedVariables(unit: string): string[] {
  const executable = maskQuotedAndCommentText(unit)
  const names = new Set<string>()
  let depth = 0
  let targetStart = 0
  for (let index = 0; index < executable.length; index += 1) {
    const char = executable[index]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1)
    if (char !== '=' || depth !== 0) continue
    const previous = executable[index - 1] ?? ''
    const next = executable[index + 1] ?? ''
    if ('=!<>:'.includes(previous) || next === '=') continue
    collectAssignmentTargetNames(executable.slice(targetStart, index), names)
    targetStart = index + 1
  }
  for (const match of executable.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*:=/g)) {
    if (match[1]) names.add(match[1])
  }
  return [...names]
}

function maskBashQuotedAndCommentText(source: string): string {
  let result = ''
  let quote: "'" | '"' | undefined
  let escaped = false
  let comment = false
  let commentBoundary = true

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\n') {
      result += '\n'
      comment = false
      commentBoundary = true
      continue
    }
    if (comment) {
      result += ' '
      continue
    }
    if (escaped) {
      result += ' '
      escaped = false
      commentBoundary = false
      continue
    }
    if (quote) {
      if (char === '\\' && quote === '"') {
        result += ' '
        escaped = true
        continue
      }
      if (char === quote) quote = undefined
      result += ' '
      continue
    }
    if (char === '\\') {
      result += ' '
      escaped = true
      continue
    }
    if (char === '#' && commentBoundary) {
      comment = true
      result += ' '
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      result += ' '
      commentBoundary = false
      continue
    }
    result += char
    commentBoundary = char ? /[\s;&|()]/.test(char) : true
  }
  return result
}

function hasUnsafeExecutionSyntax(source: string, toolName: 'bash' | 'ipython'): boolean {
  if (toolName === 'bash') {
    const executable = maskBashQuotedAndCommentText(source)
    return BASH_DIRECTORY_CHANGE.test(executable)
      || STATIC_SHELL_BRACE_EXPANSION.test(executable)
  }

  if (/^\s*(?:!|%%bash\b|%sx\b|%system\b)/im.test(source)) return true
  const executable = maskQuotedAndCommentText(source)
  return PYTHON_DIRECTORY_CHANGE.test(executable) || IPYTHON_SYSTEM_ESCAPE.test(executable)
}

function mentionsVariable(unit: string, names: Set<string>): boolean {
  for (const name of names) {
    if (new RegExp(`(?:\\$\\{?${name}\\}?|\\b${name}\\b)`).test(unit)) return true
  }
  return false
}

function hasUnsafeStateMutation(source: string, config: ResearchIsolationConfig): boolean {
  const tainted = new Set<string>()
  let currentCwd = config.cwd
  for (const unit of splitExecutionUnits(source)) {
    const touchesState = config.stateRoots.some((root) => isPathWithin(currentCwd, root))
      || sourceTouchesRoots(unit, config.stateRoots, currentCwd)
      || unit.includes('.proma-research')
      || mentionsVariable(unit, tainted)
    if (touchesState) {
      for (const name of assignedVariables(unit)) tainted.add(name)
    }
    if (touchesState && STATE_MUTATION.test(unit)) return true
    currentCwd = directoryChangeTarget(unit, currentCwd) ?? currentCwd
  }
  return false
}

/**
 * 屏蔽 Python 字符串与注释正文，但保留换行和结构字符。
 * 这样既不会把说明文字里的 Popen 当成所有权证明，也仍可识别真实调用。
 */
function maskQuotedAndCommentText(source: string): string {
  let result = ''
  let quote: "'" | '"' | undefined
  let triple = false
  let escaped = false
  let comment = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\n') {
      result += '\n'
      comment = false
      if (!triple) quote = undefined
      escaped = false
      continue
    }
    if (comment) {
      result += ' '
      continue
    }
    if (quote) {
      if (escaped) {
        result += ' '
        escaped = false
        continue
      }
      if (char === '\\') {
        result += ' '
        escaped = true
        continue
      }
      if (triple && source.slice(index, index + 3) === quote.repeat(3)) {
        result += '   '
        index += 2
        quote = undefined
        triple = false
        continue
      }
      if (!triple && char === quote) quote = undefined
      result += ' '
      continue
    }
    if (char === '#') {
      comment = true
      result += ' '
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      triple = source.slice(index, index + 3) === char.repeat(3)
      if (triple) {
        result += '   '
        index += 2
      } else {
        result += ' '
      }
      continue
    }
    result += char
  }
  return result
}

function findPythonCallEnd(executable: string, openIndex: number): number | undefined {
  let depth = 0
  for (let index = openIndex; index < executable.length; index += 1) {
    const char = executable[index]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return undefined
}

function hasUnsafeProcessControl(source: string, toolName: 'bash' | 'ipython'): boolean {
  if (toolName === 'ipython') {
    const executable = maskQuotedAndCommentText(source)
    for (const match of executable.matchAll(/\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\(/gi)) {
      if (match.index === undefined) continue
      const openIndex = match.index + match[0].lastIndexOf('(')
      const callEnd = findPythonCallEnd(executable, openIndex)
      if (callEnd !== undefined && PYTHON_PROCESS_COMMAND.test(source.slice(match.index, callEnd))) {
        return true
      }
    }
  }
  const popenVariables = new Set<string>()
  const bashCell = toolName === 'ipython' && /^\s*%%bash\b/i.test(source)
  for (const rawUnit of splitExecutionUnits(source)) {
    const shellEscape = toolName === 'ipython' && /^\s*!/.test(rawUnit)
    const shellMode = toolName === 'bash' || bashCell || shellEscape
    const unit = shellMode
      ? rawUnit.replace(/^\s*!\s*/, '').replace(/['"`]/g, ' ')
      : maskQuotedAndCommentText(rawUnit)
    if (PROCESS_CONTROL.test(unit)) {
      if (/\b(?:pkill|killall)\b|\b(?:os|process)\.kill\b/i.test(unit)) return true
      const withoutOwnedMethods = unit.replace(
        /\b([A-Za-z_][A-Za-z0-9_]*)\.(?:kill|terminate|send_signal)\s*\(/g,
        (full, name: string) => (popenVariables.has(name) ? '(' : full),
      )
      const withoutOwnedShellJobs = withoutOwnedMethods.replace(
        /(?:^|[\s;&|()])(?:sudo\s+)?kill\s+(?:-[A-Za-z0-9]+\s+)*(?:\$!|%\d+)(?=$|[\s;&|)])/gi,
        ' ',
      )
      if (PROCESS_CONTROL.test(withoutOwnedShellJobs)) return true
    }

    if (shellMode) continue
    const assigned = assignedVariables(unit)
    const established = new Set<string>()
    for (const match of unit.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=;()]+)?\s*=\s*(?:subprocess\.)?Popen\s*\(/g)) {
      const name = match[1]
      if (name) established.add(name)
    }
    for (const name of assigned) {
      if (established.has(name)) popenVariables.add(name)
      else popenVariables.delete(name)
    }
  }
  return false
}

function hasDirectResearchSource(source: string, toolName: 'bash' | 'ipython'): boolean {
  if (RESEARCH_ENV_EXPANSION.test(source)) return true
  if (toolName === 'bash') return BASH_METER_RUN.test(source) || BASH_RESEARCH_IMPORT.test(source)
  const withoutCommentLines = source.split(/\r?\n/).filter((line) => !/^\s*#/.test(line)).join('\n')
  const shellEscapes = withoutCommentLines
    .split(/\r?\n/)
    .filter((line) => /^\s*!/.test(line))
    .map((line) => line.replace(/^\s*!\s*/, '').replace(/['"`]/g, ' '))
    .join('\n')
  return PYTHON_RESEARCH_IMPORT.test(withoutCommentLines)
    || PYTHON_METER_RUN.test(withoutCommentLines)
    || (/^\s*%%bash\b/im.test(withoutCommentLines) && BASH_METER_RUN.test(withoutCommentLines))
    || BASH_METER_RUN.test(shellEscapes)
    || BASH_RESEARCH_IMPORT.test(shellEscapes)
}

export function resolveResearchIsolationConfig(
  mcpServers: Record<string, Record<string, unknown>>,
  cwd: string,
  pathDelimiter: string = delimiter,
): ResearchIsolationConfig | undefined {
  const denyRoots = new Set<string>()
  const stateRoots = new Set<string>()
  for (const server of Object.values(mcpServers)) {
    const env = asRecord(server.env)
    const rawDeny = typeof env?.PROMA_RESEARCH_DENY === 'string' ? env.PROMA_RESEARCH_DENY.trim() : ''
    if (!rawDeny) continue
    for (const entry of rawDeny.split(pathDelimiter)) {
      const trimmed = entry.trim()
      if (trimmed) denyRoots.add(resolve(cwd, trimmed))
    }
    const researchCwd = typeof env?.PROMA_RESEARCH_CWD === 'string' ? env.PROMA_RESEARCH_CWD.trim() : ''
    if (researchCwd) stateRoots.add(resolve(cwd, researchCwd, '.proma-research'))
  }
  if (denyRoots.size === 0) return undefined
  return { cwd: resolve(cwd), denyRoots: [...denyRoots], stateRoots: [...stateRoots] }
}

export function classifyResearchToolCall(
  toolName: string,
  input: Record<string, unknown>,
  config: ResearchIsolationConfig,
): ResearchToolBlock | undefined {
  const normalizedTool = toolName.toLowerCase()
  if (normalizedTool !== 'bash' && normalizedTool !== 'ipython') return undefined
  const record = asRecord(input)
  const source = normalizedTool === 'bash' ? record?.command : record?.code
  if (typeof source !== 'string' || !source.trim()) {
    return { block: true, reason: '研究评测隔离无法验证空的 Bash/ipython 输入，已拒绝执行。' }
  }
  if (
    hasUnsafeExecutionSyntax(source, normalizedTool)
    ||
    hasDirectResearchSource(source, normalizedTool)
    || sourceTouchesRootsFollowingDirectoryChanges(source, config.denyRoots, config.cwd)
  ) {
    return { block: true, reason: DENIAL_REASON }
  }
  if (hasUnsafeProcessControl(source, normalizedTool)) {
    return { block: true, reason: DENIAL_REASON }
  }
  if (hasUnsafeStateMutation(source, config)) return { block: true, reason: DENIAL_REASON }
  return undefined
}

export function buildResearchIsolationConfig(denyRoots: string[], researchCwd: string): ResearchIsolationConfig {
  const cwd = resolve(researchCwd)
  return {
    cwd,
    denyRoots: denyRoots.map((root) => resolve(cwd, root)),
    stateRoots: [join(cwd, '.proma-research')],
  }
}
