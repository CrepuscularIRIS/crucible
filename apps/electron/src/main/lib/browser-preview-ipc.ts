import { ipcMain } from 'electron'
import { AGENT_IPC_CHANNELS } from '@proma/shared'
import type { BrowserTabInput } from '@proma/shared'
import type { BrowserController } from './browser-controller'

/** 桌面与 Web 桥复用同一入口，授权由主进程既有会话检查提供。 */
export function registerBrowserPreviewIpc(
  controller: BrowserController,
  assertSessionAccess: (senderId: number, sessionId: string) => Promise<void>,
): void {
  ipcMain.handle(AGENT_IPC_CHANNELS.GET_BROWSER_PREVIEW, async (event, input: BrowserTabInput) => {
    if (!input || typeof input.sessionId !== 'string' || typeof input.tabId !== 'string' || !input.tabId) throw new Error('无效的浏览器快照请求。')
    await assertSessionAccess(event.sender.id, input.sessionId)
    return controller.preview(input.sessionId, input.tabId)
  })
}
