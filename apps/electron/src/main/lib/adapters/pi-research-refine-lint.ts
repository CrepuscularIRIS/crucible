/**
 * C3 · Refine Lint（plan §6.2/§6.3）。
 *
 * 内容防火墙：扫描 refine 的 appliedEdits。
 * - deny 词汇：claim/prereg/graveyard id（H#/P#/G#）、benchmark/world/meter 路径、
 *   `.proma-research/`、journal 文件名、数字 band 字面量。
 * - 目标 ban（§6.3）：edit 的 id/title/path 指向裁决性组件（gate/guard/permission/
 *   reviewer/lint/mcp 配置）——类型检查器不可被学习。
 * - 命中 → 调用方立即 native `refine({ rollbackId })` 并追加 lint_violation residual。
 *
 * 词汇故意偏紧：误报只损失一次 local lesson（回滚），漏报会污染 harness。
 * run 名等动态值由调用方经 extraDenyPatterns 注入。
 */
export interface LintableRefineEdit {
  id?: string
  title?: string
  path?: string
  content?: string
  reason?: string
  applied?: boolean
  error?: string
}

export interface RefineLintResult {
  ok: boolean
  violations: string[]
}

const DENY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b[HPG]#?\d{1,5}\b/, label: 'claim/prereg/graveyard id' },
  { pattern: /(\b|\/)(benchmark|worlds?|meter)s?\//i, label: 'benchmark/world/meter 路径' },
  { pattern: /\.proma-research\b/, label: '.proma-research 路径' },
  { pattern: /\bjournal\.(jsonl|json)\b/i, label: 'journal 文件引用' },
  { pattern: /\bband\b\s*[:=]?\s*\[?\s*-?\d/, label: '数字 band 值' },
  { pattern: /\bseed\s*[:=]?\s*\d/, label: 'seed 值' },
]

const TARGET_BAN_PATTERN = /(gate[-_. ]?script|isolation[-_. ]?guard|permission|auto[-_. ]?refine|refine[-_. ]?(lint|reviewer)|research[-_. ]?mcp)/i

export function lintAppliedEdits(
  edits: LintableRefineEdit[],
  extraDenyPatterns: RegExp[] = [],
): RefineLintResult {
  const violations: string[] = []
  for (const edit of edits) {
    if (edit.applied === false) continue
    const target = [edit.id, edit.title, edit.path].filter(Boolean).join(' ')
    if (TARGET_BAN_PATTERN.test(target)) {
      violations.push(`目标 ban: "${target}" 指向裁决性组件`)
    }
    const content = [edit.content, edit.reason].filter(Boolean).join('\n')
    for (const { pattern, label } of DENY_PATTERNS) {
      if (pattern.test(content)) violations.push(`deny 词汇(${label}): edit ${edit.id ?? edit.title ?? '?'}`)
    }
    for (const pattern of extraDenyPatterns) {
      if (pattern.test(content)) violations.push(`deny 词汇(run 特定): edit ${edit.id ?? edit.title ?? '?'}`)
    }
  }
  return { ok: violations.length === 0, violations }
}

/** 供 C5：manifest refine 的结果必须产出至少一个 applied edit，且过 lint。 */
export function lintManifestRefinement(
  edits: LintableRefineEdit[],
  expectedCount: number,
  extraDenyPatterns: RegExp[] = [],
): RefineLintResult {
  const lint = lintAppliedEdits(edits, extraDenyPatterns)
  const appliedCount = edits.filter((edit) => edit.applied !== false).length
  if (appliedCount !== expectedCount) {
    return {
      ok: false,
      violations: [...lint.violations, `manifest 不符: 期望 ${expectedCount} 条 applied edit，实际 ${appliedCount}`],
    }
  }
  return lint
}
