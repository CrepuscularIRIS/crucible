# Proma 研究层 —— skills + MCP + 极少硬 gate

上一版研究运行时（独立容器、5 个 Python skill、4 道 gate）已归档到
`archive/2026-08-22-superseded/`。本目录是按 `docs/plans/PLAN.md` P2 重建的
版本：**跑在完整适配的 Prime 运行时上**，编排用 skill（自然语言），确定性
用 MCP（工具），硬保证用三道 gate（宿主裁决，退出码说话）。

```
Prime 运行时（Proma 内，RLM 全开）
   ↓ 自然语言编排
research/skills/*          ← 阶段纪律：abduce / probe / grill / report
                             + moves 移动库（reframe/oracle/derive/triage）
   ↓ 调用即事件（UI 可见、可包权限、可拒绝）
packages/research-mcp      ← 确定性底座：四类操作，不调 LLM
   ↓ 宿主判定，退出码说话
packages/research-mcp/gates/* ← 三道硬 gate
```

## 接线（三步）

**1. 注册 MCP 服务器**（Proma 设置 → MCP，stdio 类型）：

```json
{
  "mcpServers": {
    "research": {
      "command": "bun",
      "args": ["<crucible 仓库>/packages/research-mcp/src/server.ts"],
      "required": false,
      "timeout": 30,
      "env": {
        "PROMA_RESEARCH_CWD": "<项目根绝对路径>",
        "PROMA_RESEARCH_RUN": "<本次战役名>"
      }
    }
  }
}
```

服务器在 `PROMA_RESEARCH_CWD`（缺省为 **MCP 进程的工作目录**）下维护
`.proma-research/<run>/`。无状态、无凭据、无 LLM。

**这两个 env 都建议显式设置**：

- `PROMA_RESEARCH_CWD` —— 缺省值是 MCP 进程 cwd，不是你在 UI 里选的工作区。
  P4.3 实测战役因此落在 `apps/electron/.proma-research/`。`research_init`
  会回显绝对路径，**第一次调用后先看一眼落点对不对**。
- `PROMA_RESEARCH_RUN` —— 钉死战役名后 `research_init` 只认这一个。
  P4.3 实测对抗子代理继承了可写 MCP，自行开了一个旁路战役并在里面跑探针；
  服务端看不到 agentID，分不出父子，钉死是唯一的收敛点。

**2. 安装 skills**：把 `research/skills/` 下的目录复制（或软链）到目标
工作区的 `skills/` 目录——战役工作区装七个（loop/abduce/probe/grill/report/
kit/moves）；`research-writing-skills` 是开发期 skill（RED/GREEN 压力测试
研究 skill 本身），不随战役工作区安装。模型经 `<available_skills>` 发现它们，
bash/ipython 打开 SKILL.md 时 UI 会显示 skill 使用标记。`research-moves` 是
生成性认知移动库（reframe/oracle/derive/triage），由信念锚的 ⚠ 计数器提示
调度——底座守证据的诚实，移动库抬假设与实验的上限。

skill 文本遵循统一骨架（铁律 → 程序 → 借口|现实 → 快速参考 → 交接），
P4.3 的实测教训以借口表 + `test-pressure-*.md` 回归夹具双份存档；agent 的
自主裁决落工作区 `RULINGS.md`（`Ruling: 决定 — 理由 — 押错的代价`），
report_declare 前汇总进报告。

其中 `research-kit` 是 **Python-backed skill**（Prime 原生形态）：kernel 启动时
经 `uv pip install --editable` 装进 kernel venv，模型在 kernel 里直接
`research_kit.anchor(run)` 调用，被所有 `rlm()` 子代理继承；改 Python 源码只需
重启 kernel，改 `pyproject.toml` 才触发重装。设计依据与能力利用审计见
`research/DESIGN.md`。

> **装不上时先查这三条**（P4.3 实测 `import research_kit` 报 ModuleNotFoundError）：
> ① `uv` 在 PATH 上，或 `PRIME_AGENT_KERNEL_PYTHON` 指向可用解释器；
> ② skill 目录**是复制/软链过去的**，不是只在 crucible 仓库里；
> ③ 加完 skill 后**重启会话**——kernel 在启动时装包，运行中的 kernel 不会补装。
> 结构性前提（pyproject + `src/research_kit/__init__.py` + 打包路径）已由
> `bun test packages/research-mcp` 锁住，破了会先红。
> **不要用 `sys.path` 手工绕过**——那样子代理继承不到，等于放弃这个 skill 的全部理由。

**3. 跑 gate**（报告完成前）：

```bash
cd <项目根>
bun <crucible>/packages/research-mcp/gates/prereg.ts    .proma-research/<run>
bun <crucible>/packages/research-mcp/gates/reconcile.ts .proma-research/<run>
bun <crucible>/packages/research-mcp/gates/trace.ts     .proma-research/<run>
```

## MCP 工具面（四类，只有这些）

| 类别 | 工具 |
|---|---|
| 信念状态读写 | `research_init` · `research_state`（含 graveyard）· `claim_propose` · `claim_transition` |
| 预登记落盘 | `prereg_write`（时间戳 + sha256 冻结） |
| 受认可执行 | `probe_run`（bwrap 沙箱内只跑冻结命令：只读 FS、断网、清环境；非零退出/超时不落地） |
| 从 raw 重算 | `metric_recompute`（json 点路径 / 正则；永不执行模型代码） |

