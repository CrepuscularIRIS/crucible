# Research × Prime Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 research 产品隔离与受管 Skills 初始化，并在本地 SDK 架构内默认启用 Prime RLM 及安全可达的原生能力。

**Architecture:** 保留 Proma-managed ResourceLoader 与 Prime inline RLM；隔离守卫改为 cwd/path-boundary/statement-local 分类，research Skills 经现有默认 Skill 升级管线受管注入。Prime bundled skills 只恢复无需 daemon controller 的 allowlist，RLM 以预热常驻 kernel + 文件 fan-in 工作。

**Tech Stack:** Bun、TypeScript、Electron、Prime Agent 0.7.1、Python-backed Skills、electron-builder。

**Spec:** `docs/superpowers/specs/2026-08-23-research-prime-base-design.md`

## Global Constraints

- 使用 Bun，不使用 npm/pnpm。
- 不使用 `any`；对象类型优先 `interface`；仅类型导入使用 `import type`。
- 不覆盖当前工作树中 Docker 与其他无关用户改动。
- 所有生产行为先写失败测试并确认 RED。
- `research/skills` 是七个产品 research Skills 的唯一源码。
- RLM 供给存在时默认激活并预热；缺失时 fail-visible。
- 不宣称本地 SDK 支持 daemon-backed `agent_message`。
- 应用版本 patch +1；全部完成后单次提交。

---

### Task 1: 隔离守卫路径与语句边界

**Files:**
- Modify: `apps/electron/src/main/lib/research-isolation-guard.ts`
- Modify: `apps/electron/src/main/lib/research-isolation-guard.test.ts`
- Modify: `apps/electron/src/main/lib/agent-orchestrator.ts`
- Modify: `apps/electron/src/main/lib/adapters/pi-session-residency.ts`
- Modify: `apps/electron/src/main/lib/adapters/pi-session-residency.test.ts`

**Interfaces:**
- Produces: `ResearchIsolationConfig { cwd, denyRoots, stateRoots }`。
- Produces: `resolveResearchIsolationConfig(mcpServers, cwd, pathDelimiter?)`。
- Consumes: Agent 实际 cwd 与启用后的 MCP env。

- [ ] **Step 1: 写失败测试**

加入对抗审查中的 mixed Python、mixed Bash、自有 shell job、Popen cleanup、相对/`~`/`..` denyRoot、兄弟前缀、注释/普通字符串、多个 stateRoots、畸形 input 与 residency 结构碰撞用例。

- [ ] **Step 2: 验证 RED**

Run: `bun test apps/electron/src/main/lib/research-isolation-guard.test.ts apps/electron/src/main/lib/adapters/pi-session-residency.test.ts`

Expected: 新增用例因词袋误杀、相对路径漏拦、stateRoot 丢失或 key 碰撞失败。

- [ ] **Step 3: 实现最小分类器**

实现路径候选规范化、`path.relative` 边界、顶层语句切分、最小变量污点与可证明自有进程规则；调用方显式传 cwd；residency 使用结构化 JSON 指纹。

- [ ] **Step 4: 验证 GREEN**

Run: `bun test apps/electron/src/main/lib/research-isolation-guard.test.ts apps/electron/src/main/lib/adapters/pi-session-residency.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: PASS。

### Task 2: 无头隔离与证据归档

**Files:**
- Modify: `apps/electron/scripts/research-script-lifecycle.ts`
- Modify: `apps/electron/scripts/research-script-lifecycle.test.ts`
- Modify: `apps/electron/scripts/first-campaign.ts`
- Modify: `apps/electron/scripts/two-round-campaign.ts`
- Modify: `apps/electron/scripts/routing-acceptance.ts`
- Modify: `apps/electron/scripts/p0-evidence.ts`
- Modify: `apps/electron/scripts/rlm-runtime-e2e.ts`

**Interfaces:**
- Produces: `createResearchIpythonAuthorizer(neuronbenchRoot, cwd)`。
- Produces: overlap-safe、symlink-independent `disposeAndArchiveResearchSession`。

- [ ] **Step 1: 写失败测试**

加入 renamed denyRoot 的 parent authorizer、archive 位于 source 内、archive 等于 source、source 位于 archive 内、live target 删除后 archived symlink 仍可读的用例。

- [ ] **Step 2: 验证 RED**

Run: `bun test apps/electron/scripts/research-script-lifecycle.test.ts`

Expected: 空 denyRoots、递归 staging 或 dangling symlink 导致失败。

- [ ] **Step 3: 实现并迁移调用点**

用真实 config 创建 authorizer；归档前做双向 path containment 拒绝；`cpSync` 解引用 symlink；错误时保留可恢复证据并输出位置。

- [ ] **Step 4: 验证 GREEN**

Run: `bun test apps/electron/scripts/research-script-lifecycle.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: PASS。

