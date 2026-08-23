# 唯一权威计划 · Prime 原生优先，研究层做成 skill

**本文是唯一权威计划。** 此前的全部计划与上一版研究运行时已归档到
`archive/2026-08-22-superseded/`（含 `research/` 整个目录与五份计划文档），
**不再使用**；那里的 README 记下了重建时要带走的五条科学约束与三个教训。

仍然有效、未归档：`docs/reviews/2026-08-22-implementation-review.md`（失败模式）、
`docs/product/{Fable5,PrimeAgent}.md`（能力目标）。

`docs/product/PrimeAgent.md` 与 `Fable5.md` 保留为**能力目标**，不是实现蓝图：
只对齐面向用户与 agent 的能力，不复刻内部细节。

---

## 0 · 架构（一句话）

```
Proma 前端  +  Prime 运行时（原生能力尽量全开）
      ↓
  研究 skill / 专职 agent      ← 阶段、流程、编排全在这里，用自然语言表达
      ↓
  MCP 工具                     ← 需要确定性执行的部分（Python/TS 都行）
      ↓
  少量硬 gate                  ← 只在必须有硬保证的边界上
```

**最高原则：能复用 Prime/Proma 已有的，就不要重写。**
判断标准只有一条——**这件事 Prime 是不是已经做了**。是，就用它的；
否，才轮到 MCP；MCP 也不合适（需要否决权），才做 gate。

---

## P0 · 把 Prime 完整适配进 Proma（**已实现** · 990ac95 / a272a68，运行时证据补齐见 P3.4）

现状一句话：**Proma 现在把 Prime 定义性的特性关着在跑。**
Prime 唯一的内置工具是 `ipython`（`tools/index.ts:46-47`，`allToolNames = new Set(["ipython"])`），
文件编辑、子代理、goal、MCP、skill 装载全是在那个 kernel 里跑 Python。
Proma 传 `noTools:'builtin'`（`pi-agent-adapter.ts:2036`）把它关掉，
于是 kernel 从不创建，RLM 整条链不可达。

### P0.1 · 打开 RLM（本阶段的核心，其余都是它的配套）

**为什么现在不能直接开**：`ipython` **没有**经过 `wrapToolWithPermission`。
这正是 `/goal` 被 shield 的原因（`pi-agent-adapter.ts:1283-1286` 的注释说得很清楚）：
`/goal` 会强激活它，等于在任何权限模式下给用户一个不受管的 kernel。

**怎么开（已验证可行，且与现有做法同构）**：
`createIpythonToolDefinition(cwd, options)` 是 SDK 导出的
（`index.ts:246`，签名 `ipython.ts:619`），**形状与 `createBashToolDefinition` /
`createEditToolDefinition` 完全一致**——而后两者 Proma 早就注册成 customTool
并包了权限（`:1311-1314` → `:1952` `wrapCustomToolDefinitions(..., indirectCanUseTool)`）。

所以：

- **保留** `noTools:'builtin'`（让**未包装**的内置 ipython 继续不激活）；
- 把 `createIpythonToolDefinition(cwd, …)` 加进 `customTools` 数组，
  自动走同一条权限包装路径；
- **不要**去改 `allowedToolNames` / `initialActiveToolNames` —— 那条路绕过权限。

**kernel 供给是真正的成本项，必须先决策**（`kernel/bootstrap.ts`）：

- kernel 需要 **`uv`**；找不到时 Prime 会 `curl astral.sh | sh` 装它，
  **并在 readline 上交互确认**（`:551`）——Electron 里没有 TTY，这条路会挂；
- venv 落在 `~/.prime/agent/kernel-venv`（或 XDG data home，`:342-349`）；
- `PRIME_AGENT_KERNEL_PYTHON` 可以钉一个自带 ipykernel 的 python，**绕开 uv**；
- `bootstrap` 有 `reportProgress` 回调，**可以把首次装配进度显示在 UI 上**。

