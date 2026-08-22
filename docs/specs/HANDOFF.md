# HANDOFF —— 交接给下一个会话（2026-08-20 晚）

**一页读完：Research OS 的**零件**已经造完并入库（M1–M4，`gates/` selftest 33/33 全绿），
但**一个零件都没接到在跑的循环上** —— `grep` 全仓，没有任何代码 import `spine.py`、
`method.py` 或 `gates/`。下一步不是继续造零件，是**接线**。**

上一份交接（本文件的 08-20 早版）留的两条待拍板**都已经落地**：
`ts-*` 十四个 → 降级到 `plugin/skills_demoted/`；闸门执行机制 → **外层 harness 续跑循环**（`spine.py`）。

---

## 0 · 两个仓怎么分工（先记住这条，不然会改错地方）

| | 仓 | 放什么 | 排法 |
|---|---|---|---|
| **规格源** | `/home/lingxufeng/ClawUI` | 「要做成什么样」 | **根 = 现行真相源；`docs/<日期>/` = 已被取代的历史** |
| **实现** | `/home/lingxufeng/crucible` | 「做成了什么样」 | **全部按日期分目录**，见 `docs/INDEX.md` |

两边排法**故意不一样**，理由写在 `../crucible/docs/INDEX.md`「已知的坑」最后一条。

> ### ⚠️ `ClawUI/clawui/` 是死的
> 冻结在 **2026-08-15**。活的是 `crucible/backend/clawui/`（**2026-08-20**），
> 多四样：`method.py` · `families.json` · `owui_bridge.py` · `prompts/`。
> 同名文件**逐个都不一样**。容器不加载 ClawUI 这份 —— 改这里 = 白改。
>
> **已经踩了一次**：`clawui/nb_solver.py`（215 行，未入库）就写在这个死目录里。
> 要留就搬去 `crucible/backend/clawui/`，要弃就说一声。

---

## 1 · 现在是什么形状

```
浏览器 ── Open WebUI 0.11.0（容器 crucible-webui，:8081，healthy 38h）
             └─ Pipe（backend/clawui/pipe_owui.py，跑在 OWUI 进程内）
                  ▼
          后端（容器 crucible-backend，:4003 **仅回环**，刚重启）
             ├─ host.py       起 run · 翻译事件 · 附件 · 产物
             ├─ mcp_sci.py    14 个自研科研工具
             ├─ agents.py     10 个角色 + LEAD_PROMPT
             ├─ steer.py      PreToolUse + PreCompact 钩子
             └─ run.db        事件全落库，任何 seq 可重放

          ── 以下是 M1–M4 造好的零件，**全部未接线** ──
             ├─ spine.py      续跑循环：terminal 是具名谓词，写进 journal（M2）
             ├─ method.py     M1–M5 按 manifest 形状选方法论
             └─ gates/        2,780 行 · 8 个 py · selftest **33/33 绿**（含正控）
                              grill.py 629 · claims.py 833 · gate.py 423
                              accept.py 200 · evidence_check.py 45

          模型：Qwen 3.7 plus / max 轮替，经自建网关 `:4004`（**已起来**，litellm pid 1073295）
```

**`:4001` 是别的项目在用的共享 litellm —— MUST NOT 改，MUST NOT 重启。**

### 技能层（M3+M4 的成果）

| skill | SKILL.md（启动就进上下文） | references |
|---|---|---|
| `research-os` | **3,037 B** ← 新造的路由器，形状对了 | 6 个阶段文件 |
| `crucible-recall` | 8,224 B | 0 |
| `experimental-design` | 13,949 B | 4 |
| `hypothesis-generation` | 15,567 B | 10 |
| **`grill-loop`** | **69,562 B** ← **主线 B 还没开刀的那个** | 10 |
| `skills_demoted/ts-*` | 14 个，已降级出顶层 ✅ | — |

---

## 2 · 四条不变量（改代码前先记住）

1. **run 跑在后台，不属于任何一次 HTTP 请求。** 断开、换设备、没人读，它照跑到底。
2. **写了 ≠ 生效。** 本仓库反复栽在「管子全通、唯独一处没接上，症状是**安静地什么都没发生**」。
   → **凡是「配置里写了」的东西，必须有一条运行时检查去回读。**
   **M1–M4 现在整个就是这条的最大实例**：2,780 行闸门全绿，但没有执行点。
3. **做不了、做砸了、放弃了照样记一行。** 台账不记等于没发生。
4. **闸门只贴标签，不拦路** —— 这一条要靠接线才能改掉。

---

## 3 · 下一步（按顺序，前两件都是分钟级）

1. **修 H-1 死钩子** —— `plugin/hooks/always-on.sh:9` 指向
   `../skills/crucible-research/SKILL.md`，**该目录不存在**，`[ -f ] || exit 0` 静默放行。
   现在正确的目标是 **`research-os`**（3 KB 路由器，就是为这个造的）。改一个字符串。
   **这是不变量 2 的活体样本，也是最便宜的一次「配置写了没生效」修复。**

