---
name: research-probe
description: Use when 存在 ≥2 条 LIVE 假设有可判别差异、而没有覆盖这个差异的已落地探针时；或 triage 出口要求重新预登记一个探针时。
version: 0.6.0
---

# research-probe —— 判别性探针

## 你在做什么

设计一个能**改变信念**的实验。判别力是唯一标准：结果落在哪里，会杀死/收窄
哪个假设？答不上来的实验不要做。

## 铁律

```
预登记落盘之前，被登记的命令绝不以任何方式先运行
```

**违反字面就是违反精神。** 不用 Bash 预览、不用 kernel 试算、不"就看一眼格式
对不对"。看过再写的频段不是预测，是回忆——而这条违规**不进 journal**，三道
gate 一道都拦不住；零宽频段拒绝只挡得住最笨的那次。真正守住它的是执行顺序
本身。想验证命令能跑通：先 `prereg_write`，让 `probe_run` 去跑——写错了记
FAILED 重登一个，代价远小于一条作废的证据链。（赛事模板 P14 原文："应展示
执行前已经形成的真实计划，不要根据结果反向补写预期观测或停止条件。"）

## 程序

1. **对象确认**：`research_state` 或锚，找到要判别的 LIVE 假设对（≥2 条）。
   **自查：LIVE 集里有伪影/混杂类无聊对手吗？** 没有 → 先回 research-abduce。
   ✓ 成功条件：能说出这个探针判别哪一对假设。
2. **SELECT——先比再登**：写出 ≥2 个候选设计（遭遇战 2 个起步，会战更多），
   各自填频段表后用 `research_kit.disjoint_pairs(bands)` 数互斥对，按
   **P(kill)/成本** 排序——最快能杀死东西的优先；同分选顺手产出可复用仪器的。
   设计来源不够：贡献上界/瓶颈裁决 → `research-moves` 的 `references/oracle.md`；
   频段宽度与形状承诺 → `research-moves` 的 `references/derive.md`。
   ✓ 成功条件：落选设计也留了频段表（下场战役的现成候选）。
3. **预登记 `prereg_write`**，五样缺一不可：
   - **question**：判别什么 + **点名对照**（什么对照能否证这个读数）+ 末尾
     一句 severity："若被检验假设为假，这个测试大概率仍会通过吗？"——答"会"
     就重新设计。（纪律：schema 只查 question 非空，这句话的存在与诚实由你负责）
   - **evalCommand**：一条确定性命令，指标进 stdout（json 或单行）；
   - **bands**：每条被检验假设的频段——**必须存在一对不重叠**【结构】；
     **必须有宽度**【结构】——宽度就是你执行前真实的不确定性，写窄是自欺，
     写宽会显示在报告校准段（`research_kit.calibration`）；
   - **branches**：每个频段对每条假设的处置，**必须有 kill 或 scope**【结构】；
   - **metricKind + metricSpec**：从 stdout 重算指标的规约——`json`（点路径，
     如 `results.accuracy`）或 `regex`（单捕获组）【结构：schema 必填】。
   ✓ 成功条件：prereg_write 返回 pid（sha256 已冻结）。
4. **`probe_run`**：只运行冻结命令。非零退出记 FAILED、不落地——不是惩罚，
   是保护：崩溃与干净结果不可区分，FAILED 永不做终态依据。改命令 = 新探针。
   ✓ 成功条件：锚里探针行出现 LANDED + metric（或 FAILED）。
5. **应用 branches**：`claim_transition` 把被杀/被收窄的送进坟场。
   落带外 → server 拒绝并路由：**立即打开 `research-moves` 的
   `references/triage.md` 执行强制分诊**（伪影→bug→方差→已知→真实意外，
   以 journal 落地终结，没有第四个出口）。
   ✓ 成功条件：每个落地结果都能回答"它杀死了什么"。

## 命令纪律（沙箱契约，全部【结构】）

bwrap 内执行：文件系统只读（中间文件只能写 `/tmp`，结果走 stdout）；无网络；
环境只有 `PATH/HOME=/tmp/LANG`（拿不到宿主密钥，也别试图读）；超时（默认
10 分钟）按失败处理。因此 evalCommand 必须：可复放（固定种子）、无网络、
无时间依赖、指标可从 stdout 重算（json 点路径或正则）。

## 借口 | 现实

| 借口 | 现实 |
|---|---|
| "只看一眼输出格式，不算偷看" | P4.3 的 `[45,45]` 就是这么来的——频段成了回忆，整场证据作废。先登记，FAILED 很便宜。 |
| "频段写 [0,1] 最保险" | 全频段 = 无论结果如何信念都不变 = 装饰性探针。安全感不是判别力。 |
| "只想到一个设计，直接登记" | 把选择题偷换成判断题。第二个设计常常便宜一半、杀伤大一倍。 |
| "这次结果不理想，换个命令再跑一遍" | 改命令 = 新探针，必须新预登记。旧探针照实留在账上。 |
| "落带外了，解释一下就能算 H1 支持" | server 会拒绝迁移。事后解释塞回频段 = 把意外（系统唯一学习入口）焊死。走 triage。 |
| "跑探针收集点数据再说" | 没有 kill/scope 分支的探针在 prereg 就被拒。每个探针都要能杀死点什么。 |
| "换个 pid 把同一个探针再登一遍" | 同 question、同 bands = 旧探针换了身衣服。server 只拒重复 pid，这条只能靠你——重复探针不产信息，只稀释校准账本。 |

## 快速参考

| 步骤 | 动作 | 成功条件 | 执法 |
|---|---|---|---|
| 对象 | 锚 + 无聊对手自查 | 说得出判别哪对 | 纪律 |
| SELECT | ≥2 设计比互斥对 | P(kill)/成本排序 | 纪律 |
| 预登记 | prereg_write 四件套 | 返回 pid | 互斥/宽度/kill【结构】· severity 纪律 |
| 执行 | probe_run | LANDED 或 FAILED | 沙箱【结构】 |
| 落账 | claim_transition | 答"杀死了什么" | 带外拒绝【结构】 |

## 交接

- 落带外 / transition 被拒 → `research-moves` 的 `references/triage.md`（强制）
- 设计来源 → `research-moves` 的 `references/oracle.md` 与 `references/derive.md`
- 缺无聊对手 / 需要新假设 → `research-abduce`
- 落地且信念已更新、假设未挨过打 → `research-grill`
