/**
 * `lead` 封顶（01 §5.2 K2-6 / K3、§7.2、§7.5；s0 审计 §7.3）——只用于有 mode 的 run。
 *
 * 封顶不是拒绝（A2）：prereg 照常冻结，迁移照常落账，只是请求的 SUPPORTED / REFUTED 落成
 * `CONTESTED + lead{requested, caps}`，claim 留在竞争里。宿主只查结构（字段在不在、带重不重叠、
 * 出处标签是不是 sim / measured），从不判语义——正则代理语义 2/3 假阳性（DN:61）。
 */

import {
  ResearchStateError, isAlive, type Band, type ClaimRecord, type PreregBranch, type ProbeSpec, type ResearchState, type SimCitation,
} from './state'

export type CapCode =
  | 'no_discrimination'
  | 'no_headline'
  | 'asserted_band'
  | 'rival_overlap'
  | 'no_audit'
  | 'audit_unverified'
  | 'self_reviewed'

export interface Cap {
  code: CapCode
  detail: string
}

/** 每条封顶的出口（成功返回值里内联：卡片摘录 + 一个具体下一步，01 §6.5）。 */
export const CAP_HINTS: Record<CapCode, string> = {
  no_discrimination: 'prereg 缺 discrimination（判别度：d、σ、r*、仿真记录 id）→ 该 prereg 的 support 结论封顶 lead；下一个 prereg 写上 discrimination',
  no_headline: '分支缺 headline（该分支命中时报告的第一句，HYPOTHETICAL）→ 该分支封顶 lead；coherence-dry-run：先写出每个结果分支会让报告第一句怎么说，再登记',
  asserted_band: '目标的频段出处是 asserted / invented / 未标（spec.provenance）→ 只凭手写频段的 kill / support 封顶 lead；用 sim:<记录>（spec.sims 引用）或 measured:P# 标出处',
  rival_overlap: '封顶不是拒绝：support 带与对手带重叠，或对手没进 bands → 设计判别探针：把这些对手（含 H0）放进 bands，并让 support 带与它们全部互斥',
  no_audit: 'SUPPORTED（或家族级 REFUTED）没带 audit → K3 审计：开一个 W2，只查 note 里每个数字在账本有出处、band 出处标签按语义成立；它写 .rlm-jobs/<run>/k3/<H#>/<nonce>/out.md（末行 STATUS: ok PATH: …）后，带 audit=<该路径> 重新 claim_transition',
  audit_unverified: 'audit 不是 .rlm-jobs/<run>/ 下、末行为 `STATUS: ok PATH: …` 的普通文件 → 按未审计读；修好审计产物后带 audit 重迁',
  self_reviewed: '审计是父会话代写（SELF_REVIEWED / -self 目录）→ 封顶 lead；要去掉封顶，重开一个 W2 审计窗口',
}

const filled = (text?: string) => typeof text === 'string' && text.trim() !== ''
const overlaps = (a: Band, b: Band) => !(a[1] < b[0] || b[1] < a[0])

/** 频段出处是否可核对（sim / measured）；其余一律按 asserted。 */
function bandBacked(spec: ProbeSpec, claimId: string): boolean {
  // 只认 validateProvenance 核对过的两种写法；`measured:foo` 之类没被核对，按 asserted
  return /^(sim:\S|measured:P\d+$)/.test(spec.provenance?.[claimId]?.trim() ?? '')
}

/**
 * support 的互斥检查：对手 = 仍在竞争的其他 claim。identify 要"唯一存活"（01 §3.0），所以全部活 claim
 * 都是对手、没进 bands 的也算不互斥；open / score 只看进了 bands 的对手 + 内置 H0。
 */
function rivalOverlap(spec: ProbeSpec, branch: PreregBranch, state: ResearchState): Cap | undefined {
  const contract = state.contract
  const alive = state.claims.filter((c) => c.id !== branch.target && isAlive(c.state, contract))
  const pool = contract?.mode === 'identify' ? alive : alive.filter((c) => c.id in spec.bands || c.builtin)
  const hits = pool.filter((c) => !spec.bands[c.id] || overlaps(spec.bands[c.id], branch.band))
  if (hits.length === 0) return undefined
  const detail = hits.map((c) => (spec.bands[c.id] ? `${c.id} [${spec.bands[c.id].join(', ')}]` : `${c.id}（未入 bands）`)).join('、')
  return { code: 'rival_overlap', detail: `support 带 [${branch.band.join(', ')}] 对 ${detail}` }
}

