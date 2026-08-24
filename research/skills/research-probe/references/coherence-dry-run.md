# Coherence dry-run——在真实执行前把设计在纸面上跑一遍

**何时加载：** prereg 前的设计已经写成步骤，或 coder 实现前、reviewer 审查时。

dry-run 只用虚构的微型输入和静态推导，绝不能运行待登记的 evalCommand、等价
命令或读取真实结果；否则违反“预登记先于观测”。

## 五个动作

1. **数据流形式化：** 写成 producer → consumer；每个符号都有来源，没有循环、
   未定义输入或偷换单位。
2. **微型数值演算：** 用一个人为构造的小实例从头算到尾，检查量级、概率、
   shape 与归一化。算不出来的步骤还不是设计。
3. **退化输入：** 空输入、零长度、全相同、单类、恒等变换、极端阈值分别应返回
   什么；禁止用 clamp/skip 把设计缺陷伪装成实现细节。
4. **claim → step 映射：** 每个主张点名哪个步骤支持，并标为 `established`、
   `conditional`、`overclaim` 或 `empirical`。`overclaim` 立即降级措辞；
   `empirical` 必须进入 prereg。
5. **独立朴素基线：** 不复用候选自己对 baseline 的描述，独立构造最简单版本。
   判断新设计是在正面解决朴素方案的障碍，还是仅增加步骤但与朴素方案等价。

需要重新设计的 finding 是阻塞项；原文交回 analyst/DESIGN，不由 coder 打补丁
掩盖。表面实现缺陷才交给 coder。reviewer 对代码重复同一套 trace，但保持只读。