2. **量一次启动上下文 token**（主线 C 唯一确定的动作）。
   这是整份拆解里唯一没有测量值的数字 —— 没基线，任何「上下文优化」都无法验收。
   判据：启动 token 降 ≥30% **且** `Skill` 调用次数不降。

3. **接线**（主线 A，真正的活）—— 让 `host.py` 走 `spine.py` 的续跑循环，
   `terminal` 由谓词决定而不是模型自愿退出。
   **验收**（`GOAL-RESEARCH-OS.md` §4，一条都不能少）：跑一次 `Astronomy_003`，留下
   router 被调用 · **≥1 个闸门红转绿写进 journal** · `evidence > 0` 且 `round > 1` ·
   ≥1 次真实 `run_falsifier` · 报告非空带覆盖率与未决计数 · 退出谓词可从 `journal.jsonl` 读出 ·
   selftest 全绿含正控 · `kill -9` 中途能续跑。

---

## 4 · 定位口径（上一轮谈定的，别丢）

真实用户 = **有 taste 的课题组学生**，不是 autoresearch / prime-agent 那种「模型自己演化、没有规则」。
出处是主办方自己的话（`Race/需求拆解文档` 第 296 行）：**「人是导师，agent 是学生/助手」**。

写进 PDF 时四条要成立：

1. **「逆向溯因加载方法论」要落到机制**，否则是口号。它的意思是：
   *不把方法论写成提示词让模型遵守，而是从「论文最终要经得起什么审查」倒推每一步的前置条件。*
   审稿人问「这数字哪来的」→ `evidence_check`；问「怎么排除另一解释」→ G-SELECT ≥2 活假设；
   问「无论什么结果都支持你吧」→ G-DESIGN outcome table 每支必须杀掉一个假设；
   问「先看结果才写的预期吧」→ G-FREEZE 没有预测行就拒绝启动；问「推翻它要什么」→ 每个 kill 带 `reopens_if`。

2. **取舍要说成目标函数之差，不是「做不做 harness」**。评委必然反问「你做了 harness 却说刷分不重要？」
   答法：`Prime 那类 terminal := 分够了`，`我们 terminal := 四锁闭合`。同样是 harness，停止条件不同。

3. **「更有品味」必须操作化**（评委原话：看真实科研价值，不是情绪价值）。四条载体：
   候选只能靠测量或占位离开池、永不靠排名 · 每个实验分支必须杀掉某个假设 ·
   ≥2 个活假设才开工 · 推理只能降级，只有测量能杀死。

4. **「Prime Intellect 遥遥领先」这句必须查证或删掉。** 它是 world fact，且是整个取舍论述的前提，
   前提塌了论述就塌。按项目规矩走 `playwright-extension` 查 ChatGPT，**MUST NOT** 用模型记忆。
   查不到出处就改成不需要排名支撑的说法。

**对照口径**：P18 的同条件比较用 **`evidence_check` 幻觉数字率**，**不是分数**。
「我们不是刷分型」和「我们分更高」互相拆台，只能留一个。
**头条交付物**：一条完整的**闸门红→绿时间线**（模型交结论 → 闸门发现引用的数字不在被引文件里 →
驳回 → 模型补跑实验 → 重交 → 通过）。现在它还只是 M6 里的一个勾选项。
—— 三条 RCB 基线**零个闸门触发**，这是定位与现实之间唯一的硬矛盾，接线就是为了消掉它。

**选 1B 的理由**：不是 B 容易，是 **B 的闭环形状就是 ML 研究的真实工作形状**
（设计→跑→看结果→改下一轮）。1A 没有下一轮，闸门无处安放。

---

## 5 · 红线（MUST NOT）

**安全**
- LLM 生成的代码 **MUST NOT** 在宿主机执行 —— 一律 `docker run --rm -i --network=none`。
- `.env` 和 **`dash.md`** 是活的 API key。**MUST NOT** `cat` / `tail`，输出一律打码。
  （曾误回显过一次 DASHSCOPE key —— 不许再发生。）两份都已 gitignore，`dash.md` 从未入库，已核。
- `~/.config/opencode/opencode.json` 是明文 key，**MUST NOT** 回显。
- **`:4003` MUST 保持 `127.0.0.1`** —— 无鉴权且挂 docker.sock，等于宿主 root。
- **人拥有**：secrets · 花钱 · 公网部署 · force-push · `git push`。

