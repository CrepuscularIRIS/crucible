/**
 * 容器内的静态渲染层服务。
 *
 * 一个进程同时喂两个消费者：
 * - 容器内的 Electron 主窗口（它按 `isDev` 加载 http://127.0.0.1:5173）；
 * - 宿主浏览器（compose 把 5173 发布到宿主回环）。
 * 两边加载的是同一份 `dist/renderer`；差别只在浏览器侧没有 preload，
 * 于是 web-bootstrap 走 WebSocket 桥（见 src/web/electron-shim.ts）。
 *
 * 不引第三方静态服务器：Bun 自带 HTTP 与文件流，够用就别加依赖。
 */

import { file } from 'bun'
import { join, normalize } from 'node:path'

const ROOT = process.env.PROMA_WEB_ROOT ?? '/crucible/apps/electron/dist/renderer'
const PORT = Number(process.env.PROMA_WEB_PORT ?? 5173)
const HOST = process.env.PROMA_WEB_HOST ?? '0.0.0.0'

/** 把 URL 路径解析到 ROOT 内；任何逃逸尝试都退回 index.html。 */
function resolveWithinRoot(pathname: string): string | undefined {
  const decoded = decodeURIComponent(pathname)
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  if (normalized.includes('\0')) return undefined
  const candidate = join(ROOT, normalized)
  return candidate.startsWith(ROOT) ? candidate : undefined
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url)

    // 健康检查：compose 的 healthcheck 打这里，不依赖渲染层构建是否完整。
    if (pathname === '/healthz') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }

    const indexPath = join(ROOT, 'index.html')
    const target = pathname === '/' ? indexPath : resolveWithinRoot(pathname)
    if (target) {
      const asset = file(target)
      if (await asset.exists()) return new Response(asset)
    }

    // SPA 回退：未知路径交给前端路由，而不是 404。
    const index = file(indexPath)
    if (await index.exists()) {
      return new Response(index, { headers: { 'content-type': 'text/html' } })
    }
    return new Response(
      `渲染层构建缺失：${indexPath}\n镜像内应由 \`bun run build\` 生成，请检查构建日志。`,
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  },
})

console.log(`[web] 渲染层已服务于 http://${HOST}:${server.port}（root=${ROOT}）`)
