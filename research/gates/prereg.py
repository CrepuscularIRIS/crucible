#!/usr/bin/env python3
"""prereg gate —— 先登记后执行，且预登记必须致命。

拒绝条件（计划 §2.6，对应 ARFT A.2 与 P14 红线）：
  1. 任何已执行/落地的 probe：unix_prereg_ts 不早于结果 unix_started；
  2. prereg 文件哈希与 register 登记不符（事后篡改）；
  3. 任何 prereg 缺 kill/scope 分支（装饰性实验）；
  4. journal 顺序：prereg(P#) 必须出现在 probe.run(P#) 之前；
  5. 实际执行的 eval 命令哈希与登记不符。

用法：python prereg.py <RUN_DIR>
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import conclude, journal_lines, load_prereg, load_register, sha256_file


def main(run_dir: str) -> int:
    reg = load_register(run_dir)
    journal = journal_lines(run_dir)
    refusals: list[str] = []
    details: list[str] = []

    # journal 顺序：prereg 先于执行
    seen_ops: dict[str, int] = {}
    for i, entry in enumerate(journal):
        op = entry.get("op", "")
        if op in ("prereg", "probe.run") and entry.get("ok"):
            seen_ops[f"{op}:{entry.get('pid')}"] = i

    for pid, probe in sorted(reg.get("probes", {}).items()):
        spec = load_prereg(run_dir, probe)
        if spec is None:
            refusals.append(f"{pid}: prereg 文件缺失（{probe.get('prereg_path')}）")
            continue
        path = os.path.join(run_dir, probe["prereg_path"])
        if sha256_file(path) != probe.get("prereg_sha"):
            refusals.append(f"{pid}: prereg 文件哈希与登记不符（事后篡改）")
            continue
        lethal = any(
            (br.get("on_hit") or {}).get("kill") or (br.get("on_hit") or {}).get("scope")
            for br in spec.get("predictions", [])
        )
        if not lethal:
            refusals.append(f"{pid}: prereg 无 kill/scope 分支——装饰性实验")
        prereg_i = seen_ops.get(f"prereg:{pid}")
        run_i = seen_ops.get(f"probe.run:{pid}")
        if run_i is not None and (prereg_i is None or prereg_i > run_i):
            refusals.append(f"{pid}: journal 中 probe.run 出现在 prereg 之前（顺序倒置）")
        # 已有结果的：先登记后执行 + 命令哈希一致
        prov_path = os.path.join(run_dir, "results", pid, "provenance.json")
        if os.path.exists(prov_path):
            import json

            with open(prov_path, encoding="utf-8") as fh:
                prov = json.load(fh)
            if prov.get("produced_by") != "probe.run":
                refusals.append(f"{pid}: 结果 produced_by != probe.run")
            if float(spec.get("unix_prereg_ts", 0)) >= float(prov.get("unix_started", 0)):
                refusals.append(f"{pid}: prereg 时间戳不早于结果开始时间（先登记后执行被违反）")
            if prov.get("eval_cmd_hash") != spec.get("eval_cmd_hash"):
                refusals.append(f"{pid}: 实际执行命令哈希与登记不符")
            details.append(f"{pid}: prereg {spec.get('prereg_ts')} → run {prov.get('unix_started')}")

    return conclude("prereg", refusals, details)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python prereg.py <RUN_DIR>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
