#!/usr/bin/env bash
# 组装 docker build 上下文：prime-agent 子集 + 五个 skill + gate 配置。
# 产物 container/build/ 已被 .gitignore 排除。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PRIME="${PRIME_DIR:-/home/lingxufeng/oss/prime-agent}"
BUILD="$HERE/build"

rm -rf "$BUILD"
mkdir -p "$BUILD/prime-agent" "$BUILD/prime-config"

# prime-agent：dist 自包含 JS + 根 node_modules（bun workspace 把 zeromq 等提升到根）
# + 子包 node_modules + python runtime 源码
mkdir -p "$BUILD/prime-agent/packages/coding-agent" "$BUILD/prime-agent/prime-agent-runtime"
cp -r "$PRIME/packages/coding-agent/dist" "$BUILD/prime-agent/packages/coding-agent/"
cp -r "$PRIME/packages/coding-agent/node_modules" "$BUILD/prime-agent/packages/coding-agent/"
cp "$PRIME/packages/coding-agent/package.json" "$BUILD/prime-agent/packages/coding-agent/"
cp -r "$PRIME/prime-agent-runtime/src" "$PRIME/prime-agent-runtime/pyproject.toml" "$BUILD/prime-agent/prime-agent-runtime/"
cp "$PRIME/package.json" "$BUILD/prime-agent/" 2>/dev/null || true
if [ -d "$PRIME/node_modules" ]; then
  echo "拷贝根 node_modules（约 443M，一次性成本）..."
  cp -r "$PRIME/node_modules" "$BUILD/prime-agent/"
fi

# 五个 skill（loop 是 markdown-only，其余四个将 editable 安装进 kernel venv）
cp -r "$ROOT/skills" "$BUILD/crucible-skills"

# prime 配置
cp "$HERE/models.json" "$HERE/settings.json" "$BUILD/prime-config/"

cp "$HERE/Dockerfile" "$HERE/entrypoint.sh" "$BUILD/"
echo "build 上下文就绪: $BUILD ($(du -sh "$BUILD" | cut -f1))"
