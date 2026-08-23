---
name: research-kit
description: 研究层 kernel 只读工具箱：anchor（跨压缩信念锚）、claim_view（对抗者不对称上下文）、disjoint_pairs（探针判别表）、calibration（预测 vs 观测账本）。只读 register.json，绝不写状态——写状态一律走 research MCP 工具。
version: 0.1.0
---

# research-kit —— kernel 侧只读工具箱

Python skill，kernel 里按 `research_kit` 直接用（同步函数，无需 await），
被所有 `rlm()` 子代理继承。

## API

```python
research_kit.anchor(run)             # ~1k token 信念锚；同时存 research_kit.LAST
research_kit.LAST                    # 上次 anchor 结果（kernel 变量，跨压缩存活）
research_kit.claim_view(run, "H1")   # 对抗者上下文：claim+证据+graveyard，无 notes
research_kit.disjoint_pairs({"H1": (0.8, 1.0), "H2": (0.0, 0.6)})  # → [("H1","H2")]
research_kit.calibration(run)        # 每个落地探针：预登记频段 vs 观测（带内/外）
```

`run` 接受 run 名（解析到 `<cwd>/.proma-research/<run>`）或直接给 run 目录路径。

## 规则

- **只读**。写信念状态（propose/transition/prereg/attack/declare）一律走
  research MCP 工具——journal 留痕、UI 可见、可拒绝。本模块写不了，也不要
  试图绕过（手改 `.proma-research/` 会被 P3.3 防篡改与 trace gate 抓住）。
- 读的是派生缓存 `register.json`；与 `research_state` 有分歧时以后者为准。
- 压缩发生后：先 `print(research_kit.LAST)` 找回锚，再决定是否重新 `anchor()`。

## 何时不用

- 需要最新权威状态做迁移决策时 → 用 MCP `research_state`。
- 单条已知信息（如某探针的 metric）→ 直接问 `research_state`，别为一行数据拉锚。
