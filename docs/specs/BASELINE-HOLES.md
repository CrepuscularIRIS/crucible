# 基线跑出来的漏洞台账

**这一轮跑 benchmark 的目的是找 crucible 的漏洞，不是刷分。**分数只是探针的读数。

口径：`RCB`（ResearchClawBench，40 任务 / 10 学科 / 真论文当参考答案）与
`NeuronBench`（6 worlds，headline `spike_forecast_mse`，确定性打分）。
执行者 `qwen3.7-plus`（复杂档 `qwen3.7-max`），全程过阿里云百炼 —— 赛题 133/134 的硬约束。

每条漏洞 MUST 带**实测证据**（run_id / 日志行 / 文件路径），不带证据的写进「待证实」。

---

## 基线读数

| run | 任务 | 状态 | 轮/秒 | **RCB 分** |
|---|---|---|---|---|
| `Astronomy_003_20260820_025227` | Astronomy_003 | completed exit 0 | 26 轮 / 520s | **46.9 / 100** |
| `Neuroscience_000_20260820_030114` | Neuroscience_000 | completed exit 0 | 23 轮 / 496s | **7.0 / 100** —— 见 H7 |
| `Math_000_20260820_030944` | Math_000 | completed exit 0 | **16 轮 / 215s** | report 0 字节，无 `_score.json` —— 见 H6 |

三条全部 exit 0，三条 `stats` 全部 `evidence:0 killed:0 survived:0 round:1`（H1）。
**三条 = 三种完全不同的失败，一个闸门都没响**：结论没人反驳（H1）、
交付物根本没生成却报成功（H6）、答非所问却写得很漂亮（H7）。
**别求这三个数的平均值** —— 它们量的不是同一件事。

Astronomy_003 的 rubric 只有 3 条，**全部是 `"type": "image"`**（权重 .4/.3/.3）：

| # | 权重 | 分 | 裁判怎么说 |
|---|---|---|---|
| 0 | .4 | 55 | 中位数 4.25e-4 对上了论文的 4e-4，KS p=0.908，99.8% 落在 1e-4~1e-2 —— 量化结论基本复现 |
| 1 | .3 | **35** | ℓ=8 中位数 2.27e-3 比标准答案 ~1.5e-3 高 50%；**更要命的是结论反了** |
| 2 | .3 | 48 | 外推误差 2.03e-5 / 5.34e-5 对上了 ~2e-5 / ~5e-5，「比分辨率误差小一个量级」的核心结论也对 |

**46.9 分不是「模型不行」，是「没人拦它」** —— 见 H1。

---

## H1 · 编排整个没触发，退化成普通写码 agent 〔**已实测·最高优先**〕

**证据**：真实 run `Astronomy_003_20260820_025227`，**26 轮、520 秒、exit 0、产出 11 张图 +
6 个 CSV + 完整 report.md** —— 看起来一切正常。而 55 条事件里 30 条 `stats` 无一例外：

```
{"t": "stats", "evidence": 0, "killed": 0, "survived": 0, "round": 1}
```

全程只调 `Bash` / `Write` / `Read`，**一个 `mcp__sci__*` 没调、一个子智能体没派**
（事件流里 `run_falsifier` / `record_source` 只出现在 `init` 的工具清单里，从未被调用）。
冒烟 run `smoke_rcb_001`（4 轮）形状完全相同 —— 不是任务太简单导致的。

**这意味着什么**：判伪闸门（`run_falsifier`）、证据链（`record_source` → evidence id）、
十角色编队 —— 我们对外声称的全部贡献，在 RCB 上一次都没被触发。
现在的 crucible 和 prime-agent **结构上没有差别**，分数高低都说明不了我们的方法有效。

**为什么会这样**：`SCI_ONLY` 把 `Bash`/`Write` 开给了 lead（vendor 进来的科研 skill 需要），
而 RCB 的 `INSTRUCTIONS.md` 明写「every response must include at least one tool call」
+「report/report.md 写完才算完」。模型选了阻力最小的那条路 —— 直接写码出图。
**提示词是劝，工具面是拦**：这条本仓库自己写过，这次栽在自己写的话上。

**这次它有价钱了**：rubric #1 拿 35 分，裁判的原话是

> the AI's conclusion in Section 3.3 **contradicts the paper's key insight**: the AI claims
> higher modes (ℓ≥4) dominate the error budget (~60%), while the criterion explicitly states
> that overall waveform accuracy remains dominated by ℓ=2 due to its larger amplitude

模型从「高阶模的**相对**误差更大」直接跳到了「高阶模主导误差预算」—— 漏了幅度加权。
这是一个**没被任何人反驳过的结论**：它自己写码、自己出图、自己下判断，全程没有第二个视角。
`run_falsifier` 存在的意义就是杀这种断言，而它一次都没被调用。
另外两条（55、48）失分主要是数值精度和图本身，不是同一类错。

**H1 不再只是「我们的功能没触发」，是「我们的功能没触发，并且正好在它该管的那条 rubric 上丢了 65 分」。**

