---
name: figure
description: 多模态证据入口。figure.read(path) 把结果图（png/jpg）交给 DashScope 的 Qwen-VL，返回结构化证据条目 {observation, axes, values_read, caveats, simulated}；该条目必须经 R.attach(claim, entry, kind="figure") 挂到某个 claim 上才有效。发表用的图仍由代码从证据包渲染——模型读图是证据采集，不是数字来源。
---

# Figure —— Qwen-VL 读图

```python
import figure
entry = await figure.read("figures/ablation.png", question="误差棒下两组是否分离？")
R.attach("H1", entry, kind="figure")   # 不挂接 = 不存在
```

纪律：

- 读到什么写什么：`values_read` 只能放图上确实可读的数值；读不到的字段写 null，不要编。
- `simulated: true` 当且仅当图内证据表明数据是合成/模拟的——这会随条目入册。
- 关键数字永远来自 `R.land()` 的重算链路；figure 的读数是辅助证据，两者冲突时以重算为准并在 caveats 说明。
- 环境变量：`DASHSCOPE_API_KEY`（必需）· `DASHSCOPE_BASE_URL`（默认 compatible-mode/v1）· `CRUCIBLE_VL_MODEL`（默认 qwen-vl-max）。
