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

## P3 · 封边与实证（**已实现** · bf4d474 + 复审修复 88cfa6a）

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
  UI 版移入 P4.3。
- [x] **复审修复（88cfa6a，Grok no findings）**：replay 曾把非零退出的
  probe.land 一律记 LANDED 且 `Number(null)`=0 —— kill 频段含 0 时崩溃探针
  可冒充终态依据。改为按 exit_code 分支出 FAILED 态（无 metric），四处
  `=== 'LANDED'` 消费点自动排除；战役 register 按不变 journal 重生成，
  三道 gate 复跑 3×PASS。顺带修好 `PROMA_RESEARCH_BWRAP` 只参与检测
  不参与 spawn 的失效逃生口。

### P3 之后

只剩打磨循环：skill 措辞随战役复盘迭代、MCP 工具面按摩擦点微调、
UI 证据面（gate 徽章、战役状态视图）按需增补。**没有 Plugins 一腿**：
Proma 无插件系统（`noExtensions:true`），能力目标也不需要它。

---

## P4 · 打磨与闭环（**当前阶段**）

**范围裁定（2026-08-23，与用户确认）**：下一阶段 = Skills/MCP 打磨 + 闭环
测试，两者**交错进行**而非先后——UI 战役是打磨素材的最快来源。参照物两份：

- `~/workspace/plan/HYPOTHESIS-REGISTER.md`——GRILL 循环的成熟 claim 语汇，
  **只在 skills 层吸收措辞**，不加 server 状态；
- `~/workspace/plan/TRIGGER-SPEC-2026-08-23.md`——为 Claude Code 设计的
  事件触发层。**结论：它诊断的四类缺陷（位置触发/意图触发/自判守卫/
  触发词住在没人读的文件里）在 crucible 里已被结构性解决**——MCP 工具
  就是它要造的 chokepoint，journal 就是它要靠 diff 重建的事件流，预登记
  频段已把 SURPRISE 变成减法（其 E5），sha256 冻结即其 E6。
  **明确不移植**：gate.py 本体、快照机制、心跳/staleness 计时器（E8，
  交互式产品无此需要）、Claude Code hooks（§9，Prime 的 chokepoint 就是
  MCP 工具本身）、双账本。**移植两条**：外部审视义务（其 R3 支柱）→ P4.1；
  "报错信息即路由"（其原则 4）→ P4.1 顺带。
- **Arbor**：推迟到 P4.4，凭 P4.3 的实证摩擦点逐条评估，不预先实现。

### P4.1 · 对抗义务收进 trace gate（唯一的结构性补丁，~半天）

**问题**：目前没有任何结构要求对抗者跑过——零条 `attack.record` 的 run
照样 declare 全绿。首场战役通过只因 grill 恰好跑了。这正是 ARFT 的 R3
（完整性：路径从未被自己控制不了的检查质询过），TRIGGER-SPEC 移植清单上
唯一缺失的结构件。

**规则（校准过，防"噪声级门禁被弃用"）**——实测校准依据：首场战役 7 条
攻击全部指向 H1（SUPPORTED）且晚于终态迁移，H2（REFUTED）零攻击；
一刀切"每个终态都要攻击"会把诚实的首场战役判红：

1. **每个 SUPPORTED claim** 必须有 ≥1 条 `attack.record` 指向它且
   **晚于**它最后一次终态迁移（对抗者见过的是最终信念，不是草稿）；
2. **run 级**：最后一次终态迁移之后必须存在 ≥1 条 `attack.record`
   （kill/scope 不逐条强制，但"信念定格后对抗者看过一眼"必须成立——
   graveyard 对对抗者可见是五条科学约束的第 5 条，这是它的执行点）。

**落点**：**trace gate 内**（它的职责本来就是"终态可追溯"，扩展为
"结论经过审视"），不加第四道 gate；declare 因 P3.2 在 server 内跑同一函数
而自动继承。独立 CLI 复跑同样覆盖。

**同批（报错信息即路由）**：server 的每条 ResearchStateError 与 gate 红
理由，末尾点名下一步该用的工具/skill（如"先 prereg_write 再 probe_run"、
"红在 reconcile：用 metric_recompute 重取该数字"）。