**三选一，需你拍板**：
(a) 随应用分发一个带 ipykernel 的 Python，设 `PRIME_AGENT_KERNEL_PYTHON`（体积大，最省心）；
(b) 检测 `uv`，缺失时用**我们自己的 UI**引导安装（绝不能让 Prime 的 readline 弹出来）；
(c) 只在检测到 uv 时才开放 RLM，否则功能降级并明确告知。
**我的建议是 (b)**：体积可控，且首次装配有进度可显示。

**证明它真的在跑**（缺一不可）：
1. 会话里出现名为 `ipython` 的工具调用，**且弹出权限询问**，拒绝生效；
2. `~/.prime/agent/kernel-venv` 被创建，进程树里有 kernel 进程；
3. 在 kernel 里定义一个变量 → 触发一次 compaction → 变量仍在
   （Prime 会显式告诉模型"kernel 跨压缩存活"，`agent-session.ts:6993`）;
4. `rlm("...")` 能拉起子代理并返回 `RLMSpawnHandle`。

**验收**：上述 4 条全绿；且**关掉权限**时 ipython 调用被拒。

### P0.2 · 恢复 RLM 的 prompt 侧契约

`systemPromptOverride`（`:2015`）让 Prime 走自定义 prompt 分支
（`system-prompt.ts:72`），**丢掉 `buildRlmPrompt` 与 `buildSubagentGuidance`**。
kernel 开了但模型不知道 `rlm()` 的契约，等于开了个空壳。

**做法**：把 Prime 的 RLM 段落**并入** Proma 的系统提示（用 `appendSystemPromptOverride`
或直接在自定义 prompt 里拼上），不要整段替换。

**`rlm()` 的真实契约**（写进提示时别写错）：
- 只接受 `name` 与 `model` 两个 kwarg，其余抛错（`agent-session.ts:9689-9693`）。
  Python 侧 `run(prompt, **kwargs)` 照单全收再透传，**只读 Python 侧会误判**；
- **不阻塞**：spawn 在"准入"时就返回（`:9813`）；
- 结果靠 `agent_message` / 磁盘文件 / `agent_observe` 回收；
- 默认 `RLM_MAX_DEPTH=1`。

**验收**：模型能在无人提示的情况下正确调用 `rlm()` 并拿回结果。

### P0.3 · skill 可见性（你的头号诉求）

**先纠正一个认知**：模型**一直在自己用 skill**。
`system-prompt.ts:85-89` 在自定义 prompt 分支下仍注入 `<available_skills>`，
条件是 active 工具含 `ipython` 或 `bash`——Proma 注册了 Prime 的 `bash`，条件成立。
模型看得到清单，也能 `bash cat` 打开。

**问题是 UI 一次都没显示过**：唯一能识别"模型自己用了 skill"的机制
（`skill-usage.ts:151-192`）靠扫描 `Read` 工具调用，而 Prime **没有 `Read` 工具**——
该分支永不触发。所以"没有 chip"≠"没用 skill"，这比没做更误导。

**做法**：换成真实信号。P0.1 之后 skill 由 kernel 侧 `python_import` / 文件读取触发，
应从工具调用事件里识别；在此之前至少识别 `bash` 打开 `*/SKILL.md` 的调用。
**不要**再留着 `Read` 那条死分支假装有覆盖。

**顺带修**（都是 1-2 行）：
- 注入的说明让模型"用 ipython 打开 skill"（`skills.ts:459`）——P0.1 后自洽，之前需说明；
- Windows 无 Git Bash/WSL 时 `bash` 注册不上，`<available_skills>` **整块静默消失**；
- `#` 提及注入了不存在的工具名 `proma-workspace-{slug}:{slug}`
  （`agent-orchestrator.ts:1040-1045`）。

**验收**：模型自主打开一个 skill → UI 出现对应标记；**故意让它不用** → 标记不出现。

### P0.4 · MCP 修到可依赖（研究层要靠它）

