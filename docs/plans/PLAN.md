# 唯一权威计划 · Prime 原生优先，研究层做成 skill

**本文取代并作废以下全部计划**：
`2026-08-22-research-min-core.md`、`2026-08-22-phase1-integration-first.md`、
`2026-08-22-hands-on-test-plan.md`、`HANDOFF-2026-08-22.md`、
`ARCHITECTURE-DECISION-2026-08-22.md`。
它们的**事实与审计结论**仍可查阅（尤其 `docs/reviews/2026-08-22-implementation-review.md`），
但**执行顺序一律以本文为准**。

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

## P0 · 把 Prime 完整适配进 Proma（**唯一的当前任务**）

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

## P1 · 删除旧研究层

**两侧都删**（这是你的决定，我只记录范围）：

- `research/`（整个目录：5 个 skill、4 个 gate、容器、viewer、artifacts 脚本）
- Proma 里的研究专用逻辑（P0 阶段梳理时逐个标出）

**保留**：`docs/reviews/2026-08-22-implementation-review.md` 与本文——
里面的**失败模式**是重建时最有价值的东西（尤其"四道 gate 曾对捏造的战役全绿"、
以及三次 impossible-instructions）。

**删除前先做一件事**：把旧实现里**经过实测的科学约束**摘成一页纸
（互斥频段、先登记后执行、从原始文件重算、终态必须可追溯到落地 probe、
攻击者必须看得到 graveyard）。**代码删掉，约束保留**——重建时它们会变成
skill 的写法与 MCP 的接口。

---

## P2 · 重建研究层 = skills + agents + MCP + 极少 gate

**顺序**：P0 验收通过之前不开始。

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

## 下一步（P0.1 之前唯一要做的事）

**kernel 供给三选一需要你拍板**（见 P0.1）：
分发自带 Python / 检测 uv 并用我们的 UI 引导 / 仅在有 uv 时开放。
定了之后 P0.1 才能动工——它是后面所有事情的地基。
