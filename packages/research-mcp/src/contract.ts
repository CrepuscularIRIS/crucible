/**
 * 01 §3.0 / §9.1 P2：research_init 的冻结字段与按 mode 内置的 H0。
 *
 * mode 在 init 时冻结，切换 = 开新 run [HC-Q1]；没有 mode 的 run 走 legacy 规则，且不能事后补 mode
 * ——补上会让已有 journal 换一套语义重放（SCOPED 突然变成 narrowed）。
 */

import { ResearchStateError, type ResearchMode, type ResearchState, type RunContract } from './state'

export interface ContractInput {
  mode?: ResearchMode
  success_predicate?: string
  depth?: RunContract['depth']
  recall?: RunContract['recall']
}

/** 谓词默认值逐字取 01 §3.0 的表（K0 没写时用它，并在返回值里说明是默认）。 */
const DEFAULT_PREDICATE: Record<ResearchMode, string> = {
  open: 'claim X 被判别探针支持，且 scoop delta 句已写（Level≠1）',
  score: 'admit(best) − admit(incumbent) ≥ δ，跨 seed',
  identify: 'LIVE 收缩到 1 个或一个写明的等价类，且 forecast 已提交',
}

/**
 * recall 默认：open 开（召回是 open 的核心）；identify / score 默认 parametric-only——benchmark 公平
 * （Arbor 默认两条检索通道都关），但仍许凭记忆给"家族名 + 检索词"（R-3）。INFERRED·Claude 自决。
 */
const DEFAULT_RECALL: Record<ResearchMode, RunContract['recall']> = {
  open: 'on',
  score: 'parametric-only',
  identify: 'parametric-only',
}

/** 内置 H0（01 §7.2）：identify = null，score = incumbent；open 的 H0′ 是候选专属的，K1 经 claim_propose{parent} 登记。 */
export const BUILTIN_H0: Partial<Record<ResearchMode, { statement: string; predicts: string[] }>> = {
  identify: {
    statement: '内置 H0（null）：真实系统与参考模型（无附加机制）无可分辨差异，观测偏离都在噪声内',
    predicts: ['观测落在参考模型的仿真分布内（无附加机制）'],
  },
  score: {
    statement: '内置 H0（incumbent）：没有任何变体在冻结评测上超过 incumbent 达 margin',
    predicts: ['admit(best) − admit(incumbent) < δ'],
  },
}

export interface InitPlan {
  /** 写进 run.init 的字段（空 = legacy / 重开） */
  fields: Record<string, unknown>
  /** 本次是否第一次冻结契约（要登记 H0） */
  fresh: boolean
  contract?: RunContract
}

/** 解析 research_init 的契约参数；与已冻结的契约冲突即拒（拒绝文本就是出口：开新 run）。 */
export function planInit(existing: ResearchState | undefined, input: ContractInput): InitPlan {
  const given = Object.entries(input).filter(([, value]) => value !== undefined).map(([key]) => key)
  if (!input.mode) {
    if (given.length > 0) {
      throw new ResearchStateError(`${given.join(', ')} 只在给了 mode 时有意义 → research_init 带 mode（open | score | identify）`)
    }
    return { fields: {}, fresh: false, contract: existing?.contract }
  }
  const contract: RunContract = {
    mode: input.mode,
    successPredicate: input.success_predicate?.trim() || DEFAULT_PREDICATE[input.mode],
    depth: input.depth ?? 'light',
    recall: input.recall ?? DEFAULT_RECALL[input.mode],
  }
  if (existing && !existing.contract) {
    throw new ResearchStateError('这是没有 mode 的 legacy run，不能事后补 mode（已有 journal 会换一套语义重放）→ 开一个新 run 名')
  }
  if (existing?.contract) {
    const frozen = existing.contract
    const clash = given.filter((key) => {
      if (key === 'mode') return frozen.mode !== contract.mode
      if (key === 'success_predicate') return frozen.successPredicate !== contract.successPredicate
      return frozen[key as 'depth' | 'recall'] !== contract[key as 'depth' | 'recall']
    })
    if (clash.length > 0) {
      throw new ResearchStateError(
        `run 契约已在 init 时冻结（mode=${frozen.mode} · predicate=${frozen.successPredicate} · depth=${frozen.depth} · recall=${frozen.recall}），`
        + `不能改 ${clash.join(', ')}：切换模式或谓词 = 开新 run（K5 reframe 只写"建议开新 run"）`,
      )
    }
    return { fields: {}, fresh: false, contract: frozen }
  }
  const defaults = (['success_predicate', 'depth', 'recall'] as const).filter((key) => input[key] === undefined || (key === 'success_predicate' && !input[key]?.trim()))
  return {
    fresh: true,
    contract,
    fields: {
      mode: contract.mode,
      success_predicate: contract.successPredicate,
      depth: contract.depth,
      recall: contract.recall,
      ...(defaults.length > 0 ? { defaults } : {}),
    },
  }
}

export function describeContract(contract: RunContract): string {
  return `mode=${contract.mode} · predicate=${contract.successPredicate} · depth=${contract.depth} · recall=${contract.recall}`
}
