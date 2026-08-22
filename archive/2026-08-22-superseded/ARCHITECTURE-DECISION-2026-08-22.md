# 要不要推倒重来 · 架构判断

**问题**：现在这套东西是不是过度工程？是不是该回到
「Prime 运行时 + 少量写好的研究 skill + MCP + 决策点上的轻量 gate」？

**答案**：**不要重建。你提的那个简单架构，就是现在跑着的这套。**
没有工作流引擎。真正的问题不是"太复杂"，而是三件别的事——见 §3。

---

## 1 · 先把事实摆出来：现在到底有什么

```
pi -p --autonomous --goal "…"                    ← 循环是 Prime 的，不是我们的
   --autonomous-gate ×4                          ← 决策点上的 gate（宿主判定，退出码）
   --no-skills --skill ×5                        ← register / probe / grill / figure / loop
   └─ IPython kernel（四个 Python skill 装进 kernel venv）
```

自定义代码总量：

| 件 | 行数 | 是什么 |
|---|---|---|
| `register.py` | ~760 | 信念状态存储 + 四验证器 |
| `probe/` | ~170 | 执行实验并留 provenance |
| `grill/` | ~150 | 对抗子代理（`rlm()` 的薄封装 + 镜头轮换 + 类型化结果契约） |
| `figure/` | ~110 | 读图（Qwen-VL） |
| 四道 gate | ~400 | 宿主裁决，只用标准库 |
| `viewer.py` | ~230 | 评委页面 |
| `loop/` | markdown | **路由，不是引擎** |

**没有一行是 turn 循环、重试、预算控制、上下文压缩、子代理调度。**
这不是印象，是查过的——在 `skills/ gates/ campaign/ viewer/` 里搜
`while True|for turn|retry|max_turns|budget`（排除测试）**零命中**；
循环控制全部来自 `entrypoint.sh` 里的 `--autonomous / --autonomous-max-turns /
--autonomous-max-tokens / --autonomous-max-continuations`。
自定义 Python 合计 **2307 行**（不含测试）。你担心的"大型自定义工作流引擎"不存在。

`state → load skill → work → gate → continue` 正是它现在的运行方式：
Prime 的 autonomous 驱动 continue，`--autonomous-gate` 就是 gate，
`loop/SKILL.md` 就是 load-relevant-skill 的路由。

---

## 2 · 认知校正表（"我们可能想错的地方"）

| 你现在的理解 | 实际情况 | 后果 |
|---|---|---|
| 我们建了一个复杂的编排层 | **没有**。循环、重试、压缩、续跑全部是 Prime 原生 flag；我们只加了 5 个 skill + 4 个 gate 脚本 + 一个状态存储 | 不需要重建 |
| gate 可以是"决策点上的轻量检查" | gate 必须检查**机器可读的状态**。状态在散文里，gate 就只能是一个 LLM 裁判——而 ARFT 测出来的头号失败模式正是模型的自我裁决（F.4 未纠正的自知错误 82.5%） | **register 不是范围蔓延，它是 gate 能成立的前提** |
| skill 规定每个阶段该做什么，就够了 | skill 是 prompt，**它不能强制**。模型可以无视它，而且实测就会无视 | 规定用 skill，强制用 gate。两者不可互相替代 |
| Prime 管长程，所以我们不用管 | 对压缩/续跑/refine 成立；对**研究状态**不成立——Prime 没有"假设"这个概念 | register 这一层砍不掉 |
| 我们在 Prime 已有能力之上重复造轮子 | 大体没有（见 §1）。真正重复的是 **Track B**——它整个落在产品路径上，而战役路径**从不经过 Electron 外壳** | Track B 对竞赛零贡献 |
| MCP 已经接好了 | 见 §4（审计中）。倾向：**没有** | 这是你列表里唯一真缺的一项 |
| Step 0 反复失败是模型能力不够 | 七次失败**没有一次**是模型的问题。两条 gate 规则数学上互相矛盾，模型无解 | 已修；这也是最该记住的教训 |
| 架构文档描述的就是系统 | Fable5/PrimeAgent 里大部分东西**没有建**，而且计划 §5 明确砍掉了 | 别照着文档估进度 |

---

## 3 · 真正的问题（不是复杂度）