**共享 / 上游**
- **MUST NOT** 改 `/home/lingxufeng/proxy/litellm/config.yaml`，**MUST NOT** 重启它。
- **MUST NOT** fork Open WebUI；**MUST NOT** 动上游 `vendor/`（pdf.js 升级除外）、`benchmark/`。
- ResearchClawBench 上游：只许往 `evaluation/agents.json` 加 preset（备份 `agents.json.bak` 在）。
- **MUST NOT** 改 NeuronBench 的评测代码 —— 改了分数就没有可比性。
- **MUST NOT** 抢用户正在用的浏览器标签页（tab 0 是用户的 OWUI，我们用 tab 1）。

**设计**
- **MUST NOT** 把编排写成固定阶段链（AI4S 的 `ai4s-agent`、AI Scientist-v2 的 `agent_manager.py` 都是这个错）。
- **MUST NOT** 让闸门由模型自己跑 —— **抄谓词，不抄执行权**。
- **MUST NOT** 用域名（Astronomy/Chemistry/…）选方法论 —— 已量过，形状不按域聚类。
- **MUST NOT** 加一个不可能变红的闸门。
- **MUST NOT** 让任何模型判决写 `accepted`（`accept.py`：*一个 goal/loop 可以驱动，但不能宣判无罪*）。

---

## 6 · 已知但**不动**的

**H-2：角色分档被环境变量短路。** `agents.py:48-66` —— `CLAUDE_CODE_SUBAGENT_MODEL`
若已设且 ≠ `inherit`，**赢过并短路**每个角色的 `model=`。`docker-compose.yml` 一直设着它
→ `falsifier` / `auditor` 实际和执行者同一个模型，**跨家族评审是假的**。
修法是删掉它或设成 `inherit`。**没做，因为它改的是实际计费的模型 —— `agents.py:63` 写明「是人的决定」。** 台账 #11。

**NeuronBench 基线不合规**：`refs/neuronbench-runs.jsonl` 只有 1 行，且 `"model": "dsv4flash"`
—— **不是 Qwen**，违反赛题 §5.1「基座模型须使用 Qwen 系列」。整条基线要在 Qwen 上重跑。台账 #10。

**旧交接里一条已经过时**：不要再照抄「build context 是 `./backend`，所以 `gates/` 容器里不可达」。
`../crucible/docker-compose.yml:51` 现在写明**上下文是仓库根**，正是为了把 `plugin/` 与 `gates/` 一起烤进镜像。

---

## 7 · 降级的那批（接线做完之后才动）

不是不做，是**顺序在后面**。编排还会 16 轮就自愿退出的时候跑全量，跑的是同一个洞的 90 次复现。

| 台账 | 事 |
|---|---|
| #10 | NeuronBench 走 crucible harness 取 **Qwen** 基线 |
| #5 | 全量 6 worlds × 3 seeds × 5 配置 |
| #3 | 两轮闭环证据链 plan_v1 → 调整依据表 → plan_v2 |
| #4 | 多模态：膜电位轨迹图 + Qwen 读图（图注必须带 `simulated` 披露） |
| #16 | 同条件对照 —— **口径是幻觉数字率，不是分数**（见 §4） |
| #6 / #7 / #8 | 前端只读页 + 录屏 / 20 页 PDF / 可复现包 |

**日程**：提交 2026-09-05，初审 2026-09-20 —— 从今天算 **16 天**，且演示服务要活到评审期结束。

---

## 8 · 本次整理动了什么

**只动了文件位置和索引，没动任何代码逻辑。全部是 `git mv`，历史保留，未 commit。**

- 27 张根目录截图 → `docs/shots/`（5.5 MB 从根上清掉）
- 立项期 7 份文档 → `docs/2026-08-13/` · `docs/2026-08-14/` · `docs/2026-08-15/`
- **6 份现行规格留在根上**，因为 `GOAL-METHODOLOGY.md` / `GOAL-PHASES.md` 正好卡在 4000 字符上限、
  `GOAL-SKILLS.md` 已超 9 字符，给路径加 `docs/2026-08-20/` 要动契约正文
- 新建 `README.md`（这个仓一直没有入口文件）
- 修好两仓之间因移动而失效的相对链接（`ClawUI` 1 份 + `crucible` 6 份，含 `docs/INDEX.md`），
  并核验「指向被移动文件的引用」为 0 处失效
- `.gitignore` 补上 **`dash.md`**（明文 key，此前未被忽略，一次 `git add -A` 就会进历史）
  和 `Race/*.zip` · `5.6Pro/*.zip`（各 1–2 MB）

**没动**：`docs/COGNITION.md` 和 `docs/PLUGIN-ALIGNMENT.md` 保持不带日期目录 ——
`../crucible/docs/INDEX.md:146` 写明「这次重排踩过一次，已回滚」，尊重这条已记录的教训。

**留给人拍板**：commit。建议分两笔 ——
`chore: 仓库整理（截图与历史文档归档 + README + 链接修复）` 和
`chore: gitignore 明文 key dash.md`。`git push` 归人。
