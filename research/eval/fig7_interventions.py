#!/usr/bin/env python3
"""fig7: 干预前后确定性计数(E1@0.17.76 vs E1M@0.17.77,评委可复算)。

数据源:T-metrics-all21.txt / T-metrics-6arm.txt(journal_metrics.py 输出)。
E1 的 UI 层催促日志未随 bundle 归档,如实标注,不造数。
"""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager

for f in ["Noto Sans CJK SC", "Noto Sans CJK JP", "AR PL SungtiL GB"]:
    try:
        font_manager.findfont(f, fallback_to_default=False)
        plt.rcParams["font.family"] = f
        break
    except Exception:
        continue
plt.rcParams["axes.unicode_minus"] = False

C_E1, C_E1M, C_BAD, C_OK = "#94a3b8", "#1d4ed8", "#dc2626", "#059669"

fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.4))
fig.suptitle("图7 · 干预前后确定性计数(E1@0.17.76 → E1M@0.17.77;journal_metrics.py 可复算)",
             fontsize=12.5, fontweight="bold", y=1.02)

# A: declare 真调率(自主收口)
ax = axes[0]
labels = ["E1 @0.17.76\n(15 臂)", "E1M @0.17.77\n(6 臂)"]
declared = [9, 6]
total = [15, 6]
bars = ax.bar(labels, [d / t * 100 for d, t in zip(declared, total)],
              color=[C_E1, C_E1M], width=0.5)
for b, d, t in zip(bars, declared, total):
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 2, f"{d}/{t}",
            ha="center", fontsize=12, fontweight="bold")
ax.set_ylim(0, 118)
ax.set_ylabel("declare 自主收口率 (%)")
ax.set_title("A · 终局自主收口", fontsize=11)
ax.text(0.5, -0.24, "E1 未收口 6 臂 = 百炼欠费中断(事故台账)\nE1M 同类中断后全部自愈并双绿",
        transform=ax.transAxes, ha="center", fontsize=8.5, color="#475569")

# B: prereg 冻结重哈希(完整性不变量)
ax = axes[1]
ok = [62, 40]
tot = [62, 40]
bars = ax.bar(labels, [o / t * 100 for o, t in zip(ok, tot)], color=[C_OK, C_OK], width=0.5)
for b, o, t in zip(bars, ok, tot):
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 2, f"{o}/{t}",
            ha="center", fontsize=12, fontweight="bold")
ax.set_ylim(0, 118)
ax.set_ylabel("磁盘重哈希 = journal 冻结值 (%)")
ax.set_title("B · prereg 完整性(跨版本不变量)", fontsize=11)

# C: 外部催促(E1M 逐臂;E1 未归档)
ax = axes[2]
arms = ["ca", "dtype", "hsag", "nafat", "tbm", "zreb"]
nudges = [2, 4, 0, 2, 2, 0]
colors = [C_BAD if n else C_OK for n in nudges]
bars = ax.bar(arms, nudges, color=colors, width=0.6)
for b, n in zip(bars, nudges):
    ax.text(b.get_x() + b.get_width() / 2, n + 0.08, str(n), ha="center", fontsize=11)
ax.set_ylim(0, 5.2)
ax.set_ylabel("UI 层非任务 user 消息数")
ax.set_title("C · 外部催促(E1M 逐臂;全部为欠费/重启后中性唤醒)", fontsize=10.5)
ax.text(0.5, -0.24, "E1 同项未随 bundle 归档 UI 层日志,不造数;\n事故台账口径:欠费/重启唤醒 ×8 + 内容提示 ×1",
        transform=ax.transAxes, ha="center", fontsize=8.5, color="#475569")

plt.tight_layout()
plt.savefig("/home/lingxufeng/crucible/Race/report-work/figures/fig7-interventions.png",
            dpi=180, bbox_inches="tight")
print("fig7 written")