### 3.1 执法层曾经是假的（已修）

五路独立评审共同发现：一场**完全捏造**的战役——实验从未执行、`register.json` 手改、
报告数字编造——原样通过三道 gate。`land()` 不是关口，是约定。

修法不是加编排，是加**对账**：新增 `integrity.py`，拿只追加的 journal 复算并与
register 比对，外加"空跑不给绿灯"。这恰恰是最简架构里缺的那一块——
**gate 之间必须有一道检查状态是怎么来的**。

### 3.2 skill 内容有约 40% 是不可执行的

`loop/references/` 17 个文件里，ChatGPT ×30、browser ×31、Playwright ×14 处指令——
容器里只有 ipython 和一个 DashScope 出口。而 `SKILL.md:49` **明确路由**模型去读其中两个。

你说"要自己写核心研究 skill"——**这一条我完全同意**，而且这就是理由。
现在的 references 是从别处搬来的，不是为这个运行时写的。

### 3.3 长程行为从未验证

没有任何一次运行越过 30 轮或经历过 compaction。Prime 的长程能力我们**假设**它好用，
但没有证据。而且 print 模式只在结束时输出，事后连轨迹都没有（container.log 实测
234 B / 942 B / 113 B）。

---

## 4 · 你的四个运行时问题

> RLM 何时触发？子代理怎么注册派发？skill 怎么发现调用？MCP 在哪？

审计进行中，结论落地前**不要假设任何一项可用**。已知的（源码核实过）：

- `rlm(...)` **只接受** `(prompt, name=, model=)`，传别的 kwarg 会抛。
  "把信息不对称做成函数参数"是**错的**——子代理是一个完整会话，能自己读工作区。
  所以 grill 的隔离是 **prompt-blinded，不是结构隔离**，报告里必须这么写（已写）。
- heartbeat 是**墙钟**调度（once/cron/interval），**没有**按轮数触发。
  按轮数的是 auto-refine（默认每 25 个 assistant 轮）。
- Prime 唯一的内置模型工具是 `ipython`。bash/edit 是 SDK 导出，Proma 自己包权限。
  Prime **没有任何权限系统**。
- Proma 侧 `noTools:'builtin'` → ipython 注册但不激活；`skillsOverride` 把 13 个
  Prime 自带 skill 全过滤掉；`systemPromptOverride` 让 Prime 走自定义 prompt 分支，
  **丢掉 RLM 基座 prompt 与 rlm() 契约**。所以产品侧现在基本没有 RLM。

---

## 5 · 建议：砍什么、留什么、补什么

### 砍

| 对象 | 理由 |
|---|---|
| **Track B（战役期间）** | 战役从不经过 Electron；它带来一条无人使用、无校验、最终 `shell:true` 在宿主执行的 IPC 通道 |
| `loop/references/` 里不可执行的部分 | 见 §3.2；至少删 `browser-patterns.md`，剥离 ChatGPT/Grok/MoA 段落 |
| `figure` skill（暂缓） | 迄今没有任何一次运行用到它 |
| 架构文档里那一长串 | 判别力排序、校准账本、陷阱世界、ARFT 判官、消融梯队、保留对手、三臂并行——计划 §5 已砍，**保持砍掉** |

### 留（都有存在理由，别砍）

- **register** —— 没有它就没有可检查的状态，gate 退化成 LLM 裁判
- **四道 gate** —— 唯一真正有强制力的东西
- **probe 的 provenance 链** —— "重算不采信"的落点
- **grill** —— 但要认清它是 prompt-blinded
- **viewer** —— 提交材料需要

### 补

1. **MCP**（你列表里唯一真缺的）——审计结论出来后定
2. **自己写的研究 skill**（你的原话，同意）——把 references 换成为这个运行时写的内容
3. **长程轨迹落盘**（零代码，挂个卷）
4. **真实的 red→green 阳性对照**（两小时，是计划自定的头号交付物）

---

## 6 · 一句话

架构是对的，**规模也是对的**；坏的是执法层曾经没有牙齿（已修）、skill 内容有近一半
是给别的运行时写的（该重写，你的直觉对）、长程能力从没验证过（该验）。
重建会把能跑的生成侧一起扔掉，再花几天重新推导出同一个设计。