**修的方向**（编排层，不是提示词层）：让「出结论」这一步必须过闸门 ——
报告里的每个定量结论要能追到一个 `run_falsifier` 的裁决或一个 evidence id，
否则 `accept()` 只给 provisional。落地方案待定，见 task #14。

---

## H2 · 花费闸门读的是假价格 〔已实测·已绕过〕

**证据**：`smoke_rcb_001`，4 轮 / 59,824 input tokens，`done` 事件报 `cost: 0.32722`。
按百炼真实单价这应当低一个数量级。原因：`crucible/litellm/config.yaml` 没给
`qwen3.7-*` 声明 `model_info`，litellm 走默认价格表。

**后果**：`MAX_USD` 这个闸门拦的是一个假数 —— 原值 2 大约 6 轮就触发，
一条真实 RCB 任务（几十轮）必然半路被砍，而且**看起来像模型跑飞，不像闸门误伤**。

**已被第二个数据点证实**：`Astronomy_003_20260820_025227` 26 轮报 `cost: 3.56`。
原值 `MAX_USD=2` 会在大约第 15 轮把这条本来跑成了的 run 砍掉 ——
**接入当天如果没先改这个值，第一条基线就会是一次假的失败**。

**当前处置**：`MAX_USD` 2 → 20，真闸门交给 `MAX_TURNS=200`。
**正解**：查到百炼真实单价，写进 `litellm/config.yaml` 的 `model_info`，再把 20 调回去。

---

## H3 · RCB 对 `exit≠0` 直接不评分，产出被整份丢掉 〔已实测·外部约束〕

**证据**：`workspaces/Astronomy_003_20260816_144940/` 有完整 `report/report.md` + 9 张图 + 8 个
输出文件，`_meta.json` 却是 `"status": "failed", "exit_code": 1`，从未进入评分。
2026-08-16 那 15 次全 null 里，7 次是这个形状（prime-agent `--autonomous-max-turns 30`
冲到 35/42/57/84/85/107 后非零退出）。

**我们这侧的处置**：`crucible_agent.py` 的退出码**只反映「跑完了没有」，不反映「跑得好不好」**，
产出拷回放在 `finally` 里 —— 半路断了也带回去。

**上游那侧 MUST NOT 改**（改了跟别人的分数没有可比性）。

---

## H4 · RCB 评测服务绑 0.0.0.0 〔已实测·未处置〕

`:5000` 在局域网可见。上游 flask 代码，按规矩没动。本机跑无妨，
换到共享网段前 MUST 用防火墙或反代收口。

---

## H5 · 手上只有「我们的分」，没有「同条件对照」〔已实测·待补〕

**证据**：`workspaces/*/_score.json` 全库只有 1 个文件 —— 就是我们这条 46.9。
2026-08-16 那 15 次 prime-agent 全部 exit≠0，一条都没进评分（见 H3），
**所以 prime-agent 在 Astronomy_003 上的分数我们其实并不知道**。

**为什么这是个洞**：评分表 P18 要「至少提供一种同条件比较」。
46.9 这个数现在**孤零零**—— 说不出是好是坏，也说不出编排改完之后的分是被编排拉上去的
还是被别的东西拉上去的。做完 #14 再拿一个 46.9→X，没有对照仍然证明不了因果。

**处置**：`agents.json` 里三个 `prime_agent*` preset 保持不动，就是留着当对照。
补跑 MUST 用同一个 `baseline.sh`（串行、同一台机、同一个网关），
并且**给 prime-agent 也把 `--autonomous-max-turns` 提上去** —— 不然对照组会重演 H3
（跑出东西但 exit≠0，不评分），那不是对照，那是把对手绑起来打。

---

## H6 · 没有自主契约：跑到一半停下来问人，还报成功 〔**已实测·并列最高优先**〕

**证据**：`Math_000_20260820_030944`。写完两个 .py（`byte_track.py` / `sparse_track.py`）之后
最后一段正文是：

> Got it. The SparseTrack implementation is ready … **What would you like to do next?** I can:
> - Run the tracking on your data
> - Compare performance against ByteTrack
> - Visualize the depth-based decomposition

然后 `done`：

```
{"turns": 16, "error": false, "stopped_by_user": false,
 "ctx": {"used": 28640, "pct": 14}, "cost": 1.4379, "denials": 0}
```

**一个闸门都没响。**不是 `MAX_TURNS`（16/200），不是 `MAX_USD`（1.44/20），
不是上下文（14%），不是报错，不是用户打断。它**自己决定停下来征求意见** ——
而 benchmark 那头没有人。产出：`report/` 空、`outputs/` 空，只有两个没跑过的脚本。

**已排除是我这侧的拷回 bug**：crucible 侧源目录 `data/workspaces/Math_000_.../report/`
同样是空的，agent 确实没写。

**为什么这条最毒**：`_meta.json` 写的是 `"status": "completed", "exit_code": 0`。
**它长得跟成功一模一样。**只有 report 是 0 字节这一个地方漏了馅。
H3 是「exit≠0 把好活扔掉」，H6 是它的镜像 —— **exit 0 给零活盖了个成功的章**。
一条 40 任务的全量跑完，这种假成功会直接混进平均分里，而且从状态栏上看不出来。

