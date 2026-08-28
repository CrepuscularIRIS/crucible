# demo2r 两轮闭环演示 · 事故与时间线台账

容器:`proma-demo2r`(127.0.0.1:5211 UI / 5212 bridge),镜像 crucible/proma:latest(0.17.77)。
模型:**qwen3.7-plus** via 百炼 TokenPlan 渠道(用户指示"多用 token plan";按量 DashScope 渠道保留未用)。
env:`PROMA_EVAL_BUDGET=8`、`PROMA_RESEARCH_DENY=/bench/neuronbench`、**无 `PROMA_RESEARCH_RUN`**(两轮需要两个 run)。

## 时间线(UTC)

- 05:24 起:先在 `proma-38ca`(E1M ca 容器,env 钉死 `PROMA_RESEARCH_RUN=e1-2026-08-27-ca_rebound-s0`)
  建会话发同一目标 → **server 拒绝**:「本次会话已钉死战役 …,拒绝访问 demo2r-ca-r1:
  研究战役不由子代理凭空开新分支」。P4.3 防污染闸现场命中,会话转录与截图存
  `Race/report-work/shots/demo2r/attempts-38ca-pinned/`(session-refused-pin.jsonl ×48 行)。
- 05:33 建 `proma-demo2r`(不钉 run);注入渠道 DashScope+TokenPlan;onboard via bridge。
- 05:34 UI 建会话,模型选 **百炼 TokenPlan · Qwen3.7 Plus**(截图 06),发第一轮目标(截图 07/08)。
  目标要点:run 名 `demo2r-ca-r1`;预登记前先写 PLAN-v1.md;REPORT.md 必须含「遗留与债务」段。
- 05:37–05:50 探索期:15× world.simulate(免费候选对比)+ 5× world.observe(计量观测)、
  3× claim.propose、5× attack.record(RLM grill)。
- 05:50:30 **world.forecast**:6 协议一次提交,`spike_forecast_mse = 6.595`,`budget_spent = 11`。
  对照:同世界 qwen3.8-max(E1M 直连)MSE 35.53;qwen3.7-plus(E1 经 LiteLLM)9.23。
  预报呈梯度反跳结构(hyperpol -25/-30/-35/-40 → 12/14/16/17)。
- 05:52 起:预报后继续整理——REPORT.md 落盘、P1 prereg.write(sha 5e424b5d)…
  (declare/gate 待续)

## 与 E1M 的纪律差异(如实记录)

- 本轮 **0 prereg 先行**:全部观测走 `world.observe`(计量细胞)而非 prereg→probe_run 沙箱路径;
  首个 prereg.write 出现在 forecast 之后(05:52)。P14「计划先于执行」的证据因此退回
  prereg 时间戳 + journal 顺序,而非 PLAN-v1.md——**PLAN-v1.md 未写**(目标里有要求,模型未执行)。
- `budget_spent=11 > EVAL_BUDGET=8`:候选 world.simulate 的 reps 是否计费待查 meter 语义;
  E1M ca 为 6/8。不构成 gate 违规(计量器未拒),记录在案。

## 第二轮(待发)

seed 1、run `demo2r-ca-r2`;以第一轮 journal/register 的未清偿债务为起点;
本轮硬性要求观测前 prereg;REPORT.md 增「两轮对比」段。
