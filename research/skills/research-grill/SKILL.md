---
name: research-grill
description: 用 rlm() 拉起对抗子代理攻击自己的假设：claim_view 构造不对称上下文，攻击写文件扇入，typed 落盘，静默假设逐条清账。
version: 0.2.0
---

# research-grill —— 对抗检验

## 你在做什么

给自己的假设请一个对抗者。它的工作不是复述风险，是**找到你错在哪**。

## 信息不对称（结构，不是纪律）

对抗者看得到**主张与证据**，看不到你**为主张辩护的推理**——给了推理，
对抗就退化成复读。`research_kit.claim_view(run, "H1")` 替你构造这个上下文：
claim + 证据探针（频段与观测）+ graveyard，不含 transition notes。

## 程序

1. 对每个要攻击的 claim（LIVE 与 SUPPORTED 都在列），kernel 里构造并拉起：

   ```python
   view = research_kit.claim_view(run, "H1")
   handle = await rlm(
       view + "\n\n你是对抗性评审。用四个镜头攻击上面的主张："
       "占据度（现有证据真能区分它与竞争解释吗）、机制（因果故事漏了什么"
       "混合/总体解释）、测量（指标与频段设计有没有偷换）、框架（问题本身"
       "是不是问错了）。graveyard 必须逐条点名——装看不见即失职。"
       "把每条攻击写进 Path(os.environ['RLM_SESSION_DIR']) / 'attacks.md'："
       "一行一条，格式 `KIND | 目标claim | 具体可检验的表述`，"
       "KIND ∈ new_h/constraint/no_change。",
       name="grill-H1",
   )
   ```

   `rlm()` 在**准入**时返回句柄，不是完成时——立即去读文件必然为空。
   **扇入走文件**：子代理 kernel 的 `RLM_SESSION_DIR` 就是它的会话目录
   （等于父侧的 `handle.session_dir`），所以 prompt 里要写明这个落点；
   父代理在**后续轮次**读 `handle.session_dir / "attacks.md"` 回收——
   这是无 daemon 时唯一可靠的通道，不要等消息。
2. **对抗者记忆**（防止越攻越软）：第二轮起，把上一轮的 attacks.md 原文
   附进新对抗者的输入——它要知道哪些攻击已被消化、哪些被驳回，
   才不会重复已和解的攻击。
3. **静默假设清账**：对每个 SUPPORTED claim 额外追问对抗者——
   "这个结论静默依赖了什么？"每条静默假设落成 `constraint` 攻击，
   **必须带上能了结它的 falsifier 写法**（"若依赖不成立，观测 X 应为 Y"）。
   不可检验的静默假设不是攻击，是收窄声明的素材——送去 research-report。
4. 对每条站得住的攻击，父代理逐条调用 `attack_record` 落成 typed 证据：
   - `new_h`：混合/总体替代解释（若是，回 `research-abduce` 登记成正式假设，
     conflicts 里点名它攻击的主张）；
   - `constraint`：被现有设计忽略的边界条件；
   - `no_change`：某个已落地结果其实不改变信念。
5. 攻击产生了新假设 → 回 research-abduce；暴露了判别缺口 → 回 research-probe。

## 对抗者的产出标准

- 攻击必须**具体到可检验**。"样本可能不够" 不算；"n=30 时频段 [0.8,1.0] 与
  [0.6,1.0] 在 95% 置信下无法区分" 算。
- 对抗者不许和稀泥。它说"整体看起来合理"就是它失职——换一个镜头重问。

## 禁止

- 不替对抗者总结"它其实想说"——用它自己的原话（attacks.md 里的行）。
- 不把攻击留在对话里不落盘——没进 journal 的攻击等于没发生。
- 不鞭尸已被否证的假设（REFUTED/SCOPED）——死人不会复活，除非你带来新证据。
  注意 SUPPORTED 也记录在 graveyard 数组里（终态都入账），但它是**主要攻击
  对象**，不在此禁令内——结论没挨过打就不许进报告。
- 不把你的推理喂给对抗者——用 claim_view，别自己拼"完整状态"。
