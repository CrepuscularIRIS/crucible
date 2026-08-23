#!/usr/bin/env bash
# Proma 容器入口：Xvfb → 静态渲染层 → Electron 主进程。
#
# 三个进程的依赖是单向的：Electron 需要 DISPLAY，主窗口需要 5173 上有东西可加载。
# 任何一个死了整个容器就该退出——半死不活的容器比崩掉的容器更难排查。
set -euo pipefail

DISPLAY_NUM="${PROMA_DISPLAY_NUM:-99}"
export DISPLAY=":${DISPLAY_NUM}"
WEB_PORT="${PROMA_WEB_PORT:-5173}"

log() { echo "[entrypoint] $*"; }

# ── 1. Xvfb ──────────────────────────────────────────────────────────
# Electron 主进程即使不给人看也要一块画布：主窗口是 web-bridge 的派发目标
# （dispatchInvoke 在无窗口时直接抛错），所以无头也必须真的把窗口建出来。
Xvfb "${DISPLAY}" -screen 0 "${PROMA_SCREEN:-1920x1080x24}" -nolisten tcp &
XVFB_PID=$!

for _ in $(seq 1 50); do
  if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
if ! xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
  echo "[entrypoint] Xvfb 未能在 10s 内就绪，放弃启动" >&2
  exit 1
fi
log "Xvfb 就绪 ${DISPLAY}"

# ── 1b. dbus session bus ─────────────────────────────────────────────
# 容器里没有系统总线，Chromium 会为此刷出几十行 ERROR:dbus/bus.cc。功能不受影响，
# 但那面错误墙会把真正的故障淹掉，也会让人以为部署坏了。给一条会话总线就安静了。
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
  eval "$(dbus-launch --sh-syntax)" || true
  export DBUS_SESSION_BUS_ADDRESS
  log "dbus 会话总线就绪"
fi

# ── 2. 静态渲染层 ────────────────────────────────────────────────────
bun /crucible/docker/serve-web.ts &
WEB_PID=$!

for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
if ! curl -fsS "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null 2>&1; then
  echo "[entrypoint] 渲染层服务未能在 10s 内就绪，放弃启动" >&2
  exit 1
fi
log "渲染层就绪 http://127.0.0.1:${WEB_PORT}"

# 任一后台进程退出即拆掉整个容器，避免 healthcheck 绿着但产品已死。
terminate() {
  log "收到退出信号，正在停止"
  kill "${XVFB_PID}" "${WEB_PID}" "${ELECTRON_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap terminate TERM INT

# ── 3. Electron 主进程 ───────────────────────────────────────────────
# --no-sandbox：容器内没有 setuid sandbox 所需的用户命名空间权限。
# 这不降低本部署的隔离——容器本身就是边界，且模型生成的代码另有 bwrap 沙箱。
cd /crucible/apps/electron
log "启动 Electron 主进程"
bunx electron . --no-sandbox --disable-gpu --disable-dev-shm-usage &
ELECTRON_PID=$!

wait -n "${XVFB_PID}" "${WEB_PID}" "${ELECTRON_PID}"
EXIT_CODE=$?
log "某个组件已退出（code=${EXIT_CODE}），停止容器"
terminate
exit "${EXIT_CODE}"
