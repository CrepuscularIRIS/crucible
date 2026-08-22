#!/bin/bash
# 战役入口：起 pi print-mode autonomous 会话，三道 gate 只读挂载在 /gates。
set -euo pipefail

: "${DASHSCOPE_API_KEY:?需要 DASHSCOPE_API_KEY（run.sh 从 ClawUI/.env 注入）}"

GOAL_FILE="${GOAL_FILE:-/work/goal.md}"
if [ ! -f "$GOAL_FILE" ]; then
  echo "缺 goal 文件: $GOAL_FILE" >&2
  exit 2
fi
GOAL="$(cat "$GOAL_FILE")"

# 以宿主 UID 运行（compose run --user）时，docker 不会为任意 UID 设 HOME；
# 显式钉一个可写 HOME，并把烘焙好的 prime 配置拷进去（否则 models.json 读不到）。
if [ "$(id -u)" != "0" ]; then
  export HOME="${PRIME_HOME:-/tmp/prime-home}"
  mkdir -p "$HOME"
  if [ ! -d "$HOME/.prime/agent" ]; then
    mkdir -p "$HOME/.prime/agent"
    cp /opt/prime-config/*.json "$HOME/.prime/agent/"
  fi
fi
export PYTHONPYCACHEPREFIX=/tmp/pycache
mkdir -p /work/artifacts /work/worktrees
cd /work

exec node /opt/prime-agent/packages/coding-agent/dist/bundle/cli.js -p \
  --model "${PRIME_MODEL:-dashscope/qwen3.7-plus}" \
  --autonomous \
  --goal "$GOAL" \
  --goal-token-budget "${GOAL_TOKEN_BUDGET:-2000000}" \
  --autonomous-gate "python3 /gates/prereg.py /work/artifacts" \
  --autonomous-gate "python3 /gates/reconcile.py /work/artifacts" \
  --autonomous-gate "python3 /gates/review.py /work/artifacts" \
  --autonomous-max-turns "${AUTONOMOUS_MAX_TURNS:-200}" \
  --autonomous-max-tokens "${AUTONOMOUS_MAX_TOKENS:-2000000}" \
  --autonomous-max-continuations "${AUTONOMOUS_MAX_CONTINUATIONS:-8}" \
  --no-skills \
  --skill /opt/crucible-skills/register \
  --skill /opt/crucible-skills/probe \
  --skill /opt/crucible-skills/grill \
  --skill /opt/crucible-skills/figure \
  --skill /opt/crucible-skills/loop \
  ${EXTRA_PI_ARGS:-} \
  "$GOAL"
