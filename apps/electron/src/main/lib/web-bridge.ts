/**
 * web-bridge —— 让整个应用能在普通浏览器里跑起来。
 *
 * 做法不是把主进程移植成 Node 服务，而是把 Electron 主进程**当后端**：
 * 浏览器只是它的第二个视图。因此 344 个 ipcMain 处理器一个都不用改写。
 *
 * 三件事：
 * 1. 包住 `ipcMain.handle/on`，把注册过的处理器记进表里，供 WS 侧派发。
 * 2. 起一个 WS 服务，收到 {channel,args} 就查表调用，回 {result|error}。
 * 3. 打一次 WebContents.prototype.send 的补丁，把主进程所有推送
 *    （53 处 webContents.send，分散在多个窗口对象上）镜像给浏览器。
 *
 * 安全：默认只绑 127.0.0.1。这个通道能执行 bash、读写文件，等价于本机 shell，
 * 在裸机上绝不能监听 0.0.0.0 —— 那是把机器交出去。
 *
 * `PROMA_WEB_BRIDGE_HOST` 只为容器而设：容器内没有宿主回环，Docker 的端口转发
 * 连的是容器网卡地址，绑 127.0.0.1 时端口发布根本不通。容器里设 0.0.0.0 的前提是
 * **compose 只把端口发布到宿主 127.0.0.1**（见 docker/docker-compose.yml），
 * 于是"仅本机可达"这条性质由发布侧保持不变。改这个变量前先想清楚谁能连上它：
 * 没有鉴权，能连上就等于拿到 shell。
 */

import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type WebContents } from 'electron'
// esbuild 会把 'ws' 解析到它的 ESM 入口 wrapper.mjs，那里
// `export default WebSocket` 只是**类本身**，Server / WebSocketServer 是另外的具名导出。
// 所以默认导入拿不到服务端构造器（doubao-asr-service.ts 只当客户端用，才没踩到）。
// @types/ws 是 `export = WebSocket`，具名导入过不了类型检查，故此处按命名空间导入取值。
import * as ws from 'ws'
import { parseWebBridgeMessage } from '../../web/web-bridge-codec'
import { resolveWebBridgeHost } from './web-bridge-host'

/** ws 连接的最小形状。运行时 send 接受字符串，@types/ws 的重载在此配置下过窄。 */
interface WsSocket {
  readyState: number
  send(data: string): void
  on(event: 'message', listener: (raw: unknown) => void): void
  on(event: 'close' | 'error', listener: () => void): void
}

interface WsServer {
  on(event: 'connection', listener: (socket: WsSocket) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  close(): void
}

type WsServerCtor = new (options: { host: string; port: number }) => WsServer

/** wrapper.mjs 里 Server 与 WebSocketServer 指向同一个类，取到哪个都行。 */
function resolveServerCtor(): WsServerCtor {
  const mod = ws as unknown as { Server?: WsServerCtor; WebSocketServer?: WsServerCtor }
  const ctor = mod.Server ?? mod.WebSocketServer
  if (typeof ctor !== 'function') {
    throw new Error("无法从 'ws' 取得 WebSocketServer 构造器")
  }
  return ctor
}

/** 与 vite dev server(5173) 相邻，避免和常见端口撞车。 */
export const WEB_BRIDGE_PORT = Number(process.env.PROMA_WEB_BRIDGE_PORT ?? 5174)

/**
 * 监听地址。默认回环——裸机行为与改动前逐字一致。
 * 只有容器镜像会显式设成 0.0.0.0，且端口只发布到宿主回环。
 */
export const WEB_BRIDGE_HOST = resolveWebBridgeHost()

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
type SendHandler = (event: unknown, ...args: unknown[]) => void

const invokeHandlers = new Map<string, InvokeHandler>()
const sendHandlers = new Map<string, SendHandler>()
const clients = new Set<WsSocket>()

let patched = false
let server: WsServer | undefined
let resolveMainWindow: (() => BrowserWindow | null) | undefined

/**
 * 记录处理器。必须在 registerIpcHandlers() **之前**调用，
 * 否则先注册的那批不会进表，浏览器侧调用会得到「未注册」。
 */
export function patchIpcMainForWeb(): void {
  if (patched) return
  patched = true

  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: InvokeHandler) => {
    invokeHandlers.set(channel, listener)
    return originalHandle(channel, listener as never)
  }) as typeof ipcMain.handle

  const originalOn = ipcMain.on.bind(ipcMain)
  ipcMain.on = ((channel: string, listener: SendHandler) => {
    sendHandlers.set(channel, listener)
    return originalOn(channel, listener as never)
  }) as typeof ipcMain.on
}

