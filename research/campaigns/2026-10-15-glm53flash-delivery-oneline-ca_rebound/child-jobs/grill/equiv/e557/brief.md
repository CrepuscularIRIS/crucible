# W3 对抗攻击 — equiv{H0, H7}（identify 三镜头版）

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

## 你的位置
战役 ca-rebound 的终局等价类 equiv{H0, H7}（null / slow_na 伪影）即将进报告。
你的工作不是复述风险，是**找到它错在哪**。你看到主张与证据（claim_view），看不到父会话的辩护推理。

## 输入（只读）
- claim_view（H0）：== 待攻击主张 · H0 ==
statement: 内置 H0（null）：真实系统与参考模型（无附加机制）无可分辨差异，观测偏离都在噪声内
state: LIVE
predicts: 观测落在参考模型的仿真分布内（无附加机制）
evidence probes:
  P1 [LANDED] q=一次观测同时判别 13 个机制候选（11 附加电流族 + slow_na 伪影 + H0）在 weak step 无阻断剂格的尖峰计数；mattering：决定附加电流属抑制性窗电流簇（KA/Kir/KsI/M/slowNA）还是高计数 Ca/NaP 簇（CaL/CaT/CaTr/NaP/CaS/Ih/Hvr） band[H0]=[6.57, 15.15] observed=14
  P2 [LANDED] q=weak step (5uA,120ms) + Cd 格（reps=1）一次观测判别全部 13 条 claim：Cd 删除全部 E≥100 附加通道 → Ca 族（CaT/CaL/CaTr/CaS）预测精确塌回 null 值 10.86±1.72@64reps，NaP/Ih/Hvr（E<100）与 slowNA/K 系（基线/非钙）保持无药读数。mattering：obs 高位（>16）杀 null+塌回簇+slowNA+Hvr，收窄到 NaP/Ih；obs 低位（<10）杀 NaP/Ih/Hvr，收窄到 null+塌回簇。severity：若所有候选为假，obs 落在全部补区间之外的概率仅由未建模机制产生——每条 claim 的 predicts 都已声明其 Cd 响应（塌回或不敏感），方向自洽。 band[H0]=[6.57, 15.15] observed=11
  P3 [LANDED] q=TEA×去极化条件化（+15uA/250ms→+12uA 测试, reps=1）：TEA 拔除基线钾后，E≥100 附加通道的载体事件应归零（放大型钙候选的 TEA 读数与其无药读数脱钩，H2 本格 reads 归零带 vs 中带；H10/H12 与 H2 同格同判（E≥100 载体 TEA 归零），其 predicts 缺条件化限定故不入本格 bands），而 M 型钾外向拖拽被 TEA 放大至 ~74。一次观测同时：高位 [46.2,61.2) support H3（与全部对手带不相交）；[1.26,25.59] reads 排除 E≥100 簇 H2（并同判 H10/H12）；各 claim 补区间无死角。H1/H6 不在本格判别（移交下一探针）。mattering：K 系（H4/H9）与中带簇（H0/H7/H8/H11）分离 + E≥100 簇候选的整体排除。severity：若 H3 为假，obs 落 [46.2,61.2) 需未建模机制；若真实系统属 E≥100 簇，obs 必落归零带而非中带——两向都有信息。 band[H0]=[8.68, 25.6] observed=16
  P4 [LANDED] q=TEA×hyperpol 条件化（-30uA/250ms→+12uA 测试, reps=1）：判别中高带分离（H1 Ih 43.4±7.1 / H11 Hvr 44.4±7.3 高带 vs H0 17.9 / H2 13.0 / H7 15.2 中带）。E≥100 归零簇（H6/H10/H12，TEA 格预测 0±0.5）不在本格 bands（其 predicts 无条件化限定，方向校验会拦截）；若 obs 落 [1.26,8.78] 或其他未判别区，E≥100 簇的排除留下一探针点名。本格不单独判别 H1 vs H11（d≈0.13，带重叠——若两者同时存活且其余全死，走等价类出口）。mattering：Ih 型方向 vs null/伪影/低阈钙的分离。severity：若 H1/H11 都为假，obs 落高带需未建模机制；中带格与高带格互斥。 band[H0]=[9.6, 26.21] observed=17
  P5 [LANDED] q=weak step + TEA（reps=1）：钙型快激活候选 H2（TEA 格预测 0.34±1.12）与 H0（34.1±6.3）/slow_na 伪影（35.4±5.3）的判决格；H6/H10/H12 不在本格 bands（方向校验限制），其判别走后续探针。obs 落中带 → H2 排除、null 与伪影二选一；obs 落归零带 → H0/H7 排除、载体为钙型。d≈10、r*=1，单观测判决。mattering：Cd 弱证据（P2: 11 vs 14）的正式检验——钙型候选唯一预测 TEA 下归零。severity：若钙型为假，obs 落归零带需未建模机制；两向互斥。 band[H0]=[18.46, 49.73] observed=29
  P7 [LANDED] q=paired long pulses + TEA（reps=1）：H0（18.0±3.2，band [9.9,26.1]）对 E≥100 归零簇（H6/H10/H12：μ≤0.34，带 [−2.8,3.5]）的判决；H2/H7 不在本格 bands（方向校验限制：升 predicts 归零带 vs 降 predicts 中带不可同格），它们的取舍由本格读数组合推断：obs∈[26.1,50.6] → H0 死+E≥100 簇死（此前 H2 已被 P5 杀）→ 唯一活者 H7（伪影判决）；obs∈[3.54,9.86] → H6/H10/H12 死、H0 活；obs∈归零带 → H0 死、载体为慢钙。mattering：E≥100 簇正式点名排除 + null vs 伪影方向判决。severity：若 H0 与 E≥100 簇都为假，obs 落全部补区间外需未建模机制。 band[H0]=[9.87, 26.09] observed=16
