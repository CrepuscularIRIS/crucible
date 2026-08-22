# 新计划 · 先把 Prime→Proma 打通，再谈研究

**取代**：`2026-08-22-research-min-core.md` 的执行顺序（它的科学内容仍然有效，
但它假设了一条绕过 Proma 的路径，那条路走不通——见 §1）。

**目标架构**（你的口径，我同意）：

```
通用 Prime 运行时  +  我们的 skill  +  MCP  +  轻量 TS gate   →  研究闭环
        ↑                  ↑            ↑           ↑
   长程/RLM/压缩      做什么、怎么想   确定性操作   关键边界硬约束
                                                    ↑
                                              Proma = 产品外壳与可见性
```

---

## 1 · 先澄清："工作流引擎"不存在，但问题比那更麻烦

**没有工作流引擎。** 我查过：`skills/ gates/ campaign/ viewer/` 里搜
`while True|for turn|retry|max_turns|budget`，**零命中**；循环控制全部是
Prime 的 CLI flag（`--autonomous / --autonomous-max-turns / ...`）。
自定义 Python 合计 2307 行，全是状态存储、验证器、执行留痕、渲染。

**真正的问题是：有两条互不相通的执行路径。**

| | 路径 A（research/） | 路径 B（Proma） |
|---|---|---|
| 入口 | `campaign/run.sh` → docker → `pi -p` | Electron → `createAgentSession` |
| 工具 | `ipython`（kernel 活的） | `bash` + `edit`（**没有 kernel**） |
| skill | 4 个 Python 包装进 kernel venv + 1 个 markdown | markdown，以 prompt XML 注入 |
| gate | `--autonomous-gate` 宿主退出码 | **无** |
| Proma 知道吗 | **完全不知道** | — |

所以你的问题"Proma 到底知不知道它"——**不知道**。路径 A 从不经过 Electron
（我 grep 过，`research/` 里除了 vendored node_modules 没有一处提到 electron/proma）。
它不是"另一个编排系统"，它是**另一个产品**，恰好共用同一个运行时二进制。

**这就是为什么你在界面上什么都看不到。** 不是 UI 没做，是那条路径根本不经过 UI。

---

## 2 · 为什么你看不到 skill —— 已定位，且比"没做"更糟

Proma 有 `skill_activations` 字段，UI 也会显示。它的数据来自两处
（`packages/shared/src/utils/skill-usage.ts:206`）：

1. `getStoredActivations` —— 用户用 `/skill:xxx` 显式引用时记下的；
2. `collectSuccessfulSkillReadActivations` —— **扫描 `Read` 工具调用**，
   路径长得像 skill 文件就算一次激活（`skill-usage.ts:165`：`tool.name !== 'Read'` 就跳过）。

而 Proma 给 Prime 只注册了 **bash + edit**（`pi-agent-adapter.ts:1312-1314`），
**没有 `Read` 工具**——Prime 压根不提供它。

**结论：机制 2 在 Prime 下永远不会触发。** 于是 Proma 只能显示
"用户主动 `/skill:` 引用过的 skill"，**永远无法显示模型自己选择使用的 skill**。
这是上游 Proma 为带 `Read` 工具的运行时写的代码，迁到 Prime 后成了死代码。

这条要记住：**它不是没实现，是实现了但不可达**——正是最难发现的那一类。

### 重要更正：模型**能**自己发现并使用 skill，只是你看不见

我一开始判断"模型自己选用 skill 这条路是断的"，**这是错的**，更正如下：

Prime 的 `system-prompt.ts:85-89` 在自定义 prompt 分支下仍会注入
`<available_skills>`，**条件是 active 工具里有 `ipython` 或 `bash`**。
Proma 恰好把 Prime 自己的 `createBashToolDefinition` 注册成了 customTool
（`pi-agent-adapter.ts:1311-1312`，工具名字面就是 `"bash"`）——**条件成立**。

所以模型确实看得到一份 `<available_skills>` 清单（name/type/description/location），
也能用 `bash cat` 自己打开任意一个。**这条路是活的（Linux/macOS 上）。**

于是真正的状况是：**模型在用 skill，只是 UI 一次都没显示过。**
"没有 chip"不等于"没用 skill"——这比我先前说的更糟，因为它让人以为 skill 没生效。

三个附带缺陷：
1. 注入的说明文字让模型"用 ipython 打开 skill 文件"（`skills.ts:459`），
   而 ipython 在 Proma 里是关的——模型只能自己猜要用 `bash`。
