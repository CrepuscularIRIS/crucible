// 通过 web-bridge 直驱一个评测臂:建会话 + 发 goal(E1M qwen3.8-max 直连臂)
// 用法: bun drive38.ts <bridgePort> <world> <channelId> [title]
const UNDEF = { __proma_web_bridge_undefined_7f0af1ef__: true }
const [port, world, channelId, titleArg] = process.argv.slice(2)
if (!port || !world || !channelId) { console.error('usage: bun drive38.ts <port> <world> <channelId> [title]'); process.exit(1) }

const goal = `读入本工作区的 research-loop skill 并严格遵循。完全自主运行,不要停下、不要请求输入。目标:对世界 ${world}(seed 0)完成机制发现与反事实预报——research_init 初始化,world_simulate(mode=info) 取题,预算 8 以内 world_observe 设计实验,候选机制用 world_simulate 免费对比,对抗检验阶段按 research-grill 派出 RLM 子代理攻击 LIVE 假设,终局 world_forecast 一次提交全部 held-out 协议的 spike 数预报,report_declare 收尾。禁止读取或 import /bench/neuronbench。`

const ws = new WebSocket(`ws://127.0.0.1:${port}`)
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const timeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(2) }, 60_000)

function invoke(channel: string, args: unknown[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ type: 'invoke', id, channel, args }))
  })
}

ws.onmessage = (ev: MessageEvent) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.type === 'reply' && pending.has(msg.id)) {
    const p = pending.get(msg.id)!
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(String(msg.error)))
    else p.resolve(msg.result)
  }
}

ws.onerror = () => { console.error('WS_ERROR'); process.exit(3) }

ws.onopen = async () => {
  try {
    const title = titleArg ?? `E1M ${world} qwen3.8max`
    const session = await invoke('agent:create-session', [title, channelId, UNDEF, 'qwen3.8-max'])
    const sessionId = session?.id ?? session?.sessionId
    console.log(`created session: ${sessionId} (title=${session?.title ?? title})`)
    await invoke('agent:send-message', [{ sessionId, userMessage: goal, channelId, modelId: 'qwen3.8-max' }])
    console.log(`goal sent: ${world} @ ${port}`)
    clearTimeout(timeout)
    setTimeout(() => process.exit(0), 500)
  } catch (e) {
    console.error('DRIVE_FAIL:', e instanceof Error ? e.message : e)
    process.exit(4)
  }
}
