// 评委可调用测试 API gateway —— 受控代理本机 web-bridge。
//
// 设计约束(见 web-bridge.ts 安全注释:桥=无认证 IPC,等价本机 shell):
//   1. 绝不转发原始桥通道;只代理下面的白名单操作。
//   2. token 认证(Authorization: Bearer <JUDGE_TOKEN>),token 印在报告 P20。
//   3. 限额:每 IP 每日 N 次写操作;单条消息 ≤500 字。花费另有容器内
//      PROMA_EVAL_BUDGET 与 meter 兜底,gateway 只再挡一层频率。
//   4. 读操作不限次;消息文本截断,防刷流量。
//
// 白名单通道(全部经桥的注册表调用,无 shell):
//   agent:list-sessions / agent:get-sdk-messages / agent:send-message
//
// 运行: BRIDGE=127.0.0.1:5212 PORT=8787 JUDGE_TOKEN=xxx bun gateway.ts
// 健康检查: GET /healthz 无需 token(只回 ok)。

const BRIDGE = process.env.BRIDGE ?? '127.0.0.1:5212'
const PORT = Number(process.env.PORT ?? 8787)
const JUDGE_TOKEN = process.env.JUDGE_TOKEN ?? ''
const DAILY_WRITE_LIMIT = Number(process.env.DAILY_WRITE_LIMIT ?? 40)

if (!JUDGE_TOKEN) {
  console.error('JUDGE_TOKEN 未设置——拒绝以无认证状态启动')
  process.exit(1)
}

// ── 桥客户端 ───────────────────────────────────────────────
let bridgeWs: WebSocket | undefined
let bridgeReady = false
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function bridgeConnect(): void {
  bridgeWs = new WebSocket(`ws://${BRIDGE}`)
  bridgeWs.onopen = () => { bridgeReady = true; console.log(`[gateway] bridge 已连接 ${BRIDGE}`) }
  bridgeWs.onmessage = (ev: MessageEvent) => {
    const msg = JSON.parse(String(ev.data))
    if (msg.type === 'reply' && pending.has(msg.id)) {
      const p = pending.get(msg.id)!
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(String(msg.error))) : p.resolve(msg.result)
    }
  }
  bridgeWs.onclose = () => {
    bridgeReady = false
    for (const [, p] of pending) p.reject(new Error('bridge 断开'))
    pending.clear()
    setTimeout(bridgeConnect, 2000) // 桥重启(容器重建)后自愈
  }
  bridgeWs.onerror = () => bridgeWs?.close()
}
bridgeConnect()

function bridgeInvoke<T = unknown>(channel: string, args: unknown[], timeoutMs = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!bridgeReady) { reject(new Error('bridge 未就绪,请稍后重试')); return }
    const id = nextId++
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('bridge 超时')) }, timeoutMs)
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v as T) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })
    bridgeWs!.send(JSON.stringify({ type: 'invoke', id, channel, args }))
  })
}

// ── 限额(进程内;重启清零——评审场景足够) ────────────────────────
const writesByIp = new Map<string, { day: string; n: number }>()
function today(): string { return new Date().toISOString().slice(0, 10) }
function allowWrite(ip: string): boolean {
  const rec = writesByIp.get(ip)
  if (!rec || rec.day !== today()) { writesByIp.set(ip, { day: today(), n: 1 }); return true }
  if (rec.n >= DAILY_WRITE_LIMIT) return false
  rec.n += 1
  return true
}

// ── 路由 ──────────────────────────────────────────────────
type Json = Record<string, unknown>

async function requireSession(id: string): Promise<{ channelId?: string; modelId?: string; title?: string }> {
  const s = await bridgeInvoke<{ sessions?: Array<{ id: string; channelId?: string; modelId?: string; model?: string; title?: string }> } | Array<{ id: string; channelId?: string; modelId?: string; model?: string; title?: string }>>('agent:list-sessions', [])
  const list = Array.isArray(s) ? s : s?.sessions ?? []
  const hit = list.find((x: { id: string }) => x.id === id)
  if (!hit) throw new HttpError(404, '会话不存在(看 GET /api/sessions)')
  return hit as { channelId?: string; modelId?: string; model?: string; title?: string }
}

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg) }
}

async function handle(req: Request, url: URL): Promise<Json> {
  const path = url.pathname
  const method = req.method

  if (method === 'GET' && path === '/api/sessions') {
    const s = await bridgeInvoke<Json | Array<Json>>('agent:list-sessions', [])
    const list = Array.isArray(s) ? s : (s.sessions as Array<Json>) ?? []
    return {
      sessions: list.map((x: Json) => ({
        id: x.id, title: x.title, model: x.modelId ?? x.model, updatedAt: x.updatedAt,
      })),
    }
  }

  const mMsg = path.match(/^\/api\/session\/([^/]+)\/messages$/)
  if (method === 'GET' && mMsg) {
    await requireSession(mMsg[1])
    const msgs = await bridgeInvoke<Array<Json>>('agent:get-sdk-messages', [mMsg[1]])
    const list = Array.isArray(msgs) ? msgs : []
    return {
      count: list.length,
      messages: list.slice(-40).map((e: Json) => {
        const msg = e.message as Json | undefined
        const content = msg?.content
        let text = ''
        if (typeof content === 'string') text = content
        else if (Array.isArray(content)) {
          text = content
            .filter((p: Json) => p?.type === 'text')
            .map((p: Json) => String(p.text ?? ''))
            .join('\n')
        }
        return { ts: e.timestamp, type: e.type, role: msg?.role, text: text.slice(0, 800) }
      }),
    }
  }

  const mSend = path.match(/^\/api\/session\/([^/]+)\/message$/)
  if (method === 'POST' && mSend) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    if (!allowWrite(ip)) throw new HttpError(429, `当日写限额 ${DAILY_WRITE_LIMIT} 次已用完`)
    const target = await requireSession(mSend[1])
    const body = await req.json().catch(() => null) as { message?: string } | null
    const message = String(body?.message ?? '').slice(0, 500).trim()
    if (!message) throw new HttpError(400, 'message 不能为空(≤500 字)')
    await bridgeInvoke('agent:send-message', [{
      sessionId: mSend[1], userMessage: message,
      channelId: target.channelId, modelId: target.modelId ?? (target as { model?: string }).model,
    }], 30000)
    return {
      ok: true,
      note: '消息已投递给 Qwen 会话;1-2 分钟后 GET /api/session/<id>/messages 可见响应',
      session: mSend[1],
    }
  }

  throw new HttpError(404, '未知端点。可用:GET /api/sessions · GET /api/session/<id>/messages · POST /api/session/<id>/message')
}

function cors(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/healthz') return new Response('ok')

    // 静态演示站(deploy/site/,只伺服白名单扩展名,禁目录穿越)
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
      if (/^[\w./-]+$/.test(rel) && !rel.includes('..')) {
        const file = Bun.file(`deploy/site/${rel}`)
        if (await file.exists()) return new Response(file)
      }
    }

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors() })
    if (req.headers.get('authorization') !== `Bearer ${JUDGE_TOKEN}`) {
      return new Response(JSON.stringify({ error: 'unauthorized:带 Authorization: Bearer <token>(见报告 P20)' }, null, 2),
        { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', ...cors() } })
    }
    try {
      const result = await handle(req, url)
      return new Response(JSON.stringify(result, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', ...cors() } })
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 502
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }, null, 2),
        { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors() } })
    }
  },
})

console.log(`[gateway] :${PORT} → bridge ${BRIDGE} | 写限额 ${DAILY_WRITE_LIMIT}/IP/日`)
export default server