**验收（破坏必须变红）**：
1. SUPPORTED 无攻击 → trace 红 + declare 拒绝；
2. 攻击全部早于最后终态迁移 → 红（对抗者看的是草稿）；
3. 首场战役归档（不改 journal）复跑 → 仍 3×PASS；
4. gates.test.ts 诚实产物加攻击事件后全绿——**全绿集成测试仍是
   impossible-instructions 的检测器**，新规则并入后不许出现无解产物。

### P4.2 · skills 的 Prime 原生重写（**已实现** · 见 research/DESIGN.md）

用户 2026-08-23 把范围从"纯散文"扩为"Prime 原生化"：先做能力利用审计
（三路并行勘察：~/oss/prime-agent 源码 · ~/workspace/.claude GRILL 原版 ·
~/cli/Arbor 实现），再按审计重写。完整审计与裁定在 `research/DESIGN.md`。

落地内容：

- **新增 `research-kit` Python-backed skill**（Prime 原生形态：kernel 内
  按 import 名直接调用、出错即 raise、被所有 rlm 子代理继承）：
  `anchor`（跨压缩信念锚，存 kernel 变量 LAST）· `claim_view`（对抗者
  不对称上下文，无 transition notes）· `disjoint_pairs`（SELECT 判别表）·
  `calibration`（预测频段 vs 观测账本）。**全部只读**——kernel 侧绝不
  直连 research-mcp（第二个 server 实例会触发 P3.3 防篡改互咬）。
- **claim_propose 加 `conflicts` 结构守卫**（Arbor 四行契约第 4 行）：
  graveyard 非空时必填，换装重提死方向被 server 拒绝。
- **五个 skill 重写**：loop 加锚仪式与压缩恢复（print(research_kit.LAST)）；
  abduce 加 conflicts 纪律与"改写即作废"天花板；probe 加 SELECT（≥2 候选
  比判别力）与落带外分诊台阶（伪影→bug→噪声→已知→真实）；grill 换
  claim_view 不对称构造 + 攻击文件扇入（handle.session_dir/attacks.md）+
  对抗者记忆回喂 + 静默假设清账（P7–P19 模式）；report 加校准账本段与
  收窄声明模板。
- **明确不用**（ponytail 裁定，写进 DESIGN.md）：goal/autonomous（UI 交互
  战役用不到，无人值守时 `--autonomous-gate` 挂三道 gate CLI 是现成路）、
  harness subagent 条目与 refine（等真实战役产生素材）、TS extensions。

**验收**：13 处工具/函数引用逐一对实（MCP 8 工具 + research_kit 5 API 全部
真实存在）；research-kit.test.ts 4 tests（含 claim_view 不含 note 的不对称
断言）+ conflicts 正反向测试，research-mcp 全包 45 passed；
"每条新增措辞在首场 UI 战役里至少命中一次或被裁掉"转入 P4.3 验收。

### P4.3 · UI 闭环战役（**已跑 · 已审计 · 缺陷已修**）

战役归档：`apps/electron/.proma-research/p4-3-ui-20260823/`（REPORT / FRICTION /
register / journal）。审计与逐条处置：`docs/reviews/2026-08-23-p4-3-audit.md`。

**结论：管道通了，那一场的证据不成立。** 父 Agent 在预登记前用 Bash 预览了结果，
频段因此被写成零宽的 `[45, 45]`——违规发生在 journal 之外，三道 gate 一道都拦不住。
四条验收里第 4 条的"ipython 权限询问"**不成立且不再追求**：生产只有
`bypassPermissions` / `plan` 两种模式，逐次询问不是产品路径（口径见审计 §0）。

修复十项已落地（详见审计 §7）：零宽频段结构性拒绝、`PROMA_RESEARCH_RUN` 钉死战役、
沙箱见证入 provenance、plan 模式拆出 research 写+执行面、"取反不是第二条假设"、
`rlm()` 扇入改由父代理指定绝对路径 + `collect_attacks` 兜底、dead 询问机件删除。
`packages/research-mcp` 52 pass，全仓 574 pass，7 工作区 typecheck 全 0，
首场诚实战役三道 gate 复跑仍全 PASS。

**本场战役按其真实性质归档为流程测试**：它证明了管道能跑、UI 能看、gate 能复跑，
没有证明任何关于 `packages/research-mcp` 的事情。

