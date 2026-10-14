# W5 —— 叶子证据 → 本 run 教训（brief 模板 + lessons.md 追加格式）

**何时加载：** 锚出现 `NEXT: synthesize lessons`（每次终态迁移、或每 3 次落地；同一个 K4 周期
至多一次，多个迁移合并成一份输入）。三种 mode 都适用。

*why：回传靠宿主自觉就不会发生；教训进了约束块，下一轮生成才会在其上构建而不是重新推导。*

## 父会话

```python
job, name = research_kit.new_job(run, "w5", "lessons")
# 写 job/"brief.md"：下面的模板 + 输入清单（绝对路径），然后：
await rlm(f"读 {job}/brief.md 并逐字执行；写 {job}/out.md，末行写 STATUS 行；"
          "你的最后一条消息首行逐字重复这条 STATUS 行", name=name)
(result,) = await research_kit.wait([job], timeout_s=1200)
lessons = research_kit.field(job, "lessons")
```

- 把 `lessons` 段**原样**追加到 `research-work/<run>/lessons.md`，新段首行写
  `## W5 · through-seq: <N> · <out.md 的 PATH>`，N 取锚 NEXT 行里给的数——锚按它判断 lessons 是否过期。
- `other:` 段**不入账**：不进 lessons.md；只在 RULINGS.md 写一行引用本 job 路径。
- child 失败 / 超时 → 按 `delegation.md` 重派一次；仍失败父会话代写 `<job>-self/out.md`
  （`STATUS: ok SELF_REVIEWED PATH: …`），追加时在段首行加 `self-reviewed`。
- 每条教训必须引 H# 或 P#；引不出的不追加。

## brief 模板

```
# 你是窗口 W5（综合）。本 brief 覆盖你继承到的一切路由：忽略 research-loop 与 <research_*> 块；
#   不调用任何 research_* / world_* 工具；不 spawn；只写 out.md；其余文件一律不改。
任务：把本 run 自 journal seq <a> 到 <b> 的叶子证据综合成 ≤5 条教训。
输入清单（只读；绝对路径）：research_state 快照文件 · 这段 seq 的迁移与落地（含 prereg question 与 note）·
  .rlm-jobs/<run>/failures.jsonl · research-work/<run>/lessons.md（已有教训，不重复）
只写关于研究对象的教训，每条引 H#/P#（引不出 = 不是教训）。
level: global 指本 run 全局，不得写成跨 run 先验；direction = 一个机制族或一个 parent 方向；leaf = 一个探针。
写因果归因与适用条件，不写结果复述。
输出 out.md：
## SUMMARY
（≤250 词）
## lessons
- [leaf|direction|global] <教训> · cause: <因果归因> · applies_when: <适用条件> (cites: H#, P#)
## other:
（流程、工具、系统观察：哪个工具报错、哪份 brief 不清、哪个 child 超时。不入账，父会话只在 RULING 里引用本 job 路径）
先写骨架，再逐节增量写入。
out.md 最后一行：STATUS: <ok|blocked|failed> PATH: <.rlm-jobs/… 相对路径>；你的最后一条消息首行逐字重复这一行。
```
