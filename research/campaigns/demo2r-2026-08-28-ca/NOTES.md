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
- 05:56 **declare 首次被 gate 拒**(两次拒绝,两种闸都真实生效):
  ① reconcile:报告数字无 provenance → agent 反复改写 REPORT;
  ② prereg:「空 run:没有任何已落地探针」——本轮观测全走 world.observe 计量路径,
  沙箱探针为零。agent 随后 prereg P1-P8 试跑,**全部 exit 1**(最小命令 `id` 也败)
  → 其 thinking 记录"All probes fail. The sandbox is completely no…",一度准备写终局总结放弃。
- 05:59 **根因定位(我方基础设施错误,非系统问题)**:`docker run` 建容器时漏带
  38 系容器都有的 `--cap-add CAP_SYS_ADMIN/CAP_NET_ADMIN --security-opt
  seccomp=unconfined --security-opt apparmor=unconfined --shm-size 1g`
  → bwrap 无法创建用户命名空间(`Creating new namespace failed: Operation not
  permitted`)。**修复**:原容器删除,同名卷复用重建(会话/run 状态无损),bwrap 验证 OK。
- 06:00 桥接唤醒一次(基础设施修复通知,内容中性):「容器缺沙箱权限导致探针全
  exit 1,已修复;继续完成战役」(首送 TIMEOUT 但服务端已投递;二送被拒「会话正
  在运行中」→ 会话自动恢复)。**本会话外部催促计数 +1(如实计入)。**
- 06:01 修复后首批探针落地:P12 metric=40,prereg 持续,declare 重试中。
- 06:09:24 **第一轮 declare 过门**:`gate.verdict passed:true,prereg ✓ reconcile ✓
  trace ✓`,REPORT.md sha a921d293。最终 claim 态:H1 SUPPORTED(P16)/H2 CONTESTED/
  H3 REFUTED;12 prereg 全部重哈希一致;攻击 7 条(constraint 4 / new_h 2 / no_change 1)。
  REPORT「遗留与债务」段列 6 条债,并自主给出「第二轮建议起点」(ICAN 登记/驳回、
  收紧 H1 频段、判别探针、预算纪律)——元认知由债务清单实现的现场例证。
- 06:10:23 第二轮反馈消息经 bridge 投递(同会话;该消息为 r2 的任务指令,不计入
  r1 催促——r1 真实催促 = 1 次沙箱修复通知)。r1 bundle 已归档
  `research/campaigns/demo2r-2026-08-28-ca/round1/`,审计:
  prereg 12/12 · REPORT sha ✓ · MSE 引用一致 ✓ · gate ✓ · heldout 4 · fc_max_dev 1.0。

## 与 E1M 的纪律差异(如实记录)

- 本轮 **0 prereg 先行**:全部观测走 `world.observe`(计量细胞)而非 prereg→probe_run 沙箱路径;
  首个 prereg.write 出现在 forecast 之后(05:52)。P14「计划先于执行」的证据因此退回
  prereg 时间戳 + journal 顺序,而非 PLAN-v1.md——**PLAN-v1.md 未写**(目标里有要求,模型未执行)。
- `budget_spent=11 > EVAL_BUDGET=8`:候选 world.simulate 的 reps 是否计费待查 meter 语义;
  E1M ca 为 6/8。不构成 gate 违规(计量器未拒),记录在案。

## 第二轮(终局)

- 06:10:23 反馈消息投递(同会话):seed 1、run `demo2r-ca-r2`、以债务清单为唯一起点、
  观测前强制 prereg、预算硬顶 8、「两轮对比」段。
- 06:11–06:14 **plan-v2 仍未写**(两轮一致:该模型不写计划文件,P14 证据=prereg 时间戳),
  但纪律完成迁移:3 claim 提案(H1 收紧频段/H2 继承/H3=ICAN 正式登记)→
  4 prereg 全部**先于观测**冻结 → 4 observe + 4 probe 全落地(0 失败)。
- 06:14:14 **world.forecast**(seed 1):MSE 14.333,`budget_spent=4`(预算债清偿:11→4)。
  梯度反跳结构 12/14/16/17 原样迁移;long step 26→33(新 seed 重校准;报告归因
  "long step=33 远超预测导致 MSE 增加")。
- 06:18:44 **declare 一次过门**(r1 的教训迁移):`passed:true,prereg ✓ reconcile ✓ trace ✓`,
  sha 1e058e1a。journal 终态:H1 SUPPORTED(P1=40 落收紧带 [36,44])、H2 OPEN、H3 OPEN。
- **叙事漂移发现(重要,如实记录)**:r2 REPORT 的「两轮对比」表写
  "H1 降级 CONTESTED / H2 仍 CONTESTED / H3 CONTESTED",与 journal 真值
  (H1 SUPPORTED 复确证、H2/H3 OPEN 未终态)不一致——**reconcile gate 校数字出处,
  不校 claim 状态叙事**;已声明报告不可改(sha 冻结),差异以确定性审计为准。
  这既是本轮的诚实披露,也是 gate 覆盖面的实测边界(候选改进:claim 状态表纳入 reconcile)。
- 双轮审计(journal_metrics,评委可复算):r1 gate✓/prereg 重哈希 12/12/MSE 引用一致✓;
  r2 gate✓/prereg 4/4/REPORT sha✓(r2 报告引用了 forecast 事件但未写数值字面量,
  mse_in_report=False 如实记录);催促计数:全会话 3 条非上下文 user 消息
  = 2 条任务指令(r1/r2 各一)+1 条沙箱修复通知,真实"干预"仅最后者。

## 交付物

- bundle:`round1/`、`round2/`(run/ + session.jsonl + proma-session.jsonl)
- 图:fig6 两轮对照(`figures/fig6-two-rounds.png`,脚本 `research/eval/fig6_two_rounds.py`)
- 截图 16 张:`Race/report-work/shots/demo2r/`(含 38ca 钉死拒绝事故 3 张)
