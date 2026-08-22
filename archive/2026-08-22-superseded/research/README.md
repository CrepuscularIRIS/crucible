# Research Minimal Core —— 研究战役基础设施

对应计划：`docs/plans/2026-08-22-research-min-core.md`（rev 2）。

一句话：**一个容器化的 Prime Agent 研究战役、五个 skill、三道退出 gate、一个静态 viewer**——
一切为了让一次真实研究战役在认识论上站得住：生成式模型负责提出假设，确定性系统负责保真。

## 目录

```text
skills/
  register/   Python skill：信念状态（claim/probe 状态机 + 四验证器 + journal）
  probe/      Python skill：唯一受认可的执行路径（worktree + 冻结 eval + provenance）
  grill/      Python skill：每轮一次 rlm() 攻击，prompt 只来自 claim_view()
  figure/     Python skill：Qwen-VL 读图 → 结构化证据条目（多模态）
  loop/       markdown skill：路由（ORIENT 仪式 + move 菜单 + 各 claim kind 的验收谓词）
gates/        宿主端退出谓词（stdlib-only）：prereg.py / reconcile.py / review.py
container/    Dockerfile + compose + 模型配置（DashScope 直连）
campaign/     run.sh 宿主编排 + goal 模板
step0/        go/no-go 玩具战役
viewer/       artifacts → 静态 HTML
```

## 分层信任

- kernel 内验证器是"栅栏"（模型可绕过）；宿主端 gate 是"出口"（重放 journal、从原始文件重算）。
- 容器内 gates 只读挂载（转向用）；容器退出后 `campaign/run.sh` 在**宿主**重跑三道 gate（裁决层），
  结果与 which-bound-ended 一并写入 `artifacts/$RUN/ledger.json`，并对 artifacts 打包记录 sha256。
- 密钥永不入库：models.json 的 `apiKey` 是环境变量名 `DASHSCOPE_API_KEY`，
  由 `campaign/run.sh` 运行时从 `~/ClawUI/.env`（`Dash-Model`）注入。

## 本地测试

```bash
cd research
uv venv .venv && uv pip install -p .venv pytest \
  -e skills/register -e skills/probe -e skills/figure
.venv/bin/python -m pytest skills -q
```

## 跑一次战役（Step 2 起）

```bash
cd research
campaign/run.sh <RUN_ID>          # 起容器 → 宿主重跑 gates → ledger.json
```

Step 0 玩具战役见 `step0/README.md`。