function broadcast(payload: unknown): void {
  if (clients.size === 0) return
  const text = JSON.stringify(payload)
  for (const client of clients) {
    // 1 === WebSocket.OPEN，避免为了一个常量引入 ws 的值导入。
    if (client.readyState === 1) {
      try {
        client.send(text)
      } catch {
        // 单个客户端发送失败不能影响其它客户端与主进程自身。
      }
    }
  }
}

/**
 * 镜像主进程的所有推送。
 *
 * 53 处 send 分散在 win / mainWindow / owner / sender 等不同对象上，
 * 但它们共享同一个 WebContents 原型 —— 补一次原型即可全覆盖，
 * 不必逐个改调用点。
 */
function patchWebContentsSend(webContents: WebContents): void {
  const proto = Object.getPrototypeOf(webContents) as { send: (channel: string, ...args: unknown[]) => void }
  const marker = '__promaWebBridgePatched'
  if ((proto as unknown as Record<string, unknown>)[marker]) return
  ;(proto as unknown as Record<string, unknown>)[marker] = true

  const originalSend = proto.send
  proto.send = function patchedSend(channel: string, ...args: unknown[]) {
    try {
      broadcast({ type: 'push', channel, args })
    } catch {
      // 镜像失败绝不能影响桌面端自身的推送。
    }
    return originalSend.apply(this, [channel, ...args] as never)
  }
}

async function dispatchInvoke(channel: string, args: unknown[]): Promise<unknown> {
  const handler = invokeHandlers.get(channel)
  if (!handler) throw new Error(`未注册的 IPC 通道: ${channel}`)

  const win = resolveMainWindow?.() ?? null
  if (!win || win.isDestroyed()) {
    throw new Error('主窗口不可用，无法处理该调用')
  }
  // 传真实的 webContents 作为 sender：54 个处理器会用 event.sender 回推，
  // 拿真的对象就能保持与桌面端完全一致的行为，其推送再由原型补丁镜像回浏览器。
  const event = { sender: win.webContents, senderFrame: null, processId: 0, frameId: 0 } as unknown as IpcMainInvokeEvent
  return await handler(event, ...args)
}

export function startWebBridge(getMainWindow: () => BrowserWindow | null): void {
  if (server) return
  resolveMainWindow = getMainWindow

  const win = getMainWindow()
  if (win && !win.isDestroyed()) patchWebContentsSend(win.webContents)

  server = new (resolveServerCtor())({ host: WEB_BRIDGE_HOST, port: WEB_BRIDGE_PORT })

  server.on('connection', (socket: WsSocket) => {
    clients.add(socket)
    console.log(`[web-bridge] 浏览器已连接（当前 ${clients.size} 个）`)

    socket.on('message', (raw: unknown) => {
      let msg: { type?: string; id?: number; channel?: string; args?: unknown[] }
      try {
        msg = parseWebBridgeMessage(String(raw)) as {
          type?: string
          id?: number
          channel?: string
          args?: unknown[]
        }
      } catch {
        return
      }
      if (!msg.channel) return

      if (msg.type === 'send') {
        const handler = sendHandlers.get(msg.channel)
        const target = getMainWindow()
        if (handler && target && !target.isDestroyed()) {
          try {
            handler({ sender: target.webContents }, ...(msg.args ?? []))
          } catch (error) {
            console.error(`[web-bridge] ${msg.channel} 处理失败:`, error)
          }
        }
        return
      }

      if (msg.type !== 'invoke' || typeof msg.id !== 'number') return
      const id = msg.id
      dispatchInvoke(msg.channel, msg.args ?? [])
        .then((result) => socket.send(JSON.stringify({ type: 'reply', id, result })))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          try {
            socket.send(JSON.stringify({ type: 'reply', id, error: message }))
          } catch {
            // 客户端已断开
          }
        })
    })

    socket.on('close', () => {
      clients.delete(socket)
    })
    socket.on('error', () => {
      clients.delete(socket)
    })
  })

  server.on('error', (error: Error) => {
    console.error('[web-bridge] 服务启动失败:', error)
  })

  console.log(
    `[web-bridge] 已监听 ws://${WEB_BRIDGE_HOST}:${WEB_BRIDGE_PORT}`
    + `${WEB_BRIDGE_HOST === '127.0.0.1' ? '（仅回环）' : '（非回环：仅当端口只发布到宿主回环时才安全）'}`,
  )
}

export function stopWebBridge(): void {
  server?.close()
  server = undefined
  clients.clear()
}
