# Crucible

面向科研的 AI Agent 桌面应用：**Proma 前端/会话层 + Prime Agent 运行时**。

2026-08-22 合仓：此前的「ClawUI 规格仓 + crucible 实现仓（GRILL / Open WebUI）」
双仓结构已归档，本仓库成为唯一主仓，实现整体换成迁移到 Prime Agent 的 Proma 桌面端。

---

## 现在能跑什么

Proma 桌面端已完整跑在 Prime Agent 运行时上（原 Pi Agent 0.84.2 → Prime fork 0.7.x）。
6 个 workspace 全部类型检查通过，Electron 构建通过，Qwen/百炼渠道经
`registerProvider → getModel → getAuth` 冒烟验证（`thinkingFormat: 'qwen'`
是 Prime compat 的一等公民）。

运行时差异全部收敛在一个文件：`apps/electron/src/main/lib/adapters/prime-compat.ts`。

## 前置条件

Prime Agent 的 fork 必须检出在 `~/oss/prime-agent`，且已构建 `dist`：

```
~/
├── crucible/          <- 本仓库
└── oss/prime-agent/   <- 运行时（file: 依赖指向它）
```

依赖以 `file:../oss/prime-agent/packages/*` 引用，**不随本仓库分发**。
改动 prime-agent 源码后，必须重建其 `dist` 并在本仓库重新 `bun install`
（bun 会复制而非软链 `file:` 依赖）。

## 开发

```bash
bun install
bun run typecheck      # 6 个 workspace
bun run dev            # Electron 开发模式
```

注意：`bun -e` / `bun test` 直接 import `@earendil-works/pi-coding-agent` 会因
native dlopen 崩溃；需要脚本化验证运行时的话用 Node（v22 可用）。

## 目录

| 路径 | 内容 |
|---|---|
| `apps/`、`packages/` | Proma 桌面端（Electron + React + 共享包） |
| `docs/product/` | 新架构文档：产品规划、Prime Agent 精读、Claude Agent SDK 精读、双 harness 设计 |
| `docs/specs/` | 规格仓沿用的方法论与阶段设计文档 |
| `Race/` | 赛题材料：赛题解析、1A/1B 提交模板与要求、参考论文 |

## 路线

1. ~~Proma 迁移到 Prime Agent，前后端对齐~~ ✅ 已完成
2. 把 Prime 的 **RLM / ipython** 与 **refine 机制**接进 Proma 界面
3. 参考 GenericAgent 的基础 loop，结合 Prime 的 refine，搭轻量科研循环

GRILL 的门禁机制按计划**暂不引入**，需要更充分的设计再谈。

## 许可

AGPL-3.0（继承自 Proma），取代此前的 MIT。第三方来源与义务见 [`NOTICE.md`](NOTICE.md)。

## 归档

合仓前的内容一件未丢：

| 归档 | 位置 |
|---|---|
| crucible 实现仓（GRILL / Open WebUI，161 commits） | 本仓库 tag `archive/grill-v1`（已推 GitHub）；`~/backups/crucible-grill-v1-20260822.tar.gz` |
| ClawUI 规格仓（111 commits） | `~/ClawUI` tag `archive/specs-v1`；`~/backups/clawui-specs-20260822.tar.gz` |

`git checkout archive/grill-v1` 可取回本仓库合仓前的全部内容。

> `~/ClawUI` 仍在磁盘上：它的 git 历史**没有远端**，是那 111 个提交的唯一 git 副本，
> 请勿直接删除（另有 tarball 备份）。