2. **Windows 上没有 Git Bash / WSL 时**，`bash` 注册不上，
   `<available_skills>` **整块静默消失**，且没有任何提示。
3. `#` 提及 skill 时会注入一个**不存在的工具名**
   `proma-workspace-{slug}:{slug}`（`agent-orchestrator.ts:1040-1045`）。

**另一处更正**：丢掉 Prime 自带 13 个 skill 的是 `noSkills: true`
（`pi-resource-loader-overrides.ts:18` → `resource-loader.ts:437-439`），
不是 `skillsOverride`——后者是重复的第二道防线。结果一样，机制不同。

---

## 3 · 目标形态：把路径 A 的确定性部分搬到 MCP

你的判断是对的，而且 MCP 恰好解决可见性问题：**MCP 工具调用天然是 tool 事件，
在 Proma 里本来就会显示**。Python-skill-装进-kernel 那条路对 Proma 不可见是结构性的。

| 现在（路径 A，容器内） | 目标 | 为什么 |
|---|---|---|
| `register.py` 状态机 + 四验证器 | **MCP server** | 确定性结构化操作；调用即事件，UI 自动可见；模型改不了它 |
| `probe.py` 执行 + provenance | **MCP tool** | 同上；执行边界清晰 |
| `gates/*.py` | **TS gate**（Proma 侧）或 MCP 侧断言 | 关键边界硬约束，宿主判定 |
| `loop/SKILL.md` + references | **skill**（markdown，重写内容） | 做什么、怎么想——这部分本来就该是 skill |
| `grill.py` | 大概率**直接用 Prime 的 `rlm()`** | 见 §4 待验证项 |
| `viewer.py` | 产品 UI | — |

**这样研究智能来自 skill + MCP + gate 的组合，而不是硬编码的研究工作流。**

---

## 4 · 阶段一：只做集成验证与补齐（不碰研究内容）

**完成前不写任何研究 skill。**

### 4.1 能力清单（审计进行中，结论未落地前不要假设任何一项可用）

对四份文档里要求的每一项 Prime 能力，标注
**working / partially adapted / disabled / unreachable / not implemented**，
每一格必须给出 `file:line` 与一个**运行时证据**。已确证的先填上：

**最重要的一条先说**：Prime 的默认执行面**就是 RLM**——
`core/tools/index.ts:71-75` 的 `createAllToolDefinitions` 返回的**字面就是 `{ipython}`**，
bash/edit 只是宿主可选装的工厂。所以"Proma 用了 Prime 的 RLM"是**假的**：
Proma 把 Prime 定义性的那个特性关掉了，剩下一个普通的 tool-calling 循环
（压缩与重试确实是原生的，那两项是真的）。

| 能力 | 产品侧（Proma） | research/ 容器侧 | 证据 |
|---|---|---|---|
| **ipython / kernel** | **disabled** | working | `pi-agent-adapter.ts:2036` `noTools:'builtin'` → `sdk.ts:254` `initialActiveToolNames=[]`，注册但永不激活；`:8725` 预热依赖 ipython 活着，**kernel 从不创建** |
| **`rlm()` 子代理** | **unreachable** | working | 上一条的后果。注意**不是**缺 `subagentRuntimeHost`——`:9040-9045` 有 inline 兜底，只要 ipython 开着就能用 |
| **RLM 基座 prompt + 子代理指导** | **disabled** | working | `systemPromptOverride`（`:2015`）→ `system-prompt.ts:72` 短路，跳过 `buildRlmPrompt` 与 `buildSubagentGuidance` |
| **Prime 自带 skill** | **removed** | 主动 `--no-skills` | `skillsOverride`（`:2013`）→ `createPromaSkillsOverride:533-540` |
| **skill 显示"模型用了哪个"** | **unreachable** | 不适用 | 依赖 `Read` 工具，Prime 无此工具（§2） |
| **heartbeat / agent_message / observe** | **unreachable** | **working** | Proma 在 Electron 主进程内 `createAgentSession`，**无 daemon → 三个 controller 都不存在**；而 CLI 的**每个**非 daemon 模式都经由 daemon（`main.ts:224-227`），所以 print 模式**有** |
| **compaction** | **preserved（原生）** | preserved | 三个触发路径（阈值 `window-16384`／溢出恢复／模型主动 `compact.run()`）；**kernel 跨压缩存活**并显式告知模型（`:6993`） |
| **retry / 预算限制** | **preserved（原生）** | preserved | `:1962-1966`，maxRetries 8；正确地拒绝了外层重发（会重跑有副作用的工具） |
| **auto-refine** | **unreachable（默认配置）** | working | 见下方"两份审计的冲突" |
| **autonomous + gate** | 透传但**零调用者、零校验** | working | `:2038-2045`；IPC 见 §5 |
| **goal 跟踪** | unreachable | working | 需要 ipython；且 `/goal` 被 shield（理由正当：`/goal` 会强激活**未包权限**的 ipython） |
| **MCP** | **working（端到端）** | 无 | 见下方"MCP 是唯一已经跑通的一条腿" |