**必修的真 bug**：`buildMcpServers` 对每个 server 硬写 `required:false`
（`agent-orchestrator.ts:285`、`:293`，用户无法覆盖）→ 走 `listOptionalMcpTools`
→ 和 **500ms** 赛跑（`pi-mcp-tools.ts:24`）→ 超时返回空列表。
`npx` 起的 stdio server 不可能在 500ms 内连上，**每个会话的第一条消息
静默看不到任何 MCP 工具**，UI 里配的 30s `startup_timeout_sec` 被完全绕开。

**做法**：让 `required` 可配；或首轮改为等待 `startup_timeout_sec`；
或连接就绪后主动刷新工具表并在 UI 提示。

**同批**：
- **"测试连接"是假的**（`mcp-validator.ts:35-104`）：stdio 只 `existsSync`/`which`，
  http/sse 只 `new URL()`。要么真连一次，要么把绿标去掉——现在它在撒谎；
- **`chrome-devtools` 内置 MCP 是死代码**（`builtin-mcp/chrome-devtools.ts:28-56`
  零调用点）却显示绿色"可用"与 10 个不存在的工具。接上或整套摘掉；
- 43 个 `mcp__*` 本地工具（planning 25 / collaboration 10 / automation 6 / …）
  **不是 MCP**，是借前缀让权限正则统一。功能正常，但要在文档里说清，别自己也被骗。

**待查**：`mcp__collaboration__` 那 10 个工具是不是 Proma 自己的子代理机制？
**若是，它与 `rlm()` 职责重叠，必须二选一**（按最高原则：留 `rlm()`）。

**验收**：新建会话**第一条消息**里 MCP 工具即可用；杀掉 server 进程 → UI 明确报错。

### P0.5 · 运行时选择与长程能力

`agent-service.ts:54-56`：未设 `PROMA_AGENT_RUNTIME` 时走 **utility adapter**，
它每次 query `new AgentRuntimeClient` 并在 `finally` 里 `client.stop()`。
后果：**会话驻留与 auto-refine 在默认配置下全部空转**（驻留逻辑在 `PiAgentAdapter` 里）。

**做法**：定一个默认值。RLM 要的是常驻 kernel，**倾向默认 `in-process`**；
若保留 utility，则驻留/refine 必须从 UI 撤掉，不能显示一个不生效的功能。

**顺带**：refine 徽章读 `refinements.jsonl`，而 Prime 只在 **global scope** 写它，
Proma 调的是 local scope → **永远显示"尚无经验记录"**。改读 `harness_state.json`
或订阅 refine 完成事件。

**heartbeat / agent_message / agent_observe**：需要 daemon 侧的三个 controller，
Proma 在主进程内 `createAgentSession`，**没有 daemon → 三者都不可用**。
CLI 的每个非 daemon 模式都经由 daemon（`main.ts:224-227`），所以命令行有、产品没有。
**先判断产品到底要不要**——研究层若靠 `rlm()` + 文件回收，可以不要。

**验收**：单会话连续跑过 25 个 assistant 轮 → auto-refine 真触发且 UI 可见；
关掉应用 → 会话与 kernel 正确释放，无残留进程。

### P0.6 · 删死代码（避免下一个人再被骗）

零调用者或永不可达，**全删**：
`chrome-devtools` 整套 · `validateMcpServers`（复数，`mcp-validator.ts:136`）·
`buildPromaCloudTools`（`return []`）· `SkillMeta.icon`（解析传输却从不渲染，
`SkillCard.tsx:42-43` 硬编码 `Sparkles`）· `skill_disabled` toast
（生产者只发 `enabled:true`）· `skill-usage` 的 `Read` 分支（P0.3 替换后）·
**autonomous 两个 IPC handler**（`ipc.ts:2261`：零调用者、零校验，
`gates` 最终以 `shell:true` 落宿主执行）。

### P0 完成条件

