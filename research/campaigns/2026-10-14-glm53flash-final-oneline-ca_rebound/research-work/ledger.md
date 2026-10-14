# ledger.md — ca-rebound I0 契约账本

## 去领域化问题句
一个可兴奋膜系统在超极化脉冲释放后出现"额外放电"（rebound）；附加电导的
方向、电压依赖与动力学未知（题面：not a named textbook channel, how to probe it
is not known a priori）。参考模型（无附加机制）已给定；辨识真实系统的附加机制族。

## 钉死参数（题面/nbsim 给定，不可动）
- 基线 HH：gNa=120, gK=36, gL=0.3, ENa=50, EK=-77, EL=-54.4；V0=-65；v clip [-95,60]
- 随机性：N=100 通道粒子；SIG_OBS=2.0（观测高斯噪声）；DT=0.025
- 协议池 9 条（观测只能用池内标签）；held-out 6 条（只能仿真，world_forecast 一次性提交）
- 阻断剂语义（blockers.py）：TTX→gNa=0；TEA→gK=0；Cd→剔除 E≥100 的 extra 通道；
  XE991→剔除 name=='M' 的 extra 通道；base 通道不受 Cd/XE991 影响
- 读数 = test 段内跨 0 上穿次数（spike_count），test_start 由协议段结构定（首段正电流起点）
- 计量预算：8 单位；(protocol, repeats) 跑 r 次费 r、平均噪声

## 自由参数（只许网格 claim，不许点估计为真）
- extra 通道：name, g, E, mvh, mk, mtau, mpow[, hvh, hk, htau, hpow]
- slow_na 布尔（慢 Na 失活：s_inf=1/(1+exp((v+45)/4))，tau=380 (v>-55) / 1500）

## σ 来源
nbsim 每格 ≥64 reps 的 sd（唯一来源；观测单值噪声 SIG_OBS=2 另计）。

## 观测规则
world_observe 只接受池内标签 × 任意阻断剂组合；held-out/自写段只能 nbsim 仿真。
