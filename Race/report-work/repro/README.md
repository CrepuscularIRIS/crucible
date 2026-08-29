# 方向 1B 复现包(Proma × Prime Agent × research-mcp)

一条命令冷启、一套脚本复算全部报告声明。冷启实测 **17.6 s**(容器起 → UI HTTP 200,
含技能种子与沙箱自检通过;2026-08-29,crucible/proma:latest = 0.17.77)。

## 0. 前置

- Docker(需能建用户命名空间:容器须带 `--cap-add CAP_SYS_ADMIN --cap-add
  CAP_NET_ADMIN --security-opt seccomp=unconfined --security-opt apparmor=unconfined
  --shm-size 1g`,否则 bwrap 沙箱探针全数 exit 1——实测教训,见
  `research/campaigns/demo2r-2026-08-28-ca/NOTES.md`)
- 镜像:`crucible/proma:latest`(源码 `docker/` 下可自行构建)
- 评测世界:`git clone` NeuronBench → 只读挂载 `/bench/neuronbench`
- 百炼渠道 key(自备;注入方式见 §2)

## 1. 冷启(17.6 s 实测)

```bash
docker run -d --name proma-demo \
  --cap-add CAP_NET_ADMIN --cap-add CAP_SYS_ADMIN \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --shm-size 1g \
  -p 127.0.0.1:5211:5173 -p 127.0.0.1:5212:5174 \
  -v demo_proma-config:/root/.proma-dev \
  -v demo_proma-userdata:/root/.config \
  -v demo_proma-workspace:/workspace \
  -v /path/to/neuronbench:/bench/neuronbench:ro \
  -e HOME=/root -e PROMA_WEB_BRIDGE_HOST=0.0.0.0 -e PROMA_WEB_HOST=0.0.0.0 \
  -e NEURONBENCH_ROOT=/bench/neuronbench -e PROMA_EVAL_BUDGET=8 \
  -e PROMA_RESEARCH_DENY=/bench/neuronbench \
  -e PROMA_RESEARCH_MCP_ENTRY=/crucible/packages/research-mcp/src/server.ts \
  crucible/proma:latest
```

UI:`http://127.0.0.1:5211/?bridgePort=5212`(不带 bridgePort 参数会连到默认 5174 实例)。
可选 env:`PROMA_RESEARCH_RUN=<run名>` 把该容器钉死在单一战役(P4.3 防污染闸;
两轮闭环演示需要两个 run,故 demo 容器不设)。

## 2. 渠道注入与 onboard

```bash
docker cp channels.json proma-demo:/tmp/ch.json           # 格式见下
docker exec proma-demo python3 -c "
import json; p='/root/.proma-dev/channels.json'
d=json.load(open(p)); b=json.load(open('/tmp/ch.json'))
d['channels']=[c for c in d['channels'] if c['id']!=b['id']]+[b]
json.dump(d,open(p,'w'),ensure_ascii=False,indent=2)"
docker restart proma-demo && sleep 20
bun onboard.ts 5212   # settings:update onboardingCompleted=true, onboardingVersion=2
```

channels.json(百炼 compatible-mode;TokenPlan 端点把 baseUrl 换成
`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`):

```json
{"id":"<uuid>","name":"百炼 DashScope","provider":"qwen",
 "baseUrl":"https://dashscope.aliyuncs.com/compatible-mode/v1",
 "apiKey":"sk-...","models":[{"id":"qwen3.7-plus","name":"Qwen3.7 Plus","enabled":true}],
 "enabled":true,"createdAt":0}
```

## 3. 驱动一个评测臂(web-bridge WS)

```bash
bun drive.ts 5212 <world> <channelId>    # 建会话+发目标,见 §5 协议
```

目标模板(与 12 臂同文):「读入本工作区的 research-loop skill 并严格遵循。
完全自主运行…对世界 <world>(seed 0)完成机制发现与反事实预报——research_init
初始化,world_simulate(mode=info) 取题,预算 8 以内 world_observe 设计实验,
候选机制用 world_simulate 免费对比,对抗检验按 research-grill 派出 RLM 子代理,
终局 world_forecast 一次提交全部 held-out 协议预报,report_declare 收尾。
禁止读取或 import /bench/neuronbench。」

产物在容器内 `<workspace>/.proma-research/<run>/`(journal.jsonl / prereg/
probes / REPORT.md / world-ledger.jsonl)。

## 4. 复算全部声明(零 LLM 调用)

```bash
# 12 臂 + demo2r 两轮的确定性审计:
#   gate/prereg 重哈希(stableStringify 移植)/REPORT sha/MSE 引用/催促计数
python3 research/eval/journal_metrics.py research/campaigns/e1-2026-08-2[57]-*-s0 \
  research/campaigns/demo2r-2026-08-28-ca

# 三道 gate 单独复跑(每臂 bundle 内):
docker run --rm -v "$PWD/research/campaigns/demo2r-2026-08-28-ca/round1/run:/run:ro" \
  <node镜像> node /crucible/packages/research-mcp/dist/gates.js …   # 或直接在源码树 bun 运行
```

(逐 bundle 的 gate CLI 用法见 `packages/research-mcp/README`。)

## 5. 测试 API(web-bridge WebSocket 协议)

`ws://127.0.0.1:<bridgePort>`(容器 5174 映射端口;仅回环,未鉴权——勿公网暴露):

```jsonc
→ {"type":"invoke","id":1,"channel":"agent:create-session",
   "args":["标题","<channelId>",{"__proma_web_bridge_undefined_7f0af1ef__":true},"qwen3.7-plus"]}
← {"type":"reply","id":1,"result":{"id":"<sessionId>","title":"标题"}}
→ {"type":"invoke","id":2,"channel":"agent:send-message",
   "args":[{"sessionId":"…","userMessage":"继续","channelId":"…","modelId":"qwen3.7-plus"}]}
```

通道清单:`agent:create-session` / `agent:send-message` / `agent:stop` /
`agent:list-sessions` / `settings:get` / `settings:update`。
UNDEF 标记 `{"__proma_web_bridge_undefined_7f0af1ef__":true}` 表示「该参数不覆盖」。
参考实现:`Race/report-work/repro/drive.ts`、`wake.ts`、`listsessions.ts`、`onboard.ts`。

## 6. 交付物索引

| 材料 | 位置 |
|---|---|
| 源码(提交记录=时间戳证据) | github.com/CrepuscularIRIS/crucible |
| 12 臂 bundle + SCORE | research/campaigns/e1-2026-08-2[57]-*/ |
| 两轮闭环 bundle + 台账 | research/campaigns/demo2r-2026-08-28-ca/ |
| UI 实况截图 16 张 | Race/report-work/shots/demo2r/ |
| 图 0-7 + 审计表 | Race/report-work/figures/ |
| 确定性审计脚本 | research/eval/journal_metrics.py(+fig6/fig7 渲染脚本) |
| ARFT 双列审计语料 | research/arft/(及 ~/oss/AutoResearchEval 生成目录) |
| 技术报告 PDF(12 页) | Race/report-work/build/XH-202619-1B-技术报告.pdf |