- [ ] RLM 全链路可用：kernel 起得来、ipython **有权限包装**、`rlm()` 能拉子代理
- [ ] kernel 跨一次真实 compaction 存活（实测，不是推断）
- [ ] 模型自主使用的 skill **在 UI 上看得见**，且反向验证成立（不用就不显示）
- [ ] MCP 首轮即可用；连接失败有真实报错
- [ ] auto-refine 真触发一次且可见；运行时默认值已定
- [ ] 上述每一条都有**运行时证据**（工具调用事件 / 进程 / 文件），且**故意破坏会变红**
- [ ] 死代码清单已清空

---

## P1 · 清掉旧研究层

**`research/` 已归档**到 `archive/2026-08-22-superseded/research/`（已完成）。
那五条实测出来的科学约束与三个教训写在该目录的 README 里——
**代码不再使用，约束带走**，重建时它们会变成 skill 的写法与 MCP 的接口。

**还剩一件事**：Proma 里的研究专用逻辑（P0 阶段梳理时逐个标出并清掉）。
判断标准：只服务于旧研究流程、与通用 agent 能力无关的代码。

---

## P2 · 重建研究层 = skills + agents + MCP + 极少 gate（**已实现** · fb9bba6，两个关键缺口由 P3 闭合）

**顺序**：P0 验收通过之前不开始。（实际上 P2 先于 P0 证据补齐落地了——
2026-08-22 复审确认架构对齐，但 probe_run 宿主执行与 gate 无强制执行点
两项必须在任何真实战役之前修复，见 P3。）

### 分工原则（判断一件事该放哪）

| 它是什么 | 放哪 | 理由 |
|---|---|---|
| 该做什么、怎么想、找什么证据、按什么程序 | **skill** | 自然语言表达最合适，改起来最快 |
| 需要确定性、可重放、不能靠模型自觉 | **MCP** | 调用即事件（UI 可见）、可包权限、可拒绝 |
| 必须有硬保证、模型不得绕过 | **gate** | 宿主判定，退出码说话 |
| Prime 已经做了的 | **什么都不做** | 最高原则 |

### 阶段 → skill

一个研究阶段一个 skill，阶段间转移写在 skill 指令里
（`PrimeAgent.md` / `Fable5.md` 的六类动作是能力目标，不必逐条复刻）。
专职角色（如对抗者）用 `rlm(prompt, name=…)` 拉子代理，**角色定义就是它的 prompt +
它加载的 skill**——不需要另造 agent 注册表。

### 哪些必须落到 MCP（确定性，且只有这些）

1. **信念状态读写**：claim / probe 的状态迁移。gate 要检查的是**机器可读的状态**；
   状态若只存在于散文里，gate 就退化成"模型自己判自己"——那正是要防的失败模式。
2. **从原始文件重算指标**：永不采信报告里的数字。
3. **预登记落盘**：带时间戳与哈希，为"先登记后执行"提供根据。
4. **受认可的执行路径**：产出带 provenance 的结果。

**就这四类。** 其余一律先尝试用 skill 表达。

### 哪些必须是硬 gate（更少）

1. 执行之前存在预登记；
2. 报告里的数字与重算值对得上；
3. 终态结论可追溯到一次真实落地。

**旧实现的教训必须带过来**：gate 之间**不能互相矛盾**。旧的 review 要求
"每个 claim 都要有 verdict 行"，reconcile 又拒绝"任何无 artifact 的 claim"——
只要存在一个未检验的假设，报告在数学上就无解。
**通用防御：一个断言"所有 gate 对同一份诚实产物同时通过"的集成测试。**
旧的 10 个 gate 测试每个只跑一道、各自全绿，把三处矛盾全藏住了。

---

## P3 · 封边与实证（**进行中** · P3.1–P3.5 已完成，P3.6 战役演练见 research/campaigns/）

**现状**：P0/P1/P2 已实现（990ac95 · a272a68 · fb9bba6 · 99bc832）。
2026-08-22 复审确认：架构与目标一致，旧编排引擎无残留，五个 skill 引用的
工具全部真实存在，trace gate 是"捏造战役全绿"教训的直接解毒剂。
但两个关键缺口未闭合、P0 验收证据只有 2/5——P3 是"能对用户说这套系统
可信"之前的全部剩余工作。P3 之后只剩 skill/MCP 打磨与真实战役迭代。

