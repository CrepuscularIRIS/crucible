我按你描述的“自动科研 tournament”看了目前的 `Infatoshi/crucible`。先给结论：

**这个阿里云 AI Scientist 比赛并不要求“全程零人工、所有东西由 Agent 自动产出”。它真正要求的是“科研闭环 + 可验证 + 可迭代”，而且最新版规则明确允许“自动校正或人工反馈后的迭代优化”。** 也就是说，Human-in-the-loop 不仅允许，实际上是赛题设计的一部分。([Aliyun University][1])

但你们现在还有一个比“全自动还是 HITL”更需要先处理的问题：**最终参赛 runtime 的基座模型必须是 Qwen。** 如果最后直接用 Claude Agent SDK + Claude 作为核心科研 Agent，我认为有明显合规风险。Claude Agent SDK 可以作为研发、benchmark、reference harness，但正式提交版本最好把主 Agent backend 切成百炼上的 Qwen。官网现在允许“智能体编排、skills 设计、system harness 工程”，但基座模型要求仍然是 Qwen。([Aliyun University][1]) 解析会整理稿也补充过“可以外接其他模型做优化，但基座必须是 Qwen”，而该文档自己注明口径冲突时以官网为准。

所以你们比较合适的方向不是：

```text
Claude Code
    ↓
Claude Agent SDK
    ↓
最终参赛
```

而应该是：

```text
                    ┌─ Claude Agent SDK
                    │   用于研发 / benchmark / oracle
Research Harness ───┤
                    │
                    └─ Qwen / Bailian Runtime
                        用于正式比赛
```

也就是把你们之前做的自动科研插件，尽量全部做成 **model-agnostic 的 Skill / MCP / Tool**，不要绑定 Claude。

---

### 1. Crucible 很适合你们，但不要直接把它当比赛框架

如果说的是 `Infatoshi/crucible`，它本质上是一个“多 Agent 自动研究竞赛 harness”：每一轮给 Agent 一个 fresh sandbox，Agent 写 `solution.py`，GPU/程序自动评价，最好结果成为下一轮的 `prior_best.py`，然后继续迭代。

它现在的主循环基本就是：

```text
Research problem
      ↓
Agent A / Agent B
      ↓
write solution.py
      ↓
mechanical evaluator
      ↓
fitness
      ↓
select best
      ↓
prior_best.py
      ↓
next round
```

`Tournament` 就是明确这么实现的：每轮重新创建 sandbox，Protocol 准备 workspace，运行 Agent，执行 `evaluate()`，选择 fitness 最好的结果，随后把 winning solution 带进下一轮。

它的 Protocol abstraction 也很适合你们。每一个科研任务只需要定义：

```text
setup_workspace()
get_system_prompt()
get_initial_message()
evaluate()
fitness_key
fitness_direction
```

所以我不会重写 Crucible 的 orchestrator。

我会直接把你们的自动科研系统塞进这个 interface 里。

不过 Crucible 当前内置的 5 个 protocol 是：

```text
kernel optimization
quantization
mechanistic interpretability
scaling laws
reward hacking
```

它们主要测试“Agent 自动修改 ML artifact → evaluator 给分”，还不等于你们比赛需要的：

```text
问题理解
→ 文献检索
→ 事实/证据抽取
→ 假设生成
→ 反例检索
→ 实验设计
→ 实验执行 / 仿真
→ 数据分析
→ 修改假设
→ 下一轮实验
→ 最终研究计划
```

所以 Crucible 应该是你们的 **evaluation substrate**，而不是完整的 AI Scientist benchmark。

---

### 2. 比赛到底要不要全程自动？

最新版官网说得其实非常明确。

赛道一要求 AI 应用参与：

```text
科学假设生成
研究计划设计
实验任务规划
数据分析
反馈迭代
```

重点考察的是有没有“清楚的科研闭环”，以及能不能基于真实数据和文献继续推进下一步研究，并“在必要时完成自动校正或人工反馈后的迭代优化”。([Aliyun University][1])

方向 1A 更直接：

```text
问题理解
→ 知识整合
→ 候选假设生成
→ 证据梳理
→ 研究计划输出
→ 反馈修正
```

允许用：