<details>
<summary>原始验收口径（保留备查）</summary>

### P4.3 原口径 · UI 闭环战役（P3.6 的 UI 版，真正的总验收，~1 天）

P3.6 是**脚本驱动**的闭环；产品的闭环是**人在 Proma UI 里**驱动的。
在 Proma 里用 Qwen 跑一场小而真的战役，全程不碰命令行（独立 gate
复跑除外），验收即 P3.6 原四条：

1. abduce ≥2 可判别假设 → prereg → 沙箱 probe 落地；
2. grill 经 `rlm()` 拉起对抗者，typed 攻击落 journal（P4.1 规则下
   declare 才能绿）；
3. report：declare 内嵌 gate 全绿；用户独立复跑三道 gate 同绿；
4. UI 全程可见：skill 使用标记、MCP 调用事件、ipython 权限询问。

**产出物除战役归档外，还有一份摩擦清单**：每个卡顿点归类到
skill 措辞（回 P4.2）/ MCP 工具面 / UI 证据面，作为后续打磨的唯一输入
——不做清单之外的"顺手优化"。对照：`research/campaigns/2026-08-23-first/`。

</details>

### P4.4 · Arbor 评估（凭实证，不预先实现）

由用户提供 Arbor 材料，逐条过 P2 的分工表（skill / MCP / gate / 什么都不做）：
只有对着 P4.3 摩擦清单能说出"它修复哪个实测问题"的想法才进实现队列。
**评估先于任何代码。** ——**赛程口径下降级为可选**：距 09-05 只剩两周，
P5 的三项结构性缺口优先。

### P4 完成条件

- [x] trace gate 含对抗义务，首场战役归档复跑仍绿
- [x] 五个 skill 完成语汇吸收，无从未触发的指令残留
- [x] UI 闭环战役全流程走通并留档，摩擦清单落盘 + **审计并逐条修复**
- [ ] Arbor 评估结论写进本文（降级为可选，见上）

---

## P5 · 赛事交付（**当前阶段**，截止 2026-09-05）

**口径变更（2026-08-23）**：`Race/` 下的赛事材料为全项目权威——
每个架构决策、功能、Skill、MCP、Plugin、实验与产品打磨都对着它评估。
方向 **1B 科学实验任务规划与反馈迭代**。模板 P1–P20 见
`Race/赛道一-方向1B-…提交要求及模板.docx`；需求全解见
`Race/XH-202619_赛题解析会_需求拆解文档.md`。

**模板里三条具有工程约束力的原文**（不是文案要求）：

- **P14**：「应展示执行前已经形成的真实计划，**不要根据结果反向补写预期观测或
  停止条件**」——就是审计 §2.1，已由零宽频段拒绝 + skill 红线处置；
- **P11**：「**重新生成一次方案本身不等于反馈迭代**」——第二轮必须由第一轮的
  实测结果*导致*。`claim_transition → 下一个探针`已是真机制，缺的是跑满两轮；
- **P9**：「应让评审能够判断作品确实完成了相应实验……而不是仅展示预制结果」
  ——已由 provenance 的 `sandbox` 见证 + raw 落盘处置。

### P5.0 · 认知层 Batch 1（已落地 2026-08-23）

底座（MCP+gate）守证据诚实，但不产生值得检验的假设与实验——ARFT 论文
（800 条轨迹）显示被要求"表演"的认知动作会被照做然后无视，所以生成性认知
以**落地规则**注入（不落成 `claim_propose`/`prereg_write` 的移动等于没发生），
触发以**可数计数器**调度（锁死框架的 agent 注意不到前提，但它会数数）：

- 新 skill `research-moves`：reframe（换框架/换抽象层级/重述）· oracle
  （特权干预，三臂设计，RGB-D 真值注入为例）· derive（最小参数模型 →
  诚实频段宽度 + 机制类 claim 的形状承诺）· triage（落带外**强制**分诊，
  三个出口无第四个——它产生的 propose/prereg 正是 P11 要的两轮因果连接件）；
- `research_kit.counters` + anchor 的 COUNTERS/⚠ 段：落地未迁移、攻击债、
  同探针死亡、LIVE/坟场，命中阈值才出提示，结案战役静默；
