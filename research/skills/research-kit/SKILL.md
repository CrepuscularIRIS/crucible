---
name: research-kit
description: Use when 在 kernel 里需要读信念状态时——立锚/计数器、构造对抗者视图、比较探针判别力、出校准账本、回收子代理攻击；或给 rlm 窗口建作业目录、阻塞等待并回收 out.md。
version: 0.5.2
---

# research-kit —— kernel 侧只读工具箱

## 你在做什么

kernel 里 `import research_kit` 直接用（同步函数，无需 await；唯一例外 `wait`）。
Python-backed skill，所有 `rlm()` 子代理自动继承。

## 铁律

```
本模块只读；写信念状态一律走 research MCP 工具
```

**违反字面就是违反精神。** 手改 `.proma-research/` 会被 P3.3 防篡改与 trace
gate 抓住【结构】；本模块写不了，也不要绕。

## API

```python
research_kit.anchor(run)             # ~1k token 信念锚：MODE/谓词 · LIVE · 约束块 · COUNTERS/⚠ · NUGGET · NEXT；存 research_kit.LAST
research_kit.LAST                    # 上次 anchor 结果（kernel 变量，跨压缩存活）
research_kit.counters(run)           # 元认知计数器 dict：落地未迁移/攻击债/同探针死亡/存量
research_kit.claim_view(run, "H1")   # 对抗者上下文：claim+证据+graveyard，无 notes
research_kit.disjoint_pairs({"H1": (0.8, 1.0), "H2": (0.0, 0.6)})  # → [("H1","H2")]
research_kit.calibration(run)        # 每个落地探针：预登记频段 vs 观测（带内/外）
research_kit.collect_attacks(str(drop_dir))  # 回收子代理写下的攻击行（去重；drop_dir = 父代理 spawn 前选定的落点目录）

# rlm 窗口作业（契约见 research-loop 的 references/delegation.md）
job, name = research_kit.new_job(run, "certify", "C2")  # <cwd>/.rlm-jobs/<run>/certify/C2/<nonce4>/ + "certify-C2-<nonce4>"
results = await research_kit.wait([job, ...], timeout_s=1200)  # 阻塞读磁盘，零 token；超时删 child、child 已结束却没写 STATUS 判 failed，都记 failures.jsonl
research_kit.collect([job, ...])         # 不阻塞：各 out.md 末行 STATUS（-self 目录标 self_reviewed）
research_kit.field(job, "verdict")       # 取 out.md 的一个字段（## 标题节或 key: value 行），不整份读
research_kit.parse_status(line)          # 解析 STATUS 行（out.md 末行或完成通知预览）
```

唯一的写：`new_job` 建作业目录、`wait` 追加 `<cwd>/.rlm-jobs/<run>/failures.jsonl`——都在
`<cwd>/.rlm-jobs/` 之内、`.proma-research/` 之外（隔离守卫拦一切写状态根的 ipython），
从不碰 MCP 拥有的文件。

`run` 接受 run 名（解析到 `<cwd>/.proma-research/<run>`）或 run 目录路径；给 `new_job` 传
run 名——同一 cell 里含 `.proma-research` 的路径会让隔离守卫连带拦下写 brief.md。
读的是派生缓存 `register.json`；`counters`（及 anchor 的 COUNTERS 段）额外
只读 `journal.jsonl`。与 `research_state` 有分歧时以后者为准。

## 锚里的 P2 段（都只读）

| 段 | 来源 | 意思 |
|---|---|---|
| `MODE:` | `research_init` 冻结的 mode / 成功谓词 / depth（journal 的 run.init） | 没有 mode = `legacy`，走 research-loop 阶段表 |
| `LIVE (n)` | 有 mode 的 run：活集（与 MCP `isAlive` 同一定义）里不是 lead / narrowed 的；非 LIVE 带 `[状态]` | legacy 只列 LIVE |
| `LEAD (n)` | CONTESTED 且带 `lead{requested, caps}` 的 claim（终态请求被宿主封顶） | 仍是活对手：不进坟场禁令，计入 NEXT 的存活数；补上 caps 指的东西后可重迁 |
| `LIVE (narrowed)` | SCOPED 的 claim（有 mode 的 run；显示 scoped_statement） | 收窄后的活对手，可入 bands；不进坟场禁令 |
| `COUNTERS` | 攻击债：有 mode 的 run 读 register 的 `debts`（按 claim）；LIVE= 是活集大小 | legacy 照旧按 journal 计 |
| `EQUIV (RULING)` | `RULINGS.md` 最新一行 `equiv{H#, …}` | 等价类出口；覆盖全部 LIVE 时算"收缩到等价类" |
| `LESSONS` | `research-work/<run>/lessons.md` 的 `- [global\|direction\|leaf] …` 行 | 本 run 教训；global = 本 run 全局 |
| `NUGGET:` | `RULINGS.md` 最新一行 `nugget: …` | open 下为空时打 ⚠ |
| `NEXT:` | 状态 + mode | 一步动作 · in 路径 · out 路径 · why；`NEXT: synthesize lessons` 按 lessons.md 的 `through-seq:` 与 journal 计数；identify 的计量预算 = `PROMA_EVAL_BUDGET`（缺省 8）− journal 的 `world.observe` cost：有剩余且活对手未分开 → `剩余预算 N → 选判别度最高的下一探针（含阻断剂）`，forecast / 报告行带 `预算剩 N`（01 K2-1） |
⚠ 提示的调度表在 `research-moves` 的 SKILL.md。

## collect_attacks 的落点约定

`rlm()` 在**准入**时返回句柄——立即读必然空（空不是错误），后续轮次再读。
落点由**父代理在 spawn 之前**选定绝对路径写进子代理 prompt（如
`<项目根>/.grill-drops/H1/attacks.md`，见 research-grill 程序 2）；不要让
子代理读 `os.environ['RLM_SESSION_DIR']`——Prime 只在有持久 artifact 目录时
才设它，没有时该变量根本不存在（P4.3 实测子代理因此写到了 `/tmp`）。
本函数扫给定目录及其 `sub-*`，**不向上找父目录**——`/tmp` 这类共享父目录
会把无关战役的攻击收进证据链。

## 借口 | 现实

| 借口 | 现实 |
|---|---|
| "import 报 ModuleNotFoundError，加个 sys.path 就好" | 手工绕过的模块子代理继承不到——等于放弃这个 skill 的全部理由。按 README 三条排查：uv 在 PATH / skill 目录已复制 / 重启会话。 |
| "压缩后重新拉一遍状态重建认知" | 先 `print(research_kit.LAST)`——锚在 kernel 里活着，别凭对话记忆重建。 |
| "为一个 metric 拉一次 anchor" | 单条已知信息直接问 `research_state`。 |

## 交接

- 需要权威状态做迁移决策 → MCP `research_state`
- 写信念（propose/transition/prereg/attack/declare）→ research MCP 工具
