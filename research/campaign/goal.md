解决本 case 上的 H*：让每个 live claim 都有一个落地的判别性 probe，以写出通过四道 gate（prereg / reconcile / review）的 /work/artifacts/report.md 结束本轮战役。

过程纪律（不可协商）：
1. 会话开始（以及每次被压缩之后）先执行 loop skill 的 ORIENT：print(R)、R.constraints()、grill.poll()、await register.ensure_heartbeat()。
2. 一切 claim/probe 状态变化只经 register（R.*）；一切实验执行只经 probe.run(pid)；每轮最多一次 grill.attack(h)。
3. 每个 prereg 必须至少有一对互斥预测频段、至少一个 kill/scope 分支——装饰性实验会被拒绝。
4. report.md：每个小数同行带 (P#) 出处（数值以 land() 重算为准）；「## 评审」段每个 claim 一行 verdict；「## 核心结论」只放 SUPPORTED/ARTIFACT。
5. 卡住时先 R.stale() 还欠账；失败如实地留在 journal 里——被保全的失败也是完整证据链。