**已拍板（2026-08-22）**：probe_run 执行边界三选一
（沙箱 / 逐次审批展示冻结命令 / 裸宿主+清环境变量）选 **方案 A —— 沙箱执行**。
本机已实测 bwrap 0.9.0 可用：只读根、清空环境、断网全部生效
（`bwrap --ro-bind / / --unshare-net --clearenv` 冒烟通过，写工作区被拒）。

### P3.1 · probe_run 沙箱化（红线修复，最高优先）

**问题**：`server.ts` 的 probe_run 用 `/bin/sh -c` 在宿主执行模型写的
evalCommand，且继承完整 `process.env`（含可能的密钥）。直接违反红线
"LLM 生成的代码绝不在宿主执行"。旧架构为此付出了整个容器；重建时丢了。
README 里的"预登记冻结 + 调用可见"是可见性，不是隔离。

**做法（bwrap）**：
- 沙箱契约：`--clearenv` 后只显式给 `PATH` / `HOME=/tmp` / `LANG` 三个 ·
  工作区 `--ro-bind`（只读——顺带让探针无法碰 journal/register）·
  tmpfs `/tmp`（探针的中间文件只能写这里）· `--unshare-net`（无网络，
  与命令纪律"无网络依赖"本来就一致）· `--unshare-pid --die-with-parent` ·
  超时上限（超时按非零退出处理，不落地）。
- **沙箱内零可写挂载**（除 tmpfs）：探针只需要 stdout，
  `raw/output.txt` 由 server 在沙箱外捕获落盘，探针自己不写 raw。
- **供给检测，fail closed**：与 RLM 供给检测同构——找不到 `bwrap` 时
  probe_run **结构性拒绝**并给安装引导（`apt install bubblewrap`），
  **绝不静默回落裸宿主执行**。非 Linux 平台同样拒绝，天花板写明。
  docker / GPU 直通（`--gpus`）是将来的扩展位，本阶段不做。
- **skill 同步更新**（防 impossible-instructions 复发）：research-probe
  的"命令纪律"写明沙箱契约——只读工作区、无网络、中间文件写 /tmp、
  结果走 stdout；probe_run 的工具描述同步说明。

**验收（破坏必须变红）**：
1. 探针内 `env` 看不到哨兵密钥变量（实测，不是推断）；
2. 探针写工作区 → 失败；`curl` → 失败；
3. 卸掉/藏起 bwrap → probe_run 结构性拒绝，而不是回落宿主执行；
4. 诚实探针照常落地，指标与沙箱前一致。

### P3.2 · gate 执行点收进 server（"硬"名副其实）

**问题**：三道 gate 目前只由模型按 report skill 的嘱咐自己跑——没有任何
结构阻止跳过或谎报绿。这正是 F2（有观测无更新），整套产品文档要防的就是它。

**做法**：
- `report_declare` 在 server 内直接调用三道 gate 的 TS 函数（同包导入，
  不起子进程）：任何一道红 → **declare 拒绝**并逐条给出理由；
  全绿 → 把 `gate.verdict` 事件写进 journal，工具结果里返回三道裁决。
- 独立 gate 脚本保留：用户/CI 的最终人工复核通道不变。
  research-report 里"自己先跑一遍"改为"declare 会替你跑，红了会拒绝；
  用户仍可独立复跑"。
- 全绿集成测试扩展：诚实产物（含未检验 LIVE 假设）declare 成功；
  四类篡改分别 declare 拒绝。**不许出现"declare 数学上无解"的产物**——
  这是 impossible-instructions 检测器的既有职责，扩展时一并覆盖。

### P3.3 · journal 会话内防篡改（提升下限，不假装是墙）

