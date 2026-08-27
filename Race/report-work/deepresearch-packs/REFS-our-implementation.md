# REFS · 我们的实现基理(具体机制,供对照判断邻接度)

> 与任意 PACK 一起上传。这是**已实现并实测**的系统事实,不是计划。
> 仓库:Infatoshi/crucible(Proma 桌面端 + Prime Agent 运行时 + research-mcp)。

## 1 · 分层

```
Proma(桌面产品:工作区/Skills/MCP 配置/会话编排/记忆)
 └ Prime Agent 运行时(常驻 IPython RLM 内核;递归子代理;自主门)
    └ research-mcp(独立进程,12 工具)←— 信念状态唯一 owner
       ├ journal.jsonl(追加式,哈希链防篡改,篡改即污染整个 run)
       ├ prereg/<pid>.json(冻结探针,sha256+时间戳)
       ├ probes/<pid>/raw/(沙箱产物,server 在沙箱外捕获)
       └ world-ledger.jsonl(预算账本,flock 仲裁)
基座:Qwen(qwen3.7-plus 主力;qwen3.8-max 对照)。能力层 model-agnostic。
```

## 2 · 状态机(全部结构闸,模型只能提议)

**CLAIM**:PROPOSED→LIVE(需与每个 LIVE 假设有可区分预测+声明与坟场的关系)
→terminal(REFUTED/SCOPED/SUPPORTED,**必须引用一次已落地探针**;
迁移规则在预登记时写死、结果落地时机械适用)。
**PROBE**:PREREG(冻结)→RUNNING→LANDED(退出码 0 才落地)。

**登记时拒绝**(ResearchStateError,全部有测试):
- 零宽频段 `[x,x]`:「没有容差的预测不是预测,是回忆」
- 无互斥频段对:「装饰性探针」
- 无 kill/scope 分支:探针必须有能力否定假设
- **常量回显命令**:`python3 -c "print(13.5)"` / `echo 13.5` / `printf "13.5"`
  整条命令是常数输出 → 拒绝(预登记剧场,ARFT C.1;窄闸:确定性重放合法,
  语义由 trace gate 兜底)
- **稻草人方向倒置**:predicts 方向词(升/降,中英)与频段整体倒置 → 拒绝
  (否定短语「不低于/不超过」先剥离,防误杀互补频段)
- 频段引用非 LIVE claim / 分支目标不存在

**执行契约**:bwrap 沙箱(只读 fs、无网络、env 白名单)只执行预登记冻结的
命令字符串;指标由 server 从 raw 按 metricKind(json 路径/单捕获组正则)重算
——**报告数字永不采信模型**。

**终局**:report_declare 当庭跑三道 gate——prereg(登记先于结果,时间戳)·
reconcile(报告每个数字带 (P#) 出处并与重算值对账)· trace(journal 逐字
重放,手改 register 当场抓)——全绿才写入裁决。终局契约(每回合注入父会话):
「写完 REPORT≠终局;自评全绿无效;工具不存在=看漏」。

**计量世界**(neuronbench 六 world:ca_rebound/textbook_M/z_rebound/h_sag/
na_fatigue/d_type):world_observe/simulate/forecast 三个 MCP 工具只是壳,
真值与 MSE 由外部 world-meter.py 记账;denylist(PROMA_RESEARCH_DENY,
fail-closed)对 agent 封闭真值;预算(默认 8 reps)flock+账本仲裁;
forecast 一次,之后唯一出口是 declare。

## 3 · 认知层(生成侧,与闸互补)

一环六移动(ABDUCE/SYNTHESIZE-PROBE/EXECUTE/UPDATE/CHALLENGE/REFRAME),
每张卡=信念状态形状触发+终止于一次 MCP 调用(不落账=没发生);
REFRAME 由事件触发(落地/压缩/N 回合无迁移),不由「感觉有信心」。
选择不排序:预测结果表,判别力=频段不重叠假设对数÷成本(无概率 EIG)。
计数器调度(内核锚):落地未迁移/攻击债/同探针死亡/坟场,阈值才出提示。

## 4 · 子代理(对 Prime 默认分派的重写)

父会话唯一 Research 状态写入者;child 只经绝对路径 brief/report 交接。
**信息不对称是唯一触发**:①claim 将迁移 SUPPORTED→grill child 见
claim_view(主张+证据+坟场)不见父会话辩护;②新假设首探针前→盲预测
child 见去结局 setup 不见频段;③假设句刚写→复述检查 child 只见裸句;
**永不**:分析/总结/自查自纠。

## 5 · refine 环(第二环)

失败类残差流→计数器→reviewer→提升为 harness 教训(promotion checkpoint
在会话归档前)→下一战役。**只搬过程性教训(GPU 路由/预处理),永不搬
认知状态**;Goodhart 防线:refinement 计数是残差统计,不是目标。

## 6 · 实测数字(2026-08-24/25)

- E1 六 world(0.17.76,qwen3.7-plus,seed 0,预算 8,六臂并行):
  ca 9.225 · hsag 10.724 · tbm 14.978 · dtype 20.042 · nafat 175.716 ·
  zreb 202.18(MSE);零重启、零工具挂起、零预算超支。
- E2 ARFT 判官(glm-5.3)审计我们自己 15 条轨迹:399 标签;高频
  D.4 100% · C.1 93% · E.2 93% · F.4 93%;根因支柱 P3 integrity 105/276
  (38%)。**判官确认外部 meter 未被绕过;被击穿的是流程 gate(回显探针
  合规骗过)与终局存活(自评全绿)**→ 0.17.77 三处修复(终局契约/
  回显闸/方向闸)正好对应,修复与靶点构成闭环。
- 稳定性纵向:0.17.73 每臂 1-5 次人工干预/预算并发竞态 12/8 →
  0.17.74-76 逐项修复(含 meter flock 回归测试:4 并发×reps3 只放行 2)。
- 已登记未跑(【待验】):两轮闭环代表案例;同条件对照(plus@0.17.76 vs
  0.17.77);消融阶梯 a-e 及其预登记预测((b)≈(a) 于 F.4/D.7 等)。

## 7 · 设计文档谱系(推理过程存档)

docs/product/PrimeAgent.md(第一性原理:B/W/四操作/两耦合/六失效 F1-F6;
内核寄存器设计及其自我推翻)→ Fable5.md(ARFT=提示词认知的负结果;
闭合而非认知;一环六移动;三终局 gate)→ A.md/B.md(移植规则:每行要么
塑形 MCP 调用要么命名结构判不了的判断;三层架构:承诺地板/移动库天花板/
ARFT 降级为评价词汇;rlm 触发表)→ FableDesign.md(refine 环边界)。
Race/architexture.md(选型期:双后端/双模式/隐藏评测器/四层测试阶梯,
后大半实现为现架构)。Race/Event.md(叙事)、FILLING-1B.md(P1-P20 组织)。
