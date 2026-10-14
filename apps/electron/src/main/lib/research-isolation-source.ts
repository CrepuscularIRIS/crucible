/**
 * 研究隔离守卫的源码文本工具（research-isolation-guard.ts 拆出）：按顶层分隔符分片、
 * 屏蔽 Bash / Python 的字符串与注释、取赋值目标名。纯文本函数，不碰文件系统。
 */

/** 只在顶层换行/分号/管道处分片（`splitPipes=false` 时整条管道算一片）；字符串或括号里的分隔符保持原样。 */
export function splitExecutionUnits(source: string, splitPipes = true): string[] {
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

    if (depth === 0 && (char === '\n' || char === ';' || (char === '|' && (splitPipes || next === '|')))) {
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
  value = value.replace(/^\*+/, '').replace(/^(?:export|declare|local|readonly|typeset)(?:\s+-\w+)*\s+/, '').trim()
  const annotation = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(value)
  if (annotation?.[1]) {
    names.add(annotation[1])
    return
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) names.add(value)
}

export function assignedVariables(unit: string): string[] {
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

export function maskBashQuotedAndCommentText(source: string): string {
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

/**
 * 屏蔽 Python 字符串与注释正文，但保留换行和结构字符。
 * 这样既不会把说明文字里的 Popen 当成所有权证明，也仍可识别真实调用。
 */
export function maskQuotedAndCommentText(source: string): string {
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

export function findPythonCallEnd(executable: string, openIndex: number): number | undefined {
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
