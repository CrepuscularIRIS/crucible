# W1 召回机制族（I1）— ca-rebound（identify, light）

你是 Research Analyst（契约见 /root/.proma-dev/sdk-config/research-roles/proma-research-analyst.md）。MODE: EXPLORE。本 brief 是逐字要求。

## 任务位置
identify 战役 I1 阶段：真实系统 = 一个带未知附加膜电流的神经元（随机 HH 参考模型已给定）。
现象：超极化脉冲释放后出现 rebound 放电。要召回的是**去领域化后仍成立的机制族**，
每族给出一个能直接喂给 `nbsim.simulate` 的 mechanism JSON。你只做召回与建模，不做观测、
不调用任何 research MCP 写工具、不改研究状态根目录（run 状态由父会话维护）。

## 输入（绝对路径，全部只读）
- /root/research-work/ca-rebound/ledger.md —— I0 账本：钉死参数、自由参数、σ 来源、协议池与阻断剂语义
- /root/research-work/ca-rebound/nbsim/__init__.py、kernel.py、stochastic.py、blockers.py —— 仿真包接口（只 import，不改）
  - `nbsim.simulate(mech, seg, reps=64, seed=0, block=())` → dict(counts/mean/sd/...)
  - mech = {"extra": [{name,g,E,mvh,mk,mtau,mpow[,hvh,hk,htau,hpow]}...], "slow_na": bool}
  - m∞(V)=1/(1+exp(-(V-mvh)/mk))（mk>0 去极化激活 / mk<0 超极化激活）；
    h∞(V)=1/(1+exp((V-mvh)/hk))——**h 门注意方向：hk>0 才是"去极化失活、超极化去失活"**
  - 阻断剂：TTX→base Na 清零；TEA→base K 清零；Cd→剔除 E≥100 的 extra；XE991→剔除 name=='M' 的 extra
- 池内协议标签（world_observe 只接受这些）：
  1 "brief step (12 uA, 40 ms)" 2 "long step (10 uA, 300 ms)" 3 "strong step (18 uA, 120 ms)"
  4 "weak step (5 uA, 120 ms)" 5 "hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA)"
  6 "hyperpol pre-pulse + weak test (-30 uA/250 ms, gap, +6 uA)"
  7 "paired long pulses (12 uA/300 ms, 60 ms gap, 12 uA/300 ms)"
  8 "depolarising conditioning + test (+15 uA/250 ms, then +12 uA)"
  9 "brief hyperpol conditioning + test (-30 uA/40 ms, then +12 uA)"
- held-out（只能仿真，将来 forecast 用；不计入本任务）：
  "hyperpol -25 then release" [[200,-25],[150,0]]；"-35"[[250,-35],[150,0]]；"-30"[[220,-30],[150,0]]；
  "-40"[[250,-40],[150,0]]；"brief step (12 uA, 40 ms)"；"long step (10 uA, 300 ms)"

## 三镜头（light：在本窗口内顺序完成，不要另开子代理）
1. **教科书族**：给定"超极化释放后放电"，神经物理与通用可兴奋系统文献里标准的第一性候选
   （每族给参数化 JSON，参数代表该族的合理量级，不用精确拟合）。
2. **异名/配套族 + 伪影**：同一机制的别名实现（例如同一反转电位不同动力学）；以及
   "无聊对手"——不是机制、但能在该读数下制造同类偏离的伪影候选（参考模型的已知结构缺陷
   / 读数定义的边界效应 / 观测噪声交互等），能用 mech JSON 表达的就用 JSON 表达。
3. **未被质疑的建模前提**：读 kernel.py/stochastic.py 的结构，找哪个前提若不成立会伪装成
   "附加电流"（例如 slow_na 开关、门动力学形状、噪声实现）。可仿真表达的表达成 JSON/开关。

## 每族的实例化检查（必做，防符号写反）
import sys; sys.path.insert(0, "/root/research-work/ca-rebound")
import nbsim, math
def m_inf(V, vh, k): return 1/(1+math.exp(-(V-vh)/k))
def h_inf(V, vh, k): return 1/(1+math.exp((V-vh)/k))
# 打印每个候选门在 V=-95/-65/-40 的稳态值；方向必须与族的 statement 一致再进仿真
# 例：IH（超极化激活、去极化失活）：m_inf(-95)<m_inf(-40) 为 mk<0；h_inf(-40)<h_inf(-95) 需 hk>0

## 仿真 sanity（每族至少一次）
用 nbsim.simulate 跑该族×协议5（hyperpol conditioning + depol test），reps=64, seed=0，
记录 mean/sd；参考模型（extra=[] , slow_na=False）同格也跑一次作对照。目的是确认 JSON 能跑、
方向对，不是拟合。把每次仿真写成一条 JSON 记录（见下）。

## 输出
1. `/root/research-work/ca-rebound/recall/families.md`：
   - 每族一节：族名 · 去领域化 statement（动词+抽象对象，无领域名词）· mechanism JSON（完整可跑）
     · 实例化检查的门稳态表 · sanity 仿真（协议5, reps=64, seed=0）mean/sd vs 参考模型同格
     · 预期可判别读数（哪个协议/阻断剂组合下该族与参考模型或其他族差异最大，定性即可）
   - 一节"伪影与前提"（镜头3 结论，含 slow_na 开关类）
2. 每次仿真写 `/root/research-work/ca-rebound/sim/<id>.json`：{mechanism, label 或 segments, block, reps, seed,
   counts_mean, counts_sd, nbsim_sha256:"bd1b9c85aaa7d9a0f7cdb92f086423d77af0fce4b5a472f4a0479b821ed58813"}
   文件名用 `<id>` = 简短族名+序号（如 ih-1.json, ref-1.json）。
3. `/root/.rlm-jobs/ca-rebound/recall/W1/2458/out.md`：SUMMARY（≤250 词：族清单一行一个）+ 各族一句话 + 文件清单；
   末行 STATUS 行（契约见角色文件）。STATUS 只用 ok/blocked/failed。

## 边界
- reps ≥ 64、seed 固定；仿真免费可多跑，但每条进记录；held-out 只仿真不观测
- 预算/判别/频段是父会话的事，不要做
- 不 pip install；numpy/math/json 足够
