#!/usr/bin/env python3
"""fig6: demo2r 两轮闭环对照(journal 真值,评委可复算)。

数据源:research/campaigns/demo2r-2026-08-28-ca/round{1,2}/run/journal.jsonl
逐字段核对过(见 NOTES.md);MSE 跨 seed 不可直比,图中如实标注。
"""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

for f in ["Noto Sans CJK SC", "Noto Sans CJK JP", "AR PL SungtiL GB"]:
    try:
        font_manager.findfont(f, fallback_to_default=False)
        plt.rcParams["font.family"] = f
        break
    except Exception:
        continue
plt.rcParams["axes.unicode_minus"] = False

C_R1, C_R2, C_BASE, C_BAD = "#b45309", "#1d4ed8", "#94a3b8", "#dc2626"

fig, axes = plt.subplots(2, 2, figsize=(11, 8.5))
fig.suptitle("图6 · 两轮闭环对照(demo2r-ca,qwen3.7-plus@百炼 TokenPlan,journal 真值)",
             fontsize=13, fontweight="bold", y=0.99)

# A: MSE(跨 seed 如实标注)
ax = axes[0][0]
labels = ["qwen3.8-max\n(E1M,seed0)", "qwen3.7-plus\n(E1,seed0)", "第一轮\n(seed 0)", "第二轮\n(seed 1)"]
vals = [35.533, 9.225, 6.595, 14.333]
colors = [C_BASE, C_BASE, C_R1, C_R2]
bars = ax.bar(labels, vals, color=colors, width=0.62)
bars[3].set_hatch("//")
bars[3].set_edgecolor("white")
for b, v in zip(bars, vals):
    ax.text(b.get_x() + b.get_width() / 2, v + 0.6, f"{v:.2f}", ha="center", fontsize=10)
ax.set_title("A · 终局预报 MSE(6 协议)", fontsize=11)
ax.set_ylabel("spike_forecast_mse")
ax.text(0.98, 0.72, "第二轮为 seed 1:\n跨 seed 不可直比,\n斜线仅示记录", transform=ax.transAxes,
        ha="right", fontsize=8.5, color="#475569")

# B: 预算纪律
ax = axes[0][1]
labels = ["第一轮", "第二轮"]
spent = [11, 4]
bars = ax.bar(labels, spent, color=[C_BAD if s > 8 else C_R2 for s in spent], width=0.45)
ax.axhline(8, color="#334155", ls="--", lw=1.2)
ax.text(1.38, 8.25, "预算 8", fontsize=9, color="#334155")
for b, v in zip(bars, spent):
    ax.text(b.get_x() + b.get_width() / 2, v + 0.25, f"{v}/8", ha="center", fontsize=11)
ax.set_title("B · 预算纪律(第一轮债务 → 第二轮清偿)", fontsize=11)
ax.set_ylabel("budget_spent")
ax.set_ylim(0, 12.5)

# C: prereg 纪律结构
ax = axes[1][0]
import numpy as np

x = np.arange(2)
before = [0, 4]   # 观测前冻结的 prereg
after = [12, 0]   # forecast 之后(修复回路)补的 prereg
ax.bar(x - 0.18, before, 0.34, color=C_R2, label="观测前冻结(合规)")
ax.bar(x + 0.18, after, 0.34, color=C_BAD, label="forecast 后补(修复回路)")
for i, (b, a) in enumerate(zip(before, after)):
    if b: ax.text(i - 0.18, b + 0.25, str(b), ha="center", fontsize=10)
    if a: ax.text(i + 0.18, a + 0.25, str(a), ha="center", fontsize=10)
ax.set_xticks(x, ["第一轮", "第二轮"])
ax.set_title("C · prereg 时序纪律(债:0 先行 → 4/4 先行)", fontsize=11)
ax.set_ylabel("prereg.write 数")
ax.legend(fontsize=8.5, loc="upper left")

# D: claim 终态(journal 真值,非报告叙事)
ax = axes[1][1]
states = ["SUPPORTED", "CONTESTED", "REFUTED", "OPEN"]
r1 = [1, 1, 1, 0]
r2 = [1, 0, 0, 2]
w = 0.34
ax.bar(np.arange(4) - w / 2, r1, w, color=C_R1, label="第一轮(seed 0)")
ax.bar(np.arange(4) + w / 2, r2, w, color=C_R2, label="第二轮(seed 1)")
for i, (a, b) in enumerate(zip(r1, r2)):
    if a: ax.text(i - w / 2, a + 0.06, str(a), ha="center", fontsize=10)
    if b: ax.text(i + w / 2, b + 0.06, str(b), ha="center", fontsize=10)
ax.set_xticks(np.arange(4), states, fontsize=9)
ax.set_title("D · claim 终态(journal;H1 以收紧频段 [36,44] 复确证)", fontsize=11)
ax.set_ylabel("假设数")
ax.legend(fontsize=8.5, loc="upper right")

fig.text(0.5, 0.005,
         "审计:两轮 gate 全绿;prereg 重哈希 12/12 与 4/4;REPORT sha 一致。"
         "两轮报告叙事表(claim 状态)与 journal 存在漂移——gate 校数字出处、不校叙事,差异已在 NOTES 如实记录。",
         ha="center", fontsize=8, color="#475569")
plt.tight_layout(rect=[0, 0.02, 1, 0.97])
plt.savefig("/home/lingxufeng/crucible/Race/report-work/figures/fig6-two-rounds.png", dpi=180)
print("fig6 written")
