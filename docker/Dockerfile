# Proma + Prime Agent —— 本机可复现的完整产品镜像。
#
# 形状说明（别按"Web 服务"去读这个文件）：
# Proma 是 Electron 桌面应用，不是前后端分离的 Web 服务。浏览器里那个界面是
# **同一个渲染层**，只是把 preload 的 IPC 换成了 WebSocket 桥（src/web/electron-shim.ts）。
# 所以容器里必须真的跑一个 Electron 主进程（它就是后端），Xvfb 给它一块看不见的画布。
#
# Prime Agent 不入库：它是 MIT 的独立上游仓库，构建时按 commit 钉死克隆。
# 目录布局刻意还原宿主开发时的相对位置——crucible 的四个依赖写的是
# `file:../../../oss/prime-agent/packages/*`，把仓库放在 /crucible、把它放在
# /oss/prime-agent，这些路径就原样成立，一行 package.json 都不用改。

FROM node:22-bookworm-slim AS prime-builder

# Prime Agent 自己是 npm workspace（package-lock + Node >=22.8），必须用它原生的
# 工具链构建。不要在 Bun runtime 阶段安装 Prime：那会生成不同的 workspace 布局，
# 而且 `file:` 依赖会在 dist 生成前把不完整源码快照进 Bun store。
ARG PRIME_AGENT_REPO=https://github.com/PrimeIntellect-ai/prime-agent.git
ARG PRIME_AGENT_REF=71ca6cfd1a2f7205ca0ec1baa65d10d0ed88f6e8

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --filter=blob:none "${PRIME_AGENT_REPO}" /oss/prime-agent \
    && cd /oss/prime-agent \
    && git checkout --detach "${PRIME_AGENT_REF}" \
    && rm -rf .git

# builder 只产出 TypeScript dist；zeromq 的原生运行时由 Crucible 自己的 bun.lock
# 安装并在最终 Electron runtime 中验收，所以这里禁用第三方 install scripts。
RUN cd /oss/prime-agent \
    && npm ci --ignore-scripts --no-audit --no-fund \
    && npm run build \
    && test -s packages/tui/dist/index.js \
    && test -s packages/ai/dist/index.js \
    && test -s packages/agent/dist/index.js \
    && test -s packages/coding-agent/dist/index.js \
    && rm -rf node_modules packages/*/node_modules

FROM oven/bun:1.3.12-debian

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    ELECTRON_DISABLE_SECURITY_WARNINGS=1

# 三组依赖，分组是为了将来能一眼看出哪组能删：
#   ① Electron/Chromium 的运行库  ② 无头显示  ③ 研究层运行时（kernel + 探针沙箱）
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git tini \
      libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libatspi2.0-0 \
      libdrm2 libgbm1 libasound2 libcups2 libpango-1.0-0 libcairo2 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxkbcommon0 \
      fonts-liberation xdg-utils \
      xvfb x11-utils \
      dbus dbus-x11 \
      python3 python3-venv python3-numpy bubblewrap \
    && rm -rf /var/lib/apt/lists/*

# uv：research-kit 这个 Python-backed skill 靠它把包装进 ipython kernel 的 venv。
# 缺了它 RLM 不会报错，只会静默不可用——所以装在镜像里，而不是留给运行期。
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh \
    && uv --version

# ── Prime Agent（构建期克隆并编译，不入库） ──────────────────────────
# file: 依赖拷贝的是此目录的快照，因此必须在 Crucible 的 bun install 前复制进来。
COPY --from=prime-builder /oss/prime-agent /oss/prime-agent

# ── Proma 工作区 ─────────────────────────────────────────────────────
WORKDIR /crucible

# 先只拷清单，让依赖层能被 Docker 缓存复用（源码改动不必重装依赖）。
COPY package.json bun.lock ./
COPY apps/cli/package.json           apps/cli/package.json
COPY apps/electron/package.json      apps/electron/package.json
COPY packages/core/package.json      packages/core/package.json
COPY packages/research-mcp/package.json packages/research-mcp/package.json
COPY packages/session-core/package.json packages/session-core/package.json
COPY packages/shared/package.json    packages/shared/package.json
COPY packages/ui/package.json        packages/ui/package.json

# 依赖装在这里；prime-agent 的 file: 路径此刻必须已经存在（上面已克隆）。
RUN bun install --frozen-lockfile

# Electron 的二进制由它自己的 postinstall 下载，而 bun 默认不跑未信任包的
# postinstall（根 package.json 的 trustedDependencies 里只有 pi-coding-agent）。
# 不显式补这一步，`bunx electron` 会在**每次容器首启时**联网下载 ~100MB：
# 启动慢、离线起不来、且下载落在可写层里，容器一重建就没了。
RUN ELECTRON_DIR="$(find /crucible/node_modules/.bun -maxdepth 3 -type d -path '*/electron@*/node_modules/electron' | head -1)" \
    && test -n "${ELECTRON_DIR}" \
    && cd "${ELECTRON_DIR}" \
    && bun install.js \
    && test -s path.txt \
    && echo "electron binary baked: $(cat path.txt)"

# 构建期就用最终 Electron 的 Node runtime 加载 Prime 与 zeromq。仅检查文件存在不够：
# ESM exports、Bun file 快照或 N-API 架构任一出错，都必须让镜像构建当场失败。
RUN ELECTRON_BIN="$(find /crucible/node_modules/.bun -type f -path '*/electron/dist/electron' | head -1)" \
    && test -x "${ELECTRON_BIN}" \
    && test -s /crucible/apps/electron/node_modules/@earendil-works/pi-coding-agent/dist/index.js \
    && cd /crucible/apps/electron \
    && ELECTRON_RUN_AS_NODE=1 "${ELECTRON_BIN}" -e \
      'Promise.all([import("@earendil-works/pi-coding-agent"), import("@earendil-works/pi-ai")]).then(() => { require("/crucible/node_modules/.bun/node_modules/zeromq"); console.log("Prime runtime import smoke: ok") }).catch((error) => { console.error(error); process.exit(1) })'

COPY . .

# 构建全部产物：main / agent-runtime / preload / renderer / cli。
# 原生 helper 脚本自身按 process.platform 判定，非 macOS 上是 no-op。
RUN bun run --filter='@proma/electron' build

RUN chmod +x /crucible/docker/entrypoint.sh

# 5173 渲染层（浏览器入口） · 5174 web-bridge（主进程 IPC 通道）
EXPOSE 5173 5174

# 容器内必须绑 0.0.0.0——Docker 的端口转发连的是容器网卡，不是容器回环。
# "仅本机可达"这条性质改由 compose 的 `127.0.0.1:` 发布前缀保持。
ENV PROMA_WEB_BRIDGE_HOST=0.0.0.0 \
    PROMA_WEB_HOST=0.0.0.0 \
    PROMA_WEB_PORT=5173 \
    PROMA_WEB_ROOT=/crucible/apps/electron/dist/renderer \
    PROMA_RESEARCH_MCP_ENTRY=/crucible/packages/research-mcp/src/server.ts

# tini 收养 Xvfb/Electron 留下的孤儿进程，否则 PID 1 会攒僵尸。
ENTRYPOINT ["/usr/bin/tini", "--", "/crucible/docker/entrypoint.sh"]
