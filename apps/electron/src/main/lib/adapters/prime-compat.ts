/**
 * Prime 运行时兼容层：用 Prime fork（@earendil-works/pi-* 0.7.x）的
 * ModelRegistry + AuthStorage 复刻上游 Pi 0.84.x ModelRuntime 的最小 API 面。
 *
 * 上游 ModelRuntime 在 Prime 中不存在；除 OAuth service 外，所有差异都收敛在
 * 本文件 —— 调用方继续用 getModel/getModels/registerProvider/getAuth，
 * 不感知底层是哪个运行时。
 *
 * 已知不对等（调用方需自行处理）：
 * - Prime 没有内置 xAI OAuth provider：xAI 订阅渠道无法解析凭据，
 *   buildXaiModel 必须显式报错而非静默 401。
 * - Prime 没有 pi-ai 原生重试（willRetry / retryAssistantCall）：
 *   瞬时网关错误会直接上抛，由上层决定是否重试。
 */
import type { Api, AssistantMessage, Context, Model, OAuthCredentials, StreamOptions } from '@earendil-works/pi-ai'
import type { AuthStorage, AuthStorageBackend, ModelRegistry, OAuthCredential } from '@earendil-works/pi-coding-agent'

type PiSdk = typeof import('@earendil-works/pi-coding-agent')

export type ProviderConfigInput = Parameters<ModelRegistry['registerProvider']>[1]

type RuntimeOAuthCredential = OAuthCredentials & { type: 'oauth' }

/** 上游 ModelRuntime 的内存凭据仓接口（Proma 的 codex/ephemeral store 均实现它）。 */
export interface RuntimeCredentialStore {
  read(providerId?: string): Promise<RuntimeOAuthCredential | undefined>
  list(): Promise<readonly { providerId: string; type: 'oauth' }[]>
  modify(
    providerId: string,
    fn: (current: RuntimeOAuthCredential | undefined) => Promise<RuntimeOAuthCredential | undefined>,
  ): Promise<RuntimeOAuthCredential | undefined>
  delete(providerId: string): Promise<void>
}

export interface PrimeModelRuntime {
  readonly registry: ModelRegistry
  readonly authStorage: AuthStorage
  getModel(provider: string, modelId: string): Model<Api> | undefined
  getModels(provider: string): Model<Api>[]
  registerProvider(providerName: string, config: ProviderConfigInput): void
  /** 解析 provider 的可用 API key；OAuth 凭据过期时由 AuthStorage 自动刷新并回写。 */
  getAuth(provider: string): Promise<string | undefined>
  /** 一次性补全（上游 runtime.complete）：先经 registry 解析认证，再走 pi-ai 的 complete。 */
  complete<TApi extends Api>(model: Model<TApi>, context: Context, options?: StreamOptions): Promise<AssistantMessage>
}

/**
 * 内存 AuthStorage 后端：Prime 刷新 OAuth token 时经由 withLock 写回，
 * 本后端将变更镜像回 Proma 的凭据仓（进而持久化 + 触发 onRefreshed）。
 * 缺少镜像时，轮换后的 refresh token 只活在内存里，下次会话即失效。
 */
class MirroringAuthStorageBackend implements AuthStorageBackend {
  private value: string | undefined

  constructor(private onOAuthChange?: (providerId: string, credential: OAuthCredential) => void) {}

  /** 初始灌入凭据，不触发镜像回写。 */
  seed(data: Record<string, OAuthCredential>): void {
    this.value = JSON.stringify(data)
  }

  withLock<T>(fn: (current: string | undefined) => { result: T; next?: string }): T {
    const { result, next } = fn(this.value)
    this.commit(next)
    return result
  }

  async withLockAsync<T>(fn: (current: string | undefined) => Promise<{ result: T; next?: string }>): Promise<T> {
    const { result, next } = await fn(this.value)
    this.commit(next)
    return result
  }

  private commit(next: string | undefined): void {
    if (next === undefined || next === this.value) return
    const previous = this.value
    this.value = next
    if (!this.onOAuthChange) return
    try {
      const before = (previous ? JSON.parse(previous) : {}) as Record<string, OAuthCredential>
      const after = (next ? JSON.parse(next) : {}) as Record<string, OAuthCredential>
      for (const [providerId, credential] of Object.entries(after)) {
        if (credential?.type !== 'oauth') continue
        if (JSON.stringify(before[providerId]) === JSON.stringify(credential)) continue
        this.onOAuthChange(providerId, credential)
      }
    } catch (error) {
      console.warn('[prime-compat] OAuth 凭据镜像解析失败:', error)
    }
  }
}

export async function createModelRuntime(
  sdk: PiSdk,
  options?: {
    credentials?: RuntimeCredentialStore
    /** 上游遗留参数：Prime 的 inMemory registry 恒为离线目录，此值仅兼容占位。 */
    allowModelNetwork?: boolean
  },
): Promise<PrimeModelRuntime> {
  const store = options?.credentials

  const backend = new MirroringAuthStorageBackend(
    store
      ? (providerId, credential) => {
          void store
            .modify(providerId, async () => credential as RuntimeOAuthCredential)
            .catch((error) => console.warn(`[prime-compat] ${providerId} 凭据回写失败:`, error))
        }
      : undefined,
  )

  if (store) {
    const seed: Record<string, OAuthCredential> = {}
    for (const entry of await store.list()) {
      const credential = await store.read(entry.providerId)
      if (credential) seed[entry.providerId] = credential as OAuthCredential
    }
    backend.seed(seed)
  }

  const authStorage = sdk.AuthStorage.fromStorage(backend)
  const registry = sdk.ModelRegistry.inMemory(authStorage)

  return {
    registry,
    authStorage,
    getModel: (provider, modelId) => registry.find(provider, modelId),
    getModels: (provider) => registry.getAll().filter((m) => m.provider === provider),
    registerProvider: (providerName, config) => registry.registerProvider(providerName, config),
    getAuth: (provider) => registry.getApiKeyForProvider(provider),
    complete: async (model, context, options) => {
      const { complete } = await import('@earendil-works/pi-ai')
      const auth = await registry.getApiKeyAndHeaders(model)
      if (!auth.ok) throw new Error(`模型 ${model.provider}/${model.id} 认证解析失败: ${auth.error}`)
      return complete(model, context, {
        ...options,
        ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
        ...(auth.headers || options?.headers
          ? { headers: { ...auth.headers, ...options?.headers } }
          : {}),
      })
    },
  }
}
