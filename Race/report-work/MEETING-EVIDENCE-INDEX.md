# 会议答辩证据索引

版本 0.1.0，2026-10-15。用于讲者在二十秒内定位依据，不是评测成绩单。起始版本为本地 `526149e`；后续文字澄清提交以 Git 为准。其他任务正在跑的 benchmark 不纳入本次结论。

## 首先打开什么

主展示：Proma 研究画布，载入 `2026-10-14-glm53flash-oneline-ca_rebound` 只读示例。备用审计：`deploy/defense/index.html`，关键节点 `#D6`。运行采用 GLM 5.3 Flash、seed 20261014；新版画布读取历史记录，不等于新版研究系统重新运行。

本页下列路径均相对仓库根。可在编辑器按行跳转，或在工作台按事件/滑块定位。静态 HTML 可离线阅读；不是提供给评委的公网服务。

## 评分规则的来源和冲突

已直接读取 `Race/XH-202619_基于国产开源大模型的AI Scientist的研发与应用.pdf` 第6–7页：科学价值40、技术深度30、应用潜力30，总计100。该文件能证明所留存PDF的条款，不能证明它仍是官网最新版本。

`Race/赛道一-方向1B-科学实验任务规划与反馈迭代-提交要求及模板.docx` 明确：基座须为Qwen；重新生成不等于反馈迭代；无提升也是有效结果；仿真不能写成真实科学验证。

直播网页转录版的应用潜力标30%，子项15+10+10=35；全表子项共105。此冲突尚未由原始最新版澄清。模拟打分只按明确的PDF版100分计算；直播表用于定性检查，不能自行改成归一化正式分数。

## 问题与可展示的证据

以下 `ONE` 均指 `research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound/`。

| 评委追问 | 二十秒内打开 | 能证明 | 不能证明 |
|---|---|---|---|
| 实验问题是什么 | `ONE/prereg/P1.json` 的 question；画布本轮解释 | 当时登记的问题和预测 | 问题本身具备新颖科学价值 |
| 是先预测还是看结果后编 | `ONE/journal.jsonl:30`、`:32`、`:33`，再看P1文件 | 此归档的登记、观测、落地顺序 | 绝对防篡改、无侧路泄漏 |
| 第一轮怎样影响后续 | `ONE/journal.jsonl:34`，再看 `ONE/prereg/P2.json` | H1收窄的原始理由；后续为区分弱效应登记40ms协议 | 下一步为最优选择；仅凭时间相邻就有因果证明 |
| 第二轮只是重新生成吗 | `ONE/journal.jsonl:63`、`:65`、`:66` | 先登记，后执行计费仿真观测13并落地 | 研究质量得到提升 |
| 哪个判断改变了 | `ONE/journal.jsonl:67`、`:68` | H5→REFUTED、H3→SUPPORTED是实际状态记录 | 这两个科学判断正确 |
| 后面真的还有实验吗 | `ONE/journal.jsonl:88–89`、`:99–100` | P3读数6、P4读数26有观测及落地事件 | 多轮一定优于单轮 |
| 花了多少预算 | `ONE/journal.jsonl` 的4条 world.observe | 3+1+1+1=6个计费观测单位，预算上限8 | 总API费用、token数或计算时间 |
| 三道检查为什么没拦住错误 | `ONE/journal.jsonl:105`；`ONE/annotations.json` D6 | 契约检查记录与事后科学审查可以不一致 | 所有错误已被运行时拦住 |
| 谁认定结论有问题 | `deploy/defense/index.html#D6` 的证据抽屉 | 原始判断、审计注释和复算来源分开 | 注释来自独立人类领域专家 |
| 有没有Qwen证据 | 八月Qwen归档与原报告P7的凭证材料，单独展示 | 需按各自运行和截图覆盖范围说明历史使用 | 十月GLM链是新版Qwen验证；用量账单能归因每个具体探针 |
| 原代表案例是否可靠 | `research/campaigns/demo2r-2026-08-28-ca/round2/run/prereg/P1.json` | evalCommand直接输出40.0；该探针不能证明独立测量 | 仅凭全绿即可接受旧报告科学结论 |
| 能暂停、询问和改方向吗 | 控制代码及测试；现场完整路径仍待验 | 实现与局部测试存在 | 按下按钮即停止所有子任务；本轮已完成真人控制验收 |

## 主案例的最小数字卡

| 量 | 数值 | 口径 |
|---|---|---|
| 探针 | 4 | P1–P4，不是4个独立任务 |
| 计费观测单位 | 6 / 8 | P1重复3次，其余各1次；不是费用金额 |
| P1、P2实测 | 17.3333、13 | 不同协议，不能直接以差值宣称性能改善 |
| P1、P2条件 | 250ms、40ms | 其余具体参数见预登记 |
| 科学结果 | 最终机制结论错误 | 以审计及其依据核对；不是成功发现案例 |
| 本轮产品验证 | 118项画布测试通过 | 2026-10-15本地执行；不等于科学效果或真人冷读通过 |

## 复用与团队工作分别说

| 来源 | 使用方式 | 本地可查落点 | 当前结论 |
|---|---|---|---|
| Proma、Pi/Prime | 应用与Agent运行基础 | `apps/electron`；`adapters/prime-compat.ts` | 不作为团队原创基础模型/运行时 |
| ResearchStudio、ResearchCompanion、Arbor | 研究流程、审查与反馈设计参考 | `mindset/调研/redesign/R1–R4`，统一架构01 | 参考和已实现模块分开，不声称性能超越 |
| Crucible研究记录与约束 | 计划登记、计量、状态变化、报告校验 | `packages/research-mcp`、`packages/shared/src/research-record` | 可检查部分契约；不能裁决全部科学真伪 |
| Crucible阅读与交互层 | 同记录的画布、阶段解释、审计页 | `research/`组件、`research/report` | 产品可读性与科研收益各自验证 |

