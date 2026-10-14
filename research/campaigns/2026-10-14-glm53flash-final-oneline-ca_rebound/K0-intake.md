status: confirmed · research_init 2026-10-14T21:16:44.371Z
mode: identify
run: ca-rebound
success_predicate: LIVE 收缩到 1 个或一个写明的等价类（RULING `equiv{H#…}`），且 world_forecast 已提交（默认 identify 谓词）
depth: light            # light ≈ 10 个 child · 1.5–3 h；full ≈ 20+ child · 3–5 h
recall: off             # 命名系统的机制辨识，benchmark 默认 off
world: ca_rebound（拟，按题面命名；init 后以 world_simulate(mode=info) 实际题面为准） · seed: 0（拟）
forks: auto
prior_reports: not read (independent run)；当前 .proma-research/ 下无任何已声明报告
ood: none — 题面给了具体系统（ca_rebound 神经元）与明确问题（哪个放电机制为真）
副作用信封:
  workdir: research-work/ca-rebound/   # REPORT.md、lessons.md、ledger.md、sim/、nbsim/、机制 JSON
  jobs: .rlm-jobs/ca-rebound/
  children: ≈ 10（light：召回 1 + rival 1 + 复评/攻击/审计/报告）
  web: off
  tokens/墙钟: ≈ light 档，1.5–3 h
budget: 世界计量预算默认总 8（world_observe 计费）；探针/计量预留 ≈10% 给 K3 审计、forecast 与报告；确证阶段预留 ≥2 reps
seed_questions:（identify 不适用，略）