### Task 3: 七个 research Skills 受管初始化

**Files:**
- Create: `apps/electron/src/main/lib/research-default-skills.ts`
- Create: `apps/electron/src/main/lib/research-default-skills.test.ts`
- Modify: `apps/electron/src/main/lib/config-paths.ts`
- Modify: `apps/electron/src/main/lib/agent-workspace-manager.ts`
- Modify: `apps/electron/electron-builder.yml`

**Interfaces:**
- Produces: `RESEARCH_DEFAULT_SKILL_SLUGS` 七项 readonly allowlist。
- Produces: 开发态/打包态 research Skills source resolver。
- Consumes: 现有 `seedDefaultSkills` 与 `upgradeDefaultSkillsInWorkspaces`。

- [ ] **Step 1: 写失败测试**

断言 allowlist 恰好七项、目录均含合法 `SKILL.md`、`research-writing-skills` 被排除，并验证合并 seed 会把缺失 Skill 注入既有 workspace。

- [ ] **Step 2: 验证 RED**

Run: `bun test apps/electron/src/main/lib/research-default-skills.test.ts`

Expected: 模块或受管来源不存在。

- [ ] **Step 3: 实现受管来源**

将七项同步进 default skill cache；开发态解析仓库 `research/skills`，打包态解析 `process.resourcesPath/research-skills`；electron-builder 只打包七项目录。

- [ ] **Step 4: 验证 GREEN**

Run: `bun test apps/electron/src/main/lib/research-default-skills.test.ts`

Expected: PASS。

### Task 4: 删除本机绝对路径

**Files:**
- Modify: `packages/research-mcp/src/sandbox.ts`
- Modify: `packages/research-mcp/src/sandbox.test.ts`
- Modify: `packages/research-mcp/src/world-meter.test.ts`
- Modify: `apps/electron/scripts/first-campaign.ts`
- Modify: `apps/electron/scripts/two-round-campaign.ts`
- Modify: `apps/electron/scripts/routing-acceptance.ts`

**Interfaces:**
- Produces: 必填且存在的 `NEURONBENCH_ROOT` 配置。

- [ ] **Step 1: 写失败测试**

断言 `NEURONBENCH_ROOT` 缺失时 fail closed，不再回退开发机路径。

- [ ] **Step 2: 验证 RED**

Run: `bun test packages/research-mcp/src/sandbox.test.ts`

Expected: 当前硬编码默认使测试失败。

- [ ] **Step 3: 删除字面路径并迁移脚本**

campaign 使用 `requireEnvironmentSecret(process.env, 'NEURONBENCH_ROOT')`；world-meter 集成测试仅在显式 env 存在时执行。

- [ ] **Step 4: 验证 GREEN 与扫描**

Run: `bun test packages/research-mcp/src/sandbox.test.ts`

Run: `rg -n --glob '*.{ts,tsx,js,mjs,cjs,json}' '/home/lingxufeng|/Users/lingxufeng' apps packages`

Expected: 测试 PASS；扫描无输出。

### Task 5: Prime 原生能力与 RLM 默认开启

