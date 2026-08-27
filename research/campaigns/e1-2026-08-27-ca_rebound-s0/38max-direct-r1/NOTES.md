# 38max-direct-r1 运行注记(2026-08-27)

- 栈:Proma+Prime Agent 0.17.77(656fec3)· qwen3.8-max · 百炼 DashScope 直连 · seed 0 · 预算 8
- 通路时间线:14:09Z 开跑(百炼主站)→ **15:31-45 百炼欠费中断(Arrearage)** → 15:45 自愈
  → 15:57-16:01 误切 token-plan 端点(约 4 分钟,发现即回切百炼)→ 16:01 后百炼主站至终
- 人工干预:中性唤醒「继续」若干次(欠费恢复后/重启后);dtype 另含 1 次内容提示
  (rlm 子代理因容器重启悬死,stop+提示恢复)
- 判分:外部 meter(journal 计账),gate 三道全绿;MSE 见 E1-SUMMARY
