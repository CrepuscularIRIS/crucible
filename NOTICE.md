# NOTICE — 第三方来源与许可

本仓库（Crucible）是在两个上游项目之上的衍生作品，整体以 **AGPL-3.0** 分发。

## Proma

- 来源：https://github.com/proma-ai/Proma
- 许可：GNU Affero General Public License v3.0
- 用法：本仓库的桌面端应用（`apps/`、`packages/`）源自 Proma 的
  `prime-migration` 分支快照（2026-08-22）。UI、会话管理、MCP 集成、
  技能加载等实现均来自 Proma。

## Prime Agent（`@earendil-works/pi-*`）

- 来源：https://github.com/PrimeIntellect-ai/prime-agent
- 用法：agent 运行时。本仓库通过 `file:../oss/prime-agent/packages/*`
  引用同级检出的 fork，**不随本仓库分发其源码**。
- 注意：构建前必须在 `../oss/prime-agent` 存在该检出，
  且其 `packages/*/dist` 已构建。

## ResearchStudio

- 来源：https://github.com/microsoft/ResearchStudio
- 许可：MIT License，Copyright (c) 2026 Happy
- 用法：`research/skills/` 中的 research-scoop（移植自
  `ResearchStudio-Idea/skills/scoop_check/SKILL.md`）、research-grill 的
  `references/idea-quality.md`（`ResearchStudio-Idea/evaluation/idea_quality/SKILL.md`）、
  research-loop 的 `references/intake-check.md`（`ResearchStudio-Idea/skills/idea_spark/`）
  改写自其文本；research-probe 的 `references/candidate-screen.md` 与 research-grill
  的 `references/idea-gauntlet.md` 引用其 idea_quality 规则。技能中的 "RS" 即指此仓库。

## research-companion

- 来源：https://github.com/andrehuang/research-companion
- 许可：MIT License，Copyright (c) 2026 Andre Huang
- 用法：`research/skills/` 中 research-grill 的 `references/idea-quality.md`、
  `references/idea-gauntlet.md`，research-loop 的 `references/intake-check.md`，
  research-abduce 的 `references/discovery-methods.md`，research-moves 的
  `references/research-judgment.md`，research-probe 的 `references/candidate-screen.md`
  有段落改写自其 `principles/`、`agents/`、`skills/research-companion/SKILL.md`。
  技能中的 "RC" 即指此仓库。

以上两项 MIT 许可要求随副本保留版权声明与许可文本：

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 本仓库前身（已归档）

- 本仓库即原 Crucible 实现仓，合仓前的全部内容见 tag `archive/grill-v1`。
- 原 Python 实现（GRILL 账本、Open WebUI Pipe、gates）**未**并入当前代码，
  按计划留待后续研究阶段重新设计。
- `docs/specs/` 与 `Race/` 来自原 ClawUI 规格仓（tag `archive/specs-v1`，在 `~/ClawUI`）。

## AGPL-3.0 的含义（§13）

若本项目以网络服务形式对外提供交互（可调用 API 或在线前端），
必须向使用者提供对应版本的完整源码。本项目按开源方式运作，符合该义务。
