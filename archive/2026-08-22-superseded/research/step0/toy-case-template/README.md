# Step 0 玩具 case

两个植入假设：
- H-A：D 的均值明显大于 0.5（真：≈0.65）
- H-B：D 的均值在 0.5 附近（假）

eval：`python eval.py --seeds 200` 写 `metrics.json`。
recompute 规约：`{"kind": "json", "path": "metrics.json", "key": "mean"}`。

验收（计划 §4 Step 0）：
1. 模型无提示调用 Python skill ≥1 次（journal 出现 abduce/prereg 等操作即证据）；
2. 活过 host continuations 第 30 轮（session JSONL 统计 assistant 轮数）；
3. gate 环 red→green 闭环（container.log 里 gate 失败注入 → 最终 host gates 全过）；
4. kernel 状态扛过一次强制 compaction（session JSONL 出现 compaction 事件且 register.json 完好）。
