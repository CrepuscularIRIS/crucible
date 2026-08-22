#!/usr/bin/env bash
# Step 0 go/no-go 验收：四项判据的机械评估。
# 用法: check.sh <RUN_DIR>
# set -e 会让第一条不达标的判据直接终止脚本——四项判据于是永远只跑到第一个 ✗，
# 后面三项和总计都不打印。验收脚本必须把四项都跑完再报分。
set -uo pipefail
RUN="${1:?用法: check.sh <RUN_DIR>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══ Step 0 验收 · $RUN ═══"
PASS=0; FAIL=0
judge() { if [ "$1" = 0 ]; then echo "  ✓ $2"; PASS=$((PASS+1)); else echo "  ✗ $2"; FAIL=$((FAIL+1)); fi }

# 1. 模型无提示调用 Python skill ≥1 次（journal 里出现模型才会触发的操作）
SKILL_CALLS=$(python3 - "$RUN" <<'EOF'
import json, sys
ops = set()
for line in open(f"{sys.argv[1]}/journal.jsonl"):
    e = json.loads(line)
    if e.get("op") in ("abduce", "prereg", "land", "attack", "attach", "add_constraint") and e.get("ok"):
        ops.add(e["op"])
print(len(ops))
EOF
)
[ "$SKILL_CALLS" -ge 3 ]; judge $? "1) Python skill 无提示驱动（journal 中 ≥3 类操作，实际 $SKILL_CALLS）"

# 2. host continuations 存活（journal 时间跨度 + 容器日志轮次迹象）
python3 - "$RUN" <<'EOF'
import json, sys, os
entries = [json.loads(l) for l in open(f"{sys.argv[1]}/journal.jsonl")]
ts = [e["unix_ts"] for e in entries if "unix_ts" in e]
span = max(ts) - min(ts) if ts else 0
log = f"{sys.argv[1]}/container.log"
log_size = os.path.getsize(log) if os.path.exists(log) else 0
# 判据：journal 活动跨度 > 60s（多次模型往返）或容器日志显著
ok = span > 60 or log_size > 20000
print(f"  · journal 跨度 {span:.0f}s, container.log {log_size}B")
sys.exit(0 if ok else 1)
EOF
judge $? "2) 多轮往返存活（未在首轮即退）"

# 3. gate 闭环：宿主三道 gate 全过 或 ledger 记录了 gate 活动
if [ -f "$RUN/ledger.json" ]; then
  python3 - "$RUN" <<'EOF'
import json, sys
led = json.load(open(f"{sys.argv[1]}/ledger.json"))
gates = led.get("host_gates", {})
passed = [g for g, s in gates.items() if s == "pass"]
print(f"  · bound={led.get('bound')} host_gates={gates}")
sys.exit(0 if len(passed) >= 2 else 1)
EOF
  judge $? "3) gate 环闭环（宿主裁决 ≥2 道通过）"
else
  judge 1 "3) gate 环闭环（无 ledger.json——run 未结束）"
fi

# 4. kernel 状态跨事件存活：register.json 完好且 journal 连续（compaction 由专项小窗测试补证）
python3 - "$RUN" <<'EOF'
import json, sys
reg = json.load(open(f"{sys.argv[1]}/register.json"))
claims = reg.get("claims", {})
probes = reg.get("probes", {})
sys.exit(0 if len(claims) >= 2 and len(probes) >= 1 else 1)
EOF
judge $? "4) 信念状态完整（≥2 claim + ≥1 probe 落盘）"

echo "═══ 结果: $PASS 通过 / $FAIL 未过 ═══"
[ "$FAIL" -eq 0 ]
