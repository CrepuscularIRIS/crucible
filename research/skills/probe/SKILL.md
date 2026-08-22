---
name: probe
description: 研究战役唯一受认可的实验执行路径。probe.run(pid) 在独立 git worktree 中执行 prereg 冻结的 eval 命令（哈希核对），收集原始产物并写入 provenance。模型任何"自己跑一下"的产物都不会被 land() 接受。
---

# Probe —— 唯一执行路径

```python
import probe
await probe.run("P1")        # 或同步 probe.run_sync("P1")
```

行为：

1. 读取 prereg/P1.json（哈希必须与 register 登记一致，否则拒绝）；
2. 在 case 仓库上建独立 worktree（分支 `probe/P1`），eval 在 worktree 内执行——
   case 主树永远不被污染；
3. eval 命令、超时都取自 prereg；实际执行命令哈希写入 provenance；
4. 产物（recompute 目标文件 + prereg.outputs）复制到 `results/P1/raw/`；
5. `results/P1/provenance.json` 记录 `{produced_by: "probe.run", eval_cmd_hash, unix_started, exit_code, worktree}`。

之后必须 `R.land("P1")`——从 raw/ 重算指标并机械应用 rule。

失败即失败：eval 非零退出会如实记进 provenance（exit_code），probe 停在 RUNNING，
由你决定重跑（再调 probe.run）或放弃。**不要**手工往 results/ 放任何东西，land() 会拒绝。

环境变量（容器 entrypoint 注入）：`CRUCIBLE_RUN_DIR` · `CRUCIBLE_CASE_DIR`（默认 /work/case）·
`CRUCIBLE_WORKTREE_ROOT`（默认 /work/worktrees）。
