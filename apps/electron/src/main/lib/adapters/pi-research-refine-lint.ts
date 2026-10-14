/**
 * C3 · Refine Lint（plan §6.2/§6.3；02 §3.4 F1–F9、§5.2 RESEARCH_PROTECTED）。
 *
 * 内容防火墙：扫描 refine 的 appliedEdits。
 * - deny 词汇：claim/prereg/graveyard id（H#/P#/G#）、benchmark/world/meter 路径、
 *   `.proma-research/`、journal 文件名、数字 band 字面量。
 * - F1 目标 ban：edit 的 id/title/path 指向裁决性组件或受管条目——类型检查器不可被学习。
 * - F2–F8 词法、F9 scope（确定性）：见各常量注释。违规标签以 `F<n>` 开头。
 * - 命中 → 调用方立即 native `refine({ rollbackId })` 并追加 lint_violation residual。
 *
 * 词汇故意偏紧：误报只损失一次 local lesson（回滚），漏报会污染 harness。
 * run / world 名等动态值由调用方经 extraDenyPatterns 注入（F5）。
 * 诚实上限（02 §3.4）：散文形式的领域结论、不点名任何工具的"重新解释纪律"条目照样能过；
 * 兜底只有 frozen 臂与 off/learning 不变性检查（SE14）。
 */

/** research-mcp `server.ts` 注册的全部工具名（F9 与 SE4 的契约断言共用）。 */
export const RESEARCH_TOOL_NAMES = [
  'research_init', 'research_state', 'claim_propose', 'claim_transition', 'prereg_write', 'probe_run',
  'metric_recompute', 'attack_record', 'report_declare', 'world_observe', 'world_simulate', 'world_forecast',
] as const

/** 整名匹配（可带 `mcp__research__` 前缀）。server.ts 新增工具而这里没跟上 → SE4 的 RDS 断言变红。 */
export const RESEARCH_TOOL_NAME_PATTERN = new RegExp(`^(?:mcp__research__)?(?:${RESEARCH_TOOL_NAMES.join('|')})$`)

/**
 * 受保护清单（02 §5.1–5.2，M4）。`<...>` 占位符是运行时才解析的根。
 * - frozenDuringRun：P1 P2 P4 P5 P8 P9 P11。run 中不该变：K0/K7 digest（SE15）+ guard 拒写。
 * - mcpOrHostOnly：P7（不含 REPORT.md、lessons.md）+ P12。只拒写，不做 digest。
 * - runtimeGlobs：前两者中只在运行时存在的路径，只是分类，不带保护语义。
 * - nameTokens：F1 目标 ban 的名字 token。
 * ponytail: token 匹配是词法层；语义层的削弱靠可疑改善审计（02 §2.3）。
 */
const FROZEN_DURING_RUN = [
  'packages/research-mcp/src/**',
  'packages/research-mcp/gates/**',
  'research/skills/*/SKILL.md',
  'research/skills/*/integrity-anchors.txt',
  'apps/electron/src/main/lib/research-isolation-guard.ts',
  'apps/electron/src/main/lib/adapters/pi-research-isolation-extension.ts',
  'apps/electron/src/main/lib/adapters/pi-research-refine-*.ts',
  'apps/electron/src/main/lib/research-default-skills.test.ts',
  'apps/electron/scripts/routing-acceptance.ts',
  'research/skills/research-kit/src/research_kit/**',
  'research/skills/research-kit/pyproject.toml',
  'research/eval/{world-meter.py,nbsim_strip.py,test_nbsim.py}',
  '<kernel-venv>/**',
  '<neuronbench-root>/**',
  '<workspace-skills>/**',
] as const
const MCP_OR_HOST_ONLY = [
  '<cwd>/.proma-research/*/journal.jsonl',
  '<cwd>/.proma-research/*/register.json',
  '<cwd>/.proma-research/*/prereg/**',
  '<cwd>/.proma-research/*/world-ledger.jsonl',
  '<cwd>/.proma-research/*/RETRO.md',
  '<cwd>/.rlm-jobs/*/failures.jsonl',
  '<sdk-config>/session-artifacts/*/research-refine/**',
  '<sdk-config>/sessions/**',
  '<sdk-config>/harness/**',
  '<sdk-config>/research-roles/**',
] as const
export const RESEARCH_PROTECTED = {
  frozenDuringRun: FROZEN_DURING_RUN,
  mcpOrHostOnly: MCP_OR_HOST_ONLY,
  runtimeGlobs: [...FROZEN_DURING_RUN, ...MCP_OR_HOST_ONLY].filter((glob) => glob.startsWith('<')),
  nameTokens: [
    'gate', 'guard', 'reconcile', 'trace-gate', 'proma-research-',
    'permission', 'auto-refine', 'refine-lint', 'refine-reviewer', 'research-mcp',
  ],
  idPrefixes: ['proma-research-'],
} as const

