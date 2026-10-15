status: confirmed · research_init 2026-10-15T12:27:06.539Z
run: ML04-scaling-knn
mode: score
success_predicate: H1/H2/H3 各自获得一次预注册探针落地后的裁决（supported/refuted/partially_supported/inconclusive，裁决只依据 probe_run 落地的 metrics），且 task-card deliverables 四项（submission/code/、results/metrics.json、README.md 含 '## Agent-produced writeup'、claims.json）全部交付
depth: light            # light ≈ 5–7 个 child · 墙钟 1–2h；full ≈ 10–12 个 child · 墙钟 3–5h
recall: off             # 文献召回关闭：数据集、条件、指标、假设均由 task-card.yaml 钉死
world: — (本地 sklearn 数据，无 world_* 计量) · seed: 42   # 统一随机种子，派生 ≥5 个 stratified split
forks: auto
prior_reports: not read (independent run)
ood: none
副作用信封:
  workdir: research-work/ML04-scaling-knn/   # ledger、sim/预检记录、lessons、REPORT.md
  jobs: .rlm-jobs/ML04-scaling-knn/
  deliverables: /root/arc-ML04/submission/   # 按 task-card.yaml deliverables 写入
  children: ≈ 5–7（light：coder 实现 + analyst 攻击复评 + 报告审计各 1–2 席）
  web: off
  tokens/墙钟: ≈ light 档
budget: 世界计量预算 0（评测走本地预注册 probe_run，PROMA_EVAL_BUDGET=8 不动）；预注册探针 ≈ 3–4 个（H1/H2/H3 各自的判别脚本，可合并执行）；保留额 ≈10%
seed_questions: 无（任务卡已钉死数据集、条件、指标与三条假设；有补充约束请在此轮提出）
