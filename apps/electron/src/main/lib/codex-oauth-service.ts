/**
 * ChatGPT (OpenAI Codex) OAuth 登录服务
 *
 * 复用 Pi SDK（@earendil-works/pi-ai/oauth）内置的 Codex OAuth 流程完成登录：
 * - 登录必须在主进程（Node 侧）执行——SDK 使用 Node crypto 生成 PKCE，并在
 *   本地 127.0.0.1:1455 起回调服务接收授权码，无法在渲染进程运行。
 * - 浏览器由本服务通过 shell.openExternal 打开；SDK 内部的回调服务负责接收
 *   redirect 并完成 code→token 交换，最终返回 { access, refresh, expires, accountId }。
 *
 * token 的加密存储与过期刷新由上层（channel-manager / pi-model-registry）负责，
 * 本服务只封装"跑一次登录流程""刷新一次 token"两个纯操作。
 */

import { shell } from 'electron'
import type { CodexOAuthCredentials, CodexOAuthDeviceCode, CodexOAuthLoginMethod } from '@proma/shared'
import { runWithOAuthProxyScope } from './oauth-proxy-scope'
/** Prime 将 Codex OAuth 以纯函数暴露在 pi-ai/oauth。保持动态 import，避免 Electron 主包将 Pi runtime 内联。 */
type PiOAuth = typeof import('@earendil-works/pi-ai/oauth')

let piOAuthPromise: Promise<PiOAuth> | undefined

function loadPiOAuth(): Promise<PiOAuth> {
  piOAuthPromise ??= import('@earendil-works/pi-ai/oauth')
  return piOAuthPromise
}

type OAuthCredential = { type: 'oauth'; access: string; refresh: string; expires: number; [key: string]: unknown }

function normalizeCredentials(value: unknown): CodexOAuthCredentials {
  if (!value || typeof value !== 'object') throw new Error('Pi OAuth 未返回有效凭据')
  const credential = value as Partial<OAuthCredential>
  if (typeof credential.access !== 'string' || typeof credential.refresh !== 'string' || typeof credential.expires !== 'number') {
    throw new Error('Pi OAuth 返回的凭据缺少 access、refresh 或 expires')
  }
  return {
    access: credential.access,
    refresh: credential.refresh,
    expires: credential.expires,
    ...(typeof credential.accountId === 'string' && credential.accountId ? { accountId: credential.accountId } : {}),
  }
}

/** 进行中的登录流程的取消控制器（同一时刻只允许一个登录流程）。 */
let activeLoginAbort: AbortController | undefined

/**
 * 注意：Pi 0.80.10 的公开 OAuth API 不再接收 fetch 注入。依赖升级补丁会把
 * Proma 的代理 fetch 重新接回该流程；本 service 只负责与公开 ModelRuntime 交互。
 */

export interface CodexLoginCallbacks {
  /** SDK 生成授权 URL 后回调，用于（除自动开浏览器外）通知渲染层展示 URL。 */
  onAuthUrl?: (url: string) => void
  /** Pi 生成 device code 后回调，供 UI 展示、复制或交给另一台设备扫码。 */
  onDeviceCode?: (deviceCode: CodexOAuthDeviceCode) => void
  /** 进度消息回调。 */
  onProgress?: (message: string) => void
}

export interface CodexLoginOptions extends CodexLoginCallbacks {
  /** 默认系统浏览器；网络受限时可选择 RFC 8628 device-code 流程。 */
  method?: CodexOAuthLoginMethod
}

/**
 * 发起一次 ChatGPT (Codex) 浏览器 OAuth 登录。
 *
 * 成功返回规范化的 OAuth 凭据；用户取消或失败则抛错。
 * 登录期间自动用系统浏览器打开授权页，SDK 内部回调服务（:1455）接收授权码。
 */
export async function loginCodexOAuth(options?: CodexLoginOptions): Promise<CodexOAuthCredentials> {
  const oauth = await loadPiOAuth()
  const method = options?.method ?? 'browser'
  // Prime 的 loginOpenAICodex 只有浏览器回调流程；RFC 8628 device-code 是上游 0.8x 能力。
  if (method !== 'browser') {
    throw new Error('Prime 运行时的 Codex 登录仅支持浏览器流程，请改用"浏览器登录"')
  }

  // 取消上一个仍在进行的登录流程，避免 :1455 端口占用与并发回调。
  activeLoginAbort?.abort()
  const abort = new AbortController()
  activeLoginAbort = abort

  try {
    return await runWithOAuthProxyScope(async () => {
      const credentials = await oauth.loginOpenAICodex({
        onAuth: (info) => {
          options?.onAuthUrl?.(info.url)
          shell.openExternal(info.url).catch((err) => console.error('[Codex OAuth] 打开浏览器失败:', err))
        },
        // 桌面端没有"手工粘贴授权码"的输入面：回调服务未收到 code 即视为流程失败。
        onPrompt: async () => {
          throw new Error('Codex 登录未收到浏览器回调，请重试')
        },
        onProgress: (message) => {
          console.log(`[Codex OAuth] ${message}`)
          options?.onProgress?.(message)
        },
        // 取消通道：abort 触发时 reject，SDK 的 manual-input 分支随之终止本地回调等待。
        onManualCodeInput: () =>
          new Promise<string>((_resolve, reject) => {
            abort.signal.addEventListener('abort', () => reject(new Error('登录已取消')), { once: true })
          }),
      })
      return normalizeCredentials(credentials)
    })
  } finally {
    if (activeLoginAbort === abort) {
      activeLoginAbort = undefined
    }
  }
}

/** 取消进行中的 Codex OAuth 登录流程（若有）。 */
export function cancelCodexOAuthLogin(): void {
  activeLoginAbort?.abort()
  activeLoginAbort = undefined
}

/**
 * 用 refresh token 刷新 Codex OAuth 凭据。
 *
 * 返回新的规范化凭据（含新的 expires）。SDK 在 refresh token 未轮换时会复用旧值。
 */
export async function refreshCodexOAuth(refreshToken: string): Promise<CodexOAuthCredentials> {
  const oauth = await loadPiOAuth()
  return runWithOAuthProxyScope(async () => {
    // Prime 直接暴露纯函数刷新；返回值含 access/refresh/expires/accountId。
    return normalizeCredentials(await oauth.refreshOpenAICodexToken(refreshToken))
  })
}
