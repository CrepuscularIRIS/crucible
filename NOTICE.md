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

## 本仓库前身（已归档）

- 本仓库即原 Crucible 实现仓，合仓前的全部内容见 tag `archive/grill-v1`。
- 原 Python 实现（GRILL 账本、Open WebUI Pipe、gates）**未**并入当前代码，
  按计划留待后续研究阶段重新设计。
- `docs/specs/` 与 `Race/` 来自原 ClawUI 规格仓（tag `archive/specs-v1`，在 `~/ClawUI`）。

## AGPL-3.0 的含义（§13）

若本项目以网络服务形式对外提供交互（可调用 API 或在线前端），
必须向使用者提供对应版本的完整源码。本项目按开源方式运作，符合该义务。
