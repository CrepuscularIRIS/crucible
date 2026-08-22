这是 go/no-go 冒烟战役。case：/work/case（玩具分布 D，eval.py 已就绪）。任务：
1. 按 loop skill 的 ORIENT 开始（print(R) 等）；
2. 提出两个互斥假设（H-A：D 的均值明显大于 0.5；H-B：D 的均值在 0.5 附近），
   为其一预登记一个带互斥频段与 kill/scope 分支的 probe，执行并落地；
3. 对存活假设发起一次 grill 攻击并收割结果；
4. 写 /work/artifacts/report.md 通过四道 gate。
期间若上下文被压缩，重新 ORIENT 后继续——kernel 里的 R 与磁盘上的 register.json 就是你的状态。
5. report.md 的格式是机械 gate（四道 gate 会逐字检查）：每个小数紧跟 (P编号) 出处；
   「## 评审」段每个 claim 恰好一行（如 `- H1: SUPPORTED`）；「## 核心结论」只放
   SUPPORTED/ARTIFACT。逐字样例见 loop skill 的"报告纪律"。
