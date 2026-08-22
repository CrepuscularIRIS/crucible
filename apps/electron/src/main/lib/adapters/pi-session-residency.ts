/**
 * 会话驻留登记表（Track B #1）。
 *
 * 目标：把 Proma 的「每轮 query 新建 + dispose AgentSession」换成
 * 「每个会话一条常驻 AgentSession，空闲超时后再释放」。收益：
 * - auto-refine 的 assistant 轮数计数跨用户消息累计（Prime 原生条件触发得以生效）；
 * - goal/autonomous 状态延续；kernel 快照等长程能力有落点。
 *
 * 纯逻辑、零 SDK 依赖：AgentSession 以最小 Disposable 形状注入，便于单测。
 * owner 令牌防止并发 query 的释放路径误清新占有者的槽位。
 */

export interface DisposableSession {
  dispose: () => unknown
}

export interface ResidentSessionEntry<T extends DisposableSession> {
  key: string
  session: T
  /** 当前占用者（一般是一次 query 的 active 句柄）；空闲时为 undefined */
  owner?: object
  idleTimer?: NodeJS.Timeout
}

export interface ResidencyOptions {
  /** 空闲多久后 dispose；<=0 表示常驻直到 disposeAll */
  idleMs: number
  /** dispose 完成后的回调（日志/观测） */
  onDispose?: (key: string, reason: 'idle' | 'replaced' | 'shutdown') => void
}

export class ResidentSessionRegistry<T extends DisposableSession> {
  private entries = new Map<string, ResidentSessionEntry<T>>()
  private shutDown = false

  constructor(private readonly options: ResidencyOptions) {}

  get(key: string): ResidentSessionEntry<T> | undefined {
    return this.entries.get(key)
  }

  /** 命中并占用：清掉 idle timer，记 owner。未命中/已关闭返回 undefined。 */
  acquire(key: string, owner: object): ResidentSessionEntry<T> | undefined {
    if (this.shutDown) return undefined
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = undefined
    }
    entry.owner = owner
    return entry
  }

  /** 新建或替换：同 key 旧会话立即 dispose（模型/环境指纹变化时由调用方触发）。 */
  install(key: string, session: T, owner: object): ResidentSessionEntry<T> {
    const previous = this.entries.get(key)
    if (previous) {
      this.disposeEntry(previous, 'replaced')
    }
    const entry: ResidentSessionEntry<T> = { key, session, owner }
    this.entries.set(key, entry)
    return entry
  }

  /** 释放占用：只有当前 owner 能释放；成功释放后排空闲计时。 */
  release(key: string, owner: object): 'released' | 'not-found' | 'owner-mismatch' {
    const entry = this.entries.get(key)
    if (!entry) return 'not-found'
    if (entry.owner !== owner) return 'owner-mismatch'
    entry.owner = undefined
    if (this.options.idleMs > 0 && !this.shutDown) {
      entry.idleTimer = setTimeout(() => {
        this.disposeEntry(entry, 'idle')
      }, this.options.idleMs)
      // 计时器不阻止进程退出
      entry.idleTimer.unref?.()
    }
    return 'released'
  }

  /** 主动丢弃（外部发现指纹变化时用；语义等同 install 替换）。 */
  evict(key: string): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false
    this.disposeEntry(entry, 'replaced')
    return true
  }

  async disposeAll(): Promise<void> {
    this.shutDown = true
    const pending: Promise<unknown>[] = []
    for (const entry of [...this.entries.values()]) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer)
      const maybePromise = entry.session.dispose()
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        pending.push(maybePromise as Promise<unknown>)
      }
      this.options.onDispose?.(entry.key, 'shutdown')
    }
    this.entries.clear()
    await Promise.allSettled(pending)
  }

  get size(): number {
    return this.entries.size
  }

  private disposeEntry(entry: ResidentSessionEntry<T>, reason: 'idle' | 'replaced' | 'shutdown'): void {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = undefined
    }
    if (this.entries.get(entry.key) === entry) {
      this.entries.delete(entry.key)
    }
    try {
      entry.session.dispose()
    } finally {
      this.options.onDispose?.(entry.key, reason)
    }
  }
}

/** 驻留指纹：任何一个分量变化都应重建会话（保守策略，正确优先于复用率）。 */
export function computeResidencyKey(parts: {
  provider: string
  model: string
  thinkingLevel: string
  cwd: string
  agentDir: string
  sessionDir: string
  systemPrompt: string
  additionalSkillPaths: string[]
  projectInstructionFiles: string[]
  projectScope?: string
  autonomous?: string
}): string {
  return [
    parts.provider,
    parts.model,
    parts.thinkingLevel,
    parts.cwd,
    parts.agentDir,
    parts.sessionDir,
    hashString(parts.systemPrompt),
    [...parts.additionalSkillPaths].sort().join('|'),
    [...parts.projectInstructionFiles].sort().join('|'),
    parts.projectScope ?? '',
    parts.autonomous ?? '',
  ].join('§')
}

function hashString(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
