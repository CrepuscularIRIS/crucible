/**
 * web-bridge 监听地址的解析。
 *
 * 单独成文件只有一个原因：web-bridge.ts 在模块顶层 import 'electron'，
 * 测试它就得 mock.module('electron')，而那会跨测试文件污染（planning-manager
 * 已经被这条坑过一次）。默认值是安全边界，必须有一条不依赖 mock 的检查看着它。
 */

/** 默认回环。只有容器会显式改，且端口只发布到宿主回环。 */
export function resolveWebBridgeHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.PROMA_WEB_BRIDGE_HOST?.trim() || '127.0.0.1'
}
