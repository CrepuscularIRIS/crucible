#!/usr/bin/env python3
"""world-meter —— NeuronBench 的计量接口（EVAL-PLAN §1.3，P6.0）。

世界只经本接口暴露：`observe` 扣预算返回真细胞的带噪偏观测，`simulate`
对**自提候选机制**免费跑生成模型（不触真细胞、不耗预算），`forecast`
是终局裁决。真值（worlds.py 的 novel 通道参数）从不出现在任何输出里。
评测接线通过 denylist 拒绝直接路径，liveness 另行检出不可沙箱化 kernel 中的
绕行读取；预算与终局唯一性由 Research MCP 的权威 journal 判定，本地 ledger
只作为人类可读明细。

只在 research-mcp server 进程内被调用（沙箱外）；绝不修改 neuronbench。

用法（一次性子命令，全部经 stdout 返回 JSON）：
  python3 world-meter.py --ledger L --budget B info      WORLD SEED
  python3 world-meter.py --ledger L --budget B observe   WORLD SEED LABEL [--reps R] [--blockers b1,b2]
  python3 world-meter.py --ledger L --budget B simulate  WORLD SEED LABEL --mechanism JSON [--reps R]
  python3 world-meter.py --ledger L --budget B forecast  WORLD SEED --counts JSON
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

_NB_ROOT = os.environ.get("NEURONBENCH_ROOT", "").strip()
if not _NB_ROOT:
    raise SystemExit("NEURONBENCH_ROOT 未配置")
if _NB_ROOT not in sys.path:
    sys.path.insert(0, _NB_ROOT)

import neuronbench as nb  # noqa: E402  (import 在 sys.path 注入之后)

# 观测电压轨迹的返回上限：足够分辨尖峰形状，又不至于把上下文灌爆。
_MAX_TRACE_POINTS = 256


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _load_ledger(path: str) -> list[dict]:
    p = Path(path)
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text().splitlines() if line.strip()]


def _append(path: str, entry: dict) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _spent(entries: list[dict]) -> int:
    return sum(int(e.get("cost", 0)) for e in entries if e.get("cmd") == "observe")


class _LedgerLock:
    """进程间互斥：预算判定必须是 load→check→append 的原子段。

    并发 observe 曾把 8 的预算打到 12——每个进程各自读到过期 spent 再各自放行。
    flock 串行化后，后到者必然看到先到者已落盘的 cost。锁文件放 ledger 同目录。
    """

    def __init__(self, ledger: str):
        self._path = f"{ledger}.lock"

    def __enter__(self):
        import os
        self._fh = open(self._path, "a", encoding="utf-8")
        fcntl.flock(self._fh, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self._fh, fcntl.LOCK_UN)
        self._fh.close()


def _chan_from_dict(raw: dict):
    fields = {f.name for f in nb.Chan.__dataclass_fields__.values()}  # type: ignore[attr-defined]
    return nb.Chan(**{k: v for k, v in raw.items() if k in fields})


def _mechanism(raw: dict) -> dict:
    return {
        "extra": [_chan_from_dict(c) for c in raw.get("extra", [])],
        "slow_na": bool(raw.get("slow_na", False)),
    }


def _protocol(label: str):
    proto = nb.protocols.by_label(label)
    if proto is None:
        raise SystemExit(f"unknown protocol label: {label}")
    return proto


def _subsample(values) -> list[float]:
    if values is None:
        return []
    step = max(1, len(values) // _MAX_TRACE_POINTS)
    return [round(float(v), 4) for v in values[::step]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ledger", required=True)
    ap.add_argument("--budget", type=int, required=True)
    ap.add_argument(
        "--budget-spent",
        type=int,
        help="由 Research MCP 从权威 journal 重放得到；ledger 仅为展示",
    )
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("info", "observe", "simulate", "forecast"):
        p = sub.add_parser(name)
        p.add_argument("world")
        p.add_argument("seed", type=int)
        if name in ("observe", "simulate"):
            p.add_argument("label")
            p.add_argument("--reps", type=int, default=1)
            p.add_argument("--blockers", default="")
            if name == "simulate":
                p.add_argument("--mechanism", required=True, help="JSON: {extra:[{...Chan}], slow_na:bool}")
        if name == "forecast":
            p.add_argument("--counts", required=True, help="JSON: 每个 held-out 协议的预测 test-window 尖峰数")
    args = ap.parse_args()

    entries = _load_ledger(args.ledger)
    # 预算唯一真值是 ledger 自身累计；--budget-spent 只作对照（取两者较大值兜底），
    # 不得覆盖——server 传入的过期计数曾让并发 observe 全部放行（12/8 事故）。
    spent = max(_spent(entries), args.budget_spent or 0)
    base = {"ts": _now(), "cmd": args.cmd, "world": args.world, "seed": args.seed}

    if args.cmd == "info":
        world = nb.load_world(args.world, seed=args.seed)
        # 严格透传 benchmark 自己定义的 leak-free problem()；不要在此扩张键集合。
        out = world.problem()
        _append(args.ledger, base | {"cost": 0, "budget_before": spent})
        print(json.dumps(out, ensure_ascii=False))
        return

    if args.cmd == "observe":
        reps = max(1, args.reps)
        with _LedgerLock(args.ledger):
            # 锁内重读：先到者的 cost 已落盘，后到者据此判定。
            spent = max(_spent(_load_ledger(args.ledger)), args.budget_spent or 0)
            if spent + reps > args.budget:
                raise SystemExit(
                    f"budget exhausted: spent={spent} + reps={reps} > budget={args.budget}；"
                    "下一步：用已落地的观测收窄假设，或 report_declare 终局"
                )
            world = nb.load_world(args.world, seed=args.seed)
            obs = world.run(_protocol(args.label), reps=reps, block=tuple(
                b for b in args.blockers.split(",") if b))
            _append(args.ledger, base | {"protocol": args.label, "reps": reps, "cost": obs.cost,
                                         "budget_before": spent, "budget_after": spent + obs.cost,
                                         "spike_count": round(float(obs.spike_count), 4)})
        out = {
            "protocol_label": obs.protocol_label,
            "spike_count": round(float(obs.spike_count), 4),
            "reps": obs.reps,
            "cost": obs.cost,
            "voltage": _subsample(obs.voltage),
            "test_start_index": obs.test_start,
        }
        print(json.dumps(out, ensure_ascii=False))
        return

    if args.cmd == "simulate":
        # 生成模型对自提候选免费：不扣预算、不触真细胞、不进预算账。
        # stochastic 模式 simulate 返回 (reps, T) 电压数组——按 observe 同一口径
        # （features.spike_count 于 test 窗）归约成可比的尖峰数。
        world = nb.load_world(args.world, seed=args.seed)
        proto = _protocol(args.label)
        mech = _mechanism(json.loads(args.mechanism))
        reps = max(1, args.reps)
        volts = world.simulate(mech, proto, reps=reps,
                               block=tuple(b for b in args.blockers.split(",") if b))
        _, _, ts = nb.stochastic.make_protocol(proto[1])
        counts = nb.features.spike_count(volts, ts)
        out = {"protocol_label": args.label, "candidate": json.loads(args.mechanism),
               "reps": reps, "cost": 0,
               "spike_counts": [round(float(c), 4) for c in counts],
               "mean_spike_count": round(float(counts.mean()), 4),
               "mean_voltage_subsampled": _subsample(volts.mean(axis=0))}
        _append(args.ledger, base | {"protocol": args.label, "cost": 0, "candidate": True,
                                     "mean_spike_count": out["mean_spike_count"]})
        print(json.dumps(out, ensure_ascii=False))
        return

    if args.cmd == "forecast":
        world = nb.load_world(args.world, seed=args.seed)
        predictions = {k: float(v) for k, v in json.loads(args.counts).items()}
        mse = world.forecast_mse(predictions)
        _append(args.ledger, base | {"cost": 0, "mse": mse, "predictions": predictions,
                                     "budget_spent_final": spent})
        print(json.dumps({"spike_forecast_mse": mse, "budget_spent": spent}, ensure_ascii=False))
        return


if __name__ == "__main__":
    main()
