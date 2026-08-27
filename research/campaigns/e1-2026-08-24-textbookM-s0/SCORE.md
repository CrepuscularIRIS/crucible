# E1 首轮 · textbook_M seed 0 · 三模型对照(2026-08-24)

同栈(Proma+Prime+research skills/MCP)、同 world、同 seed、预算 8。
唯一变量:模型。口径备注见「已知口径问题」。

| 臂 | 模型 | spike_forecast_mse | 预算 | 终局链 | RLM 子代理 | 攻击记录 | 人工干预 |
|---|---|---:|---:|---|---:|---:|---|
| plus | qwen3.7-plus | 9.585 | 6/8 | ⚠ 无 report/gate | 5 | 7 | 无 |
| max | qwen3.7-max | 12.186 | 8/8 | ✅ gate PASSED | 0 | 3 | 无 |
| t8max | qwen3.8-max | **0.725** | 9/8 ⚠ | ✅ gate PASSED | **21** | **16** | 1 次收尾指令 |

参考线:乱猜 ≈ 117(本机实测);MSE 下限(floor)= 0.25。

## 活性(三臂共同)
路由 PASS · anchor PASS · kernel 0 重启 · F1 干净(无预登记前评测)。
plus/max 的 `meter_execution` FAIL 复核为读取 meter 源码(非执行),t8max PASS。

## 已知口径问题(照实记录,不得掩饰)
1. **t8max 超预算 1 单位**(9/8,observe reps 记账边界),需查 `server.ts:447` 的 reps 判定。
2. **t8max 含一次人工收尾指令**(19:05 注入,19:10 forecast);其 forecast 数值本身由 agent 自主生成。
3. **系统 Python 缺 numpy**:三臂 agent 均自行修复(plus/t8max 早、max 晚),已根修进 Dockerfile;此轮三臂环境不完全一致。
4. plus 臂 report_declare MCP 调用过但 journal 无事件,终局不完整。

## 行为分叉(ARFT 素材)
- plus:预登记纪律派(4 预登记/2 探针/7 攻击),最快完赛(23min)。
- max:轻探索(0 子代理),完整终局链但 MSE 最差。
- t8max:重探索派(101 免费模拟/21 子代理/16 攻击),MSE 逼近下限,但耗时 75min、token 最多,需人工止损。

bundle:本目录 {plus,max,t8max}/(journal+prereg+probes+ledger+session.jsonl+session-artifacts)。
