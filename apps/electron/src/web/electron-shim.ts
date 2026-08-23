/**
 * 浏览器侧的 `electron` 模块替身。
 *
 * 目的：让 `src/preload/index.ts` 原样跑在浏览器里 —— 它有 337 个
 * `ipcRenderer.invoke` 和 95 个 `ipcRenderer.on`，形状完全机械，
 * 因此只要换掉**传输层**就能整体复用，无需逐个改写。
 * vite 用 resolve.alias 把 'electron' 指到本文件（见 vite.config.ts）。
 *
 * 传输：WebSocket 连到主进程的 web-bridge（默认 127.0.0.1:5174）。
 * 主进程仍是真正的后端，浏览器只是它的第二个视图。
 */

import { serializeWebBridgeMessage } from './web-bridge-codec'

type Listener = (event: unknown, ...args: unknown[]) => void

const WS_PORT = Number(
  new URLSearchParams(location.search).get('bridgePort')
    ?? (import.meta as { env?: Record<string, string> }).env?.VITE_BRIDGE_PORT
    ?? 5174,
)
const WS_URL = `ws://${location.hostname || '127.0.0.1'}:${WS_PORT}`

let socket: WebSocket | undefined
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const listeners = new Map<string, Set<Listener>>()

/** 连接就绪前发起的调用先排队，连上后按序补发 —— 否则应用启动瞬间的调用会丢。 */
const queued: string[] = []

function flush(): void {
  if (socket?.readyState !== WebSocket.OPEN) return
  while (queued.length) socket.send(queued.shift() as string)
}

function send(payload: unknown): void {
  const text = serializeWebBridgeMessage(payload)
  if (socket?.readyState === WebSocket.OPEN) socket.send(text)
  else queued.push(text)
}

export function connectBridge(): Promise<void> {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      flush()
      resolve()
    }

    socket.onmessage = (raw) => {
      let msg: { type: string; id?: number; channel?: string; args?: unknown[]; result?: unknown; error?: string }
      try {
        msg = JSON.parse(String(raw.data))
      } catch {
        return
      }

      if (msg.type === 'reply' && typeof msg.id === 'number') {
        const slot = pending.get(msg.id)
        if (!slot) return
        pending.delete(msg.id)
        if (msg.error) slot.reject(new Error(msg.error))
        else slot.resolve(msg.result)
        return
      }

      if (msg.type === 'push' && msg.channel) {
        // 主进程侧任何 webContents.send 都会镜像到这里，事件对象无需还原。
        for (const fn of listeners.get(msg.channel) ?? []) {
          try {
            fn({}, ...(msg.args ?? []))
          } catch (error) {
            console.error(`[web-bridge] ${msg.channel} 监听器抛错:`, error)
          }
        }
      }
    }

    socket.onerror = () => reject(new Error(`无法连接 web-bridge (${WS_URL})，主进程是否在运行？`))
    socket.onclose = () => {
      // 主进程退出时，所有在途调用必须失败，否则界面会永远转圈。
      for (const [, slot] of pending) slot.reject(new Error('web-bridge 连接已断开'))
      pending.clear()
    }
  })
}

/** 与 Electron ipcRenderer 同形的最小子集（preload 只用到这些）。 */
interface IpcRendererShim {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  sendSync(channel: string, ...args: unknown[]): unknown
  on(channel: string, listener: Listener): IpcRendererShim
  once(channel: string, listener: Listener): IpcRendererShim
  off(channel: string, listener: Listener): IpcRendererShim
  removeListener(channel: string, listener: Listener): IpcRendererShim
  removeAllListeners(channel?: string): IpcRendererShim
}

export const ipcRenderer: IpcRendererShim = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      send({ type: 'invoke', id, channel, args })
    })
  },

  send(channel: string, ...args: unknown[]): void {
    send({ type: 'send', channel, args })
  },

  sendSync(channel: string, ...args: unknown[]): unknown {
    // 浏览器主线程无法同步等待 WebSocket 回包。beforeunload 的两个调用只需要
    // 把同步 IPC 事件送到主进程；socket.send 会在页面卸载前同步入队。
    send({ type: 'send', channel, args })
    return true
  },

  on(channel: string, listener: Listener): IpcRendererShim {
    if (!listeners.has(channel)) listeners.set(channel, new Set())
    listeners.get(channel)!.add(listener)
    return ipcRenderer
  },

  once(channel: string, listener: Listener): IpcRendererShim {
    const wrapped: Listener = (event, ...args) => {
      ipcRenderer.removeListener(channel, wrapped)
      listener(event, ...args)
    }
    return ipcRenderer.on(channel, wrapped)
  },

  off(channel: string, listener: Listener): IpcRendererShim {
    return ipcRenderer.removeListener(channel, listener)
  },

  removeListener(channel: string, listener: Listener): IpcRendererShim {
    listeners.get(channel)?.delete(listener)
    return ipcRenderer
  },

  removeAllListeners(channel?: string): IpcRendererShim {
    if (channel) listeners.delete(channel)
    else listeners.clear()
    return ipcRenderer
  },
}

export const contextBridge = {
  exposeInMainWorld(key: string, api: unknown): void {
    // 浏览器没有 contextIsolation，直接挂到 window 即可，形状与桌面端一致。
    ;(window as unknown as Record<string, unknown>)[key] = api
  },
}

export const webUtils = {
  /**
   * 桌面端用它从拖入的 File 反查真实磁盘路径；浏览器沙箱拿不到路径。
   * 返回空串让上层走「无路径」分支，而不是抛错中断拖拽。
   */
  getPathForFile(_file: File): string {
    return ''
  },
}

export default { ipcRenderer, contextBridge, webUtils }