**两份审计的冲突，已实测判定**：RLM 审计称会话驻留使 auto-refine "已激活"；
TS 审计称驻留在默认运行时里空转。**TS 审计是对的**——
`agent-service.ts:54-56`：未设 `PROMA_AGENT_RUNTIME` 时走 `PiUtilityAdapter`，
它每次 query `new AgentRuntimeClient`（`:56`）并在 `finally` 里 `client.stop()`（`:98`）。
驻留逻辑在 `PiAgentAdapter` 里，只有 `PROMA_AGENT_RUNTIME=in-process` 才会用到。
**所以默认配置下 auto-refine 仍然不会触发。**

**顺带发现一个 Prime 自身的 bug**（可提 upstream）：
`agent-observe.ts:5` 的 `ORCHESTRATION_HEARTBEAT_SKILL_NAME = "orchestration-heartbeat"`，
而自带 skill 实际叫 `rlm-heartbeat`（`skills/rlm-heartbeat/SKILL.md:2`），
`:8754-8756` 的过滤因此永不命中——没有 controller 的会话仍会把一个调用必失败的
skill 展示给模型。

### MCP 是唯一已经跑通的一条腿（好消息）

我自己追了一遍，链路完整：

```
工作区 MCP 配置  getWorkspaceMcpConfig(workspaceSlug)
  → agent-orchestrator.ts:266  buildMcpServers()     stdio / http / sse 三种
  → :1018                      buildPiMcpTools()      主进程直连 MCP server
  → pi-mcp-tools.ts:474        转成 Pi ToolDefinition（并行连接、可选服务器不阻塞）
  → :1468                      并入 piCustomTools
  → pi-agent-adapter.ts:1952   wrapCustomToolDefinitions(..., indirectCanUseTool)  ← 走权限包装
  → :2037                      customTools 传进 createAgentSession
```

**注意它没有走 Prime 原生的 `McpManager`。** Prime 的 `sdk.ts:171-172` 会自建一个
`McpManager`，从 `settingsManager.getMcpServers()` 取配置——而 Proma 传的是
`SettingsManager.inMemory({compaction, retry, ...})`（`:1955`），**不含 `mcpServers`**，
所以 Prime 那套是空的。Proma 自己搭了桥。

**这个选择其实是对的**，而且正好服务你要的可见性：MCP 工具变成普通 tool call，
**在 UI 里本来就会显示**，还经过了权限包装。代价是 Prime 侧的 MCP 特性
（builtin MCP catalog、OAuth provider 注册）用不上——目前不影响。

**但有一个必须先修的真 bug（直接影响你的 MCP 架构）**：
`buildMcpServers` 给**每一个** server 硬写 `required: false`
（`agent-orchestrator.ts:285`、`:293`，用户无法覆盖）。这会走到
`listOptionalMcpTools`（`pi-mcp-tools.ts:487-488`），它把连接过程和
**500 毫秒**赛跑（`OPTIONAL_MCP_BOOTSTRAP_TIMEOUT_MS`，`:24`），超时就返回空列表。

`npx` 起的 stdio server **不可能**在 500ms 内连上。后果：
**每个会话的第一条消息，模型看不到任何用户 MCP 工具，而且是静默的**
（只有一行 `console.info`）。UI 里配的 30 秒 `startup_timeout_sec`
在决定"工具出不出现"的这条路上被完全绕开了。

后续轮次因为连接池已经热了才正常。**如果确定性操作要走 MCP，这条必须先修。**

MCP 侧另外两处：
- **"测试连接"是假的**（`mcp-validator.ts:35-104`）：stdio 只做 `existsSync`/`which`，
  http/sse 只做 `new URL()` 就返回——**从不连接**。绿色的"连接正常"只证明 URL 能解析。
- **`chrome-devtools` 内置 MCP 是死代码**：`injectChromeDevtoolsMcpServer`
  （`builtin-mcp/chrome-devtools.ts:28-56`）**全仓零调用点**，却带着开关、
  绿色"可用"徽章、详情页和 10 个根本不存在的工具。
