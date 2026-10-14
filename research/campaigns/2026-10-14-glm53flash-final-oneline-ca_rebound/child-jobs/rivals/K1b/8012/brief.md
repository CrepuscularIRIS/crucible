# K1 对手完整性检查（I3，收窄重派）— ca-rebound（identify, light）

你是 Research Analyst（契约见 /root/.proma-dev/sdk-config/research-roles/proma-research-analyst.md）。MODE: EXPLORE。本 brief 是逐字要求。
**禁止运行任何仿真（不 import nbsim、不跑 nbsim.simulate）——纯文本分析，30 分钟内完成。**

## 任务
W1 已召回 10 项机制/伪影候选（见 /root/research-work/ca-rebound/recall/families.md，只读）：
IH、CaT、NaP、Mcur、ihfast、catna、combo、shunt、noisysrc、slowna。
战役问题：真实神经元在参考 HH 模型之外有一个未知附加膜电流，要辨识它属于哪个机制族。

(A) **缺失族**：按 5 个维度查未覆盖象限——
  ① m 方向 × h 方向 × 有无 h 的组合；② 反转电位区段 × 阻断剂（Cd 只切 E≥100；XE991 只切 name=='M'）；
  ③ 时间尺度 1–1000 ms 是否有未覆盖段；④ 读数伪影（test 段上穿计数、v-clip −95、SIG_OBS=2）还养什么非机制对手；
  ⑤ schema 能表达的非通道机制（mpow 协同性、多通道组合、slow_na 开关）。
  每个缺失候选给：statement 一句 + mechanism JSON + 为何三镜头会漏。若无缺失写 none 并给理由。
(B) **problem-fit 与冗余**：逐族判"它判别的是不是本战役问题"；标出参数化冗余对（如 ih/ihfast、cat/catna
  该合并还是保留，给 parent 关系建议）。

## 输出
只写 /root/.rlm-jobs/ca-rebound/rivals/K1/e8df/out.md：SUMMARY（≤200 词）→ (A) → (B) 表 → 末行
STATUS: <ok|blocked|failed> PATH: <相对作业根路径>
## 边界
- 不做观测、不写 run 状态、不创建子代理、不 pip install
- 只读 /root/research-work/ca-rebound/ledger.md 与 /root/research-work/ca-rebound/recall/families.md，不需要读模型源码