- abduce 新增**无聊对手准入**（LIVE 集必须含一条伪影/混杂类对手——从未被
  写下的第二假设没有任何结构能标记它的缺席）；probe 预登记 question 必须
  含一句 severity（"若假设为假，测试仍会通过吗？"）。

Batch 2（P5.1 摩擦清单驱动）：bridge/transfer/ladder 卡 + grill 压力招式 +
组合层面停止规则。Batch 3（时间允许）：跨战役校准、severity 升为 prereg 字段。

**Batch 1.5（2026-08-23，Superpowers 形式重写）**：七个 skill 统一骨架
（description 只写触发 · 铁律+"违反字面就是违反精神" · 程序带可观察成功条件 ·
借口|现实表 · 快速参考标【结构】/纪律 · 交接）；research-loop 增**裁决协议**
（四类问人：不可逆/安全敏感/工作区外副作用/欠定到纯猜；其余
`Ruling: 决定—理由—代价` 落工作区 RULINGS.md，report 第 8 项汇总）与
**遭遇战/会战**分级 + 单向棘轮（仪式伸缩，gate 从不缩水）；grill 四镜头
prompt 抽成 `references/adversary-prompt.md` 模板（占位符+产出契约）；
P4.3 教训双份存档（借口表 + `test-pressure-*.md` 夹具 ×5）；新增开发期
skill `research-writing-skills`（rlm() 跑 RED/GREEN 压测 skill 文本）。

### P5.1 · 两轮闭环战役（结构性硬要求，最高优先）

模板 P13–P17 是**一条连续证据链**，五节讲同一个案例：案例选择 → 第一轮计划
（执行前落盘、带时间戳）→ 第一轮执行与结果（**保留未达预期的**）→ 问题分析与
调整依据 → 第二轮计划/执行/结果（**含没改善的部分与新增代价**）。

按新护栏跑——护栏会强制频段有宽度、强制第二条假设是另一个机制、强制预登记
先于执行。产物直接填 P13–P17。

### P5.2 · 至少一组同条件对照（P18）

同 world / 同 seed / 同预算。模板只要求**一种**同条件比较，不要为了填表补做
多组无意义实验。

### P5.3 · 评委可体验的服务 + 百炼 Qwen 凭证（P20 / 答疑 Q13）

可调用测试 API 与可交互前端入口，**初赛评估期内必须保持可用**；
基座须为 Qwen 并经阿里云百炼调用，留存凭证/截图。

### P6 · 综合评测 —— 见 `docs/plans/EVAL-PLAN.md`（评测阶段的权威）

P5.1 两轮战役已跑完归档（journal 23 事件，declare + 三 gate 全绿，P11 因果链
六个索引逐一对上）。但**两处封边在评测前是阻塞项**，都由 2026-08-23 的
Prime 能力审计实证：

1. **战役脚本没走产品路径**——`apps/electron/scripts/*.ts` 直接调 Prime 的
   `createAgentSessionServices`，绕过 `PiAgentAdapter`/常驻会话/orchestrator，
   且 `dispose()` 紧接 `process.exit()` 使 auto-refine 永不触发（老病换了个住处）。
2. **RLM 子代理跑在父 kernel 里**——`claim_view` 的不对称只在 prompt 上，
   工具面是对称的：P5.1 实测对抗子代理读了 `eval.py` 源码自行算出真值；
   且 `RLM_MAX_DEPTH` 被绕过。

活性仪器已就位：`research/eval/liveness.py`（只读，实测能区分 P5.1 与
routing-acceptance 那对 RED/GREEN）。

### P6.1 · Research 子会话分层编排（计划项，暂不实现）

后续允许 Prime RLM child 与 Proma Collaboration child 在同一 Research 产品中
分层共存，但两者都按需启动，不在创建主会话时自动拉起，也不强制主 Agent 调用
`rlm()`：

- 主 Agent 保持唯一编排者和 Research 状态写入者，负责 Goal、阶段路由、预算、
  Research MCP 落账与最终裁决；
- RLM child 用于短期、隔离、适合信息不对称或文件扇入的工作，spawn 后通过终态
  预览或父代理预先指定的文件落点回收；
