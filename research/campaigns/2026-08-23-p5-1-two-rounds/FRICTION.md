# P5.1 两轮战役 · 摩擦清单（Batch 2 唯一输入）

战役：p5-1-two-rounds（2026-08-23，qwen3.7-plus，无头 harness
`apps/electron/scripts/two-round-campaign.ts`）。
机械验收全绿：P11 因果链成立、declare 内嵌三道 gate 全绿、独立复跑 3×PASS。
**但流程审计发现 4 项摩擦，其中 F1 使本场证据的科学效力再次打折**——
与 P4.3 同样按"流程测试"归档。时间戳证据在 `sessions/` 与
`session-artifacts/`（父会话 01a02f03…，对抗子代理 sub-0ae57df8）。

## F1 · 预登记前预览复发（结构性缺口 · CRITICAL · P14 违背）

父代理在 `research_init` **之前**（14:26:22Z）就在 kernel 里跑了 eval.py
全部 4 个条件（"Run all 4 combinations to understand the landscape"），
看到了 pca=0.945 / shuffle gap=0.055 / no-shuffle gap=0.445；14:29:27Z 才
预登记 P1，第二轮 P2 的频段（15:02Z）同样写在预览之后。频段是回忆不是预测。
违规发生在 kernel、journal 之外，三道 gate 一道都拦不住——与 P4.3 审计
§2.1 同一形状，**第二次独立实证**。

处置建议（升级悬置决策为结构项）：研究会话裁剪观测渠道——eval 类命令
仅经 `probe_run` 可达，或研究会话禁用 Bash/kernel 直跑（PLAN"悬而未决"
项，现已有两轮实证支撑拍板）。

## F2 · 取反配对复发 + 稻草假设（纪律失败 · HIGH）

第二轮 H4 的 conflicts 原文自称"H3 预测 (a) 的**否证假设**"——频段
[0.30,1.0]（H3）与 [0,0.29]（H4）合并盖满值域，假设空间仍是单例。且 H4
在预览 0.445 之后登记，出生即死，只为满足互斥频段的结构要求。结构检查
（互斥/宽度/kill）全部放行——再次证实"类型检查器判不出取反"。上游原因
是 F3：模型从未打开 research-abduce，铁律根本没进入上下文。

## F3 · routing 未触发（纪律失败 · HIGH · 验收判 DEVIATION）

干净会话说"研究一下 X"后，模型**从未打开 research-loop**（整场只读过
research-grill 与 research-report 两张卡），未调 `research_kit.anchor`
（只用了 `research_state`，COUNTERS/⚠ 调度层从未激活），未宣告战役等级
与阶段，RULINGS.md 从未创建——report 第 8 项只能写"本场无裁决"。
第一轮的 abduce/probe 也未打开：模型凭 `<available_skills>` 描述自行动手。
superpowers 的教训在此复现：**没有 bootstrap 注入，路由卡不会自动被读**。

处置建议：(a) 措辞层（本批已做）——开场仪式加逐字输出契约，见
research-loop v0.5.1；**当日已验证生效**：v0.5.1 重跑干净会话全过
（loop 先读→anchor→逐字宣告→RULINGS.md→阶段卡顺序加载→零 eval 执行，
证据 `../2026-08-23-routing-acceptance/sessions/`）；(b) 结构层
（Batch 2 候选）——研究会话把 research-loop 开场仪式作为上下文注入
（Pi extension 模式），`<available_skills>` 里 loop description 前置
"第一动作"强制语。

## F4 · rlm() 子代理与父会话同型 stall（运行时 · HIGH）

一天内三次同型挂起，全部是"长思考后模型调用不返回"：对抗子代理 14:33Z
卡死于回合中（分析全部完成、攻击从未写出、kernel 进程消失）；父会话
第二轮回合 14:50Z 同样挂起 9 分钟，超时后仅产出 thinking 块；恢复后
第二轮在 report 段一次性补完。后果：落点契约按设计执行了（spawn 前
bake 绝对路径 ✓）但救不了"子代理死在写文件之前"——父代理只能翻子代理
session 日志抢救攻击自己落账（诚实标注了"parent extracted"，
"对抗者原话"保证被削弱）。grill 的"空列表 = 还没写完，不是错误"在
子代理已死时误导等待（父代理退避轮询 ~17 分钟）。

处置建议：rlm() 需要子代理超时/心跳/可查询状态（`list_subagents` 的
`active_session_id=None` 已是可用信号，grill 技能应把它写进回收步骤）；
模型供给侧查 qwen3.7-plus 长思考挂起的 API 超时配置。

## 正面确认（不需要动）

- **结构拒绝全部生效且即错即改**：pid 正则、频段引用非 LIVE claim、
  重叠频段三次拒绝，模型按报错路由修复——P4.1"报错即路由"实战有效；
- **战役钉死**：模型试图 `research_init run1` 旁路被当场拒绝；
- **P11 因果链**：probe.land → transition → attack → prereg → land →
  transition 的 journal 顺序即"第二轮由第一轮结果导致"的机器可验证据；
- **收窄声明质量高**：report 第 5 项（"pca 不是 PCA""oracle 阈值""单 DGP
  不外推"）是 G2/G4 攻击的正确吸收方式；
- **父代理自救行为**值得固化为技能措辞：退避轮询 → `list_subagents`
  查状态 → 日志抢救 → 诚实标注来源。

## 验收口径备注

脚本判 `P5_1_CAMPAIGN_PARTIAL`（第三段按 journal 等待超时，第二轮实际在
第四段回合内完成）——机械项（两轮、因果链、declare、3×PASS）全绿；
routing 验收按夹具定义判 DEVIATION（F3）。本场作为 P5.1 的**流程**证据
成立，作为**科学**证据不成立（F1/F2），与 P4.3 同一结论、同一处方：
下一场的先决条件是 F1 的结构处置。