**Files:**
- Create: `apps/electron/src/main/lib/adapters/pi-managed-skills.ts`
- Create: `apps/electron/src/main/lib/adapters/pi-managed-skills.test.ts`
- Modify: `apps/electron/src/main/lib/adapters/pi-agent-adapter.ts`
- Modify: `apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

**Interfaces:**
- Produces: Prime bundled skill allowlist `edit|goal|compact|refine`。
- Produces: RLM supply available 时 `initialActiveToolNames=['ipython']` 与 `prewarmIpythonKernel=true`。

- [ ] **Step 1: 写失败测试**

断言 managed ResourceLoader 发现四个 Prime Skills、不发现 agent-message/observe/heartbeat；session options 在 supply 可用时预热 ipython；系统提示不宣传不可用 agent_message。

- [ ] **Step 2: 验证 RED**

Run: `bun test apps/electron/src/main/lib/adapters/pi-managed-skills.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: managed skills 模块或 prewarm 接线不存在。

- [ ] **Step 3: 实现最小适配层**

从已安装 Prime package 解析 `skills/<slug>`；把受管 Prime roots 与 workspace root 分开传入 override；供给可用时预热 kernel。保留本地 SDK file fan-in 与 Prime terminal notice，不注入无 controller 的 Python module。

- [ ] **Step 4: 验证 GREEN**

Run: `bun test apps/electron/src/main/lib/adapters/pi-managed-skills.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts`

Expected: PASS。

### Task 6: 集成验证与版本

**Files:**
- Modify: `apps/electron/package.json`

- [ ] **Step 1: 递增桌面应用 patch 版本**

将当前 `0.17.63` 递增为 `0.17.64`；不改无关 package 版本。

- [ ] **Step 2: 最小相关验证**

Run: `bun test apps/electron/src/main/lib/research-isolation-guard.test.ts apps/electron/scripts/research-script-lifecycle.test.ts apps/electron/src/main/lib/research-default-skills.test.ts apps/electron/src/main/lib/adapters/pi-managed-skills.test.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts packages/research-mcp/src/sandbox.test.ts`

Expected: PASS。

- [ ] **Step 3: 全量验证**

Run: `bun run typecheck`

Run: `bun test`

Run: `bun run electron:build`

Expected: 全部退出码 0。

- [ ] **Step 4: 产品态同步检查**

启动/刷新 5173 产品实例，确认默认 workspace 出现七 Skills、RLM badge 就绪、控制台无新增错误；不运行正式 eval。

### Task 7: Diff 审计与单次提交

- [ ] **Step 1: 审计改动范围**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff -- apps/electron/src/main/lib/research-isolation-guard.ts apps/electron/src/main/lib/research-isolation-guard.test.ts apps/electron/src/main/lib/agent-orchestrator.ts apps/electron/src/main/lib/adapters/pi-session-residency.ts apps/electron/src/main/lib/adapters/pi-session-residency.test.ts apps/electron/scripts/research-script-lifecycle.ts apps/electron/scripts/research-script-lifecycle.test.ts apps/electron/scripts/first-campaign.ts apps/electron/scripts/two-round-campaign.ts apps/electron/scripts/routing-acceptance.ts apps/electron/scripts/p0-evidence.ts apps/electron/scripts/rlm-runtime-e2e.ts apps/electron/src/main/lib/research-default-skills.ts apps/electron/src/main/lib/research-default-skills.test.ts apps/electron/src/main/lib/config-paths.ts apps/electron/src/main/lib/agent-workspace-manager.ts apps/electron/electron-builder.yml packages/research-mcp/src/sandbox.ts packages/research-mcp/src/sandbox.test.ts packages/research-mcp/src/world-meter.test.ts apps/electron/src/main/lib/adapters/pi-managed-skills.ts apps/electron/src/main/lib/adapters/pi-managed-skills.test.ts apps/electron/src/main/lib/adapters/pi-agent-adapter.ts apps/electron/src/main/lib/adapters/pi-ipython-rlm.test.ts apps/electron/package.json docs/superpowers/specs/2026-08-23-research-prime-base-design.md docs/superpowers/plans/2026-08-23-research-prime-base.md`

Expected: 无 whitespace 错误；不包含 Docker 和其他无关用户改动。

- [ ] **Step 2: 单次提交**

只 stage 本计划涉及文件与两份设计/计划文档。

Run: `git commit -m "fix(research): harden Prime research runtime base"`

Expected: 提交成功，用户的其他未提交改动仍保留在工作树。