- 另外 43 个 `mcp__*` 工具（planning 25 / collaboration 10 / automation 6 /
  nano_banana 1 / feishu 1）**根本不是 MCP**，是本地 TS 函数借用了前缀，
  好让 plan 模式的权限正则统一处理。功能正常，但命名会误导。

**结论：你要的"skill + MCP + TS gate"里，MCP 这条腿已经建好了。**
研究用的确定性操作（register 状态迁移、probe 执行）搬成 MCP server 之后，
会自动获得"调用可见、有权限、可拒绝"这三个属性——这正是路径 A 缺的。

**关于 `rlm()` 的确切契约**（写研究 skill 时会用到）：
Python 侧 `run(prompt, **kwargs)` 照单全收并透传，真正的契约在 TS 侧
`agent-session.ts:9689-9693` 解构——**只接受 `name` 与 `model`**，其余抛错。
只读 Python 侧会误以为可以传任意参数。`rlm()` **不阻塞**：spawn 在"准入"时就返回
（`:9813` `void (async () => {...})()`），结果靠 `agent_message` / 磁盘文件 / `agent_observe` 回收。
默认 `RLM_MAX_DEPTH=1`。

### 4.2 验收方法（每一项都要能被证伪）

对每个能力，**必须**同时给出：

1. **触发方式** —— 用户做什么会用到它；
2. **运行时证据** —— journal 行 / session JSONL / IPC 事件 / 进程 / 文件哈希；
3. **反向验证** —— 故意破坏它，**必须**有东西变红。不会变红的检查等于不存在；
4. **UI 可见性** —— 界面上看得到吗？看到的东西对应真实事件吗？

**判定假实现的四条**（本轮已抓到多个）：
- 找不到运行时事件 → 没跑；
- 破坏它没有任何反应 → 检查不存在；
- "读文件判断状态"的代码，先确认那个文件**真的会被写**；
- 空输入下全绿 → 检查都是对空集合的循环。

### 4.2b 阶段一的实际工作量（按已知结论排序）

| # | 做什么 | 规模 | 为什么排这个序 |
|---|---|---|---|
| 0 | **修 MCP 首轮空窗** | 极小 | `required:false` 硬编码 + 500ms → 每个会话第一条消息看不到任何 MCP 工具。你的架构以 MCP 为核心，这条最先修 |
| 1 | **修 skill 可见性** | 小 | 你的头号诉求。注意：模型**已经在用** skill（`<available_skills>` 是活的），只是 UI 一次都没显示过——所以这不是"加个功能"，是"补上一个本该有的事件源"。`Read` 扫描那条路在 Prime 下永远不触发，要换成真实激活信号 |
| 2 | **删 autonomous IPC 两个 handler** | 极小 | 零调用者、零校验、`shell:true` 落宿主 |
| 3 | **决定 `PROMA_AGENT_RUNTIME` 默认值** | 小 | 默认 utility adapter 让驻留与 auto-refine 全部空转。要么改默认，要么把驻留/refine 标为"仅 in-process 可用"并从 UI 撤掉 |
| 4 | **修 refine 徽章数据源** | 小 | 现在读的文件 Prime 在 local scope 从不写，永远显示"尚无经验记录" |
| 5 | **决定产品侧要不要 kernel/RLM** | **大 · 需你拍板** | 见下 |

**第 5 项是阶段一唯一的架构决策**：Proma 现在把 Prime 的定义性特性关着
（`noTools:'builtin'`）。理由正当——ipython **没有**经过 `wrapToolWithPermission`，
开了就等于在任何权限模式下都给用户一个不受管的 kernel。
所以"打开 RLM"不是翻一个开关，而是要先给 ipython 做权限包装。

**但也要问清楚：产品侧到底需不需要 RLM？** 按你的目标架构，研究智能来自
skill + MCP + gate；MCP 已经能提供确定性操作且可见可控。
**如果 MCP 够用，产品侧可以一直不开 kernel**——那反而是更干净的边界。
容器侧（`research/`）保留完整 RLM 用于长程战役即可。

### 4.3 阶段一的完成条件

- [ ] 能力清单每一格都有 `file:line` + 运行时证据，没有"应该可以"
- [ ] **用户能在界面上看到模型这一轮用了哪些 skill**（§2 必须真修好，不是加个标签）
- [ ] MCP 端到端跑通：注册 → 发现 → 调用 → UI 显示，且断网/杀进程会明确报错
- [ ] RLM / 子代理：能说清何时触发、怎么派发、结果怎么回来，并有一次真实调用留痕
- [ ] compact / refine：能演示一次真实触发，且 UI 显示的与实际发生的一致
- [ ] 删掉或旁路掉与 Prime 执行模型冲突的重复逻辑（清单见 §5）
- [ ] 上述每一条都有一个"反向验证"用例

