# 研究层的 Prime 原生设计（P4.2 · 2026-08-23）

依据：`docs/product/{Fable5,PrimeAgent}.md`（能力目标）· ARFT（2608.14905）·
`~/ccf/{Event.en,ARBOR,PRIME-AGENT-READING}.md` · `~/workspace/.claude`（GRILL 原版）·
`~/cli/Arbor`（实现审读）· `~/oss/prime-agent` 源码勘察（2026-08-23 三路并行扫描）。

## 一、能力利用审计（此次重写为什么发生）

Prime + Proma 集成后可用、而 P2 版技能**没有用上**的原生机制：

| Prime 原生机制 | P2 版现状 | 本版处置 |
|---|---|---|
| **Python-backed skill**（SKILL.md + pyproject + `src/<name>/`，kernel 内按 import 名直接调用，出错即 raise；被所有 rlm 子代理继承） | 五个纯 markdown skill | 新增 `research-kit`：kernel 侧只读工具箱（锚、claim_view、判别表、校准账本）。Proma 的 skillsOverride 是纯过滤器（`pi-agent-adapter.ts:538`），Prime 自己的 loadSkills 先跑，python 检测保留 |
| **kernel 跨压缩存活**（变量/import 全保留，compaction 摘要明示这一点） | 信念状态只靠每次调 `research_state` | `research_kit.anchor()` 把紧凑锚存进 kernel 变量：压缩后 `print(research_kit.LAST)` 一行找回，不再重新拉取 |
| **rlm() 子代理 + 文件扇入**（admission 返回句柄；产出走文件——无 daemon 时唯一通道） | grill 用了 rlm() 但回收方式含糊 | grill 明确：子代理把 typed 攻击写进 `handle.session_dir/attacks.md`，父代理读文件后逐条 `attack_record`。对抗者记忆 = 上一轮攻击文件回喂（无 daemon 的"retained adversary"） |
| **信息不对称构造**（prompt-as-a-variable：子代理只拿到你构造的上下文） | grill 把"完整状态"整个塞给对抗者——含提出者的论证 | `research_kit.claim_view()`：claim + 证据 + graveyard，**不含 transition notes**（提出者的理由）。"不许看提出者的推理"从纪律变成函数参数（PrimeAgent.md §2） |
| **goal + autonomous（in-process 可用）** | 未用 | 不在本阶段接——UI 交互式战役用不到；无人值守长战役时 `--autonomous-gate` 挂三道 gate CLI 是现成的路，记在此处备用 |
| **harness subagent 条目 / refine** | 未用 | 暂不用：角色定义住在 grill skill 的 prompt 里已够（ponytail 第 1 级）。跨战役经验沉淀是 refine 的地盘，等真实战役产生素材再说 |

**明确不做**：kernel 侧直连 research-mcp（会起第二个 server 实例，P3.3 防篡改把
彼此的 append 当篡改；且失去 UI 可见性与权限包装——P2 的"register 放 MCP"决定
不变）。kernel 侧一切**只读**，读 server 维护的派生缓存 `register.json`。

## 二、从三份参照吸收什么（及不吸收什么）

**GRILL（~/workspace/.claude）**——吸收的是**问法**，全部进 skill 散文：
静默假设清账（P7–P19 模式 → constraint 攻击带 falsifier 写法）、对照臂即必需臂、
收窄结论而非检验不可检验（P7/P16 解法）、四角色契约里 `OUT OF SCOPE` 是干活的
字段、"发帖不等于收割"。**不吸收**：hooks/gate.py/快照 机制（journal+MCP 已是
更强形态）、`LOAD WHEN:` 头（实测 0 触发）。

**Arbor（~/cli/Arbor，生产级，385 tests）**——吸收四条：
1. **constraints block**：graveyard 渲染成**禁令**而非数据（"不许重提共享同一
   隐藏假设的想法，除非明确反驳该教训"）→ `research_kit.anchor()` 的 graveyard 段；
2. **Conflicts 行**（四行假设契约的第 4 行）→ `claim_propose` 新增 `conflicts`
   参数，graveyard 非空时结构性必填；
3. **needs_retry ≠ done**——预算耗尽不得洗成假设被否证 → 88cfa6a 已独立实现
   （FAILED 态），互证；
4. **干预送达决策点**（收敛升级信息进 tool result 而非系统提示）→ server 报错
   信息即路由，P4.1 顺带打磨。
**不吸收**：idea tree（claim 的记忆形状不对，PrimeAgent.md §3 已裁）、单调分数
merge gate、LOAD_RECEIPT（无 checker 的 prompt 恐吓）。

**ARFT**——设计的靶子不变：F.4（82.5% 发现致命缺陷仍照常发布）证明 epistemic
prompting 无效，唯一修法是"信念改变必须有语法，语法有模型不拥有的类型检查器"。
本层的 MCP+gate 就是那个检查器；技能只负责把模型的提议质量抬高。

## 三、本版形状

```
research/skills/
  research-loop      markdown   路由 + 锚仪式（压缩后/每次相变先 anchor）
  research-abduce    markdown   假设登记 + Conflicts 纪律
  research-probe     markdown   SELECT（判别表）→ 预登记 → 沙箱执行 → 台阶分诊
  research-grill     markdown   claim_view 不对称对抗 + 攻击文件扇入 + 记忆回喂
  research-report    markdown   对账格式 + 校准账本段 + 收窄声明
  research-kit       python     kernel 只读工具箱（下表）——被所有子代理继承
packages/research-mcp            唯一写路径（不变）
packages/research-mcp/gates      三道硬 gate（不变；P4.1 加对抗义务）
```

`research_kit`（stdlib only，零依赖，全部只读）：

| 函数 | 作用 | 服务哪个 move |
|---|---|---|
| `anchor(run)` | ~1k token 紧凑锚：LIVE 一行一条 · graveyard 禁令体 · 探针状态 · 攻击计数；存 `research_kit.LAST` | ORIENT（Fable5 §2 的 always-on anchor） |
| `claim_view(run, id)` | 对抗者上下文：claim + 证据探针 + graveyard，**无 notes** | CHALLENGE 的信息不对称 |
| `disjoint_pairs(bands)` | 频段表 → 不重叠假设对 | SELECT：≥2 候选探针先比判别力再预登记 |
| `calibration(run)` | 每个落地探针：预测频段 vs 观测值 · 内/外 | 校准账本（report 引用；跨战役品味数据） |

天花板（诚实声明）：kernel 侧读 register.json 有写后读延迟（server 每次写后刷新，
间隙极小但存在）；journal 仍是唯一权威，分歧时以 `research_state` 为准。
