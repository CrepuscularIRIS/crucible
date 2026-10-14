# K1 对手完整性检查（I3）— ca-rebound（identify, light）

你是 Research Analyst（契约见 /root/.proma-dev/sdk-config/research-roles/proma-research-analyst.md）。MODE: EXPLORE。本 brief 是逐字要求。

## 任务位置
identify 战役 I3 阶段。W1 已召回 7 机制族 + 2 伪影 + 1 前提开关（清单见输入）。
你要以"没被召回的视角"回答两个问题：
(A) **还缺哪个族？**——给定问题与已召回集合，哪些第一性机制族/伪影族缺席？
(B) **problem-fit**——已召回每族判别的是不是"真实系统的未知附加电流是什么"这道战役问题本身；
    哪些族其实只是对同一信号空间的不同参数化（冗余，应合并或给 parent 关系）？

你不做观测、不调用任何研究状态写工具、不改 run 状态。**你没有偏好机制**；
不看 W1 之外任何战役内部推理。

## 输入（只读）
- /root/research-work/ca-rebound/ledger.md —— 钉死参数、协议池、阻断剂语义、读数定义
- /root/research-work/ca-rebound/recall/families.md —— 已召回 10 项（IH、CaT、NaP、Mcur、ihfast、catna、combo、
  shunt、noisysrc、slowna），每项有 statement 与 mechanism JSON
- /root/research-work/ca-rebound/nbsim/kernel.py、stochastic.py、blockers.py —— 模型结构（只读）

## 逐族核查维度（输出表格逐列给）
1. 门方向组合（m 方向 × h 方向 × 有无 h）是否还有未覆盖象限
2. 反转电位区段（<0、0–100、≥100）× 阻断剂可分性（Cd 只切 E≥100，XE991 只切 name=='M'）
3. 时间尺度（mtau/htau 数量级）是否覆盖了池内协议可分辨的范围（协议长 40–300 ms）
4. 读数伪影（spike_count 只看 test 段上穿；v-clip 地板 −95；SIG_OBS=2）还养着哪些非机制对手
5. slow_na 开关之外，mech JSON schema 还能表达的"非通道"机制（如 mpow>1 的协同性、多通道串联）

## 输出
- /root/.rlm-jobs/ca-rebound/rivals/K1/e8df/out.md：SUMMARY（≤250 词）→ (A) 缺失族清单（每族：statement 一句 + mechanism JSON +
  为什么 W1 三镜头会漏它）→ (B) problem-fit 表（族 × 判别的是否本战役问题 × 冗余关系）
  → 末行 STATUS 行。若判断"无缺失族"，(A) 节写 none 并给理由。
- 不写其他文件。reps≥64 的仿真可选（免费），跑就写 /root/research-work/ca-rebound/sim/rival-*.json。

## 边界
- 不评估已有族的参数是否最优——那是 K2 判别设计的事
- 不 pip install
