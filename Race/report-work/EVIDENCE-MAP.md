# EVIDENCE MAP · 方向 1B 技术报告(2026-08-26 重估)

> 前身:`Race/FILLING-1B.md`(组织底稿,S1/S2/S3 叙事 + 七条填写纪律沿用)。
> 该稿写于旧架构代(spine.py 未接线),现状列已过时;本表按今天证据重估。
> 叙事三句(S1 立论 / S2 转折 / S3 主张)与设计原则一句不改,见 FILLING-1B §1。

图例:✅ 素材已有 · 🟡 有一半 · ❌ 还没有(标注来源计划)

| 节 | 填什么 | 证据来源 | 现状(08-26) |
| --- | --- | --- | --- |
| **P1** 信息与核心结果 | S1+S3 压缩 300 字;两个代表性结果要数字 | ①六 world MSE 表(E1)②两轮闭环案例 | 🟡 ①有;②等任务#5;报名表/百炼截图=用户 |
| **P2** 目标与完成 | S1+S2 不足;完成只写真做的 | Event.md + HANDOFF + E1 实跑范围 | ✅ 素材齐,待收敛 |
| **P3** 科学逻辑与判断 | 五行表对 S3 五动词;三态区分 | belief→probe→observation→update 状态机;gates 四锁 | ✅ 代码即证据(state.ts 头注释) |
| **P4** 数据与实验条件 | NeuronBench 六 world·seed·预算·meter 噪声 | E1-SUMMARY;world-meter.py;BASELINE-HOLES | ✅ |
| **P5** 评价方法 | 谁评价(meter/gate=程序,agent=被评);一轮二轮同口径 | meter 外部计分+journal 账本;确定性指标脚本 | 🟡 脚本待建(任务#6) |
| **P6** 架构与技术闭环 | 五模块图;为什么不是一次性生成 | Proma+Prime+research MCP/skills 分层;P0.1 RLM 时机重写 | ✅ 需一张新架构图(matplotlib/drawio) |
| **P7** Qwen 使用与上下文 | qwen3.7-plus/3.8-max·LiteLLM/百炼;真实上下文结构 | 终局契约注入(agent-prompt-builder);skills 动态装载;journal 锚 | 🟡 需一张真实上下文示意图 |
| **P8** 实验任务规划 | 五环节表 + 真实计划片段 | research-loop 状态机 + 两轮案例 plan_v1(执行前落盘) | ❌ 等任务#5 |
| **P9** 执行与数据获取 | 原始结果与模型生成内容的区分 | bwrap 沙箱 provenance.json(sandbox 见证)+ raw 落盘 + meter 账本 | ✅ E1 bundle 里有实例,选贴 |
| **P10** 分析质控与反馈 | 确定性程序算什么/模型解释什么 | recomputeMetric 只认 raw;gate 重放 journal;ARFT=模型解释的边界 | ✅ 分工天然对口 |
| **P11** 反馈与调整 | 一项真实调整:哪个结果→什么判断→X 改成 Y | 两轮案例:RULINGS diff + claim_transition→下一探针 + refine 事件 | ❌ 等任务#5(P11 红线:重生成≠迭代) |
| **P12** 流程与失败处理 | 真实流程图 + 实际失败台账 | 稳定性 bug 台账(E1-SUMMARY);预算竞态 12/8→flock;回显探针→结构闸 | ✅ 失败清单是加分项 |
| **P13** 案例选择 | 选它的理由 + 不能代表什么 | ca_rebound(倾向:最优 MSE 9.2、六轮史、rebound 动力学适合两轮叙事) | 🟡 案例待定稿 |
| **P14** 第一轮计划 | 预期观测/停止条件,执行前时间戳 | 两轮案例 plan_v1 + prereg sha256 | ❌ 等任务#5(P14 红线:不许反向补写) |
| **P15** 第一轮执行与结果 | 原始结果·与预期差异·保留未达预期 | 第一轮 journal + forecast MSE | ❌ 等任务#5 |
| **P16** 问题分析与调整依据 | 问题→依据→替代解释→对下轮影响 | grill 攻击记录 + ARFT 视角复盘 | ❌ 等任务#5 |
| **P17** 第二轮计划执行结果 | 五行变化对照 + 没改善的 + 新增代价 | plan_v2 + 第二轮 journal + 改善/未改善对照 | ❌ 等任务#5 |
| **P18** 对照消融 | 至少一种同条件比较 | plus@0.17.76(有 n=6)vs plus@0.17.77(任务#6);口径 caveat 照写 | ❌ 等任务#6 |
| **P19** 总体结果失败边界 | 六 world 表 + ARFT 审计 + 失败/边界诚实清单 | E1 全表 + ARFT(E2)+ 口径 caveat 五条 | ✅ 素材最全的一节 |
| **P20** 复现与提交 | 源码/环境/凭证/API/前端 + 自检 | 复现包(任务#7);gates CLI 可独立复跑 | 🟡 打包待做 |

## 图槽(matplotlib,数值一律由 evidence 渲染,红线 7)

1. **fig1 架构图**(P6):✅ figures/fig1-architecture.png(+.drawio 源)
2. **fig2 上下文结构**(P7):✅ figures/fig2-context-layers.png(+.drawio 源)
3. **fig3 六 world MSE**(P1/P19):✅ figures/fig3-mse-12arm.png
4. **fig4 稳定性时间线**(P12):✅ figures/fig4-stability.png
5. **fig5 ARFT 支柱图**(P19):✅ figures/fig5-arft-pillars.png
6. **fig6 两轮对照**(P17):✅ 已交付 figures/fig6-two-rounds.png(demo2r)
7. **fig7 干预前后**(P18):✅ 已交付 figures/fig7-interventions.png(E1 未归档项如实标注)

## 确定性指标脚本(P5/P10/P18 共用,评委可重跑)

从 journal.jsonl + session.jsonl 计数(判据先写死):declare 真调率、forecast→declare
催促次数、恒等回显探针率(0.17.77 起结构性=0)、预算纪律(确证阶段预留)。
宿主脚本,不进 benchmark 臂;输出 CSV + 复算命令一行。

## 写作顺序(与任务对应)

1. **今天** P2/P3/P6/P7 初稿(纯叙事,素材冻结)+ F1/F2/F3/F4/F5 出图
2. **本周中** 任务#5 两轮案例 → P8/P13-P17 草稿(等数据插槽)
3. **随后** 任务#6 → P18 + F7;P19/P20 收尾
4. **最后** 全页渲染 QA → DOCX/PDF(≤20 页,一节一页;砍 P2/P6 论证,不砍 P13-P17 证据)

## 用户持有项(报告等不了的要尽早)

- 报名表盖章版截图(P1)
- 百炼/官网 API 调用凭证或账单截图(P1/P7)——E1 直连臂走官网 API,凭证在你手里
- 录屏终版出镜决策(P20 可选,≤10min)