/** 一个 kill / support 分支在当前状态下的封顶理由；scope 分支不封顶（收窄本来就不是强结论）。 */
export function branchCaps(spec: ProbeSpec, branch: PreregBranch, state: ResearchState): Cap[] {
  if (branch.action === 'scope') return []
  const caps: Cap[] = []
  if (branch.action === 'support' && !filled(spec.discrimination)) {
    caps.push({ code: 'no_discrimination', detail: `${spec.pid} 无 discrimination` })
  }
  if (!filled(branch.headline)) {
    caps.push({ code: 'no_headline', detail: `${branch.action} ${branch.target} [${branch.band.join(', ')}] 无 headline` })
  }
  if (!bandBacked(spec, branch.target)) {
    caps.push({ code: 'asserted_band', detail: `${branch.target} 的频段出处：${spec.provenance?.[branch.target] ?? '未标'}` })
  }
  if (branch.action === 'support') {
    const rival = rivalOverlap(spec, branch, state)
    if (rival) caps.push(rival)
  }
  return caps
}

/** 家族级 claim（机制族而非参数点）：显式标注优先；identify 下没有 parent 的默认是族（s0 审计 §7.3）。 */
export function isFamilyLevel(claim: ClaimRecord, state: ResearchState): boolean {
  if (claim.level) return claim.level === 'family'
  return state.contract?.mode === 'identify' && !claim.parent
}

/**
 * mode run 的终态迁移：必须执行预登记写下的动作（否则拒——那是改判，不是封顶的范围）；
 * SUPPORTED / REFUTED 的封顶理由 = 最有利的那条命中分支的封顶 + K3 审计（SUPPORTED 必审，REFUTED 只审家族级）。
 */
export function decideTransition(
  spec: ProbeSpec,
  claim: ClaimRecord,
  to: 'SUPPORTED' | 'REFUTED' | 'SCOPED',
  metric: number,
  inBandBranches: PreregBranch[],
  state: ResearchState,
  inspected: { audit?: SimCitation; cap?: Cap } | undefined,
): { caps: Cap[]; audit?: SimCitation } {
  const action = ({ SUPPORTED: 'support', REFUTED: 'kill', SCOPED: 'scope' } as const)[to]
  const matching = inBandBranches.filter((b) => b.action === action)
  if (matching.length === 0) {
    throw new ResearchStateError(
      `${spec.pid} 在 ${metric} 处对 ${claim.id} 预登记的动作是 ${[...new Set(inBandBranches.map((b) => b.action))].join(' / ')}，不是 ${action}：`
      + '迁移只能执行预登记写下的动作 → 照预登记迁移，或为新判断预登记一个新探针',
    )
  }
  if (to === 'SCOPED') return { caps: [], audit: inspected?.audit }
  const caps = matching.map((b) => branchCaps(spec, b, state)).reduce((best, next) => (next.length < best.length ? next : best))
  const needsAudit = to === 'SUPPORTED' || isFamilyLevel(claim, state)
  if (needsAudit && !inspected) caps.push({ code: 'no_audit', detail: `${to} ${claim.id}${to === 'REFUTED' ? '（家族级）' : ''} 没带 audit` })
  if (needsAudit && inspected?.cap) caps.push(inspected.cap)
  return { caps, audit: inspected?.audit }
}

/** prereg_write 成功返回值里的封顶提示（不进 rejections.jsonl：那里只记真实拒绝）。 */
export function preregCapLines(spec: ProbeSpec, state: ResearchState): string[] {
  const lines = (spec.branches ?? []).flatMap((branch) => branchCaps(spec, branch, state)
    .map((cap) => `- ${branch.action} ${branch.target}：${cap.detail} — ${CAP_HINTS[cap.code]}`))
  return lines.length === 0 ? [] : ['封顶提示（不是拒绝；prereg 已冻结，命中这些分支的迁移按 lead 落账）：', ...lines]
}

export function capLines(caps: Cap[]): string {
  return caps.map((cap) => `- ${cap.code}：${cap.detail} — ${CAP_HINTS[cap.code]}`).join('\n')
}
