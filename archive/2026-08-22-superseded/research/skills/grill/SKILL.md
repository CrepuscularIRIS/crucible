---
name: grill
description: 研究战役的对抗审讯。每轮对最重要的 live claim 发起一次 rlm() 攻击（prompt 只由 claim_view 构成，攻击者看不到提出者的推理）；结果必须是 typed entry（new_h / constraint / no_change），经 register 验证器落地，散文一律被拒。
---

# Grill —— 一轮一次攻击

```python
import grill, register
await grill.attack("H1")            # 发起（默认模型 dashscope/qwen3.7-plus，可 env 覆盖）
grill.poll()                        # 检查子代理回传的 grill/G*.json 并落地（每轮 ORIENT 时也 poll 一次）
```

协议：攻击 prompt = claim_view（claim + 证据，**永远不含**提出者的推理/辩护理由）+ 四镜头之一
（occupancy / mechanism / measurement / framing，按攻击序号轮转）+ typed 输出要求。子代理把结果
写到 `<RUN>/grill/<gid>.json`；`poll()` 校验后走 `R.record_attack()`——new_h 仍须过 distinctness
等验证器，被拒即记为 rejected_by_validator（这本身是有价值的攻击结果）。

诚实边界（写进报告）：子代理是 **prompt-blinded 而非结构隔离**——rlm 子进程与父共享 cwd，理论上
可读盘。我们不为它声称更强的隔离。
