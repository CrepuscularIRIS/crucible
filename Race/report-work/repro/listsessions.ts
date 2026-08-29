const port = process.argv[2]
const ws = new WebSocket(`ws://127.0.0.1:${port}`)
let nextId = 1
const pending = new Map<number, (v: any) => void>()
function invoke(channel: string, args: unknown[]): Promise<any> {
  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve)
    ws.send(JSON.stringify({ type: 'invoke', id, channel, args }))
  })
}
ws.onmessage = (ev: MessageEvent) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.type === 'reply' && pending.has(msg.id)) { pending.get(msg.id)!(msg.result); pending.delete(msg.id) }
}
ws.onopen = async () => {
  const sessions = await invoke('agent:list-sessions', [])
  const list = Array.isArray(sessions) ? sessions : sessions?.sessions ?? []
  for (const s of list.slice(0, 12)) console.log(`${s.id} | ${s.title} | model=${s.modelId ?? '?'} ch=${s.channelId ?? '?'}`)
  process.exit(0)
}
setTimeout(() => { console.error('TIMEOUT'); process.exit(2) }, 20_000)
