---
name: research-grill
description: Use when LIVE 或 SUPPORTED 假设尚未挨过对抗攻击、有新落地证据未被攻击检验、或候选要花高成本前需要独立 idea gauntlet 时。
version: 0.4.2
---

# research-grill —— 对抗检验

## 你在做什么

给自己的假设请一个对抗者。它的工作不是复述风险，是**找到你错在哪**。
对抗是一种 reviewer 角色，不绑定某一种进程：短攻击由父会话直接做，有界的
一次性深审可用 Prime RLM child，长耗时/多轮/需要用户可见时用 Proma
Collaboration child。信息不对称是结构：对抗者看得到主张与证据
（`claim_view`），看不到你为主张辩护的推理——给了推理，对抗退化成复读。

## 铁律

```
没进 journal 的攻击等于没发生；结论没挨过打不许进报告
```

**违反字面就是违反精神。** 留在对话里的攻击、被你"总结"过的攻击都不算数——
逐条 `attack_record` 原话落账。SUPPORTED 无迁移后攻击、或最后一次终态迁移后
没有任何 run 级攻击时，trace gate 直接红【结构】。

## 程序

1. **先选目标与通道**（每个目标 claim 一个 attack job，不等于一个 child）：
   - claim_view 很短、四镜头一次可完成 → 父会话直接攻击；
   - 输入已冻结、一次性、无需中途追问 → RLM `reviewer`；
   - 多文件/长耗时/需要追踪，或明确要多轮追问 → Collaboration `reviewer`。

   同一 job 不双开 RLM 与 Collaboration，也不把简单攻击机械委派。详细路由、
   模型继承和状态契约见 research-loop 的 `references/delegation.md`。
   若目标是“尚未花大成本的完整候选”而非单条 claim，先冻结 proposition packet，
   再打开 `references/idea-gauntlet.md` 分离 contribution、prior-art、methods 三个
   互盲攻击面，最后才让独立 reformulator 看全量 finding。审查与修订不能在同一
   上下文完成。
2. **先选落点，再执行**。只要使用 child，落点必须在 spawn **之前**由父会话
   选定；完整 reviewer 角色契约、`claim_view`、对抗模板与字面绝对报告路径一起
   进入自包含 prompt。RLM 使用启动时受管的 `proma-research-reviewer` spec，
   Collaboration 传 `role=reviewer`；两者都不传模型参数。

   RLM 示例：

   ```python
   import pathlib
   drop_dir = pathlib.Path.cwd() / ".grill-drops" / "H1"   # 项目根下，绝不在 .proma-research 内
   drop_dir.mkdir(parents=True, exist_ok=True)
   view = research_kit.claim_view(run, "H1")               # 不含 transition notes
   prompt = reviewer 角色契约 + 按 references/adversary-prompt.md 填占位符
   # {DROP_PATH} = f"{drop_dir}/attacks.md"
   handle = await rlm(prompt, name="grill-H1")
   ```

   ✓ 成功条件：spawn 前 prompt 里已有字面绝对路径；没有任何"从环境变量找"
   或"稍后告诉你"的指示。
3. **回收原文**：父会话直接攻击时保留四镜头原句；RLM 在**准入**时返回句柄，
   不是答案，后续用 `research_kit.collect_attacks(str(drop_dir))` 回收（一并扫
   `sub-*`，去重；空列表 = 还没写完，不是错误）；Collaboration 用
   `wait_for_delegations` 收到终态后读取同一绝对报告路径，需要第二轮时才
   `continue_delegation`。不要短间隔轮询。
   ✓ 成功条件：拿到攻击行原文（跳过 `#` 开头的 SCOPE-ONLY 行——那是收窄
   声明素材，送 research-report，不落 attack_record）。
