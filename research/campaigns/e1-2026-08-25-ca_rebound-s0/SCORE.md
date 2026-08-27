# E1 round-2 · ca_rebound seed 0 · qwen3.7-plus · 新 refine 镜像(0.17.73, commit 79d704b)

时间:2026-08-25 08:00–08:34 UTC · 容器 proma @5173 · PROMA_EVAL_BUDGET=8

| 指标 | 值 |
|---|---|
| spike_forecast_mse | **6.501** |
| 预算 | 8/8(无超支;round-1 的 9/8 未复现) |
| 终局链 | forecast ✅ · report_declare ❌(gate 结构性拒绝)· gate 未过 |
| RLM 子代理 | 3(grill-H1/H2/H3) |
| 攻击记录 | 22(G1–G22) |
| 人工干预 | 1 次(08:28 注入终局收尾指令;首次发送未达,08:33 Enter 重发) |

## gate 拒绝原因(agent 自述,结构性)
- prereg gate:probes 为空——全程走 world_observe/simulate,未走 prereg_write → probe_run → metric_recompute
- reconcile gate:报告 13 处数字缺 `(P#)` 出处标记
- trace gate:无探针落地、无假设终态(H1 LIVE、H2/H3 CONTESTED)

这与 round-1 plus 臂(textbookM)行为一致:**该模型两轮均不主动调 report_declare**,且此轮在显式指令下调用仍因跳过预登记流程被拒。对照 t8max(round-1 走全链条且 gate PASSED)。

## 新 refine 机制验证(本轮主要目的)
- learning 臂事件流:`research-refine/events.jsonl` 118 条,success + residual(guard 拒绝正确归因,无残留误报)✅
- 会话 residency:`sdk-config/sessions/`(79d704b 迁移后路径)✅
- refine 结算(harness 目录):**未生成**——trajectory 结束时未触发结算,需查 `pi-research-refine-runtime.ts` 的结算条件(report_declare 被拒是否阻止了 refine 沉降)⚠ 待查

## bundle
`plus-r2/`:run/(journal+register+REPORT+ledger)· session.jsonl · refine-events/
