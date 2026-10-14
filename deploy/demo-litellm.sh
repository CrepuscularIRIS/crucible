#!/usr/bin/env bash
# 起演示网关（见 demo-litellm.yaml）。key 存 ~/.config/crucible-demo/litellm.key（600），从不打印。
set -euo pipefail
KEY_FILE="${KEY_FILE:-$HOME/.config/crucible-demo/litellm.key}"
mkdir -p "$(dirname "$KEY_FILE")"
[ -s "$KEY_FILE" ] || (umask 077; echo "sk-demo-$(openssl rand -hex 16)" > "$KEY_FILE")
set -a; . "${ZHIPU_ENV:-$HOME/proxy/glm-kimi.env}"; set +a
export DEMO_LITELLM_KEY="$(cat "$KEY_FILE")"
exec "${LITELLM:-$HOME/proxy/litellm/.venv/bin/litellm}" --config "$(dirname "$0")/demo-litellm.yaml" \
  --host "${HOST:-172.17.0.1}" --port "${PORT:-4012}" --num_workers 1
