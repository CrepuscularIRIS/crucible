"""register skill 的公开面。

kernel 内：环境变量 CRUCIBLE_RUN_DIR 由容器 entrypoint 注入，
bootstrap 导入本模块后 `R` 即已绑定，模型直接 `R.abduce(...)`。
kernel 外（测试/宿主）：`from register import Register` 手动构造。
"""

from __future__ import annotations

import os

from .errors import RefusalError
from .journal import Journal, atomic_write_json, utc_now_iso
from .recompute import RecomputeError, run_spec, validate_spec
from .register import Register
from .states import ClaimState, ProbeState

__all__ = [
    "Register", "RefusalError", "Journal", "atomic_write_json", "utc_now_iso",
    "RecomputeError", "run_spec", "validate_spec", "ClaimState", "ProbeState",
    "R", "ensure_heartbeat",
]

_run_dir = os.environ.get("CRUCIBLE_RUN_DIR")
R: Register | None = Register(_run_dir) if _run_dir else None

HEARTBEAT_INSTRUCTION = (
    "Run register.R.stale(); if an owed action exists, do it before anything else. "
    "若有在飞的 probe，检查其产物并 land()。"
)


async def ensure_heartbeat(interval: str = "30m") -> dict:
    """每 run 只创建一次 30 分钟 steer heartbeat（ORIENT 步骤调用；kernel 外会抛错）。"""
    try:
        from rlm import host_request
    except ImportError as exc:  # kernel 外没有 rlm
        raise RuntimeError("ensure_heartbeat 只能在 Prime kernel 内调用") from exc
    listing = await host_request("rlm_heartbeat.list", {"include_inactive": True})
    existing = (listing or {}).get("heartbeats") or []
    if existing:
        return {"created": False, "existing": len(existing)}
    return await host_request(
        "rlm_heartbeat.create",
        {
            "instruction": HEARTBEAT_INSTRUCTION,
            "interval": interval,
            "label": "register-stale",
            "delivery_mode": "steer",
        },
    )
