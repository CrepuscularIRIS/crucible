const port = process.argv[2]
const ws = new WebSocket(`ws://127.0.0.1:${port}`)
let nextId = 1
const pending = new Map<number, (v: any) => void>()
function invoke(channel: string, args: unknown[]): Promise<any> {
  return new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); ws.send(JSON.stringify({ type: 'invoke', id, channel, args })) })
}
ws.onmessage = (ev: MessageEvent) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.type === 'reply' && pending.has(msg.id)) { pending.get(msg.id)!(msg.result ?? msg.error); pending.delete(msg.id) }
}
ws.onopen = async () => {
  const cur = await invoke('settings:get', [])
  const cur2 = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? cur : {}
  const r = await invoke('settings:update', [{ ...cur2, onboardingCompleted: true, onboardingVersion: 2, environmentCheckSkipped: true }])
  console.log('onboarded:', JSON.stringify(r).slice(0, 60))
  process.exit(0)
}
setTimeout(() => { console.error('TIMEOUT'); process.exit(2) }, 15_000)