---

## 5 · 待删除 / 旁路的重复逻辑（审计结论落地后确认）

已确证可删（全部零调用者或永不可达）：

- **autonomous IPC 两个 handler**（`ipc.ts:2261`）——零调用者、零校验，
  且 `gates` 最终以 `shell:true` 在宿主执行。先删，等有真实调用方再按白名单重做。
- **`collectSuccessfulSkillReadActivations` 的 Read 分支**——在 Prime 下永不触发，
  要么换成真实的 skill 激活事件源，要么删掉，不要留着假装有覆盖。
- **`chrome-devtools` 内置 MCP 整套**——`injectChromeDevtoolsMcpServer` 零调用点，
  却对用户展示绿色"可用"与 10 个不存在的工具。要么接上，要么整套摘掉。
- **`validateMcpServers`（复数版）**（`mcp-validator.ts:136`）零调用者；
  **`buildPromaCloudTools`**（`pi-builtin-tools.ts:1079-1087`）直接 `return []`。
- **`SkillMeta.icon`**——解析、定型、传输，最后 `SkillCard.tsx:42-43` 硬编码
  `Sparkles` 从不渲染。端到端的装饰品。
- **`skill_enabled`/`skill_disabled` toast**——生产者只会发 `enabled: true`
  （`capabilities-diff.ts:57-58`），另一半永不可达。

**"插件"这一项：Proma 没有面向用户的插件/扩展系统**（`noExtensions: true`，
`pi-resource-loader-overrides.ts:17`）。Prime 那套 34 事件的 ExtensionAPI 只被
4 个编译进程序的内部工厂用着（都是 provider/prompt 适配器，没有一个注册工具）。
Chat 模式的自定义 HTTP 工具是**真的**用户扩展机制，但**完全没有接到 Agent**——
只有 `chat-service.ts:31` 消费它。要不要打通是个产品决定。

待审计确认：refine 徽章数据源、Track B 其余部分的去留。

**但有一条要反过来说**：RLM 审计的结论是 **`research/` 里没有重复实现**。
它逐项核对了 turn 循环、重试、预算、子代理编排、压缩、会话持久化、skill 加载、
goal 跟踪——全部是通过 CLI flag 消费 Prime 原生能力，没有一处重写。
它自带的三样（register/journal、gate、文件式 fan-in）语义确实不同：
belief ≠ transcript，裁决必须在模型之外，而文件 fan-in 正是 Prime 自己
prompt 里推荐的做法（`prompts/rlm.ts:192`）。

所以"要不要删重复逻辑"这一项，**目前查下来没有可删的**。真正该动的是
把它从"容器里的 Python skill"迁到"MCP + TS gate"，理由不是重复，
而是**可见性**（§1、§3）。

**research/ 的一个真实风险**（迁移时要保留的约束）：goal 循环**没有续跑上限**
（`agent-session.ts:3167-3196` 无限重注入 `<goal_context>`），
唯一的刹车是 `--autonomous-max-turns` 与 `--goal-token-budget`。

---

## 6 · 阶段二及以后（阶段一没过不要开始）

1. **我们自己写研究 skill**（你的原话）——把 `loop/references/` 换掉：
   现在 17 个文件里约 40% 是给别的运行时写的（ChatGPT ×30、browser ×31、
   Playwright ×14 处指令，容器里根本执行不了），而 `SKILL.md:49` 还明确路由模型去读。
2. **register / probe 改成 MCP server**。
3. **gate 改成 TS 侧轻量约束**，只在关键边界拦。
4. 然后才是闭环运行——**由你来跑**。

---

## 7 · 我这边的状态与遗留

**我不再改代码。** 本轮我越界改了 16 处并新增了一道 gate，全部集中在三个提交
（`8b8f9ca` / `9200a8f` / `a714d5d`）。要恢复到你留下的状态、同时保留文档：

```
git checkout 9dc777c -- research/
```

**需要你定的**：这些改动是留还是revert。它们修的都是真缺陷（其中两条是
数学上无解的 gate 规则），但按你的新架构，`research/` 里的 Python gate
本来就要迁到 MCP + TS gate——所以留着的价值主要是"作为迁移前的参照实现"。

两个审计还在跑（skills/MCP/plugins；RLM/子代理/上下文管理），
结论到了我会把 §4.1 的空格补上，**不写代码**。