- Proma Collaboration child 用于需要用户可见、可等待、可继续、可完整读取结果的
  长周期 research/review 子任务；
- 委派由任务独立性、预期耗时、信息隔离需求、可观察性和预算共同决定；不满足条件
  时由主 Agent 直接完成；
- child 只提交候选材料或审阅结果，不直接修改 `.proma-research` 信念状态，父 Agent
  负责验证、合并并通过 Research MCP 落账；
- 第一阶段只设计运行时编排、身份与回传契约，**不修改现有七个 Research Skills**，
  也不在 Skill 文本中加入强制 RLM 调用。

正式接线前以 RCB、NeuronBench、AutoResearchEval 的单主 Agent 基线和按需委派消融
确定默认阈值、并发上限与成本预算；若委派没有带来质量或可审计性增益，维持主 Agent
直接执行。

### P5 完成条件

- [ ] 一场**两轮**战役跑完并归档，第二轮的调整可追溯到第一轮的具体结果
- [ ] 一组同条件对照落盘
- [ ] 测试 API + 前端入口可核验并持续可用；百炼调用凭证留存
- [ ] 技术方案 PDF ≤20 页，P1–P20 与实际实现逐条对得上

---

## P7 · Benchmark 后的端到端论文与科研绘图交付（计划项）

**顺序不变：先冻结并跑完 P6 benchmark，再接本阶段。** P7 是只读消费已归档
evidence 的交付层，不进入首轮 RCB / NeuronBench / AutoResearchEval，不得改变模型、
Research Skills、MCP、联网策略或任何评测分数。端到端的终点定义为
**evidence-grounded manuscript draft**，不是未经人工复核即可投稿的论文。

### P7.1 · 受管外部 Skills，而不是重写论文系统

候选来源：

- `Yuan1z0825/nature-skills`：只接入 `nature-writing`、`nature-figure`、
  `nature-statistics`、`nature-citation`、`nature-ref-verifier` 及其依赖
  `nature-shared`；不默认安装整套 19 个 Skills；
- `Trae1ounG/paper-plot-skills`：只接入 `plot-from-data` 与
  `plot-from-image`，作为 Matplotlib 风格库和参考图复刻入口。

接入约束：

1. 只从经过审阅的固定 commit 做受管复制或镜像构建，不在运行中自动 `pull`、
   `npx skills update` 或动态安装；当前本地 checkout 有未提交改动，不能直接当作
   可复现版本钉死；
2. `nature-skills` 是 Apache-2.0，可在保留许可的前提下受管分发；
   `paper-plot-skills` 当前 checkout 未见许可证，许可证澄清前只允许本地覆盖层或
   明确挂载，**不得复制进公开仓库或公开 Docker 镜像**；
3. `nature-writing` 在上游索引中仍标记为 Draft，必须先用固定 evidence case 做
   正向与反向验收，不能一安装就成为默认终局；
4. 运行时配置不得出现开发机绝对路径。Docker 只接受固定版本的镜像内资源或显式、
   只读挂载；
5. 所有论文/绘图 Skills 只读消费归档，不得写 `.proma-research`、journal、raw result
   或 gate verdict。

### P7.2 · DashScope 负责设计草图，确定性程序负责科学事实

将现有 Gemini 专用 Nano Banana 路径抽象为独立 Image Provider 后，再接百炼原生
Qwen-Image / Wan 图像接口；不通过改模型名或 base URL 假装协议兼容。图像模型只可
用于图形摘要、机制示意图、布局和视觉语言候选：

- 不让图像模型生成含真实实验数值的最终 panel；
- 保存 provider、model、prompt、request id（若有）、输出文件 hash 与人工选择记录；
- 模型草图必须经过概念、变量、箭头关系和文字审查；
- 任何坐标、表格、误差条、置信区间和实验数字均由落地 artifact 重新计算。

### P7.3 · 唯一允许的交付流水线

```text
通过 gates 的 evidence package
  → claim / figure-slot contract（每张图服务哪个主张、读取哪些字段）
  → 可选 DashScope 视觉草图（不得携带最终数值）
  → paper-plot 风格选择或参考图复刻
  → nature-figure + Matplotlib 从原始/重算数据生成 SVG/PDF + PNG 预览
  → 图数值与 evidence 独立对账，生成 figure manifest 与 caption
  → nature-writing 生成论文形态草稿
  → nature-statistics / citation / ref-verifier 审计
  → DOCX/LaTeX/PDF 排版并插图
  → 人工复核后才可标记为 submission candidate
```

