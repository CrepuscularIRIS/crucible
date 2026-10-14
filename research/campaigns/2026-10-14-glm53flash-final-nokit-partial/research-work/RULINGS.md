# RULINGS — run: ca_rebound

## RULING-001 (2026-10-14 19:52 UTC): research_kit 不可用的 deep 路径 fallback
- 事实: `research_kit` 在父内核与 shell 环境均不存在（ModuleNotFoundError / 无可执行文件）。
- 判定: 属宿主环境缺陷。routing 的 deep 配方中 `new_job`/`wait` 不可执行，但不改变战役语义。
- 处置:
  1. 子代理（k1-abduce）直接读取角色契约文件
     /root/.proma-dev/sdk-config/research-roles/proma-research-analyst.md 与任务输入
     /root/research-work/ca_rebound/briefs/k1-inputs.md，角色契约不经过父会话转写。
  2. 结果通过文件交付: /root/research-work/ca_rebound/k1-candidates.md、
     /root/research-work/ca_rebound/sim/sim-*.json、子代理 out.md。
  3. 父会话在后续轮次读取文件收口（配合完成通知），不用未提供的等待接口。
  4. 本缺陷须写入最终 REPORT.md 的 scope 段。
- 影响面: 仅执行机制，不影响证据链（claim_propose/prereg/probe 仍走 research 工具）。

## RULING-002 (2026-10-14 20:40 UTC): 判别 cell 必须落在池协议（真观测合法区）
- 事实: K1 子代理的最小判别 cell 集以 held-out release 协议（-40 release）为 A/D 主轴。
  task.json observe_rules: 真细胞观测只接受池内 9 协议；held-out 仅可仿真，为终局 forecast 专用。
- 判定: 子代理 A/D cell 对真观测非法（会被观测接口拒绝），且若真观测了 held-out 会污染 forecast 的
  held-out 语义。不采纳其 A/D 主轴；采纳其候选与 sims。
- 处置: 父侧补齐池协议 x blocker 缺口（parent-fills.json, 72 组, seed=0/reps=64 同规格），
  重建纯池判别矩阵（15/15 对可判别，min d=0.93）。真观测探针只用池协议。
- 附注（detection limit）: H0|CaT (d=0.95), H0|KA (0.93), M|KA (0.93) 三对池内判别偏薄，
  按 routing "reps<r* 仍跑、记 detection limit、结论封顶 lead" 处理；频段设计吸收重叠风险。

## RULING-003 (2026-10-14 20:40 UTC): 假设登记为家族级签名假设
- 理由: recall=off 且 text_prior 明言"非教科书命名通道"，真参数可能落在族内流形任意点；
  K1 边界节明确 REFUTED 应针对族签名（药物敏感性/方向/形状）而非精确 g。
- 处置: H1..H5 以 level=family 登记；statement 写签名判据；predicts 写可观测的 (cell, 频段) 断言。
