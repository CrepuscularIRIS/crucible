# 技能/插件的对齐要求

一个技能要进 Crucible，逐条过下面八关。**任何一关不过就不进** ——
不是"先装上再说"，工具面每多一个，模型选错的概率就高一分（29 个工具时实测它
跑去调 `TaskCreate` 而不是我们的科研角色）。

候选全集：`refs/skill-catalog.md`（机器扫出来的 436 个，未筛选）。
筛完的结果：`refs/skill-picks.md`。

---

## 关 1 · 许可证必须能用（**先查这个，别先读代码**）

扫出来的 31 个来源里，许可证分布如下（`scripts/skill_catalog.py` 自动读的）：

| 许可证 | 处置 |
| --- | --- |
| MIT / Apache-2.0 / BSD | ✅ 可采用、可随插件分发，保留 NOTICE 与出处 |
| **CC BY-NC（非商业）** | ⚠️ **只能本机用，MUST NOT 打进要分发的插件** |
| **无 LICENSE 文件** | ❌ 默认保留一切权利，不采用、不复制 |

已核到的两个坑，直接写在这里免得再踩：

- `academic-research-skills`（27 modes / 42 agents，本来是我的首选）
  —— **CC BY-NC 4.0**，作者 Cheng-I Wu。个人本机跑没问题；
  **打进参赛交付的插件里不行**，非商业条款在比赛这种场合是模糊地带。
  取舍：**借它的模式设计（modes 的切法），不复制它的文件。**
- `agent-research-skills`（31 个流程技能）—— **仓库里没有 LICENSE**。
  没有许可证 = 保留一切权利。同样只能读、不能抄进来。

## 关 2 · description 必须写清"什么时候用"

SDK 靠 `description` 决定要不要加载这个技能（`skills="all"` 时全量可见，
但触发与否看这句）。实测过：description 写成一句功能介绍而不是触发条件，
技能就永远不会被自己想起来。

**判据**：description 里能读出「用户说什么 / 出现什么情况」就该用它。
只写"这是一个做 X 的技能"的，改写或不收。

## 关 3 · 不和我们的 MCP 抢事实

分工是硬的：

- **技能管「怎么做」** —— 流程、话术、检查清单、格式规范
- **MCP 管「做了什么被记账」** —— 证据落库、假设裁决、沙箱执行、交付字段

所以：凡是技能里自带"证据存储 / 我判定它成功了 / 我来写结果数字"的部分，
**必须砍掉或改写**。裁决只能来自 `run_falsifier` 打印的 JSON，
结果只能来自 `run` 表（SPEC §8-2，Progress Mirage：54 个循环全自称有改进，
56% 实为零或负）。

## 关 4 · 工具面预算

一个工作区里同时可见的技能 **≤ 12 个**，MCP 工具 **≤ 20 个**。
超了就得砍，别指望模型自己分辨。这个数字来自实测（29 个工具时选错工具），
不是拍的。

## 关 5 · 不新开执行路径

技能 MUST NOT 引入第二条跑代码的路 —— LLM 生成的代码只在
`docker run --rm --network=none` 里跑。带 `code_interpreter`、
自建 sandbox、要求开 `terminal` 能力的技能，一律改写或不收。

## 关 6 · 领域要对得上

`scientific-agent-skills` 有 149 个，但大半是 qiskit / deepchem / pennylane
这类领域包。**与本课题（太阳耀斑预报 + 通用科研方法）无关的不收**，
哪怕它质量很高 —— 它占的是关 4 的额度。

## 关 7 · 不依赖我们没有的凭证

要额外 API key 的技能，除非那个 key 我们已经有（litellm / OpenAlex / Crossref
是有的），否则不收：装上去也是每次报错。

## 关 8 · 出处可查

采用的每一个技能，目录里放一份 `SOURCE.txt`：仓库 URL、commit、许可证、
"原样引入还是改写过"。改写过的要写清改了哪一条以及为什么
（通常是关 3 或关 5）。

---

## 三层部署（三个消费者，别搞混）

| 层 | 谁在吃 | 怎么装 | 强制启动的机制 |
| --- | --- | --- | --- |
| **Claude Code**（开发助手） | 我 | marketplace / 目录安装 | `SessionStart` 钩子（ADHD、ponytail 都是这么做的） |
| **Crucible 的 agent**（产品） | 模型 | 工作区 `.claude/skills/` + `ClaudeAgentOptions.plugins` | 工作区 `CLAUDE.md` + `skills="all"` |
| **可分发插件** | 别人 | `.claude-plugin/marketplace.json` | 插件自带 hooks |

**SDK 侧的事实（2026-08-15 查 SDK 源码确认）**：
`ClaudeAgentOptions.plugins: list[SdkPluginConfig]`，形态
`{"type": "local", "path": "..."}` —— **只支持本地插件，不走 marketplace**。
所以 marketplace 网页**不是**打通 SDK 的前置条件；它只服务 Claude Code 的一键安装。
一个插件目录可以同时喂三层。
