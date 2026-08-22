import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKToolResultBlock,
  SDKUserMessage,
  SkillActivation,
  SkillActivationSource,
} from '../types/agent'

const ACTIVATION_SOURCES: readonly SkillActivationSource[] = ['explicit', 'read']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isActivationSource(value: unknown): value is SkillActivationSource {
  return typeof value === 'string' && ACTIVATION_SOURCES.includes(value as SkillActivationSource)
}

function normalizeWorkspaceSlug(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const slug = value.trim()
  return slug !== '' && !slug.includes('/') && !slug.includes('\\') && slug !== '.' && slug !== '..'
    ? slug
    : undefined
}

function getWorkspaceSkillPath(value: unknown, slug: string): string | undefined {
  if (typeof value !== 'string') return undefined
  const path = value.trim().replace(/\\/g, '/')
  return path === `${slug}/SKILL.md` ? path : undefined
}

function normalizeActivation(value: unknown): SkillActivation | null {
  if (!isRecord(value) || typeof value.slug !== 'string' || value.slug.trim() === '') return null

  const slug = value.slug.trim()
  const name = typeof value.name === 'string' && value.name.trim() !== ''
    ? value.name.trim()
    : slug
  const sources = Array.isArray(value.sources)
    ? value.sources.filter(isActivationSource)
    : []
  const normalizedSources = ACTIVATION_SOURCES.filter((source) => sources.includes(source))
  const filePath = typeof value.filePath === 'string' && value.filePath.trim() !== ''
    ? value.filePath.trim()
    : undefined
  const workspaceSlug = normalizeWorkspaceSlug(value.workspaceSlug)
  const workspaceSkillPath = getWorkspaceSkillPath(value.workspaceSkillPath, slug)

  return {
    slug,
    name,
    ...(filePath ? { filePath } : {}),
    ...(workspaceSlug && workspaceSkillPath ? { workspaceSlug, workspaceSkillPath } : {}),
    sources: normalizedSources.length > 0 ? [...normalizedSources] : ['read'],
  }
}

/** Return the Skill directory slug when a path points at skills/<slug>/SKILL.md. */
export function getSkillSlugFromEntryPath(path: string): string | null {
  return path.replace(/\\/g, '/').match(/(?:^|\/)skills\/([^/]+)\/SKILL\.md$/i)?.[1] ?? null
}

/** Build activation metadata for a successfully loaded Skill entry file. */
export function createSkillActivationFromPath(
  path: string,
  source: SkillActivationSource,
  name?: string,
  workspaceSlug?: string,
): SkillActivation | null {
  const slug = getSkillSlugFromEntryPath(path)
  if (!slug) return null
  const normalizedWorkspaceSlug = normalizeWorkspaceSlug(workspaceSlug)
  return {
    slug,
    name: name?.trim() || slug,
    filePath: path,
    ...(normalizedWorkspaceSlug
      ? { workspaceSlug: normalizedWorkspaceSlug, workspaceSkillPath: `${slug}/SKILL.md` }
      : {}),
    sources: [source],
  }
}

/** Merge activations in first-seen order, combining sources and preserving the first usable locator. */
export function mergeSkillActivations(
  ...groups: ReadonlyArray<ReadonlyArray<SkillActivation>>
): SkillActivation[] {
  const merged = new Map<string, SkillActivation>()

  for (const group of groups) {
    for (const rawActivation of group) {
      const activation = normalizeActivation(rawActivation)
      if (!activation) continue

      const existing = merged.get(activation.slug)
      if (!existing) {
        merged.set(activation.slug, {
          slug: activation.slug,
          name: activation.name,
          ...(activation.filePath ? { filePath: activation.filePath } : {}),
          ...(activation.workspaceSlug && activation.workspaceSkillPath
            ? { workspaceSlug: activation.workspaceSlug, workspaceSkillPath: activation.workspaceSkillPath }
            : {}),
          sources: [...activation.sources],
        })
        continue
      }

      if (existing.name === existing.slug && activation.name !== activation.slug) {
        existing.name = activation.name
      }
      if (!existing.filePath && activation.filePath) {
        existing.filePath = activation.filePath
      }
      if (!existing.workspaceSlug && activation.workspaceSlug && activation.workspaceSkillPath) {
        existing.workspaceSlug = activation.workspaceSlug
        existing.workspaceSkillPath = activation.workspaceSkillPath
      }
      const sourceSet = new Set([...existing.sources, ...activation.sources])
      existing.sources = ACTIVATION_SOURCES.filter((source) => sourceSet.has(source))
    }
  }

  return [...merged.values()]
}

function getReadPath(input: Record<string, unknown>): string | null {
  const path = input.file_path ?? input.filePath ?? input.path
  return typeof path === 'string' ? path : null
}