```text
多轮资料补充
证据完善
方案评分
版本比较
人工反馈
```

来展示自迭代。([Aliyun University][1])

方向 1B 才更接近你说的“自动科研”：

```text
任务规划与实验设计
→ 实验运行与数据获取
→ 数据分析
→ 反馈迭代
→ 调整下一轮实验
```

而且评委会明确看：

> 数据获取和分析有没有真的影响下一轮计划，而不是只生成一次方案。

([Aliyun University][1])

早期官方 PDF 其实也已经把“智能体思辨与人在回路”列为四项核心能力之一，并不是要求无人参与。

所以准确地说：

**比赛要求的是“AI 驱动科研闭环”，不是“无人科研”。**

也没有任何规则说：

> 技术方案 PDF、演示视频、项目介绍、所有最终提交材料也必须完全由 Agent 自己生成。

相反，比赛要看代表性测试案例、系统工作流、上下文工程、数据来源、结果展示和反馈迭代。([Aliyun University][1])

---

### 3. 但是你们最好同时做两个模式

我会直接做：

```text
Mode A — FULL AUTO

Research Question
    ↓
Literature Research
    ↓
Evidence Extraction
    ↓
Hypothesis
    ↓
Critic / Falsification
    ↓
Experiment Design
    ↓
Experiment / Simulation
    ↓
Analysis
    ↓
Hypothesis Revision
    ↓
Next Experiment
    ↓
Final Research Artifact
```

全程 0 人工 intervention。

以及：

```text
Mode B — HITL

Research Question
    ↓
...
Hypothesis
    ↓
[Human review / approve / edit]
    ↓
Experiment
    ↓
...
```

然后报告直接做对照：

| 模式        | Task success | 最终质量 | 迭代提升 | 人工介入 | 时间 | 成本 |
| --------- | -----------: | ---: | ---: | ---: | -: | -: |
| Full Auto |              |      |      |    0 |    |    |
| HITL      |              |      |      |  1–2 |    |    |

这会比单纯强调“我们完全无人化”更有说服力。

因为比赛评分里真正出现的是：

* 科学事实准确性
* 模型/Agent/Skill 设计完整性
* 结果校验、反馈迭代与稳定性
* 真实使用价值
* 演示/交付完整度
* 代码、结果和流程可复现性

而不是“无人化率”。([Aliyun University][1])

所以全自动应该成为你们的 **technical capability**，而不是错误地理解成 **hard requirement**。

---

## 4. 你们现在 Claude Code → Agent SDK 的迁移方式基本对，但需要再抽象一层

Crucible 现在的 Claude integration 还非常粗暴。

`src/agent.py` 实际上就是 subprocess：

```text
claude
--print
--dangerously-skip-permissions
--output-format json
--model opus
...
```

所以建议不要直接把：

```python
_run_claude_cli()
```

改成一堆 Claude SDK-specific 代码。

最好先抽：

```text
AgentBackend
    │
    ├── ClaudeCodeCLIBackend
    │
    ├── ClaudeAgentSDKBackend
    │
    └── QwenBailianBackend
```

上层统一：

```text
run(
    workspace,
    task,
    tools,
    max_turns,
    timeout,
    budget
) -> AgentRun
```

这样你的 Crucible：

```text
Tournament
Protocol
Sandbox
Evaluator
RunLog
```

完全不用知道底下跑的是 Claude 还是 Qwen。

这非常重要，因为最后你们一定要做：

```text
Claude SDK → development benchmark
Qwen       → competition benchmark
```

否则现在插件全部重新适配 Claude SDK，过两周又为了 Qwen 重写一次。

---

## 5. Claude Agent SDK 本身很适合拿来先验证插件

现在 Agent SDK 已经可以直接使用 Claude Code preset tools、project skills、MCP/custom tools，所以你们原来大量 Claude Code 自动科研能力没必要重新写 Agent loop。

例如目前 SDK 支持：

```text
Claude Code tool preset
system prompt preset
MCP servers
custom tools
skills
hooks
subagents
maxTurns
sessions
permissions
```

([Claude][2])

这里我尤其建议用 SDK 的自定义 MCP tool。

把你们现在的插件统一成：

