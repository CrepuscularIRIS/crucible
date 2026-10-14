#!/usr/bin/env bash
# 重新生成答辩三页（04 §4.1 / J4）并跑两分钟验收。在仓库根运行：bash research/report/build-defense.sh
set -euo pipefail
C=research/campaigns
NAV=("一句话（主案例）" "详细指令" "P0 镜像")
gen() { # <archive> <out> <href 前缀> <当前页标签>
  bun research/report/judge-report.ts "$C/$1" --out "$2" \
    --nav "${NAV[0]}=$3index.html" --nav "${NAV[1]}=$3report/s0.html" --nav "${NAV[2]}=$3report/p0.html" --here "$4"
  bun research/report/check-two-minute.ts "$2"
}
mkdir -p deploy/defense/report
gen 2026-10-14-glm53flash-oneline-ca_rebound deploy/defense/index.html "" "${NAV[0]}"
gen 2026-10-14-glm53flash-ca_rebound-s0 deploy/defense/report/s0.html "../" "${NAV[1]}"
gen 2026-10-14-glm53flash-p0-oneline-ca_rebound deploy/defense/report/p0.html "../" "${NAV[2]}"
