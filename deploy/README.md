# 公网部署手册(评委可调用 API + 演示站)

架构:互联网 → **gateway(:8787,token 认证+白名单+限额)** → 本机回环上的
web-bridge(容器 5212)→ demo 容器。**桥与 UI 端口只绑 127.0.0.1,绝不公网。**

## 服务器上的步骤(阿里云轻量 2C4G,Ubuntu)

```bash
# 0) 基础
curl -fsSL https://get.docker.com | sh
curl -fsSL https://bun.sh/install | bash   # 或用 apt 的 node,任一 JS 运行时

# 1) 拉源码
git clone https://github.com/CrepuscularIRIS/crucible && cd crucible

# 2) 镜像(本地构建或从镜像仓库导入)
docker build -t crucible/proma:latest -f docker/Dockerfile .

# 3) demo 容器(端口只发布到回环;沙箱权限 flags 必须全带,见复现包教训)
docker run -d --name proma-demo \
  --cap-add CAP_NET_ADMIN --cap-add CAP_SYS_ADMIN \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined --shm-size 1g \
  -p 127.0.0.1:5211:5173 -p 127.0.0.1:5212:5174 \
  -v demo_proma-config:/root/.proma-dev -v demo_proma-userdata:/root/.config \
  -v demo_proma-workspace:/workspace \
  -v /opt/neuronbench:/bench/neuronbench:ro \
  -e HOME=/root -e PROMA_WEB_BRIDGE_HOST=0.0.0.0 -e PROMA_WEB_HOST=0.0.0.0 \
  -e NEURONBENCH_ROOT=/bench/neuronbench -e PROMA_EVAL_BUDGET=8 \
  -e PROMA_RESEARCH_DENY=/bench/neuronbench \
  -e PROMA_RESEARCH_MCP_ENTRY=/crucible/packages/research-mcp/src/server.ts \
  --restart unless-stopped \
  crucible/proma:latest
# 然后按 Race/report-work/repro/README.md §2 注入百炼渠道 + onboard

# 4) gateway(先本地冒烟再上 systemd)
JUDGE_TOKEN=<印进报告的token> BRIDGE=127.0.0.1:5212 PORT=8787 bun deploy/gateway.ts
curl -s http://127.0.0.1:8787/healthz   # -> ok

# 5) systemd 常驻(/etc/systemd/system/proma-gw.service)
#    [Service]
#    WorkingDirectory=/root/crucible
#    ExecStart=/root/.bun/bin/bun deploy/gateway.ts
#    Environment=JUDGE_TOKEN=<token>
#    Environment=BRIDGE=127.0.0.1:5212
#    Environment=PORT=8787
#    Restart=always
#    [Install] WantedBy=multi-user.target

# 6) 对外:安全组放行 8787(建议套 HTTPS:alidns+acme/caddy,或 SLB 终结 TLS)
```

## 安全边界(部署前自检)

- [ ] 5211/5212 未在安全组放行(仅服务器回环)
- [ ] gateway 有 JUDGE_TOKEN,healthz 之外全部 401(无 token 时)
- [ ] 目录穿越被 regex 拒绝(`..`/`%`)
- [ ] DAILY_WRITE_LIMIT 已按预算设置(默认 40/IP/日)
- [ ] 百炼 key 只在容器卷内,不在 git
- [ ] 云控制台设余额告警(评委测试烧量兜底)

## 已本地验证(2026-08-29)

`/` 静态站 200 · 图片 200 · 无 token API 401 · 带白名单 token:sessions/messages
200 · POST send-message 端到端(qwen3.7-plus 回复「收到」)· 穿越 401。