```text
literature_search
paper_download
paper_parse
citation_verify
dataset_search
dataset_download
python_analysis
run_simulation
statistical_test
plot_result
hypothesis_score
novelty_search
contradiction_search
experiment_runner
```

然后 Claude SDK 和 Qwen runtime 都调相同的 tool server。

这时真正需要适配的只有：

```text
Model/Harness layer
```

而不是：

```text
Scientific capability layer
```

---

## 6. 正式测试的时候，不要马上跑“大自动科研”

建议按 4 层走。

第一层先测试 **CLI → SDK 有没有退化**。

保持完全一样：

```text
same model
same task
same workspace
same plugins
same timeout
same evaluator
```

只换：

```text
Claude Code CLI
        vs
Claude Agent SDK
```

至少跑 5 次 seed，统计：

```text
Task Completion Rate
Final Fitness
Tool Call Count
Tool Failure Rate
Turns
Latency
Tokens
Cost
Sandbox violations
```

这里 Crucible 正好能用。

另外我在代码里看到一个小问题：`Tournament` 有 `max_turns_per_agent`，`run_agent()` 也收了 `max_turns`，但是当前 Claude CLI 调用没有真正把这个参数传给 `_run_claude_cli()`。

所以你们迁 SDK 的时候，顺手把 turns/budget 做成真正的硬限制。

---

第二层测试 **每个科研 plugin**。

不要上来就测“能不能自动发现新科学”。

先测：

```text
paper_search
    ↓
给固定 query
    ↓
召回率 / 引用真实性

paper_parse
    ↓
给固定 PDF
    ↓
事实抽取准确率

citation_verify
    ↓
给真假 citation
    ↓
precision / recall

data_analysis
    ↓
给固定 dataset
    ↓
结果与 reference 是否一致

experiment_runner
    ↓
给固定 config
    ↓
能否完成并产生标准 artifact
```

每个插件都需要：

```text
normal case
edge case
timeout
bad input
empty result
API failure
malformed output
```

这部分尽量不要靠 LLM judge。

---

第三层再测试真正的 **AI Scientist loop**。

我建议你们直接给 Crucible 新增一个：

```text
ScientificResearchProtocol
```

workspace 每次必须留下这样的 artifacts：

```text
problem.md

evidence/
  papers.json
  facts.json
  contradictions.json

hypotheses/
  hypotheses_v1.json
  hypotheses_v2.json

experiments/
  plan_v1.json
  result_v1.json
  plan_v2.json
  result_v2.json

analysis/
  analysis_v1.json
  analysis_v2.json

final/
  research_report.md
  provenance.json
```

重点不是最后 `research_report.md` 漂不漂亮。

重点看：

```text
result_v1
    ↓
有没有真正改变
    ↓
plan_v2
```

这就是比赛最看重的东西。

---

第四层才跑你说的 **正式自动科研**。

例如选 5 个真实问题，每题跑 5 个 seeds：

```text
5 problems
× 5 seeds
× 4 variants
= 100 runs
```

Variants：

```text
A. Qwen baseline
B. Qwen + basic tools
C. Qwen + full research plugins
D. Qwen + full plugins + HITL
```

如果你还想做研发 benchmark：

```text
E. Claude SDK + full plugins
```

作为 upper-bound/reference。

最后你们报告就能真正说：

```text
Research plugins
Task completion +31%

Citation validity
82% → 97%

Closed-loop completion
44% → 86%

Experiment-to-next-plan linkage
51% → 91%
```

而不是“我们这个 Agent 看起来很聪明”。

---

## 7. Crucible 最值得你们借鉴的反而是它失败的地方

这个 repo 最有价值的发现其实不是 tournament。

而是 **reward hacking**。

它最开始把 evaluation 信息暴露给 Agent，Claude、Codex、Grok 分别找到了不同作弊方式。后来才加 hidden eval 和 sanity checks。

所以你们正式自动科研 benchmark 一定要：

```text
Agent workspace
        │
        X 不能访问
        │
Hidden evaluator
Hidden test data
Scoring code
Ground-truth annotations
```

而不要：

```text
workspace/
    task.md
    papers/
    evaluate.py       ← Agent 可读
    test_data.json    ← Agent 可读
```

