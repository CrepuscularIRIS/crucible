#!/usr/bin/env bash
# 宿主编排：起容器战役 → 容器退出后在宿主重跑三道 gate（裁决层）
# → 记录 which-bound-ended 到 ledger.json → 给 artifacts 打快照哈希。
#
# 用法: campaign/run.sh <RUN_ID> <CASE_DIR> [GOAL_FILE]
# 密钥：运行时从 ~/ClawUI/.env 的 Dash-Model 读取并注入环境，绝不落盘入库。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_ID="${1:?用法: run.sh <RUN_ID> <CASE_DIR> [GOAL_FILE]}"
CASE_DIR="${2:?用法: run.sh <RUN_ID> <CASE_DIR> [GOAL_FILE]}"
GOAL_FILE="${3:-$ROOT/campaign/goal.md}"

ART="$ROOT/artifacts/$RUN_ID"
mkdir -p "$ART"

KEY="$(grep -E '^Dash-Model=' "$HOME/ClawUI/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [ -z "$KEY" ]; then
  echo "未在 ~/ClawUI/.env 找到 Dash-Model 密钥" >&2
  exit 1
fi

export DASHSCOPE_API_KEY="$KEY"
export CRUCIBLE_ART_DIR="$ART"
export CRUCIBLE_CASE_DIR="$(cd "$CASE_DIR" && pwd)"
export GOAL_FILE="$(cd "$(dirname "$GOAL_FILE")" && pwd)/$(basename "$GOAL_FILE")"

echo "── 战役 $RUN_ID ──  case: $CRUCIBLE_CASE_DIR"
STARTED="$(date -Is)"
set +e
timeout "${RUN_TIMEOUT:-0}" true 2>/dev/null || true
COMPOSE="docker compose -f $ROOT/container/compose.yaml"
RUN_V=(-v "$CRUCIBLE_ART_DIR:/work/artifacts" -v "$CRUCIBLE_CASE_DIR:/work/case" -v "$GOAL_FILE:/work/goal.md:ro")
# 以当前宿主用户身份运行容器：产物属主正确，宿主 gate/tar 不再需要 sudo
RUN_USER=(-u "$(id -u):$(id -g)")
if [ "${RUN_TIMEOUT:-0}" = "0" ]; then
  $COMPOSE run --rm "${RUN_USER[@]}" "${RUN_V[@]}" campaign 2>&1 | tee "$ART/container.log"
else
  timeout "${RUN_TIMEOUT}" $COMPOSE run --rm "${RUN_USER[@]}" "${RUN_V[@]}" campaign 2>&1 | tee "$ART/container.log"
fi
CONTAINER_EXIT="${PIPESTATUS[0]}"
set -e
FINISHED="$(date -Is)"

# ── 宿主重跑三道 gate（裁决层；容器内同名 gate 只是转向） ──
declare -a GATES=(prereg reconcile review)
declare -a GATE_RESULTS=()
ALL_PASS=1
for g in "${GATES[@]}"; do
  if python3 "$ROOT/gates/$g.py" "$ART" > "$ART/gate-$g.host.log" 2>&1; then
    GATE_RESULTS+=("\"$g\": \"pass\"")
  else
    GATE_RESULTS+=("\"$g\": \"fail\"")
    ALL_PASS=0
  fi
done

# ── which-bound-ended：不同结局永不合并 ──
if [ "$CONTAINER_EXIT" -eq 0 ] && [ "$ALL_PASS" -eq 1 ]; then
  BOUND="gates-passed"
elif grep -q "retry_exhausted\|max-turns\|max_turns\|token" "$ART/container.log" 2>/dev/null; then
  BOUND="limit-exhausted"
elif [ "$CONTAINER_EXIT" -eq 124 ]; then
  BOUND="wall-clock-timeout"
else
  BOUND="gates-failed"
fi

# ── artifacts 快照（退出后不可篡改的锚） ──
SNAP="$ROOT/artifacts/${RUN_ID}-$(date +%Y%m%dT%H%M%S).tar.gz"
tar czf "$SNAP" -C "$ROOT/artifacts" "$RUN_ID"
SHA="$(sha256sum "$SNAP" | cut -d' ' -f1)"

cat > "$ART/ledger.json" <<EOF
{
  "run_id": "$RUN_ID",
  "started": "$STARTED",
  "finished": "$FINISHED",
  "container_exit": $CONTAINER_EXIT,
  "host_gates": { $(IFS=,; echo "${GATE_RESULTS[*]}") },
  "bound": "$BOUND",
  "artifacts_snapshot": "$(basename "$SNAP")",
  "artifacts_sha256": "$SHA"
}
EOF

echo "── 结局: $BOUND (container_exit=$CONTAINER_EXIT) ──"
for g in "${GATES[@]}"; do tail -1 "$ART/gate-$g.host.log"; done
echo "快照: $SNAP"
echo "sha256: $SHA"
[ "$ALL_PASS" -eq 1 ]
