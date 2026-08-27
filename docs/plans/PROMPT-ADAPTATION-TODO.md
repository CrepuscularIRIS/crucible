# 提示词适配实施与验证记录

> 来源:2026-08-25 E1 六臂基线(0.17.76)复盘 + ARFT 15 臂描述性审计。终局规则停留在
> skill 软约束层,模型可遗忘/自行提前终止。定性:核心计分与隔离架构成立；剩余问题是
> 模型能力、软提示词和科研状态机之间的耦合缺口，不能先验归为单一一方。

## 实施状态(2026-08-26)

| 项 | 状态 |
|---|---|
| ① 父会话逐回合终局硬契约(researchIsolation 注入) | ✅ agent-prompt-builder.ts + agent-orchestrator.ts；不进入两类 child |
| ② research-loop DoD + 预算纪律(≥2 reps) | ✅ SKILL.md 0.5.3→0.5.4 |
| ③ research-report (P#) 前置 + 同回合 declare | ✅ SKILL.md 0.4.2→0.4.3 |
| ④ MCP 邻近反馈(forecast→next_required_action;declare 红灯指引) | ✅ server.ts |
| ⑤ 宿主终局存活(stop 前自动续跑一次) | ⏸ 暂缓:pi-agent-adapter/pi-session-residency 有未提交的在途改动,待合入后做 |
| #4 回显探针结构闸(常量输出命令拒绝) | ✅ state.ts validateProbeSpec + 3 测试 |
| #5 稻草人 band 方向闸(predicts 方向倒置拒绝) | ✅ 同上 + 3 测试 |
| #6 预算前置挥霍 | ✅ 并入 ② 的 DoD(软约束) |

提交前在真实 NeuronBench 依赖下复跑 Research MCP 与两组 Electron 契约测试：
95 pass、0 fail、0 skip。
复审已修三处:① 否定短语(不低于/不超过/没有上升/increase does not occur)保守跳过，
不再误判方向、误杀互补频段；② 终局硬规则改为父会话逐回合受管上下文，不进入
Proma Collaboration child，也不会经共享 ResourceLoader 污染 Prime RLM child；
③ 所有提示与邻近反馈使用 Pi 实际工具全名 `mcp__research__report_declare`。
评测注意:改动只进源码,已构建的 0.17.76 镜像不受影响——3.8-max 冻结 harness
对照仍可在旧镜像上跑(见"ARFT 复核口径"第 4 条)。

## 比赛主线与改动边界

本计划服务于 `Race/赛道一-方向1B`：最终要证明的是 Qwen 能完成"第一轮计划 → 真实执行
或仿真 → 结果判断 → 第二轮可追溯调整"，并交付不超过 20 页的技术方案 PDF、测试 API、
可交互前端、源代码与百炼调用凭证。ARFT 是 P18/P19 的失败分析和干预证据，不是产品主题，
也不是要求把 45 个模式逐条写进系统提示词。

科研方法、终局存活性和结构校验属于本计划；论文写作、PDF 排版和科研绘图属于评测后
交付层，见 `docs/plans/PLAN.md` P7。二者共享 evidence package，但交付 Skills 不得进入
benchmark 臂或改写 journal/gate 状态。

## ARFT 判官揭示的新问题(2026-08-25,r4 首份 analysis.md)

4. **预登记剧场(最重)**:探针 evalCommand 直接回显已观测数字
   (`python3 -c "print(13.5)"`)→ 频段必中 → SUPPORTED 是结构性保送。
   gate 被合规地骗过(但外部 meter 的分数骗不了,MSE 33.16 是真的差)。
   → 建议补:`validateProbeSpec`/`probe_run` 拒绝 evalCommand 输出恒等回显
   (如:命令含已观测数值字面量、或探针输出 == 某次 world_observe 的 spike_count
   且命令无独立计算逻辑)。属结构性闸,和提示词层双管齐下。
5. **稻草人假设**:H2 的 predicts 与登记频段方向相反——注册即注定 kill。
   → 建议:`claim_propose`/`prereg_write` 校验 predicts 方向与 band 单调性一致。
6. **预算前置挥霍**:8/8 全部花在第一个假设出现之前,确证阶段零预算,
   直接诱发 #4 的回显探针。→ 建议:research-loop skill 加"预留 ≥2 reps 给
   确证阶段"的预算纪律(软约束,写进 DoD)。

## ARFT 复核口径（写报告必须保留）

1. 45 模式高度共现，D.4/C.1/F.4 可视为相邻候选机制，E.2/X.1/X.2 多为后果；
   总 HIT 不能当作独立故障数，"元认知缺陷"只保留为工作假设。
2. 旧/新镜像组的 world 和轮次未配平，19.1→17.3(-9%) 是描述性相关变化，不是
   稳定性修复的因果效应；工程收益用零重启、零挂起和预算账本证明。
3. Stage 1/2 使用同一 glm-5.3 判官，13/15 未达 exemplar 配额；补第二模型或人工盲审前，
   不写"判官无偏"。
4. 理想验证是先在旧 harness 跑 qwen3.8-max，再形成 2(model) × 2(harness)；因比赛工期
   当前裁决跳过 3.8-max 全矩阵，改用同一 qwen3.7-plus、同 world/seed/预算的 0.17.76
   旧轨迹与修后单代表闭环做最小同条件对照。报告不得把它写成跨模型结论。

## 架构复核结论(2026-08-25,判官证据 + 全轮观察)

**总评:核心计分与隔离架构无结构性问题；科研流程闸和终局存活性仍有结构缺口。**
分层防线的实际表现:

| 层 | 设计意图 | 实测 | 结论 |
|---|---|---|---|
| 外部 meter 计分 | 分数不可作弊 | 回显探针只骗过 gate,MSE 仍真实(33 非 0.25) | ✅ 核心防线成立 |
| journal sha256 + 预算 flock | 账本不可篡改/不可超支 | 全轮零篡改,0.17.76 后零超支 | ✅ |
| denylist 隔离 | 真值不可见 | 判官确认"agent-visible truth sealed" | ✅ |
| 三道 gate | 流程合规 | **能被"剧场"合规地满足**(r4) | ⚠️ 唯一被击穿的层,按 #4/#5 补结构闸 |
| 提示词/skill 软约束 | 行为引导 | declare 遗忘、自评全绿 | ⚠️ 任务主体(见上) |

即:计分与真值隔离防线完好；被击穿的是"流程合规闸"，另有 forecast→declare
提前终止。前者加 prereg 回显拒绝和 band 方向校验，后者需要工具结果提示或宿主状态机
保证终局存活；都属于在现有架构上收紧契约，不重写编排。


## 问题实录(qwen3.7-plus,2/6 臂)

1. **ca_rebound r6**:模型声称 `report_declare` "在当前环境中不存在/不可用"——幻觉,
   工具全程在。给工具全名后仍固执,最终未 declare。
2. **h_sag r2**:写完 REPORT.md 后**自评"三道 gate 全绿 ✅"**并停止,journal 无
   declare 事件。指出后重调才真过 gate。
3. 次级:几乎所有臂 forecast 后需 1-3 次催促才 declare(自主收尾意愿弱);
   textbook_M declare 被拒(15 处数字缺 (P#)、SUPPORTED 后无攻击)——流程合规性。

## 修改位置

| 层 | 文件 | 改法 |
|---|---|---|
| ① 父会话受管上下文 | `agent-prompt-builder.ts` `buildResearchTerminalContext()` + `agent-orchestrator.ts` | researchIsolation 父会话每回合注入终局硬规则；不放 ResourceLoader system append，避免 Prime RLM child 继承写状态义务 |
| ② Research skill | `research/skills/research-loop/SKILL.md:100-126` | declare 从"纪律"升为 **DoD 完成定义** |
| ③ report 规则 | `research/skills/research-report/SKILL.md` | (P#) 标注规则前置强调 |
| ④ MCP 邻近反馈 | `packages/research-mcp/src/server.ts` 的 `world_forecast`/`report_declare` | forecast 成功后返回机器可读 `next_required_action`;declare 红灯返回待修项，避免只靠长上下文记忆 |
| ⑤ 宿主终局存活 | Pi 会话 stop/idle 前的 Research 状态检查 | 已 forecast 且无成功 declare 时最多自动续跑一次；只恢复未完成状态，不替模型伪造裁决 |

## 建议文案(核心三条)

1. 研究战役中,写完 REPORT.md **不等于**终局。终局唯一成立条件:**真实调用** Pi 工具
   `mcp__research__report_declare` 并收到 gate 裁决事件。
2. 不得凭记忆声称工具不可用；先按完整工具名真实调用。只有运行时实际返回注册/连接错误，
   才原样报告错误，不伪造裁决。
3. `mcp__research__world_forecast` 之后、未收到 gate verdict 之前，会话未完成；
   自评"gate 全绿"无效。

## 验证口径

同 world 同模型重跑 ≥2 臂:declare 真调率应从 4/6 → 6/6;forecast→declare 平均催促次数 → 0。
另记录恒等回显探针率、evidence 后 belief 状态迁移率、对抗发现整改率；ARFT 45 模式
仅作次级诊断，不能用总 HIT 代替上述直接指标。

## 明确不塞进系统提示词的交付能力

- Proma 已有通用 `pdf`/`docx` 默认 Skill，但它们只解决文件操作与排版，不理解 Research
  journal、claim、gate 和 figure provenance。
- `research-report` 只负责战役 `REPORT.md` 与 gate，不负责比赛 P1-P20 技术方案。
- `nature-skills` 已于 2026-08-26 安装到宿主侧 `~/.claude/skills/`(nature-writing +
  nature-figure + nature-shared;上游 Yuan1z0825/nature-skills@1562ab7,
  Apache-2.0,LICENSE 与 SOURCE 随附;nature-figure 后端已钉 python/matplotlib)。
  仅作为比赛技术报告的宿主写作/绘图层,仍不得进入 benchmark 容器或公开镜像。
- **2026-08-26 追加:两套写作技能已 vendored 进 crucible 内置**
  (`apps/electron/default-skills/`:nature 三件 Apache-2.0 + CCFA 18 件 MIT,共 127M;
  270M 论文语料排除,见各 SOURCE.md)。**评测边界**:21 条 description ≈3k token
  会进每个新建工作区会话的技能清单——任务#5/#6 的 benchmark 臂必须在当前
  (pre-vendor)镜像上跑完;之后重建的镜像用于 demo/论文工作区。
- 缺失的不是一句 prompt，而是只读交付编译层：evidence → section/figure-slot contract →
  Matplotlib PDF/SVG → caption/manifest → 技术报告 DOCX/PDF → 全页渲染 QA。

上述能力在 benchmark 冻结后按 `docs/plans/PLAN.md` P7 接入。比赛必需的 20 页技术方案
优先于可选的论文形态草稿；无真实两轮闭环 evidence 时，写作 Skill 必须输出缺失项而非补写。