- 落地探针与读数：/root/research-work/ca-rebound/ledger.md
- 机制族与 sanity：/root/research-work/ca-rebound/recall/families.md、/root/research-work/ca-rebound/rivals.md
- 仿真矩阵：/root/research-work/ca-rebound/sim/matrix.csv（783 格）
- P1-P7 预登记：/root/research-work/ca-rebound/_P3.json（weak step 设计旧版）以外的 _P2cd/_P3tea/_P4/_P5b/_P5c/_P6/_P7.json

## identify 三镜头（替换四镜头）
1. **可辨识性**：equiv{H0,H7} 与被排除的 12 族之间，是否存在一组参数（在被排除族的自由参数空间内）
   能同时复现全部六格读数（14/11/16/17/29/16）？若有，"排除"是参数点级的、等价类宣称过强。
2. **噪声模型**：六格读数都是单 rep。读数分布与 64-reps 仿真的均值±2.5σ 假设同族吗？
   双峰/偏斜（如 H10 sanity 的 sd=7.88）会不会让某次"带外"其实是运气？
3. **未覆盖协议**：哪个协议段或阻断剂组合没进矩阵？特别地：TTX/none 组合只在 sanity 里出现过，
   XE991 只在矩阵里、从未被计量观测——若真实机制是 M 型/XE991 敏感的，哪格会暴露它被漏判？

## 落点（字面绝对路径，spawn 前已定）
把攻击行写进 /root/.rlm-jobs/ca-rebound/grill/equiv/e557/attacks.md
每行一条攻击，格式：`- [identifiability|noise|coverage] <攻击原句> (target: equiv{H0,H7} 或具体 H#)`

## 输出
/root/.rlm-jobs/ca-rebound/grill/equiv/e557/out.md：SUMMARY（≤150 词）+ 攻击列表（与 attacks.md 一致）+ 每条的镜头标签。
末行：`STATUS: ok PATH: .rlm-jobs/ca-rebound/grill/equiv/e557/out.md`
最后一条消息首行逐字重复该行。
