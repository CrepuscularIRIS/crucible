status: confirmed · research_init 2026-10-14T19:46:20.968Z
mode: identify
predicate: ca_rebound 的放电/rebound 行为由一个具体机制假设主导解释：该假设在协议池判别探针下存活并获得 SUPPORTED（附 K3 audit），且至少一个与其可判别的竞争假设被 REFUTED 或 SCOPED；全程报告数字均来自 metric_recompute；最终 REPORT.md 通过 report_declare 全绿。
depth: full
forks: A=按默认执行（identify/full/recall=off/预算8）；B=快速验证已知候选机制（depth=light）；C=改为 score 模式（用户给指标）；D=其他调整。→ 用户已回复“确认，按 K0 草案执行”（分支 A），2026-10-14 19:45 UTC。
recall: off
run: ca_rebound

# 补充说明
任务：研究名为 ca_rebound 的神经元的放电机制（命名系统 → 机制识别，非 novelty，非 score）。
计划：research_init → world_simulate(info) 拿题面/协议池/sim_env → deep 子代理假设生成（claim_propose）→ nbsim 判别度预算（>=64 reps，d=|Δ|/σ，r*=[(2/d)^2]，min-r* cell，存 research-work/ca_rebound/sim/）→ prereg_write → probe_run → metric_recompute → claim_transition → research-grill/attack_record → REPORT.md → report_declare。
