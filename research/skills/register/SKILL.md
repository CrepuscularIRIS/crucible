---
name: register
description: 研究战役的信念状态寄存器。任何 claim/probe 状态变化都必须经过它；提供四道验证器（distinctness/lethality/precedence/provenance-recompute）、append-only journal、锚点 repr(R) 与 stale() 欠账检查。会话启动与每次 compaction 后先 print(R)。
---

# Register —— 信念状态

`R` 在 kernel 里已预绑定（环境变量 `CRUCIBLE_RUN_DIR` 指向本 run 的 artifacts 目录），
也可以手动 `from register import Register; R = Register(run_dir)`。

## API

```python
print(R)                       # ~1.5k token 锚点：claim 表 + graveyard + 欠账（ORIENT 必打）
R.constraints()                # graveyard + 已记录约束；abduce 之前必读
R.abduce(claim, kind, predicts, conflicts,
         mechanism="", hypothesis="", observable="")   # Arbor 四行；通过验证器 → LIVE
R.demote(h, why) / R.scope(h, to, why) / R.promote(h)  # 文本许可，可逆
R.prereg(claim, tests, predictions, rule, controls, severity,
         eval_cmd, recompute, timeout_s=600)           # → pid；launch 前写 prereg/P*.json
R.land(pid)                    # 从原始文件重算指标，机械应用 rule；从不接受口头数字
R.attach(claim, entry, kind="figure")                   # figure 等证据必须经此挂接
R.claim_view(h)                # 仅 claim+证据（grill 的 prompt 唯一来源）
R.stale()                      # 欠账清单（heartbeat 目标）
R.settle_owed(source, why)     # 还账：补了解释/新假设后销掉 TRIAGE 欠条
```

## 四验证器（拒绝即抛 `RefusalError`，理由落 journal）

1. **distinctness** —— 新假设须与每个 live H 在 ≥1 个预测可观察量上不同；
   graveyard 非空时 `conflicts` 必须引用其中至少一个 id。
2. **lethality** —— prereg 须有 ≥1 对不重叠预测频段，且 ≥1 分支 kill/scope 某个 claim
   （"装饰性实验"拒绝）。
3. **precedence** —— `land()` 拒绝 prereg 文件哈希与登记不符、或时间戳晚于结果产物的情形。
4. **provenance/recompute** —— `land()` 只接受 `probe.run` 产物目录；
   指标一律从原始文件按 prereg 的 recompute 规约重算；若产物里声称的数字与重算值不一致，直接拒绝。

## 诚实边界

kernel 内验证器是栅栏不是墙：模型理论上可以改 `/work` 下任何文件。真正的裁决在
宿主端三道 gate（重放 journal、重算指标）。此设计刻意为之——中期可绕过，出口必被查。
