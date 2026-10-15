# I2 机制×协议×阻断剂矩阵 — ca-rebound（coder，冻结规格）

No agent_message in this runtime: ignore agent_message.send / receiver_role; child results = out.md + completion notice only.

WHEN: 把已冻结的实验或工具规格实现成可运行、可复现的代码与产物。 角色契约 = 本条 `# Research Coder` 起的正文；研究路由块给出宿主写的 `<sdk-config>/research-roles/proma-research-coder.md` 绝对路径时改读那份（宿主每次研究会话重写，以它为准），没有研究路由块时照抄本条正文；`job, name = research_kit.new_job(run, '<step>', '<target>')`，把角色契约、任务、输入路径和状态契约写进 job/brief.md，再用 `await rlm(f'读 {job}/brief.md 并逐字执行；写 {job}/out.md，末行写 STATUS 行；你的最后一条消息首行逐字重复这条 STATUS 行', name=name)` 创建（固定名第二次 spawn 会抛错）；同一 turn 内 `await research_kit.wait([job])`，再用 `research_kit.field(job, '<字段>')` 取值。不要传 model，让 child 继承父会话当前模型；rlm 返回的是准入句柄，不是答案。

# Research Coder

适用：把已冻结的实验或工具规格实现成可运行、可复现的代码与产物。

## 共同边界

- 你继承父会话当前模型；不要自行选择、切换或建议改用另一模型。
- 只处理 brief 中的一个子任务，不扩展父任务，不读取父会话未显式提供的历史。
- 父会话是唯一的研究状态写入者。不得调用会改变 claim、prereg、probe、attack、report 或 journal 的 Research MCP 工具，也不得直接改写 `.proma-research/`。RLM 作业目录 `<工作目录>/.rlm-jobs/` 在它之外：brief 点名的 out.md 就写在那里，照写即可。
- 不得创建任何子 Agent；需要额外分工时返回 `STATUS: blocked`，由父会话裁决。
- 先读取 brief 点名的 Skills/references；没有点名就不要全量扫描 Skills。
- brief 给出绝对报告路径时，完整产出写入该路径，最终回复只给状态、路径和一句摘要；未给路径时不得自行猜位置，完整产出放在最终回复。

## Coder 专属契约

- brief 必须包含可执行 SPEC。若缺少会迫使你设计实验的决定，立即返回 `STATUS: blocked`，并在摘要中写 `SPEC_GAP: <缺口>`，不得自行发明。
- 先写会失败的行为测试，再做最小实现；按 SMOKE → small → full 的次序验证，首个失败阶段即停止升级规模。
- 控制组必须走同一代码路径；固定随机种子，不依赖网络或墙钟。
- 可以修改 brief 授权的代码和产物路径，但不得修改 Research MCP 状态、研究结论或实验规格。

## RLM return: STATUS contract