尤其你们 Agent 有 bash、Python、文件读取和 web 的情况下，它非常容易 reward-hack。

Evaluator 最好放另外一个 process/container：

```text
Agent Container
      ↓
artifacts only
      ↓
Evaluator Container
      ↓
score
```

评分也要尽量自己重新计算：

```text
Agent claimed metric ❌

Evaluator recomputed metric ✅
```

Crucible 的测试覆盖目前也比较轻，repo 只有一个核心测试文件，主要测 sandbox、tool blocking、logging、protocol setup 等基础组件，并没有形成科研质量 benchmark。

所以不要误以为 clone Crucible 跑过 pytest 就“自动科研测试完成了”。

---

## 8. 还有一个 benchmark 方法上的坑

Crucible 是：

```text
Round 1 best
   ↓
Round 2 prior_best
   ↓
Round 3 prior_best
```

这个很适合测：

> 能不能 iterative research。

但不适合单独测：

> Agent 本身到底多强。

因为后面的 round 已经吃到了前面 winner 的信息。

所以你们最好同时维护两个 evaluation mode：

```text
Benchmark Mode

每次 fresh start
不共享 prior best
→ 比较 Agent / Plugin 能力
```

以及：

```text
Research Loop Mode

允许 previous result
允许 feedback
允许 prior best
→ 测科研闭环和迭代能力
```

两个分开。

这样比赛报告会非常扎实：

```text
Single-run capability
+
Iterative improvement capability
```

都能证明。

---

## 9. 我会把你们比赛系统最终收敛成这个结构

```text
                 Research Question
                        │
                        ▼
                Qwen Main Scientist
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
    Literature      Data Tools     Experiment
      Skills          Skills          Skills
          │             │              │
          └─────────────┼──────────────┘
                        ▼
                Evidence Store
                        │
                        ▼
              Hypothesis Generator
                        │
                        ▼
               Critic / Falsifier
                        │
                        ▼
              Experiment Planner
                        │
                        ▼
           Simulator / Real Experiment
                        │
                        ▼
                Result Analyzer
                        │
                        ▼
             Revision / Next Round
                        │
                 ┌──────┴──────┐
                 ▼             ▼
              AUTO           HITL
                 │             │
                 └──────┬──────┘
                        ▼
               Final Research Artifact
                        │
                        ▼
                 Hidden Evaluator
```

Claude Agent SDK 的作用变成：

```text
Reference Agent
+
开发这些 skills/tools 时的高能力测试 harness
+
和 Qwen 做对照实验
```

而不是最终比赛唯一 runtime。

---

所以你们现在的开发优先级，我会排成：

**第一：先把科研插件从 Claude Code 解耦，统一成 MCP/Tool/Skill contract。**

**第二：把 Crucible 的 `run_agent()` 抽象成 Backend，先实现 Claude CLI、Claude SDK、Qwen Bailian 三个 adapter。**

**第三：先跑 CLI vs SDK parity，确认迁移没有能力退化。**

**第四：新增 competition-specific `ScientificResearchProtocol`。**

**第五：先做 2–3 轮小闭环，确认“实验结果真的修改下一轮计划”。**

**第六：隐藏 evaluator，然后才开始大规模自动科研 benchmark。**

**第七：最终同时展示 Full Auto 和 HITL，但比赛主 runtime 用 Qwen。**

如果现在就是准备正式开工，我认为下一步最有价值的是直接把 **`Infatoshi/crucible` 当前代码结构 + 你们 Claude Code 插件迁移目标**拆成一个具体的改造方案：哪些文件保留、`src/agent.py` 怎么抽象、Claude Agent SDK adapter 怎么接、Qwen adapter 放哪、`ScientificResearchProtocol` 怎么定义，以及第一批 benchmark case 怎么组织。这样基本就可以直接开始改代码。

[1]: https://university.aliyun.com/action/tzbjbgs2026?utm_source=chatgpt.com "挑战杯｜2026年度“揭榜挂帅”阿里云榜题：基于国产开源大模型的AI Scientist的研发与应用"
[2]: https://code.claude.com/docs/en/agent-sdk/python?utm_source=chatgpt.com "Agent SDK reference - Python - Claude Code Docs"
