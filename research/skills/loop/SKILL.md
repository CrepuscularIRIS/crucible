---
name: loop
description: 研究战役循环路由。会话启动、每次 compaction 之后、以及每次不知道下一步做什么时读它：ORIENT 仪式、六类 move 菜单（全部是 register 的 typed 调用）、按 live claim kind 派生的阶段判据。测量才能杀死假设；推理只能降级。
---

# Loop —— 路由

常驻立场（不可协商）：**DECOMPOSE → SIMPLIFY → RECONSTRUCT**；测量之外没有杀死假设的权力；
现象在四个对照之前只是 artifact；≥2 个 live 假设；永不空转（有 probe 在飞就利用等待时间攻击/筛选下一个）。

## ORIENT（会话开始 · 每次 compaction 之后 · 每 30 分钟 heartbeat）

```python
print(R)                      # 锚点：信念状态一览
R.constraints()               # graveyard + 约束
grill.poll()                  # 收割已回传的攻击
await register.ensure_heartbeat()   # 只在第一次 ORIENT 时需要
```

然后对 thesis 句子做一次 Decompose-Simplify-Reconstruct：它在预测什么？最便宜的判别实验是什么？
它隐含了哪个未检验的机制？

**每轮收尾**（ARCH-RESEARCH 教训——义务由 harness 声明，你只填参数）：写出你下一轮将执行的
`R.*` / `probe.run` / `grill.attack` 调用签名，空着参数也写。

## Move 菜单（全部 typed，没有"想一下"这个动作）

| Move | 调用 | 门槛 |
|---|---|---|
| ABDUCE | `R.abduce(claim, kind, predicts, conflicts, mechanism=…, hypothesis=…, observable=…)` | 先 `R.constraints()`；predicts 必须含 live 集没有的可观察量 |
| PREREG | `R.prereg(claim, tests, predictions, rule, controls, severity, eval_cmd, recompute, outputs)` | ≥1 对互斥频段 + ≥1 kill/scope 分支，否则是装饰性实验 |
| EXECUTE | `await probe.run(pid)` | 唯一执行路径；产物自动带 provenance |
| UPDATE | `R.land(pid)` | 机械重算 + 首中频段规则；TRIAGE 欠一次 abduce |
| CHALLENGE | `await grill.attack(h)` → 下轮 ORIENT `grill.poll()` | 一轮一次；prompt 盲化 |
| DEMOTE/SCOPE | `R.demote(h, why)` / `R.scope(h, to, why)` / `R.promote(h, why)` | 文本许可、可逆、要 why |
| READ-FIGURE | `entry = await figure.read(path)` → `R.attach(h, entry)` | 读到什么写什么；数字仍以 land() 重算为准 |
| REPORT | 写 `report.md`（见下） | 过三道 gate 是唯一完成方式 |

## 阶段派生（从 live claim kinds 推出，从不存储）

- 只有 phenomenon 类 live → 读 `references/1-candidate.md` + `2-measure.md`
- mechanism 类 live → `3-mechanism.md`（干预/匹配秩/影子测试；预注册 JSON 判决规则 4–6 分支）
- method 类 live → `4-method.md`（原则句先行；matched-rank / matched-effective-LR / shuffled）
- 无 live claim 或全部 TERMINAL → `5-verify.md` + 写报告

references 按需读（`LOAD WHEN:` 纪律保留）：
`0-orient.md`（每次 ORIENT）· `execution-framework.md`（任何昂贵实验前）·
`missing-point-method.md`（根因 vs 影子）· `research-judgment.md`（意外结果分诊）·
`debate-protocol.md` / `iterative-questioning.md`（构造 grill prompt 时）·
`claim-ledger.md`（novelty 机器）· `six-question-screen.md`（候选筛选）·
`phenomenon-catalogue.md`（找 case 时）· 其余按文件名。

## 报告纪律（review/reconcile gate 的机械要求——格式即门，逐字遵守）

- 每个小数必须同行带 `(P#)` 出处，数值 = gate 从原始文件重算的结果。
  逐字样例：`实验测得均值 0.6465 (P2)，落在频段 [0.60, 0.70]。`
  （小数后面**紧跟** `(P2)`；频段数字以外的每个小数都要这样标注）
  频段 `[lo, hi]` 里**不要**加 `(P#)`——频段是预登记内容，不是结果数字；
  给它标出处会被当成"声称实验测得 0.60"，然后与重算值对不上而判为幻觉数字。
- 引用的数字必须是重算值的**正确舍入**，且不要靠降精度含混过关
  （真值 0.6465 时写 `0.6465 (P2)` 或 `0.65 (P2)` 可以，写 `约 1 (P2)` 会被拒）。
- `## 评审` 段：register 中每个 claim 恰好一行，逐字样例：
  `- H1: SUPPORTED`
  `- H2: REFUTED`
  （状态词只能是 LIVE/DEMOTED/SCOPED/CONTESTED/REFUTED/ARTIFACT/SUPPORTED，与 register 完全一致）
- `## 核心结论` 段：只允许状态为 SUPPORTED / ARTIFACT 的 claim 出现；其余一律不得进入。
- 诚实边界写进报告：grill 子代理是 prompt-blinded 而非结构隔离；auto-refine 只存过程性经验。

## 失败处理

- eval 非零退出：如实留 provenance，probe.run 可重跑；不要手工造 results/。
- land() 被拒：拒绝理由即下一步；不要绕过，修 prereg/产物后重试。
- 卡住：`R.stale()` 列欠账，还账优先于一切新动作。
