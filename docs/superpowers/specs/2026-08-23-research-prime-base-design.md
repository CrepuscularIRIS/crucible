# Research × Prime 基座修复设计

## 目标

在不把 Proma 改造成 Prime daemon 的前提下，修复 research 隔离误杀与漏拦，受管安装七个 research Skills，清除源码中的本机绝对路径，并最大化启用 Prime 本地 SDK 模式已经具备的 long-horizon、RLM、Goal、Compact 与 Refine 能力。

## 范围

本次交付包含：

1. 修复 Bash/ipython research execution-before 隔离守卫；
2. 修复无头战役的隔离配置与证据归档；
3. 将 `research-loop`、`research-abduce`、`research-probe`、`research-grill`、`research-report`、`research-kit`、`research-moves` 作为受管默认 Skills 注入新旧工作区；
4. 删除生产 TypeScript 中的 `/home/lingxufeng` 字面路径；
5. RLM 供给存在时默认激活并预热 Prime 原生 ipython；
6. 恢复不依赖 daemon controller 的 Prime 原生 Python Skills：`edit`、`goal`、`compact`、`refine`；
7. 用自动化测试明确本地 SDK 模式下 RLM child 的回传契约。

不包含：把 Proma 整体切换到 Prime daemon、伪造 daemon-backed `agent_message`/`agent_observe`、删除用户 Docker 改动、运行正式 eval。

## 隔离模型

### 配置

`ResearchIsolationConfig` 使用结构化字段保存：

- `cwd`：Agent 实际执行目录；
- `denyRoots`：benchmark/真值目录集合；
- `stateRoots`：Research MCP 独占写入目录集合。

解析多个 research MCP 时两个根集合都取并集。会话驻留指纹分别编码字段名与内容，禁止 denyRoot/stateRoot 扁平化碰撞。

### 路径判断

守卫从 Bash/ipython 源码中提取路径候选，统一展开反斜杠、`~`、相对路径与 `..`，相对路径以 Agent cwd 为基准。命中使用 `path.relative` 边界判断，不使用字符串 `includes`，因此 `hidden-bench-old` 不会被误判为 `hidden-bench` 子路径。

直接 benchmark 访问继续 fail closed。静态标识只匹配真实导入、命令或环境变量展开，不因注释、普通字符串或 `rg neuronbench` 报告文本而拒绝。

### 状态写入

状态写入按顶层语句/命令片段局部判定，不再把整 cell 当词袋。只有同一执行片段同时包含状态根和写操作时拒绝。跨语句的直接变量别名会做最小污点传播；动态拼接不是本次解析器承诺的安全边界，真实防护仍由 execution-before 守卫、MCP 独占写协议与评测 liveness 共同构成。

### 进程控制

继续拒绝无法证明所有权的裸 PID、`pkill`、`killall` 与 `os.kill`。允许同一片段中可证明属于当前工具调用的 shell job（`$!`、`%n`）和由该 cell 创建的 `subprocess.Popen` 对象清理。这样不允许 Agent 猜 PID 杀 Research MCP，同时恢复正常自有任务清理。

畸形或空 Bash/ipython 输入确定性返回 block，不抛未分类异常。

## 无头战役与归档

`authorizeResearchIpython` 改为由真实 `neuronbenchRoot` 与 `cwd` 构造的 authorizer，所有 campaign/evidence 脚本不得再用空 denyRoots。

归档开始前验证 source/archive 不相同、互不包含；重叠直接拒绝。复制使用 symlink 解引用，归档必须在删除 live tree 后仍独立可读。替换旧归档失败时优先恢复旧归档；新 staging/previous 的保留位置进入错误信息，不静默删除唯一证据。

## 受管 research Skills

`research/skills` 是唯一源码。新增七项常量 allowlist；开发态从仓库目录读取，打包态由 electron-builder 放入 `resources/research-skills`。启动时将七项合并同步到 `~/.proma/default-skills`，随后复用现有 `upgradeDefaultSkillsInWorkspaces`：

- 新工作区首次创建即获得七项；
- 既有工作区缺失时自动注入 active；
- 用户已放入 inactive 的 Skill 保持 inactive；
- `research-writing-skills` 永不进入产品工作区。

Skills 变为可发现能力，不在普通对话启动时强制执行。研究请求由 `research-loop` 的 trigger description 和 Prime Skill 选择机制激活。

## 路径可移植性

生产代码和 campaign 脚本不保留 `/home/lingxufeng` 默认值。`NEURONBENCH_ROOT` 必须由环境或后续产品路径解析器显式提供，缺失时 fail closed。单元测试使用 `tmpdir()` 或合成跨平台路径；不会批量删除 TypeScript 文件。

## Prime 能力适配

### RLM 生命周期

当 `detectIpythonKernelSupply()` 成功时：

- `initialActiveToolNames` 始终包含 `ipython`；
- `prewarmIpythonKernel` 开启，避免第一次研究委派才启动；
- 同一 Proma 会话继续复用常驻 AgentSession 与 kernel；
- 空闲回收仍保留，防止历史会话永久占用进程。

供给缺失时继续 fail-visible，不启动 Prime 的交互式 uv 安装流程。

### Prime 原生 Skills

Proma 保持 `noSkills: true`，防止环境式 Skill 发现；但通过包内绝对解析得到 Prime bundled skills 目录，仅把 `edit`、`goal`、`compact`、`refine` 四项作为受管根加入 ResourceLoader。`agent-message`、`agent-observe`、`rlm-heartbeat` 没有 controller 时不注入、不宣传。

### 子代理与结果回传

RLM subagent 没有被禁用。Prime 0.7.1 的 `rlm()` 在准入后返回 handle；本地 SDK inline child 没有 daemon-backed `agentMessageController`。Prime 会注入 child 终态与最后文本预览，但 full-fidelity research 产出继续使用显式文件落点和 `research_kit.collect_attacks` 回收。

Proma Collaboration 是另一套产品子会话能力，保留给需要可见会话、等待、继续和完整结果读取的配置化 research/review 阶段。本次不把两套身份模型硬拼在一起；后续若需要完全同名 `agent_message` API，应在 Prime 上游增加 local family controller，或提供独立 SubagentRuntimeHost，而不是在 Prompt 中假装可用。

## 验证

最低验证包括：

- 隔离守卫所有正反向 BDD 测试；
- lifecycle 重叠目录、symlink、真实 denyRoots 测试；
- 七 Skills allowlist、开发态同步、既有工作区注入与 writing skill 排除测试；
- 源码 `/home/lingxufeng` 扫描为零；
- Prime managed skills 与 RLM prewarm 接线测试；
- RLM child execution-before 隔离回归；
- `bun run typecheck`、相关测试、全量 `bun test`、`bun run electron:build`；
- 应用 patch 版本递增一次；
- 全部完成后只提交一次，不包含 Docker 和其他无关用户改动。
