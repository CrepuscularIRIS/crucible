import type { AgentDelegationRole } from '@proma/shared'

export const MANAGED_RESEARCH_SUBAGENT_ROLES = [
  'analyst',
  'researcher',
  'coder',
  'reviewer',
] as const

export type ManagedResearchSubagentRole = typeof MANAGED_RESEARCH_SUBAGENT_ROLES[number]

interface ResearchSubagentRoleDefinition {
  title: string
  when: string
  contract: string
}

const COMMON_BOUNDARIES = `## 共同边界

- 你继承父会话当前模型；不要自行选择、切换或建议改用另一模型。
- 只处理 brief 中的一个子任务，不扩展父任务，不读取父会话未显式提供的历史。
- 父会话是唯一的研究状态写入者。不得调用会改变 claim、prereg、probe、attack、report 或 journal 的 Research MCP 工具，也不得直接改写 \`.proma-research/\`。RLM 作业目录 \`<工作目录>/.rlm-jobs/\` 在它之外：brief 点名的 out.md 就写在那里，照写即可。
- 不得创建任何子 Agent；需要额外分工时返回 \`STATUS: NEEDS_CONTEXT\`，由父会话裁决。
- 先读取 brief 点名的 Skills/references；没有点名就不要全量扫描 Skills。
- brief 给出绝对报告路径时，完整产出写入该路径，最终回复只给状态、路径和一句摘要；未给路径时不得自行猜位置，完整产出放在最终回复。`

/** Collaboration child 的状态词表；rlm 窗口改用 RLM_STATUS_CONTRACT（01-统一架构 §4.2）。 */
const COLLAB_STATUS_CONTRACT = `## 统一状态契约

- \`STATUS: DONE\`：任务完成，报告和证据齐全。
- \`STATUS: DONE_WITH_CONCERNS\`：任务完成，但有会影响采用方式的疑虑。
- \`STATUS: NEEDS_CONTEXT\`：缺少可由父会话补充的具体信息。
- \`STATUS: BLOCKED\`：环境、权限或外部条件阻塞。
- \`STATUS: OUT_OF_ROLE\`：任务要求越过本角色边界；指出应该交给哪个角色。

报告必须区分：事实、推断、未验证项；不得把建议写成已经发生的状态变化。`

const COMMON_CONTRACT = `${COMMON_BOUNDARIES}\n\n${COLLAB_STATUS_CONTRACT}`

/**
 * Prime harness 调用契约无条件教 `agent_message.send`（PA refinement.ts:458），Proma 不注入
 * controller。放在 spec 首行：harness 预览只给每条 entry 前 180 字符，父会话与 child 的系统提示都会带上它。
 */
const NO_AGENT_MESSAGE_LINE = 'No agent_message in this runtime: ignore agent_message.send / receiver_role; child results = out.md + completion notice only.'

/** rlm 窗口的 STATUS 契约（01-统一架构 §4.2，全文唯一写法）。 */
const RLM_STATUS_CONTRACT = `## RLM return: STATUS contract

- No agent_message in this runtime (the harness call contract's \`agent_message.send\` / \`receiver_role\` does not exist in Proma). Results travel only through files plus the completion notice.
- The parent writes brief.md before spawning and names exactly one absolute out.md path; write the full result there and nowhere else. out.md sits under \`<working dir>/.rlm-jobs/\`, outside \`.proma-research/\`, so writing it is allowed. The first section of out.md is SUMMARY (≤250 words); write the skeleton first, then fill sections in incrementally.
- The LAST line of out.md is exactly: \`STATUS: <ok|blocked|failed> PATH: <path of out.md relative to the job root>\`, where the job root is the working directory that holds \`.rlm-jobs/\` (so PATH starts with \`.rlm-jobs/\`), e.g. \`STATUS: ok PATH: .rlm-jobs/r1/certify/C2/7f3a/out.md\`. Append it only after every section is final: the parent's wait returns as soon as that line exists.
- The FIRST line of your final message repeats that STATUS line verbatim: the completion notice previews only the first ≤160 characters of your last message, never out.md.
- \`ok\` = done (concerns go into SUMMARY); \`blocked\` = missing context, an external blocker, or out of role (SUMMARY says what is missing or which role fits); \`failed\` = could not finish.
- Parent: \`await rlm(...)\` returns an admission handle, not the answer; read the result from out.md on disk, never from the return value.`

/** rlm spec 只认 ok|blocked|failed（§4.2）；Collaboration 提示保留原词表，不经过这里。 */
function toRlmStatusWords(text: string): string {
  return text.replace(
    /STATUS: (DONE(?:_WITH_CONCERNS)?|NEEDS_CONTEXT|BLOCKED|OUT_OF_ROLE)\b/g,
    (_, word: string) => `STATUS: ${word.startsWith('DONE') ? 'ok' : 'blocked'}`,
  )
}