## 固定证据身份

以下是文件字节sha256，不是日志中 spec_sha256；两者覆盖对象不同，不应直接互相比对。

```text
ONE/journal.jsonl c80e0c7a66a9b7b9ef5ef16bc9e36c399ef2660569bd132c2e0e95f42bbce1e2
ONE/REPORT.md 4a3c575f0b1b1c4516bded76f99080942f4b92018dd8afb16aca20367a26e9d6
ONE/annotations.json 5676ecca1f7549846a6c2bee81dd6d9d9124f1f3645aa9a70f7be8a6ec80f88c
ONE/prereg/P1.json de54b108e31c0b1609c1233fd0a27f88f4505a4ea2145828be6ac7cb60827eb7
ONE/prereg/P2.json bb0a0723acb1f382a969e54a4bfe0843301ba1ab66ed186f0967def56cee0d76
```

生成/验证现有评委页：`bash research/report/build-defense.sh`。它验证绑定与页面结构；两分钟检查器通过不等于真人能在两分钟内理解。复算脚本在 `research/campaigns/_recompute/`，执行前核对所需环境；不能把页面生成称为重做科学实验。

### 本轮新增的归档缺口

2026-10-15直接调用现有 `runPreregGate` 与 `runTraceGate` 检查ONE，均通过；`runReconcileGate` 报缺少 `probes/P1/raw/output.txt`。文件盘点显示P1–P4原始输出均未包含在该归档中。历史日志中的gate全绿是当时记录，不是本轮已成功重跑的结果。报告页现在单列输入归档的原始输出覆盖，缺件不得被页面结构检查掩盖。

恢复条件：从同一次运行的原始存储取回文件，核对run身份、日志、预登记和原始输出，再执行对账。不能把world.observe/metric字段打印成新output.txt填洞，也不能借另一seed或另一run的输出。当前仍可展示日志回放，但“完整可复现”的承诺必须收窄。

## 原报告配套材料

原技术报告v2保留。使用 `MEETING-ERRATA-20261015.docx` 附页说明更正；不要单独发送原报告而漏掉附页。会议讲稿、问答和分镜以同目录的最新文件为准。新bench通过后应更新整条证据链，不能只换首页数字。

## 六个十月归档的当前复核

2026-10-15本地只读执行现有 `runPreregGate`、`runReconcileGate`、`runTraceGate`，未调用模型或重做仿真实验。目录均位于 `research/campaigns/`，下表省略公共前缀 `2026-10-` 与 `glm53flash-`。

| 归档 | 已落地探针 | 原始输出提供 | prereg | reconcile | trace |
|---|---:|---:|---|---|---|
| 14 / ca_rebound-s0 | 4 | 0/4 | 通过 | 缺件阻塞 | 通过 |
| 14 / final-nokit-partial | 0 | 0/0 | 不通过 | 无报告，不通过 | 不通过 |
| 14 / final-oneline-ca_rebound | 1 | 0/1 | 通过 | 缺件阻塞 | 通过 |
| 14 / oneline-ca_rebound（ONE） | 4 | 0/4 | 通过 | 缺件阻塞 | 通过 |
| 14 / p0-oneline-ca_rebound | 5 | 0/5 | 通过 | 缺件阻塞 | 通过 |
| 15 / delivery-oneline-ca_rebound（DELIVERY） | 6 | 6/6 | 通过 | 通过 | 通过 |

ONE用于讲述反馈轨迹和失败审计；DELIVERY用于证明本地当前能够从所保留原始文件重新检查部分记录契约。不是独立第三方复现，也不是重新运行Agent。二者均为GLM，不拼成Qwen验证链。

DELIVERY仍有明确的推理问题。本轮直接核对 `prereg/P7.json` 与 `journal.jsonl:49–53`：读数16落在H12自己的预测带[-7.87,18.75]中，迁移注释仍称“排除”；该带并未阻止其进入CONTESTED。另查REPORT“等价类出口”说H7带来自P7预登记，但P7冻结bands只有H0/H6/H10/H12，没有H7。这里证明的是记录间存在矛盾，未读取世界真值，不能给最终机制结论补上科学正确认证。已放弃的额外硬规则不重新开发。

## 二十秒零模型反例演示

在仓库根执行（自动创建并清理独立临时副本，原归档只读）：

```bash
bun research/report/demo-report-integrity.ts research/campaigns/2026-10-15-glm53flash-delivery-oneline-ca_rebound
```

1. 原归档当前三项检查通过。
2. 只在临时副本追加一行报告，看到“声明后的sha256不符”。
3. 再把临时报告第一处探针数值改为999999，保持声明和原始输出不变，看到摘要不符以及“报告称999999（P1），重算14”两条错误。这一步没有写入新的report.declare事件。
4. 原报告摘要未变；临时副本清理完毕。

口述：“它能拒绝声明后的改动，也能把带出处的数字与存档原始输出对账；它仍不能替我们判断整个科学解释是否成立。”只展示命令结果，不声称这是新增运行或真实科研收益。脚本与两条BDD测试已加入本轮交付。