4. **逐条落账**：站得住的攻击逐条 `attack_record`：
   - `new_h`：混合/总体替代解释 → 回 `research-abduce` 登记成正式假设，
     conflicts 点名它攻击的主张；
   - `constraint`：被设计忽略的边界条件 → 进下一个 prereg 的控制臂；
   - `no_change`：某个已落地结果其实不改变信念。
   驳回的攻击写明白为什么驳回（对话里一行即可，别落假账）。
   ✓ 成功条件：锚的攻击计数上涨；攻击债将在下一次 propose/prereg 清偿。
   同时按 `research-loop` 的 `references/stage-questioning.md` 中 S1/S2/S5 清理
   隐藏前提、自我矛盾与最小失败边界。
5. **第二轮起**：上一轮 attacks.md 原文填进模板 `{PRIOR_ATTACKS}`——对抗者
   要知道哪些已消化、哪些被驳回，才不会越攻越软或重复已和解的攻击。
6. **落账权在父代理**：child 的系统角色契约禁止写 Research 状态；
   `PROMA_RESEARCH_RUN` 钉死的新战役名又阻止旁路 init【结构】。父会话仍须核验
   journal：发现 child 违反契约动了 MCP 写工具 → 那些事件照实留在 journal，
   报告里说明来源。

## 借口 | 现实

| 借口 | 现实 |
|---|---|
| "让子代理读 RLM_SESSION_DIR 找落点" | P4.3 实测：Prime 只在有持久 artifact 目录时才设它，没有时**根本不存在**——子代理把 attacks.md 写去了 `/tmp`，父代理只能翻日志抄回来。落点由父代理写死在 prompt 里。 |
| "拉起后马上读 attacks.md" | rlm() 准入即返回，不返回答案。立即读可能为空；空不是错误，是"还没写完"。后续轮次再收。 |
| "每条 claim 都派一个 child 才算独立" | child 是昂贵的执行通道，不是攻击本身。短 attack job 父会话直接做；只有有界深审或长程可见协作才委派。 |
| "把我的推理一起给对抗者，攻得更准" | 攻得更准的是复读机。信息不对称是这个仪器的全部原理——用 claim_view，别自己拼"完整状态"。 |
| "对抗者说整体合理，通过" | 那是它失职，不是你过关。换一个镜头重问。 |
| "我替它总结一下它想说什么" | 用它的原话（attacks.md 的行）。总结是你的辩护混进它的攻击。 |
| "把 REFUTED 的也拉出来打一轮" | 死人不会复活，鞭尸不产信息——除非你带来新证据（那走 revive）。SUPPORTED 在 graveyard 数组里但**是**主要攻击对象。 |
| "让同一个 reviewer 边挑错边给最终改稿，效率更高" | 它只会留下自己会修的 finding。冻结 proposition，攻击与 reformulate 分离，父会话最后裁决。 |

## 快速参考

| 步骤 | 动作 | 成功条件 | 执法 |
|---|---|---|---|
| 选目标+通道 | parent / RLM reviewer / Collaboration reviewer 三选一 | 与任务形状匹配、不双开 | 纪律 |
| 选落点+执行 | drop_dir → claim_view + 模板 → 对抗 | child spawn 前 prompt 含字面落点 | 不对称由 kit 视图省略 notes 保证（非 server 拒绝） |
| 回收 | 原句 / collect_attacks / wait 后读 report | 攻击行原文到手 | 纪律 |
| 落账 | attack_record 逐条 | 攻击计数上涨 | SUPPORTED 需迁移后攻击 + run 级冻结后攻击【结构：trace gate】 |
| 路由 | new_h→abduce · constraint→probe | 债在下次 propose/prereg 清偿 | 锚计数提醒 |

## 交接

- `new_h` 攻击 → `research-abduce`
- `constraint` 暴露判别缺口 → `research-probe`
- 攻完、坟场已足以答题 → `research-report`

## 参考索引

- `references/adversary-prompt.md` —— 四镜头对抗 prompt 模板（原样用，只填占位符）
- `references/idea-gauntlet.md` —— 三个互盲攻击面、独立 reformulator、执行 finding
  的 disposition 与清账规则
