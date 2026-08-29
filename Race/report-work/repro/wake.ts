// 唤醒一个既有会话:bun wake.ts <bridgePort> <sessionId> <message>
const [port, sessionId, ...rest] = process.argv.slice(2)
const message = rest.join(' ') || '继续'
const ws = new WebSocket(`ws://127.0.0.1:${port}`)
let nextId = 1
const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>()
function invoke(channel: string, args: unknown[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { res: resolve, rej: reject })
    ws.send(JSON.stringify({ type: 'invoke', id, channel, args }))
  })
}
ws.onmessage = (ev: MessageEvent) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.type === 'reply' && pending.has(msg.id)) {
    const p = pending.get(msg.id)!
    pending.delete(msg.id)
    msg.error ? p.rej(new Error(String(msg.error))) : p.res(msg.result)
  }
}
ws.onopen = async () => {
  try {
    const sessions = await invoke('agent:list-sessions', [])
    const list = Array.isArray(sessions) ? sessions : sessions?.sessions ?? []
    const target = list.find((s: any) => s.id === sessionId)
    await invoke('agent:send-message', [{
      sessionId, userMessage: message,
      channelId: target?.channelId, modelId: target?.modelId,
    }])
    console.log(`woken: ${sessionId} (${target?.title}) msg="${message.slice(0, 20)}..."`)
    process.exit(0)
  } catch (e) { console.error('WAKE_FAIL:', e instanceof Error ? e.message : e); process.exit(1) }
}
setTimeout(() => { console.error('TIMEOUT'); process.exit(2) }, 30_000)
