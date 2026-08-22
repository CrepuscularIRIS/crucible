"""grill —— 每轮一次 rlm() 攻击，typed 结果落盘回传。

攻击协议蒸馏自 ccf debate-protocol.md（四盲镜头）与 iterative-questioning.md
（预测误差为工作单位、压缩的领域共识而非专家）。rlm() 返回的是入场句柄而非答案，
故采用：子代理把 typed JSON 写到 <RUN>/grill/<gid>.json → 父进程 poll() 读取 →
R.record_attack() 落地（同一套验证器，拒散文）。
"""

from __future__ import annotations

import json
import os
from typing import Any

from register import Register

DEFAULT_MODEL = "dashscope/qwen3.7-plus"

LENSES = {
    "occupancy": (
        "你是竞争作者的化身：假设这个 claim 是你领域里别人已做过的东西。"
        "找出它实际上与哪些已知结论重合、它声称的新颖性在哪一点上不成立。"
        "OUT OF SCOPE：不要评价文笔，不要给改写建议。"
    ),
    "mechanism": (
        "你是机制怀疑者：假设 claim 的因果故事是错的。"
        "找出它混淆的相关与因果、缺失的中间变量、以及一个更简单的替代解释。"
        "OUT OF SCOPE：不要攻击实验规模（那是 measurement 镜头的事）。"
    ),
    "measurement": (
        "你是测量怀疑者：假设数字本身不可信。"
        "找出构造效度问题、缺失的对照（random-init / matched-rank / 预处理敏感性）、"
        "以及哪个分支的结果其实无法区分噪声。"
        "OUT OF SCOPE：不要提出全新的研究方向。"
    ),
    "framing": (
        "你是重构者：假设 claim 的问题框架本身歪了。"
        "给出一个把现有证据重新组织后结论完全不同的框架，并指出原框架在哪里偷换了问题。"
        "OUT OF SCOPE：不要只说『需要更多实验』。"
    ),
}
_LENS_ORDER = ("occupancy", "mechanism", "measurement", "framing")


class GrillError(Exception):
    pass


def _get_register(R: Register | None) -> Register:
    if R is not None:
        return R
    from register import R as shared_R
    if shared_R is not None:
        return shared_R
    run_dir = os.environ.get("CRUCIBLE_RUN_DIR", "")
    if not run_dir:
        raise GrillError("未设置 CRUCIBLE_RUN_DIR 且未传入 R")
    return Register(run_dir)


def _result_path(run_dir: str, gid: str) -> str:
    return os.path.join(run_dir, "grill", f"{gid}.json")


def build_prompt(view: dict[str, Any], gid: str, result_path: str, lens_index: int) -> str:
    lens = _LENS_ORDER[lens_index % len(_LENS_ORDER)]
    view_json = json.dumps(view, ensure_ascii=False, indent=1)
    return f"""# 攻击任务（镜头：{lens}）

{LENSES[lens]}

你看到的唯一材料是这个 claim 的"主张+证据"视图（提出者的推理与辩护被刻意隐藏）：

```json
{view_json}
```

规则（来自审讯纪律）：
- 你的工作单位是**预测误差**：指出这个 claim 预测了什么、哪里最可能预测错。
- 不要复述 claim；直接给出最强攻击。
- 你看不到提出者的推理，这是设计使然——不要假设它存在。

输出契约（唯一被接受的形式）：把下面的 JSON 写入文件 `{result_path}`
（用你可用的任何工具写文件；写完即可结束）：

{{"gid": "{gid}", "type": "new_h", "claim": "<一个可区分的新假设，predicts 必须预言现有 live 假设没有预言过的可观察量>", "kind": "mechanism|phenomenon|method", "predicts": ["<可观察量1>"], "conflicts": "<与死者/生者的冲突陈述，若 graveyard 非空必须点名>"}}
或
{{"gid": "{gid}", "type": "constraint", "text": "<一条应被提升为约束的攻击结论>"}}
或
{{"gid": "{gid}", "type": "no_change", "reason": "<为什么这个 claim 扛住了这一镜头>"}}

任何散文、建议、多 JSON 都会被机械拒绝。只写文件，不要输出别的。
"""


async def attack(h: str, R: Register | None = None, model: str | None = None) -> dict[str, Any]:
    """发起一次攻击：构造 prompt（含结果路径）→ 登记（含 prompt 哈希）→ rlm() 子代理。"""
    R = _get_register(R)
    view = R.claim_view(h)
    # gid 确定性可预测（G<counters.G+1>），先造 prompt 再一次性登记，journal 里哈希即真值
    predicted = f"G{R.state['counters']['G'] + 1}"
    lens_index = R.state["counters"]["G"]  # 按已发起攻击数轮转镜头
    prompt = build_prompt(view, predicted, _result_path(R.run_dir, predicted), lens_index)
    gid = R.add_attack(h, prompt)
    assert gid == predicted, "gid 预测失败（并发写入？）"
    R.journal.append("attack_prompt", True, gid=gid, lens=_LENS_ORDER[lens_index % len(_LENS_ORDER)])

    try:
        from rlm import rlm as _rlm
    except ImportError as exc:
        raise GrillError("grill.attack 只能在 Prime kernel 内调用（rlm 不可用）") from exc
    handle = await _rlm(
        prompt,
        name=f"grill-{gid}",
        model=model or os.environ.get("CRUCIBLE_GRILL_MODEL", DEFAULT_MODEL),
    )
    R.journal.append("attack_spawned", True, gid=gid, handle=handle if isinstance(handle, dict) else str(handle)[:200])
    return {"gid": gid, "claim": h, "handle": handle, "result_file": _result_path(R.run_dir, gid)}


def poll(R: Register | None = None, gid: str | None = None) -> list[dict[str, Any]]:
    """扫 grill/*.json，校验 gid 属于 in-flight 攻击，R.record_attack 落地。"""
    R = _get_register(R)
    grill_dir = os.path.join(R.run_dir, "grill")
    results: list[dict[str, Any]] = []
    if not os.path.isdir(grill_dir):
        return results
    for name in sorted(os.listdir(grill_dir)):
        if not name.endswith(".json"):
            continue
        payload_gid = name[:-5]
        if gid is not None and payload_gid != gid:
            continue
        attack_rec = R.state.get("attacks", {}).get(payload_gid)
        if attack_rec is None or attack_rec.get("status") != "in_flight":
            continue
        try:
            with open(os.path.join(grill_dir, name), encoding="utf-8") as fh:
                payload = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            R.journal.append("attack_poll", False, gid=payload_gid, reason=f"结果文件不可读: {exc}")
            continue
        if payload.get("gid") not in (None, payload_gid):
            R.journal.append("attack_poll", False, gid=payload_gid, reason="gid 不匹配，忽略")
            continue
        payload.setdefault("gid", payload_gid)
        try:
            results.append(R.record_attack(payload_gid, payload))
        except Exception as exc:  # noqa: BLE001 - 单个坏文件不中断整批；拒绝即结果
            results.append({"gid": payload_gid, "accepted": False, "reason": str(exc)})
    return results
