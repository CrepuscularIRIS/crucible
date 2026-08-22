"""玩具 case 的 eval：固定 seed 的分布均值。D 的真值设计为 ≈0.65。"""
import json
import random
import sys

seeds = int(sys.argv[sys.argv.index("--seeds") + 1])
rng = random.Random(20260822)
vals = [rng.random() * 0.7 + 0.3 for _ in range(seeds)]
json.dump({"mean": sum(vals) / len(vals)}, open("metrics.json", "w"))
print(f"mean over {seeds} samples = {sum(vals) / len(vals):.4f}")
