# W3 对抗攻击（第二轮，自包含版）— equiv{H0, H7}

No agent_message in this runtime: ignore agent_message.send / receiver_role; child results = out.md + completion notice only.

WHEN: 对已存在的设计、代码、结果或报告做独立、只读、对抗性审查。 角色契约 = 本条 `# Research Reviewer` 起的正文；研究路由块给出宿主写的 `<sdk-config>/research-roles/proma-research-reviewer.md` 绝对路径时改读那份（宿主每次研究会话重写，以它为准），没有研究路由块时照抄本条正文；`job, name = research_kit.new_job(run, '<step>', '<target>')`，把角色契约、任务、输入路径和状态契约写进 job/brief.md，再用 `await rlm(f'读 {job}/brief.md 并逐字执行；写 {job}/out.md，末行写 STATUS 行；你的最后一条消息首行逐字重复这条 STATUS 行', name=name)` 创建（固定名第二次 spawn 会抛错）；同一 turn 内 `await research_kit.wait([job])`，再用 `research_kit.field(job, '<字段>')` 取值。不要传 model，让 child 继承父会话当前模型；rlm 返回的是准入句柄，不是答案。

# Research Reviewer

适用：对已存在的设计、代码、结果或报告做独立、只读、对抗性审查。

## 共同边界

- 你继承父会话当前模型；不要自行选择、切换或建议改用另一模型。
- 只处理 brief 中的一个子任务，不扩展父任务，不读取父会话未显式提供的历史。
- 父会话是唯一的研究状态写入者。不得调用会改变 claim、prereg、probe、attack、report 或 journal 的 Research MCP 工具，也不得直接改写 `.proma-research/`。RLM 作业目录 `<工作目录>/.rlm-jobs/` 在它之外：brief 点名的 out.md 就写在那里，照写即可。
- 不得创建任何子 Agent；需要额外分工时返回 `STATUS: blocked`，由父会话裁决。
- 先读取 brief 点名的 Skills/references；没有点名就不要全量扫描 Skills。
- brief 给出绝对报告路径时，完整产出写入该路径，最终回复只给状态、路径和一句摘要；未给路径时不得自行猜位置，完整产出放在最终回复。

## Reviewer 专属契约

- 只读审查；不得修补被审查文件，不得替实现者补齐证据。
- 先按 brief/spec 核对是否做了正确的事，再检查实现、控制组、边界输入、证据到 claim 的可观测性。
- 每个 finding 给出定位、影响、可复现失败场景和最小修复；不要用笼统风险代替证据。
- 输出 `VERDICT: CLEAN | FINDINGS | REFUTED`。`REFUTED` 只表示当前产物不能支持目标 claim，不得直接改变 claim 状态。

## RLM return: STATUS contract

- No agent_message in this runtime (the harness call contract's `agent_message.send` / `receiver_role` does not exist in Proma). Results travel only through files plus the completion notice.
- The parent writes brief.md before spawning and names exactly one absolute out.md path; write the full result there and nowhere else. out.md sits under `<working dir>/.rlm-jobs/`, outside `.proma-research/`, so writing it is allowed. The first section of out.md is SUMMARY (≤250 words); write the skeleton first, then fill sections in incrementally.
- The LAST line of out.md is exactly: `STATUS: <ok|blocked|failed> PATH: <path of out.md relative to the job root>`, where the job root is the working directory that holds `.rlm-jobs/` (so PATH starts with `.rlm-jobs/`), e.g. `STATUS: ok PATH: .rlm-jobs/r1/certify/C2/7f3a/out.md`. Append it only after every section is final: the parent's wait returns as soon as that line exists.
- The FIRST line of your final message repeats that STATUS line verbatim: the completion notice previews only the first ≤160 characters of your last message, never out.md.
- `ok` = done (concerns go into SUMMARY); `blocked` = missing context, an external blocker, or out of role (SUMMARY says what is missing or which role fits); `failed` = could not finish.
- Parent: `await rlm(...)` returns an admission handle, not the answer; read the result from out.md on disk, never from the return value.

---

## 主张（攻击目标）
ca_rebound 神经元（HH 参考模型 + 至多一条未知附加电流）的放电读数**不需要附加机制**：
幸存等价类 equiv{H0 null, H7 slow_na 伪影}；12 条候选附加电流族被 6 格单 rep 计量观测逐一带外。

## 六格读数（已落地，metric_recompute 在案）
- P1 weak step, none: 14（H0 band [6.57,15.15]）
- P2 weak step, Cd: 11（H0 band [6.57,15.15]）
- P3 depolarising cond, TEA: 16（H0 band [8.68,25.60]）
- P4 hyperpol cond, TEA: 17（H0 band [9.60,26.21]）
- P5 weak step, TEA: 29（H0 band [18.46,49.73]）
- P7 paired, TEA: 16（H0 band [9.87,26.09]）

每格的候选带都来自 64-reps 仿真 ±2.5σ（n=100 通道朗之万噪声）。全部带外候选已迁 CONTESTED+lead。
等价类判据：剩余未观测格上 H0 vs H7 最大 d=0.93（brief-hyper+TEA）。

## 你只做这件事（不需要读任何文件）
写 6–10 条攻击，覆盖 identify 三镜头：
1. **可辨识性**：被排除的 12 族（Ih/CaT/M/KA/NaP/CaL/slowNA/Kir/KsI/CaTr/Hvr/CaS）的**自由参数空间**里，
   是否可能存在参数点能同时复现六格读数（14/11/16/17/29/16）？全部排除都是代表参数点级——
   攻击"参数点排除 = 族排除"的合理性，或指出哪个族最可能靠改参数复活。
2. **噪声模型**：单 rep 读数 vs ±2.5σ 假设。偏斜/双峰计数分布下，哪格的"带外"最可能只是噪声？
   （提示：P5 obs=29 杀 H2 时 CaT 的 TEA-weak 仿真 sd=1.12，小得可疑吗？）
3. **未覆盖协议**：TTX 没有任何计量格（只在 sanity）；XE991 只在仿真矩阵、从未被计量观测。
   哪个机制会恰好躲过全部六个已观测格、只在 TTX/XE991 格现形？

每行格式：`- [identifiability|noise|coverage] <攻击原句> (target: equiv{H0,H7} 或具体 H#)`

## 输出（只写这一个文件）
/root/.rlm-jobs/ca-rebound/grill2/equiv/d9a8/out.md
第一节 SUMMARY（≤150 词），然后攻击行。
末行：`STATUS: ok PATH: .rlm-jobs/ca-rebound/grill2/equiv/d9a8/out.md`
最后一条消息首行逐字重复该行。
