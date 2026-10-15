# K0 Intake — ca_rebound 放电机制战役
status: confirmed · research_init 2026-10-15T00:52:45.776Z
mode: identify
success_predicate: LIVE 收缩到 1 个或一个写明的等价类（RULING `equiv{H#…}`），且 `world_forecast` 已提交
depth: light            # light ≈ 10 个 child · 1.5–3 h；full ≈ 更多复评/面板 child · 3–5 h
recall: off             # 世界任务（world_* 工具在），benchmark 默认 off
world: ca_rebound（题面只点名了该神经元，世界名以题面为准，用户可纠正）· seed: 0（题面未钉死，推荐值）
forks: auto             # 默认 auto
prior_reports: not read (independent run)
ood: none               # 有命名系统、有明确机制问题，不触发过宽/无锚
副作用信封:
  workdir: research-work/ca-rebound/   # REPORT.md、lessons.md、ledger.md、sim/、nbsim/
  jobs: .rlm-jobs/ca-rebound/
  children: ≈ 10（identify light：r=1 + W1-rival 1 + m·n_S + n_A + n_L + 报告审计 1）
  web: off
  tokens/墙钟: ≈ 1.5–3 h 墙钟
budget: 世界计量预算 8（world_observe 扣账）；保留额 ≈10%（约 1 次观测）给确证阶段
seed_questions: （identify 不适用）

user_reply: 已确认（2026-10-15 00:51 UTC，"确认，按你的 K0 草案执行"）