对抗证据：`attack_record`（typed：new_h / constraint / no_change）；
报告声明：`report_declare`（sha256 冻结，gate 2 对账依据）。

**评测专用（EVAL-PLAN §1.3）**：`world_simulate(mode=info)` 只透传 benchmark
`problem()` 并记 `world.info`；`world_observe` 扣预算并记 `world.observe`；
候选机制模拟记 `world.simulate`；`world_forecast` 记 `world.forecast`，同一 run
只允许一次，裁决后世界接口关闭。预算与终局唯一性均由只追加 journal 掌权，
`world-ledger.jsonl` 只是展示明细。`PROMA_RESEARCH_DENY` 未覆盖 benchmark 根时
全部 `world_*` 工具 fail closed 不注册。kernel 不能被此沙箱结构性封死，因此
评测脚本还会拒绝直连 benchmark/meter，并由 `liveness.py` 检出实际读取/import；
这项泄漏是必须报告的指标，不再伪称 meter 与 journal 是两个独立记账者。

## 三道 gate

**declare 即裁决（P3.2）**：`report_declare` 在 server 内当庭跑三道 gate——任何一道红，
声明被拒绝且不产生任何 journal 事件；全绿才写入 `report.declare` + `gate.verdict`。
独立 CLI 是用户/CI 的复核通道（与内嵌裁决同一份实现）。

| gate | 检查 | 旧教训来源 |
|---|---|---|
| `prereg` | 每个被执行探针先有预登记（journal 顺序 + 时间戳 + sha256 一致）；频段互斥 + kill/scope 分支；空 run 不通过 | 先登记后执行 |
| `reconcile` | 报告每个数字带 (P#) 出处且与重算值一致（舍入容差按引用值小数位，上限 1%）；结论行与 register 一致；裸 `H\d+` 引用必须存在 | 幻觉数字 / F1 死锁 / F7-F9 |
| `trace` | journal 重放结果与 register.json 逐字一致（手改即红）；终态可追溯到落地探针；时间戳单调；world 预算快照/一次终局/终局后关闭可重放；空 run 不通过 | **四道 gate 曾对捏造战役全绿** |

## 沙箱注意事项

- 探针在 bwrap 内以只读根运行：项目文件天然可见；但**工作区若位于 /tmp 下**，
  会被沙箱的 tmpfs `/tmp` 遮蔽（首场战役 P1–P5 因此失败，模型用 heredoc 内联
  绕过）。真实项目目录不受影响。
- 沙箱内无网络、无宿主环境变量（只有 PATH/HOME/LANG）、超时（默认 10 分钟）
  按非零退出处理。

## 防篡改与它的天花板（P3.3）

server 在内存记住 journal 的 sha256 基线，每个工具调用先校验；会话外改动会被
全部工具拒绝并落 `tamper.detected` 事件，该 run 在本 server 生命周期内永久污染。
**天花板**：server 重启后基线重置（届时靠 trace 的逐字重放兜底）；与 agent 同权限
的进程终究能伪造一切——真正的墙是把 agent 本身关进沙箱，本阶段明确不做。

`gates/gates.test.ts` 是全绿集成测试：一份诚实产物（含未检验 LIVE 假设）
三道同时通过，四种蓄意破坏分别变红。**改任何 gate 前先跑它。**

## 带走的科学约束（实测过，不要重新推导）

1. **互斥频段**——预测频段两两重叠的实验是装饰性的：无论结果如何信念都不会
   改变。至少一对互斥频段 + 至少一个 kill/scope 分支，server 侧结构拒绝。
2. **先登记后执行**——预登记带时间戳与 sha256，事后补登记与"我本来就是这么
   想的"无法区分。
3. **从原始文件重算**——永不采信报告里的数字。指标按冻结规约从 raw 重算。
4. **终态可追溯**——任何终态结论都能追到一次真实落地的探针与预登记分支。
5. **graveyard 必须可见**——要求对抗者点名已死假设，就必须把 graveyard 给
   它看。不给却要求，它每次都必败。

## 三个教训（为什么长这样）

1. **gate 必须检查"状态是怎么来的"**——旧版所有 gate 把模型可写的状态文件当
   事实读，一场完全捏造的战役全绿。现在 journal 是唯一事实源，register 只是
   重放缓存，trace gate 逐字对账。
2. **gate 之间不能矛盾**——旧的 review 要求每个 claim 有结论行，reconcile 又
   拒绝任何无 artifact 的引用，存在未检验假设时报告在数学上无解。现在结论行
   只要求与 register 一致（未检验的照写 LIVE）。
3. **"实现了但不可达"比没实现更危险**——所以技能里每条纪律都对应一个可调用
   的工具，工具拒绝是响亮的（Python skill 失败会 raise，比 markdown 没被读
   好得多）。

## 与 Prime 运行时的关系

- 阶段编排在 skill 里，用自然语言表达；改流程 = 改 markdown。
- 对抗子代理走 kernel 的 `rlm()`（见 `research-grill`）——不另造 agent 注册表。
- `ipython` 工具在 Proma 里经权限包装（P0.1）；`probe_run` 在 bwrap 沙箱内
  执行预登记时冻结的命令（只读 FS / 断网 / 清环境变量 / 超时即弃），缺失
  bwrap 时结构性拒绝，绝不回落宿主执行（P3.1 红线）。
- 本层不依赖 Electron 内部 API：MCP server 是普通 stdio 进程，技能是纯
  markdown，gate 是普通脚本——换个宿主（Claude Code / Codex）照样能跑。
