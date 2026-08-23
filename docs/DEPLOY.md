# Docker 部署指南

一份自足的本机部署说明。目标：clone → 填一个 key → `docker compose up` → 浏览器打开就能用。

---

## 0. 先理解这个栈的形状（读这一节能省掉一半排查）

Proma **不是前后端分离的 Web 服务**，它是 Electron 桌面应用。浏览器里那个界面
和桌面窗口是**同一个渲染层**，区别只在传输：

```
宿主浏览器  http://127.0.0.1:5173  ──HTTP──▶  容器内静态服务（dist/renderer）
     │
     └───── ws://127.0.0.1:5174 ──WebSocket──▶ web-bridge ──▶ Electron 主进程（真正的后端）
                                                                      │
                                                        Xvfb 提供一块看不见的画布
```

由此推出三件反直觉但必然的事：

1. **容器里必须跑一个真的 Electron 进程**，还必须真的建出主窗口——web-bridge 的
   派发目标就是这个窗口，没有窗口时所有 IPC 调用直接抛错。所以镜像里有 Xvfb。
2. **两个端口都得通**。只映射 5173 会得到一个能加载、但连不上后端的白屏。
3. **5174 没有鉴权**。这个通道能执行 bash、读写文件，等价于把 shell 交出去。
   compose 里的 `127.0.0.1:` 前缀是这份部署唯一的防线，别去掉。

---

## 1. 前置条件

| 项 | 要求 | 检查 |
|---|---|---|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| 磁盘 | ≥ 8 GB 空闲 | 镜像约 4.5 GB（含 Electron、Chromium、node_modules） |
| 内存 | ≥ 4 GB 可用 | Chromium 渲染进程吃内存 |
| 网络 | 构建期需要 | 拉基础镜像、克隆 Prime Agent、下载 Electron 二进制 |

构建期需要能访问 `github.com`（Prime Agent 与 Electron 二进制）。运行期只需要能访问
你配置的模型服务。

## 2. 部署（四步）

```bash
git clone https://github.com/CrepuscularIRIS/crucible.git
cd crucible

cp .env.example .env
# 编辑 .env，至少填入 DASHSCOPE_API_KEY

docker compose up -d --build      # 首次构建约 5–10 分钟
```

等健康检查转绿（首启要装 IPython kernel 的 venv，给它 1–3 分钟）：

```bash
docker compose ps                  # STATUS 应为 (healthy)
docker compose logs -f proma       # 想看细节就跟日志
```

然后浏览器打开 **<http://127.0.0.1:5173>**。

看到「欢迎使用 Proma」和「准备就绪」就说明前后端都通了——「准备就绪」这四个字
本身就是桥接成功的信号，它是问后端要来的。

### 停止与重启

```bash
docker compose restart      # 改完 .env 后重启生效
docker compose down         # 停止（数据在命名卷里，不丢）
docker compose down -v      # 连数据一起删除，慎用
```

## 3. 配置模型服务

### Qwen / 阿里云百炼（DashScope）

1. 在 <https://bailian.console.aliyun.com/> 开通服务并创建 API Key。
2. 写进 `.env`：
   ```
   DASHSCOPE_API_KEY=sk-你的key
   ```
3. `docker compose restart`。
4. 在 UI 的「设置 → 渠道」里确认 DashScope 渠道存在，模型填 `qwen3.7-plus`
   （或你已开通的其它 Qwen 型号）。

Proma 走 DashScope 的 **OpenAI 兼容端点**
`https://dashscope.aliyuncs.com/compatible-mode/v1`，不需要额外装 SDK。

### 其它厂商

`.env` 里放开对应的注释行即可（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
`DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY`）。首启会自动创建一个 DeepSeek 预设渠道，
不填 key 时它只是躺在那里，不影响使用。

自建 OpenAI 兼容网关填 `OPENAI_BASE_URL`。

> **凭据是明文存的。** 容器里没有 OS 钥匙串，日志会打印
> `[渠道管理] safeStorage 加密不可用，将以明文存储`。key 以明文落在
> `proma-config` 卷里。这是容器部署的固有代价：请把宿主机当作信任边界，
> 别在共享主机上跑这份部署。

## 4. 数据与持久化

三个命名卷，`docker compose down` 不会删（`down -v` 才会）：

| 卷 | 容器内路径 | 内容 |
|---|---|---|
| `proma-config` | `/root/.proma-dev` | 会话、工作区、渠道凭据、设置——**最重要的一份** |
| `proma-userdata` | `/root/.config` | Electron userData：窗口状态、Chromium profile |
| `proma-workspace` | `/workspace` | Agent 干活的目录 |

备份：

```bash
docker run --rm -v crucible_proma-config:/data -v "$PWD":/backup alpine \
  tar czf /backup/proma-config-$(date +%Y%m%d).tar.gz -C /data .
```