export interface LintableRefineEdit {
  kind?: string
  id?: string
  title?: string
  path?: string
  content?: string
  reason?: string
  metadata?: Record<string, unknown>
  applied?: boolean
  error?: string
}

/**
 * F9 的 scope：触发本次 refine 的失败类可以点名的工具 / kit 函数 / rule code。
 * kit 协议名（F9_KIT_PROTOCOL）在任何 scope 下都放行，不必列进 kitNames。
 * 不传 scope（无归因的显式 refine、宿主对 global 条目的体检）→ 不做 F9。
 */
export interface RefineEditScope {
  tools: string[]
  kitNames?: string[]
  codes?: string[]
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

const tokenSource = (token: string): string =>
  token.split(/[-_. ]/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[-_. ]?')

/** F1：名字 token 两侧不能是字母数字（`_` 视作分隔符，`declare_gates` 也算命中）。 */
const TARGET_BAN_PATTERN = new RegExp(
  `(?<![a-z0-9])(?:${RESEARCH_PROTECTED.nameTokens.map(tokenSource).join('|')})s?(?![a-z0-9])`,
  'i',
)

const TOOL_GROUP = String.raw`(?:research_\w+|world_\w+|claim_\w+|prereg_\w+|probe_run|report_declare|rlm|ipython|research_kit)`

const CONTENT_FILTERS: Array<{ pattern: RegExp; label: string }> = [
  // F2 规避措辞（§1.4 三条原文）；workaround 只在 60 字符内挨着裁决组件时算。
  { pattern: /\b(?:bypass\w*|circumvent\w*|evad\w*|sidestep\w*|get(?:s|ting)? around)|without the literal/i, label: 'F2 规避措辞' },
  { pattern: /workaround[\s\S]{0,60}(?:guard|gate|lint|isolation)|(?:guard|gate|lint|isolation)[\s\S]{0,60}workaround/i, label: 'F2 规避措辞' },
  // F3 只拦无条件的负面工具能力断言；`cannot … unless` 这类带条件的程序性教训放行（M8）。
  { pattern: new RegExp(`${TOOL_GROUP}.{0,40}(?:is broken|unreliable|never works|does ?n[o']?t work|不可靠|不能用)`, 'i'), label: 'F3 负面工具断言' },
  { pattern: /\b(?:don'?t|do not|never) (?:use|call) (?:world_|research_|claim_|prereg_)/i, label: 'F3 负面工具断言' },
  // F4 瞬时 / 环境错误原文。
  { pattern: /No module named|\b429\b|rate.?limit|out of memory|\bOOM\b|Arrearage|欠费/i, label: 'F4 瞬时错误原文' },
  // F7 正面信任断言（Power Plant）；不含 `must use`（M8：那是 01 的协议）。
  {
    pattern: new RegExp(`${TOOL_GROUP}[\\s\\S]{0,60}(?:trust (?:its|the) output|as intended|always works|可以信任)|(?:trust (?:its|the) output|as intended|always works|可以信任)[\\s\\S]{0,60}${TOOL_GROUP}`, 'i'),
    label: 'F7 正面信任断言',
  },
]

/** F8：日期或 run 名，与序数词同时出现 = 单实例叙事。裸 `then`、`r\d+` 不算（M8）。 */
const F8_WHEN = /\d{4}-\d{2}-\d{2}|\b[a-z][a-z0-9_]*-s\d+\b/i
const F8_ORDINAL = /\b(?:first|second|third)\b|第[一二三]次/i

const F9_TOOL = new RegExp(`(?<![A-Za-z0-9_])(?:mcp__research__)?(${RESEARCH_TOOL_NAMES.join('|')})(?![A-Za-z0-9_])`, 'g')
const F9_KIT = /\bresearch_kit\.(\w+)/g
/** deep 作业协议本身（01§4.3、路由块）：任何程序性教训都可能要点名它们（H2）。 */
const F9_KIT_PROTOCOL = new Set(['new_job', 'wait', 'collect', 'field'])
const F9_CODE = /\[R-([\w-]+)\]/g
const shortToolName = (name: string): string => name.replace(/^mcp__research__/, '')

function scopeViolations(text: string, scope: RefineEditScope): string[] {
  const tools = new Set(scope.tools.map(shortToolName))
  const kits = new Set([...F9_KIT_PROTOCOL, ...(scope.kitNames ?? [])])
  const codes = new Set(scope.codes ?? [])
  const out = new Set<string>()
  for (const [, name = ''] of text.matchAll(F9_TOOL)) if (!tools.has(name)) out.add(name)
  for (const [, name = ''] of text.matchAll(F9_KIT)) if (!kits.has(name)) out.add(`research_kit.${name}`)
  for (const [, code = ''] of text.matchAll(F9_CODE)) if (!codes.has(code)) out.add(`[R-${code}]`)
  return [...out]
}

export function lintAppliedEdits(
  edits: LintableRefineEdit[],
  extraDenyPatterns: RegExp[] = [],
  scope?: RefineEditScope,
): RefineLintResult {
  const violations: string[] = []
  for (const edit of edits) {
    if (edit.applied === false) continue
    const name = edit.id ?? edit.title ?? '?'
    const target = [edit.id, edit.title, edit.path].filter(Boolean).join(' ')
    if (TARGET_BAN_PATTERN.test(target) || edit.metadata?.promaManagedBy === 'proma-research') {
      violations.push(`F1 目标 ban: "${target}" 指向裁决性组件或受管条目`)
    }
    if (edit.kind === 'skill' || edit.kind === 'subagent') {
      violations.push(`F6 kind 限制: 研究会话禁止 ${edit.kind} 类条目 ${name}`)
    }
    const content = [edit.content, edit.reason].filter(Boolean).join('\n')
    for (const { pattern, label } of DENY_PATTERNS) {
      if (pattern.test(content)) violations.push(`deny 词汇(${label}): edit ${name}`)
    }
    for (const { pattern, label } of CONTENT_FILTERS) {
      if (pattern.test(content) && !violations.includes(`${label}: edit ${name}`)) violations.push(`${label}: edit ${name}`)
    }
    for (const pattern of extraDenyPatterns) {
      if (pattern.test(content)) violations.push(`F5 deny 词汇(run/world 名): edit ${name}`)
    }
    const narrative = [edit.title, edit.content].filter(Boolean).join('\n')
    if (F8_WHEN.test(narrative) && F8_ORDINAL.test(narrative)) {
      violations.push(`F8 单实例叙事: edit ${name}`)
    }
    if (scope) {
      const outOfScope = scopeViolations(narrative, scope)
      if (outOfScope.length > 0) violations.push(`F9 越出触发类: edit ${name} 点名 ${outOfScope.join(', ')}`)
    }
  }
  return { ok: violations.length === 0, violations }
}