对比：prime-agent 有 `--autonomous-max-turns` 就是干这个的。
我们只有 `MAX_TURNS` 这个**天花板**，没有**地板** —— 没有任何东西规定
「交付物没出来之前不许停、不许问」。

**最关键的一条证据（决定了修法）**：RCB 的 `INSTRUCTIONS.md` 里**已经写死了这条禁令**，
而且写得比我们能写的任何提示词都重：

> **There is no human on the other end.** No one will answer questions, grant permissions,
> or provide clarification. You are fully on your own. If you encounter difficulties,
> confusion, or unexpected errors — **do not ask for help, do not pause, and do not
> interrupt the task.** Make your best judgment and keep going.

**这段话就在上下文里，模型照样问了。**所以 H6 的修法**不能**是「再加一段提示词说得更狠」——
那条路已经被实测证否了。地板必须是**机制**：`Stop` 钩子，交付物不存在就 deny stop。
**提示词是劝，钩子是拦** —— 这次不是推理，是有对照的实验结论。

**修的方向**（并进 task #14）：编排层加一条自主契约 ——
终止条件从「模型说完了」改成「交付物存在」：`report/report.md` 非空、图 ≥1、
每个定量结论有出处。不满足就继续派工，而不是把控制权交回给一个不存在的人。
顺带 `crucible_agent.py` 的退出码要能区分「跑完了」和「跑完了但什么都没有」。

---

## H7 · 答非所问，但写得很漂亮：7.0 分 〔**已实测**·一半是我们的锅，一半是任务的天花板〕

**证据**：`Neuroscience_000_20260820_030114` —— 23 轮、496 秒、exit 0、
`report.md` 22,577 字节、6 张图，**看起来是三条里最完整的一条**。得分 **7.0 / 100**。
5 条 rubric（各权重 .2）：

| # | 分 | 裁判怎么说（摘） |
|---|---|---|
| 0 | 10 | 要 6 个实验条件（Lab1/Lab2/Male/Female/RI/CSDS）的 PR 曲线，AI 只做了 `Together_1` 一个数据集 —— 「fundamental scope mismatch」 |
| 1 | **0** | 要 Lab1 vs Lab2 的 SHAP 对比，报告里**一个 SHAP 都没有** |
| 2 | **0** | 要 Male vs Female 的 SHAP 对比，同样完全缺席 |
| 3 | **0** | 要 RI vs CSDS 的 SHAP 对比，同样完全缺席 |
| 4 | 25 | 要 Attack 分类器的 permutation importance top-15，AI 给的是逻辑回归系数，且只对 Sniffing 做了 permutation，特征名也完全对不上 |

**先说不是我们的锅那一半**：`tasks/Neuroscience_000/data/` 里**只有三个文件**，
全部是 `Together_1_*`。Lab1/Lab2/Male/Female/RI/CSDS 这六个条件的数据**根本没发给我们**，
而 rubric 是照着原论文的图写的。**第 1、2、3 条（共 60% 权重）在给定数据下不可能拿分。**

> **这条直接影响后面怎么用这个 benchmark**：RCB 里存在「rubric 要的数据没随任务发」的任务。
> 拿这种任务的分数去调 harness = 调噪声。全量跑之前 MUST 先标出这类任务，
> **单独归一档，不进主对比**。

**再说是我们的锅那一半**（这才是要修的）：报告从头到尾**没有一句话承认这个缺口**。
它没写「rubric/论文涉及六个实验条件，本次仅提供 Together_1，因此以下结论仅覆盖单条件」——
它就那么自信地把单数据集的结果当成完整答案交了。第 4 条更是纯粹的方法漂移：
论文要 permutation importance，它换成了逻辑回归系数，**也没说为什么换**。

这和 H1 是同一个病根的两种表现：**没有任何一步逼它把「要求」和「我实际做了什么」摆在一起比对。**
H1 是「结论没人反驳」，H7 是「范围没人核对」。两条都指向同一个修法 ——
阶段 0 必须落一份**可核对的需求清单**，阶段 5 必须逐条核对并**显式标注未覆盖项**，
核对结果进 `report.md`，不是进模型的自我感觉。

---

## 待证实（有怀疑，还没有实测证据）

- **角色分档是否真的分开出网**：`M_SUBAGENT=inherit` 已配好，但「界面上印对了」不等于
  「CLI 真的拿这个出网」—— 本仓库自己钉过这条。要从真实 run 的事件流里回读，
  确认 10 个子智能体各自打到 plus / max / grok。（task #11）
- ~~**多模态**：我们这侧出的图够不够被判对~~ —— **已证实：够。**
  Astronomy_003 三条 rubric 全是 `"type": "image"`，全部拿到非零分，裁判 reasoning 里明写
  「The visualizations (bar chart in Image 6, summary table in Image 3) **clearly display these
  values** with correct relative magnitudes」。`qwen3.7-plus` 确实在读图，我们的图确实能被读。
  **这条不是瓶颈，别在这里花时间。**
- **并发上限**：本轮基线 MUST 串行，就是为了不把「编排弱」和「网关扛不住」混在一起。
  并发能力单独测，别混进基线。