- No agent_message in this runtime (the harness call contract's `agent_message.send` / `receiver_role` does not exist in Proma). Results travel only through files plus the completion notice.
- The parent writes brief.md before spawning and names exactly one absolute out.md path; write the full result there and nowhere else. out.md sits under `<working dir>/.rlm-jobs/`, outside `.proma-research/`, so writing it is allowed. The first section of out.md is SUMMARY (≤250 words); write the skeleton first, then fill sections in incrementally.
- The LAST line of out.md is exactly: `STATUS: <ok|blocked|failed> PATH: <path of out.md relative to the job root>`, where the job root is the working directory that holds `.rlm-jobs/` (so PATH starts with `.rlm-jobs/`), e.g. `STATUS: ok PATH: .rlm-jobs/r1/certify/C2/7f3a/out.md`. Append it only after every section is final: the parent's wait returns as soon as that line exists.
- The FIRST line of your final message repeats that STATUS line verbatim: the completion notice previews only the first ≤160 characters of your last message, never out.md.
- `ok` = done (concerns go into SUMMARY); `blocked` = missing context, an external blocker, or out of role (SUMMARY says what is missing or which role fits); `failed` = could not finish.
- Parent: `await rlm(...)` returns an admission handle, not the answer; read the result from out.md on disk, never from the return value.

---

## 位置
identify 战役 ca-rebound 的 I2：把 10 个机制（参考模型 REF + 9 个候选族）× 协议 × 阻断剂
扫成矩阵，产物是后续 Δ/σ 判别设计（I4）的唯一数字来源。规格已冻结，不要改参数、不要
加协议、不要改 reps/seed。一个 W1-rival 子代理正在并行找漏族（H10+），不要等它、不要改它
的输出。

## 冻结 SPEC（逐字执行）
- 仿真包：`import sys; sys.path.insert(0, "/root/research-work/ca-rebound"); import nbsim`
- 机制集合（10 个，mech 名 → mechanism dict）：
```json
{
 "REF": {
  "extra": [],
  "slow_na": false
 },
 "Ih": {
  "extra": [
   {
    "name": "Ih",
    "g": 1.5,
    "E": -30.0,
    "mvh": -75.0,
    "mk": -7.0,
    "mtau": 80.0,
    "mpow": 1
   }
  ],
  "slow_na": false
 },
 "CaT": {
  "extra": [
   {
    "name": "CaT",
    "g": 2.0,
    "E": 120.0,
    "mvh": -58.0,
    "mk": 6.0,
    "mtau": 8.0,
    "mpow": 2,
    "hvh": -62.0,
    "hk": 6.0,
    "htau": 90.0,
    "hpow": 1
   }
  ],
  "slow_na": false
 },
 "M": {
  "extra": [
   {
    "name": "M",
    "g": 1.2,
    "E": -77.0,
    "mvh": -30.0,
    "mk": 4.0,
    "mtau": 100.0,
    "mpow": 1
   }
  ],
  "slow_na": false
 },
 "KA": {
  "extra": [
   {
    "name": "KA",
    "g": 3.0,
    "E": -77.0,
    "mvh": -55.0,
    "mk": 8.0,
    "mtau": 6.0,
    "mpow": 1,
    "hvh": -60.0,
    "hk": 6.0,
    "htau": 25.0,
    "hpow": 1
   }
  ],
  "slow_na": false
 },
 "NaP": {
  "extra": [
   {
    "name": "NaP",
    "g": 0.8,
    "E": 50.0,
    "mvh": -48.0,
    "mk": 6.0,
    "mtau": 8.0,
    "mpow": 1
   }
  ],
  "slow_na": false
 },
 "CaL": {
  "extra": [
   {
    "name": "CaL",
    "g": 1.5,
    "E": 120.0,
    "mvh": -20.0,
    "mk": 6.0,
    "mtau": 20.0,
    "mpow": 1,
    "hvh": -15.0,
    "hk": 5.0,
    "htau": 300.0,
    "hpow": 1
   }
  ],
  "slow_na": false
 },
 "Kir": {
  "extra": [
   {
    "name": "Kir",
    "g": 2.0,
    "E": -85.0,
    "mvh": -80.0,
    "mk": -6.0,
    "mtau": 30.0,
    "mpow": 1
   }
  ],
  "slow_na": false
 },
 "KslowInact": {
  "extra": [
   {
    "name": "KslowInact",
    "g": 4.0,
    "E": -77.0,
    "mvh": -35.0,
    "mk": 10.0,
    "mtau": 8.0,
    "mpow": 1,
    "hvh": -40.0,
    "hk": 8.0,
    "htau": 600.0,
    "hpow": 1
   }
  ],
  "slow_na": false
 },
 "slowNA": {
  "extra": [],
  "slow_na": true
 }
}
```
- 协议（用 `nbsim.protocol(label)` 解析）：
  - 池内 9 条：["brief step (12 uA, 40 ms)", "long step (10 uA, 300 ms)", "strong step (18 uA, 120 ms)", "weak step (5 uA, 120 ms)", "hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA)", "hyperpol pre-pulse + weak test (-30 uA/250 ms, gap, +6 uA)", "paired long pulses (12 uA/300 ms, 60 ms gap, 12 uA/300 ms)", "depolarising conditioning + test (+15 uA/250 ms, then +12 uA)", "brief hyperpol conditioning + test (-30 uA/40 ms, then +12 uA)"]
  - held-out 6 条（只可仿真）：["hyperpol -25 then release", "hyperpol -35 then release", "hyperpol -30 then release", "hyperpol -40 then release", "brief step (12 uA, 40 ms)", "long step (10 uA, 300 ms)"]
- 阻断剂：`block` 取 `()`、`("TEA",)`、`("Cd",)`、`("XE991",)`；另加 3 个 TTX spot-check 格：
  `("TTX",)` × {"REF", "CaT", "NaP"} × 协议 "hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA)"。
- 每格：`r = nbsim.simulate(mech, seg, reps=64, seed=0, block=block)`，取 `r["mean"]`, `r["sd"]`。
- 格集合 = 10 机制 × (9 池内 + 6 held-out) 协议 × 4 阻断剂 + 3 TTX 格 = **603 格**。
- 预计每格 ≈2s，总计 ≈20 分钟：**边跑边写**，每 20 格 flush 一次 matrix.csv，
  防止超时全丢。

## 产物（两个）
1. 每格一条 JSON 记录：`/root/research-work/ca-rebound/sim/cdfa-<mech>-<pool|ho>-<pi:02d>-<block>.json`，
   内容 `{"mechanism": <dict>, "label": <str>, "block": [..], "reps": 64, "seed": 0,
   "counts_mean": float, "counts_sd": float, "nbsim_sha256": "bd1b9c85aaa7d9a0f7cdb92f086423d77af0fce4b5a472f4a0479b821ed58813"}`。
   block 名用 `none/TEA/Cd/XE991/TTX`；文件名里的 mech/label 做文件名安全化（空格/括号→`_`，
   保留一个可逆映射表）。
2. 汇总表 `/root/research-work/ca-rebound/sim/matrix.csv`：
   列 `mech,label,is_heldout,block,reps,seed,mean,sd,sim_id`，每 20 格重写全表。

## 验收（写进 out.md）
- 总格数 = 603；identity 复核：REF × H1 协议 × none = 15.42±1.74（seed=0 应精确复现）。
- REF 与 slowNA 全程（所有协议×阻断剂）相同的格必须只有 none/…（REF 没有 extra，Cd/XE991 对它无效；
  在 out.md 用 ≤3 句话确认这个语义在数据里成立）。
- out.md 第一节 SUMMARY + 数据完整性检查 + 可逆映射表路径；
  末行逐字 `STATUS: ok PATH: .rlm-jobs/ca-rebound/matrix/I2/cdfa/out.md`，
  最后一条消息首行逐字重复该 STATUS 行。
