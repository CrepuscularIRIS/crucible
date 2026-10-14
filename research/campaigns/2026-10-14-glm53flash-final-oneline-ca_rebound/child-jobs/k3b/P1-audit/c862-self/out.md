# K3 审计（self-reviewed，父会话代做）

W2 失败两次：k3 child 超时（21:41 spawn，22:03 timeout 删除）；k3b 重派写入两次被宿主守卫拦截。
按 k3-audit 卡由父会话代做，结论封顶 lead。

## 审计项
1. **数字溯源** ✓：P1=16.0（metric_recompute）；13 条 sim 记录（prereg sims 引用）均含 counts_mean/counts_sd
   与 prereg band 端点一致（spot-check nap-p5 19.11±1.71、ref-p5 15.42±1.74、kahp-p5 7.83±1.58 重算相符）。
2. **r\* 复核**：H2 cat d=1.78→r*=2≤4 ✓；H7 kahp d=2.92→r*=1≤4 ✓；H4 mcur d=0.92→r*=5>4 ✗
   （但区间判定 |16.0−13.00|=3.00 > 2·SE(4)=2.62，检出限写法："r=4、该精度下不相容"，封顶 lead）。
3. **参数覆盖（I4.6）**：grid-*.json（每族 ≥3 个 g 点，64-rep）：
   H3 nap：g0.1/0.15/0.2 → 16.70/17.27/17.61 全落观测 2SE 窗口 → 家族级不成立，只杀注册点 g=0.35；
   H8 ka100：g0.35/0.5 在窗内 → 只杀注册点 g=1.2；H10 catna：g0.25 在窗内 → 只杀注册点 g=0.8；
   H5 combo：3 个替代配比全带外，但 g→0 极限连续趋于参考（纯 IH=17.78 在窗内）→ 只杀注册配比。
   → 四条全部降级为**注册参数点 kill**；家族弱 g 角与观测相容，按规则并入贴参考等价类（RULINGS 另行记）。
4. **门方向** ✓：被杀 7 族的 m∞/h∞ 稳态方向与 statement 一致（W1 实例化检查表 + 本次仿真用同一 JSON）。
5. **对手完整性** ✓：P1 无 support 分支（纯切分）；kill 判定不依赖任何与存活对手带重叠的假设。

AUDIT: pass-as-parameter-point — H3/H5/H8/H10 降级为注册参数点 kill（家族弱角并入等价类）；H2/H7 清洁 kill；H4 检出限 lead
STATUS: ok SELF_REVIEWED PATH: .rlm-jobs/ca-rebound/k3b/P1-audit/c862-self/out.md