server 每次 append 后在内存记住 journal 的 sha256；每个工具调用先校验
当前文件哈希再干活，不符 → 全部工具拒绝并记 tamper 事件。
**天花板写进 README**：server 重启后基线重置（届时靠 trace 的逐字重放兜底）；
同用户进程终究能伪造一切——真正的墙是把 agent 本身关进沙箱，本阶段明确不做。
验收：工具追加 → 手改 journal → 下一个工具调用拒绝。

### P3.4 · P0 验收证据补齐（五项，缺一不可）

99bc832 的 e2e 只证明了 kernel 供给与真实 ipython 调用两项。按 P0 完成
条件补齐，每项都要正反向：

1. **权限拒绝**：UI 拒绝 ipython → 调用被拒；批准 → 执行；
2. **kernel 跨压缩**：定义变量 → 真实 /compact → 变量仍在；
3. **rlm() 真拉起子代理**：`await rlm(...)` 返回句柄、产出可回收
   ——research-grill 的全部根基，本项最高优先；
4. **auto-refine 真触发**：单会话 >25 assistant 轮 → refinement 事件出现
   且徽章可见；
5. **MCP 首轮可用**：npx 冷启动 stdio server，新会话第一条消息即列出其工具。

### P3.5 · 决策与小修

- **collaboration 工具 vs rlm()**（P0.4 遗留，不再悬置）：先查清 10 个
  `mcp__collaboration__` 工具的实际消费方——若只是 Agent 模式的子代理分发，
  与 rlm() 职责重叠，按最高原则**撤出 Agent 会话**（Chat 在用就留给 Chat）；
  若另有产品职责则写下结论。
- **graveyard 复活加结构约束**：`claim_transition` 迁回 LIVE 时要求非空
  `note` 点名新证据来源（目前只有 abduce skill 里一句散文）。
- **floor 谓词**（种子数/样本下限 → CONTESTED）：**明确不做**。
  在 research-report"存活假设"一节加一行诚实声明模板即可。

### P3.6 · 首场真实战役（P2+P3 的总验收）

前五项全部完成后，按 `research/README.md` 三步接线，在 Proma UI 里用
Qwen 跑一场小而真的战役，全程不碰命令行（gate 人工复跑除外）：

1. abduce 登记 ≥2 条可判别假设 → prereg（期间 server 至少拒绝过一次
   装饰性探针为佳）→ 沙箱 probe 落地；
2. grill 经 `rlm()` 拉起对抗者，attack_record 落 typed 证据；
3. report：declare 内嵌 gate 全绿；用户独立复跑三道 gate 同绿；
4. UI 全程可见：skill 使用标记、MCP 调用事件、ipython 权限询问。

对照基线：`archive/2026-08-22-superseded/research/artifacts/`（toy-2..9）。
**这一场跑通，"与 Fable5/PrimeAgent 能力目标功能等价"才从论证变成演示。**

### P3 完成条件

- [x] 红线恢复：模型写的命令只在沙箱执行，且缺 bwrap 时 fail closed
  （sandbox.test.ts 6 passed：哨兵密钥不可见/写工作区拒绝/断网拒绝/bwrap 缺失结构性拒绝/诚实探针照常落地）
- [x] declare 即裁决：不过 gate 的报告无法 declare
  （gates.test.ts：诚实产物 declare 成功且 gate.verdict 入 journal；幻觉数字/结论行造假/空 run 的 declare 被拒）
- [x] journal 会话内篡改会被工具拒绝（server.test.ts：手改 journal → 只读/写入工具全拒 + tamper 事件落盘）
- [x] 五项 P0 证据全绿（正反向都有）：
  1 权限 pi-ipython-permission.test.ts；2 跨压缩 & 3 rlm 拉起 & 4 auto-refine —— node scripts/p0-evidence.ts
  P0_EVIDENCE_PASS（E3 排障记录：探针 cwd 未 mkdir 导致子代理 kernel spawn ENOENT，脚本已修）；
  5 MCP 首轮 pi-mcp-first-round.test.ts（1.5s 冷启动首轮即列出，窗口不足时按可选项跳过）
