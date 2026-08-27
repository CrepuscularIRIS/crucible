# PACK 3 · 预登记与可复现性谱系:我们的血缘与分界

> **配套上传(同一会话)**:`REFS-local-corpus.md` + `REFS-our-implementation.md` + `REFS-papers-docs.md` —— 本机参考语料/我们的实现基理/论文与设计文档清单,均在本目录。本包问题可引用它们作对照。

```
PROMPT(粘贴为提问):
梳理「预登记(preregistration)→ 可复现性工作流 → LLM/agent 实验预登记」
的谱系,并回答本文件 Q1-Q6。重点:有没有人把预登记做成 agent 运行时的
结构性闸(而非人类协议或文档模板)。
```

## 背景

我们的系统把预登记做成了**机器强制的结构闸**:探针登记时冻结
evalCommand(sha256+时间戳),登记时拒绝零宽频段(点预测=回忆)、
拒绝无互斥频段对(装饰性探针)、拒绝常量回显命令;执行只跑冻结字符串;
迁移必须引用已落地探针;report 引用的每个数字必须能从 raw 重算。
这是把人类科研的预登记规范编译成类型检查器。

## 已知谱系锚点

- 预注册临床试验/OSF 传统(Center for Open Science)
- COS 的 llm-benchmarking 项目(模块化 LLM 评测框架)
- ReplicatorBench(COS,KDD 2026:要求 agent 预登记复现计划再执行分析)
- arXiv 2606.27687 等预登记协议(防 prompt/参数/模型调优的 p-hacking)
- **POPPER**(oss/POPPER;论文《Automated Hypothesis Validation with Agentic Sequential Falsifications》arXiv 2502.09858,Huang/Jin/…/Candès/Leskovec)
  ——**第一优先精读**:agentic 序贯证伪做自动假设验证,名字与目标都最近。
  必查:其证伪循环有没有「预测先于结果」的结构约束,还是 agent 自主裁量。
- Popper 式可复现工作流谱系(POPPER 之外)

## 问题

- **Q1**:预登记从人类协议到「计算强制」的演化:有没有先例把预登记做成
  不可绕过的系统组件(临床 trial 系统之外的)?
- **Q2**:ReplicatorBench 的预登记是协议要求(文档级)还是结构强制
  (系统级)?细节与引文。
- **Q3**:「预测先于结果」在 ML 实验管理工具(MLflow/W&B/等)里有没有
  时间戳+哈希级保证的实现?
- **Q4**:零宽频段拒绝/互斥频段对这类**频段语义闸**,是否有任何先例
  (预测区间必须有宽度、假设必须有可区分预测)?
- **Q5**:LLM agent 语境下的 p-hacking/hindsight 偏差实证有哪些?
  (我们引作动机)
- **Q6**:综合:我们的定位句应该怎么写——「预登记的结构编译」在谱系上
  站在哪里?

## 输出格式

每问【证实/并行/证伪/空白】+ 引文(标题·链接·年份)+ 一句话结论。
最后:一段 ≤120 字中文定位句 + 谱系图(文本树:人类协议→文档模板→
CI 检查→运行时结构闸,标注各节点代表工作与我们位置)。
