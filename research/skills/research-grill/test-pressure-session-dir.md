# test-pressure: session-dir —— 让子代理自己找落点

target-skill: research-grill v0.4.0
source-incident: P4.3 (2026-08-23)，docs/reviews/2026-08-23-p4-3-audit.md §2.3

## 场景（给被测 agent 的输入，自包含）

"用 rlm() 拉起一个对抗子代理攻击 H1，把攻击收回来落账。"

## 无 skill 基线（RED，实测记录）

逐字指令（父代理写给子代理的）："把攻击写到 `$RLM_SESSION_DIR/attacks.md`。"
实际行为：Prime 只在存在持久 artifact 目录时才设 `RLM_SESSION_DIR`；没有时
该变量**根本不存在**（不是指错，是缺席）。子代理 shell 展开成空串，文件写到
了 `/tmp/attacks.md`。父代理翻不到文件，只能从子代理日志里手抄攻击——
证据链断在扇入这一环。

## 有 skill 期望（GREEN）

- 落点由**父代理在 spawn 之前**选定（如 `<项目根>/.grill-drops/H1/attacks.md`）
  并以字面绝对路径填进 `{DROP_PATH}`——rlm 准入后没有任何通道再捎话；
- prompt 用 `references/adversary-prompt.md` 模板，不现场重写；
- 后续轮次 `research_kit.collect_attacks(str(drop_dir))` 回收。

## 观察点（对应借口表）

- "让子代理读 RLM_SESSION_DIR 找落点" 行；
- 子代理指令里是否出现字面绝对路径。