- [x] collaboration/rlm 二选一有结论：collaboration 仅被 Pi 桥接（Agent 会话）消费、Chat 不用——
  已撤出 Agent 会话（注入块/目录条目/详情文案），文件与事件总线保留供历史 delegation 会话；
  子代理分发归 rlm()（决策注释在 pi-builtin-tools.ts）
- [x] 首场真实战役全流程走通并留档（FIRST_CAMPAIGN_PASS，node scripts/first-campaign.ts）：
  真模型 × research skills × 真实 stdio MCP 子进程 × bwrap 沙箱探针——
  2 假设登记 → 7 探针预登记执行落地（P1-P5 被沙箱如实拒绝，P6 落地）→
  2 终态迁移 → rlm 对抗者 7 条 typed 攻击 → report_declare 内嵌三道 gate 全绿 →
  独立 CLI 复跑 3×PASS。产物留档 research/campaigns/2026-08-23-first/
  （含模型对 P1-P5 失败的诚实归因与对抗者识破评测语义局限的 G2/G4）。
  UI 版待用户在 Proma 里按 research/README.md 三步接线复现。

### P3 之后

只剩打磨循环：skill 措辞随战役复盘迭代、MCP 工具面按摩擦点微调、
UI 证据面（gate 徽章、战役状态视图）按需增补。**没有 Plugins 一腿**：
Proma 无插件系统（`noExtensions:true`），能力目标也不需要它。

---

## 验证规则（贯穿全程）

任何"已完成"的声明必须同时给出：

1. **触发方式** —— 用户做什么会用到它；
2. **运行时证据** —— 工具调用事件 / 进程 / 文件 / 日志行；
3. **反向验证** —— 故意破坏它，**必须**有东西变红。不会变红的检查等于不存在。

**判断假实现的四条**（本轮全部实际命中过）：
- 找不到运行时事件 → 没跑；
- 破坏它没反应 → 检查不存在；
- "读文件判断状态"的代码 → 先确认那个文件**真的会被写**（refine 徽章就栽在这）；
- 空输入下全绿 → 检查都是对空集合的循环。

---

## 红线（不变）

人拥有：**密钥、花费、公开部署、force-push、`git push`**（未经要求不做）。

- LLM 生成的代码**绝不**在宿主执行；宿主侧永不执行模型写的代码；
- `.env` / `dash.md` 是活密钥：不得 `cat`/`tail`，输出必须打码；
- `:4003` 留在 `127.0.0.1`；web bridge 只绑 `127.0.0.1`，**永不** `0.0.0.0`；
- 不得修改或重启 `/home/lingxufeng/proxy/litellm/config.yaml`；`:4001` 是别的项目的共享网关；
- 不得暴露 `:4004` 与 web-bridge 到回环之外；
- 不得 fork Open WebUI；不得动 upstream `vendor/`；不得改 NeuronBench 评测代码；
- 不得让任何模型判断写 `accepted`；
- `~/ClawUI` 没有 git remote，**不要删**（112 个提交只存在于磁盘，tag `archive/specs-v1`）。

---

## 明确不做（cut list）

判别力排序 · 校准账本 · 陷阱世界 · ARFT 判官复跑 · 消融梯队 · 保留对手轮换 ·
三臂并行 · 哈希链 journal · 自定义 turn 循环/重试/预算（Prime 全有） ·
另造 agent 注册表（`rlm()` 够用） · 把 Chat 的自定义 HTTP 工具接进 Agent（除非明确需要）。

---

## 下一步

**P3.1：probe_run 沙箱化。** 方案 A 已拍板，bwrap 已实测可用（见 P3 开头）。
它是红线修复，先于其余所有 P3 项。

（历史：P0.1 之前悬置的 kernel 供给三选一已按"检测 uv / 钉
`PRIME_AGENT_KERNEL_PYTHON`，缺失则不注册并由 UI 引导"落地——
即当初的方案 (b)(c) 合体，990ac95 的 `pi-ipython-rlm.ts`。）