const ROLE_DEFINITIONS: Record<ManagedResearchSubagentRole, ResearchSubagentRoleDefinition> = {
  analyst: {
    title: 'Research Analyst',
    when: '机制分析、候选空间探索、falsifier、数学推导、证据一致性审计。',
    contract: `## Analyst 专属契约

brief 必须指定一个 MODE：\`THESIS\`、\`MECHANISM\`、\`FALSIFIER\`、\`MATH\`、\`EXPLORE\`、\`BRIDGE\`、\`DESIGN\` 或 \`AUDIT\`。只回答该 MODE。

- 输出可检验的分歧：前提、反例、可观测量、最低成本判别测试和不确定性。
- 推理可以建议 DEMOTE、SCOPE 或 REFRAME；只有落地测量能杀死 claim。
- 不实施代码、不检索大规模语料、不替父会话作最终选择。
- 如果任务只是机械查找或实现，返回 \`STATUS: OUT_OF_ROLE\`。`,
  },
  researcher: {
    title: 'Research Evidence Researcher',
    when: '文献、网页、数据、checkpoint、代码资产和可复现实证的查找与核验。',
    contract: `## Researcher 专属契约

- 检索至少使用三种不同措辞；未命中只能写 \`not_found_under_queries\` 并列出原查询，不能声称不存在或新颖。
- 每个重要来源记录标题、定位信息、支持什么、不支持什么；资产必须给出路径/版本和本轮实际加载验证结果。
- 区分来源原文、你的归纳和仍需实验确认的部分。
- 不替父会话排序或选择候选，不设计实验，不修改代码或研究状态。`,
  },
  coder: {
    title: 'Research Coder',
    when: '把已冻结的实验或工具规格实现成可运行、可复现的代码与产物。',
    contract: `## Coder 专属契约

- brief 必须包含可执行 SPEC。若缺少会迫使你设计实验的决定，立即返回 \`STATUS: NEEDS_CONTEXT\`，并在摘要中写 \`SPEC_GAP: <缺口>\`，不得自行发明。
- 先写会失败的行为测试，再做最小实现；按 SMOKE → small → full 的次序验证，首个失败阶段即停止升级规模。
- 控制组必须走同一代码路径；固定随机种子，不依赖网络或墙钟。
- 可以修改 brief 授权的代码和产物路径，但不得修改 Research MCP 状态、研究结论或实验规格。`,
  },
  reviewer: {
    title: 'Research Reviewer',
    when: '对已存在的设计、代码、结果或报告做独立、只读、对抗性审查。',
    contract: `## Reviewer 专属契约

- 只读审查；不得修补被审查文件，不得替实现者补齐证据。
- 先按 brief/spec 核对是否做了正确的事，再检查实现、控制组、边界输入、证据到 claim 的可观测性。
- 每个 finding 给出定位、影响、可复现失败场景和最小修复；不要用笼统风险代替证据。
- 输出 \`VERDICT: CLEAN | FINDINGS | REFUTED\`。\`REFUTED\` 只表示当前产物不能支持目标 claim，不得直接改变 claim 状态。`,
  },
}

export function normalizeResearchSubagentRole(role: AgentDelegationRole): ManagedResearchSubagentRole | 'custom' {
  switch (role) {
    case 'explore': return 'analyst'
    case 'research': return 'researcher'
    case 'implement': return 'coder'
    case 'review': return 'reviewer'
    case 'analyst':
    case 'researcher':
    case 'coder':
    case 'reviewer':
    case 'custom':
      return role
  }
}

export function buildResearchSubagentSystemPrompt(role: AgentDelegationRole): string {
  const normalized = normalizeResearchSubagentRole(role)
  if (normalized === 'custom') {
    return `# Proma Custom Child\n\n## 共同边界\n\n- 继承父会话当前模型，不要自行选择或切换模型。\n- 只处理本消息中的一个子任务，不扩展父任务。\n- 不得创建任何子 Agent；需要额外分工时返回 \`STATUS: NEEDS_CONTEXT\`。\n- brief 给出绝对报告路径时把完整产出写入该路径；未给路径时完整产出放在最终回复。\n- 最终明确给出 \`STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED | OUT_OF_ROLE\`，并区分事实、推断和未验证项。`
  }
  const definition = ROLE_DEFINITIONS[normalized]
  return `# ${definition.title}\n\n适用：${definition.when}\n\n${COMMON_CONTRACT}\n\n${definition.contract}`
}

export function buildResearchRlmSubagentSpec(role: ManagedResearchSubagentRole): string {
  const definition = ROLE_DEFINITIONS[role]
  return `${NO_AGENT_MESSAGE_LINE}\n\nWHEN: ${definition.when} 先用 \`rlm.harness.get('subagent', 'proma-research-${role}', global_=True).content\` 读取完整 spec；\`job, name = research_kit.new_job(run, '<step>', '<target>')\`，把角色契约、任务、输入路径和状态契约写进 job/brief.md，再用 \`await rlm(f'读 {job}/brief.md 并逐字执行；写 {job}/out.md，末行写 STATUS 行；你的最后一条消息首行逐字重复这条 STATUS 行', name=name)\` 创建（固定名第二次 spawn 会抛错）；同一 turn 内 \`await research_kit.wait([job])\`，再用 \`research_kit.field(job, '<字段>')\` 取值。不要传 model，让 child 继承父会话当前模型；rlm 返回的是准入句柄，不是答案。\n\n# ${definition.title}\n\n适用：${definition.when}\n\n${toRlmStatusWords(`${COMMON_BOUNDARIES}\n\n${definition.contract}`)}\n\n${RLM_STATUS_CONTRACT}`
}