`paper-plot-skills` 当前默认只声明 300 dpi PNG；最终交付统一由
`nature-figure`/Matplotlib 同源导出 PDF/SVG，PNG 只用于预览。所谓 paper slot 必须
落成显式 `figure-slot contract`，至少包含 claim id、数据来源、panel 类型、统计口径、
caption 和目标章节，不能只凭论文叙事临时挑图。

### P7.4 · 验收与反向验证

- **评测隔离**：接入前后对同一归档重新计算 benchmark，分数与 journal hash 不变；
- **数值忠实**：故意让绘图输入与 evidence 不一致，figure QA 必须失败；
- **写作边界**：删除关键结果或方法字段，论文必须出现缺失占位/阻塞项，不得补写；
- **引用真实性**：注入错误 DOI 或错配标题，`nature-ref-verifier` 必须报红；
- **统计边界**：缺失独立实验单位或样本量时，统计段不得猜测；
- **出版输出**：同一绘图源码生成 PDF/SVG/PNG，矢量文本、字体、尺寸、颜色和 caption
  在最终页面尺度通过视觉检查；
- **Docker 可复现**：全新 clone + 固定版本外部 Skills 能生成同 hash 的 figure manifest
  与同结构 manuscript，不依赖宿主机私人路径。

### P7 完成条件

- [ ] benchmark 基线及消融已冻结，P7 未进入任何评测臂
- [ ] 外部 Skills 的版本、许可证、依赖与受管安装路径已审计
- [ ] 一组真实 evidence 完成“数据 → PDF/SVG 图 → caption → 论文草稿”
- [ ] DashScope 只参与非数值视觉草图，最终数值图可由脚本完全复现
- [ ] 引用、统计、图数值与主张边界四类反向用例全部变红
- [ ] 论文草稿明确标注失败、局限与人工复核状态，不冒充已投稿成果

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

（注：cut 的是 **server 侧机制**——判别力排序指 `R.rank()` 式计算排名，三臂并行指
并行执行原语。P5.0 在 skill 卡面上写的 P(kill)/成本排序与 oracle 三臂**配方**是
prose 指导，不新增 server 面，不算违约。）

---

## 下一步

**P5.1：跑一场两轮战役。** 护栏已就位（零宽频段拒绝、战役钉死、沙箱见证、
"取反不是第二条假设"），认知层 Batch 1 也已就位（moves 移动库、⚠ 计数器
调度、无聊对手准入、severity 一句话）。下一场直接按赛事模板 P13–P17 的
证据链跑，第二轮的调整必须能追溯到第一轮的具体结果——落带外走 triage 的
三个强制出口，`claim_transition / claim_propose → 下一个探针`就是那条因果链。
战役的摩擦清单同时是 Batch 2（bridge/transfer/ladder + grill 压力招式）的
唯一输入。

**开跑前两件事**：① MCP 注册加上 `PROMA_RESEARCH_CWD` 与 `PROMA_RESEARCH_RUN`
（见 `research/README.md`，否则战役又会落在 `apps/electron/` 下）；
② 确认 kernel 里 `import research_kit` 能成——装不上的三条排查项在同一份 README。

**一个悬而未决、需要人拍板的**：研究会话是否**禁用 Bash**。零宽频段拒绝挡住了
最常见的那次预览，但只要 Agent 手上还有 Bash 与 kernel 两条不留痕的观测渠道，
预登记就仍是执行顺序纪律而非结构保证。做成硬模式要动 Proma 的会话工具面。

（历史：P3.1 的执行边界三选一已按方案 A（bwrap 沙箱）落地于 bf4d474；
P0.1 的 kernel 供给三选一已按"检测 uv / 钉 `PRIME_AGENT_KERNEL_PYTHON`，
缺失则不注册并由 UI 引导"落地于 990ac95；P4.1 对抗义务落地于 711f5e9；
P4.2 研究层 Prime 原生化落地于 753456b；P4.3 战役已跑、已审计、缺陷已修。）