> **为什么 workspace 是命名卷而不是绑宿主目录**：Agent 会在这里执行模型生成的代码。
> 绑 `-v ~/projects:/workspace` 等于把那些文件交给模型处置。真要挂宿主目录，
> 请挂一个你能接受被改写的专用目录。

## 5. 健康检查

compose 自带 healthcheck，打的是静态服务的 `/healthz`：

```bash
curl -fsS http://127.0.0.1:5173/healthz     # → ok
docker inspect --format '{{.State.Health.Status}}' proma
```

注意 `/healthz` 只证明**渲染层在服务**，不证明 Electron 后端活着。要确认全链路，
看日志里有没有这行：

```
[web-bridge] 已监听 ws://0.0.0.0:5174
```

或者直接看 UI 上是不是「准备就绪」。

## 6. 故障排查

### `failed to bind host port 127.0.0.1:5173: address already in use`

宿主已有东西占着端口——本机开发实例最常见。先看是谁：

```bash
ss -ltnp | grep -E ':5173|:5174'
```

要么停掉它，要么换宿主端口。换端口时**两个都要换**，并且浏览器要显式告诉前端
桥的端口（前端默认连 5174）：

```yaml
# docker-compose.yml
ports:
  - "127.0.0.1:15173:5173"
  - "127.0.0.1:15174:5174"
```

然后访问 `http://127.0.0.1:15173/?bridgePort=15174`。少了 `?bridgePort=`
前端会去连 5174，连到别的进程上去。

### 页面能打开，但一直「无法连接 Proma 主进程」

前端连不上 5174。依次查：

```bash
docker compose ps                                    # 容器还活着吗
docker compose logs proma | grep web-bridge          # 桥起来了吗
docker compose port proma 5174                       # 5174 映射出来了吗
```

如果只映射了 5173，补上 5174 再 `docker compose up -d`。

### 容器起来又退出

entrypoint 是「任一组件退出就整体退出」的设计，所以看日志最后 30 行就能定位：

```bash
docker compose logs --tail=50 proma
```

常见原因：`.env` 不存在（compose 的 `env_file` 会直接报错）——`cp .env.example .env`。

### 日志里一堆 `ERROR:dbus/bus.cc`

**可以忽略。** 容器里没有 dbus 系统总线，Chromium 会为此抱怨几行。镜像已经起了
会话总线把大部分噪音压掉，剩下的几行不影响任何功能。

### `Binaries provided by Electron for use on Linux may be incompatible with sharp`

**可以忽略。** 图片处理的兼容性警告，不影响启动与主要功能。

### 构建卡在 `bun install` 或克隆 Prime Agent

网络问题。构建期要访问 `github.com`。确认代理后重试：

```bash
docker compose build --no-cache
```

### 研究探针报「bwrap 不可用」

`probe_run` 在 bubblewrap 沙箱里跑冻结命令，而容器默认不给嵌套 user namespace。
这是**结构性拒绝，不是回落到宿主执行**——安全行为正确，只是该功能不可用。
需要它就给容器放权（会削弱容器自身隔离，自行权衡）：

```yaml
services:
  proma:
    security_opt:
      - seccomp:unconfined
    cap_add:
      - SYS_ADMIN
```

### 想进容器里看看

```bash
docker compose exec proma bash
```

## 7. 镜像里都有什么

| 组件 | 说明 |
|---|---|
| Bun 1.3.12 | 运行时与包管理 |
| Electron 43 | 主进程（后端本体），二进制在构建期就装好，运行期不联网下载 |
| Xvfb | 无头 X，给主窗口一块画布 |
| Prime Agent | 构建期按 commit 钉死克隆到 `/oss/prime-agent`，**不入库** |
| Python 3 + uv | IPython kernel（RLM / research-kit 靠它） |
| bubblewrap | 研究探针沙箱 |

### 为什么 Prime Agent 不在仓库里

它是独立的 MIT 上游仓库（`PrimeIntellect-ai/prime-agent`）。Dockerfile 在构建期
克隆并 checkout 到固定 commit：

```dockerfile
ARG PRIME_AGENT_REF=71ca6cfd1a2f7205ca0ec1baa65d10d0ed88f6e8
```

升级就改这一行再 `docker compose build`。

目录布局是刻意安排的：仓库放 `/crucible`，Prime Agent 放 `/oss/prime-agent`，
于是 `package.json` 里那些 `file:../../../oss/prime-agent/packages/*` 原样成立，
一行依赖都不用改。

> **宿主开发**（不走 Docker）需要你自己把 prime-agent 检出到 `~/oss/prime-agent`，
> 否则 `bun install` 会因为找不到 `file:` 依赖而失败。见 README 的「开发」一节。