/**
 * 从 bash 命令或 ipython cell 文本中提取 skills/<slug>/SKILL.md 路径引用。
 *
 * Prime 没有 Read 工具：模型用 bash cat/less、ipython open/%%bash 打开 skill。
 * 只认确定性的路径信号；python `import <module>` 不做反向映射——
 * importName 存在 skill 元数据里，仅凭 slug 推不出来，猜了就是假信号。
 */
const SKILL_ENTRY_PATH_PATTERN = /[^\s'"`]*skills\/[^/\s'"`]+\/SKILL\.md/gi

function collectSkillEntryPathsFromText(text: string): string[] {
  return [...text.matchAll(SKILL_ENTRY_PATH_PATTERN)].map((match) => match[0])
}

function getToolTextInput(input: Record<string, unknown>): string | null {
  const command = input.command
  if (typeof command === 'string') return command
  const code = input.code
  if (typeof code === 'string') return code
  return null
}

/** 工具名 → 该工具里可能引用 SKILL.md 的文本字段。Read 是旧会话遗留通道。 */
const SKILL_EVIDENCE_TOOLS = new Set(['Read', 'Bash', 'ipython'])

export interface SkillActivationCollectionOptions {
  workspaceSlug?: string
  workspaceSkillsRoot?: string
}

function isWorkspaceSkillEntryPath(path: string, options?: SkillActivationCollectionOptions): boolean {
  if (!options?.workspaceSlug || !options.workspaceSkillsRoot) return false
  const root = options.workspaceSkillsRoot.replace(/\\/g, '/').replace(/\/+$/, '')
  const entry = path.replace(/\\/g, '/')
  return entry.startsWith(`${root}/`)
}

/**
 * 找出成功加载 Proma Skill 入口文件的工具调用对。
 * Read（旧通道）按入参路径判定；Bash/ipython（Prime 实际通道）按命令或
 * cell 文本中的 SKILL.md 路径引用判定。裸 tool_use 不算数：失败的读取
 * 不能变成 chip。
 */
export function collectSuccessfulSkillReadActivations(
  messages: SDKMessage[],
  options?: SkillActivationCollectionOptions,
): SkillActivation[] {
  const pendingReads = new Map<string, SkillActivation[]>()
  const activations: SkillActivation[] = []

  const recordActivation = (toolCallId: string, path: string): void => {
    const activation = createSkillActivationFromPath(
      path,
      'read',
      undefined,
      isWorkspaceSkillEntryPath(path, options) ? options?.workspaceSlug : undefined,
    )
    if (!activation) return
    const current = pendingReads.get(toolCallId)
    if (current) current.push(activation)
    else pendingReads.set(toolCallId, [activation])
  }

  for (const message of messages) {
    if (message.type === 'assistant') {
      const blocks = (message as SDKAssistantMessage).message?.content
      if (!Array.isArray(blocks)) continue
      for (const block of blocks) {
        if (block.type !== 'tool_use') continue
        const tool = block as { id?: unknown; name?: unknown; input?: unknown }
        if (!SKILL_EVIDENCE_TOOLS.has(String(tool.name)) || typeof tool.id !== 'string' || !isRecord(tool.input)) continue
        if (tool.name === 'Read') {
          const path = getReadPath(tool.input)
          if (path) recordActivation(tool.id, path)
          continue
        }
        const text = getToolTextInput(tool.input)
        if (text) {
          for (const path of collectSkillEntryPathsFromText(text)) recordActivation(tool.id, path)
        }
      }
      continue
    }

    if (message.type !== 'user') continue
    const blocks = (message as SDKUserMessage).message?.content
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (block.type !== 'tool_result') continue
      const result = block as SDKToolResultBlock
      const pending = pendingReads.get(result.tool_use_id)
      if (pending && result.is_error !== true) activations.push(...pending)
      pendingReads.delete(result.tool_use_id)
    }
  }

  return mergeSkillActivations(activations)
}

function getStoredActivations(message: SDKResultMessage | SDKUserMessage): SkillActivation[] {
  if (!Array.isArray(message.skill_activations)) return []
  return message.skill_activations
    .map(normalizeActivation)
    .filter((activation): activation is SkillActivation => activation !== null)
}

/**
 * Collect persisted metadata plus the Read fallback used by older sessions.
 * Per-user activation metadata is authoritative for new records because Pi can
 * collapse several queued user inputs into one terminal result.
 */
export function collectSkillActivations(
  messages: SDKMessage[],
  options?: SkillActivationCollectionOptions,
): SkillActivation[] {
  const inputStored = messages.flatMap((message) => (
    message.type === 'user' ? getStoredActivations(message as SDKUserMessage) : []
  ))
  const resultStored = messages.flatMap((message) => (
    message.type === 'result' ? getStoredActivations(message as SDKResultMessage) : []
  ))
  return mergeSkillActivations(
    inputStored,
    inputStored.length > 0 ? [] : resultStored,
    collectSuccessfulSkillReadActivations(messages, options),
  )
}
