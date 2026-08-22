/**
 * xAI（Grok/X 订阅）OAuth 登录服务 —— Prime 运行时下停用。
 *
 * 上游 Pi 0.8x 内置了 xAI device-code OAuth；Prime fork（0.7.x）没有该
 * provider，也没有对应的 token 刷新实现。为避免"看似登录成功、请求静默
 * 401"，登录与刷新都显式报错。xAI 仍可通过 API key 渠道正常使用。
 *
 * 若要恢复订阅登录：把上游 pi-ai 的 xai OAuth provider 移植进
 * prime-agent/packages/ai/src/utils/oauth/，本文件恢复为调用它的薄封装。
 */

import type { XaiOAuthCredentials, XaiOAuthDeviceCode } from '@proma/shared'

export interface XaiLoginCallbacks {
  /** 将 device code 推送到 UI，供浏览器未预填时手动填写。 */
  onDeviceCode?: (deviceCode: XaiOAuthDeviceCode) => void
}

const XAI_OAUTH_UNSUPPORTED =
  'xAI（Grok 订阅）登录暂不支持 Prime 运行时，请改用 xAI API key 渠道'

export async function loginXaiOAuth(_callbacks?: XaiLoginCallbacks): Promise<XaiOAuthCredentials> {
  throw new Error(XAI_OAUTH_UNSUPPORTED)
}

export function cancelXaiOAuthLogin(): void {
  // 没有可取消的流程。
}

export async function refreshXaiOAuth(_refreshToken: string): Promise<XaiOAuthCredentials> {
  throw new Error(XAI_OAUTH_UNSUPPORTED)
}
