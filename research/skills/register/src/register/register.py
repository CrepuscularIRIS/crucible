"""Register —— 研究战役的信念状态寄存器。

设计原则（docs/plans/2026-08-22-research-min-core.md §2.1）：
- 一切 claim/probe 状态变化只经本类的公开方法，每次变化（含拒绝）落 journal.jsonl；
- 四验证器在 kernel 内是栅栏：拒绝时抛 RefusalError 并写明理由；
- 指标永远从原始文件重算（recompute 规约随 prereg 锁定），从不接受口头数字。

刻意不做（cut list）：哈希链 journal、判别力排序、校准计分、逐 claim 功效分析。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from typing import Any

from .errors import RefusalError
from .journal import Journal, atomic_write_json, utc_now_iso
from .recompute import RecomputeError, run_spec, validate_spec
from .states import (
    ALIVE_CLAIM_STATES,
    LAND_MOVABLE,
    PROBE_TRANSITIONS,
    TEXT_MOVES,
    ClaimState,
    ProbeState,
)

CLAIM_KINDS = ("phenomenon", "mechanism", "method")
ON_HIT_KEYS = ("kill", "scope", "support", "artifact", "contest")
ANCHOR_MAX_CHARS = 7000  # ~1.5k token 预算的字符上限
_HID = re.compile(r"^H\d+$")


def _sha256_file(path: str) -> str:
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def _norm_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text)).strip().lower()


class Register:
    def __init__(self, run_dir: str) -> None:
        self.run_dir = os.path.abspath(run_dir)
        self.path = os.path.join(self.run_dir, "register.json")
        self.journal = Journal(self.run_dir)
        for sub in ("prereg", "results", "grill", "figures"):
            os.makedirs(os.path.join(self.run_dir, sub), exist_ok=True)
        self.state: dict[str, Any] = self._load_or_init()

    # ---------- 载入 / 保存 ----------

    def _load_or_init(self) -> dict[str, Any]:
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as fh:
                return json.load(fh)
        return {
            "version": 1,
            "created": utc_now_iso(),
            "case": "",
            "thesis": "",
            "counters": {"H": 0, "P": 0, "G": 0, "E": 0},
            "claims": {},
            "probes": {},
            "attacks": {},
            "evidence": [],
            "constraints": [],
        }

    def _save(self) -> None:
        atomic_write_json(self.path, self.state)
        self._state_mtime = os.path.getmtime(self.path)

    def reload(self) -> None:
        """显式丢弃内存态，从磁盘重读（多实例共用同一 run_dir 时使用）。"""
        with open(self.path, encoding="utf-8") as fh:
            self.state = json.load(fh)
        self._state_mtime = os.path.getmtime(self.path)

    def _reload_if_stale(self) -> None:
        """公开方法入口调用：register.json 被其它实例写过则重读，保证单一事实源。"""
        try:
            mtime = os.path.getmtime(self.path)
        except OSError:
            return
        if mtime != getattr(self, "_state_mtime", None):
            self.reload()

    def _next_id(self, prefix: str) -> str:
        n = self.state["counters"][prefix] + 1
        self.state["counters"][prefix] = n
        return f"{prefix}{n}"

    # ---------- 只读视图 ----------

    def _graveyard(self) -> list[dict[str, Any]]:
        return [
            {"id": cid, **{k: v for k, v in c.items() if k != "history"}}
            for cid, c in self.state["claims"].items()
            if ClaimState(c["state"]) not in ALIVE_CLAIM_STATES
        ]

    def _alive_claims(self) -> dict[str, dict[str, Any]]:
        return {
            cid: c
            for cid, c in self.state["claims"].items()
            if ClaimState(c["state"]) in ALIVE_CLAIM_STATES
        }

    def constraints(self) -> str:
        """graveyard + 已记录约束。abduce 之前必读（loop 的 ORIENT 步骤）。"""
        self._reload_if_stale()
        lines = ["== graveyard =="]
        for g in self._graveyard():
            lines.append(f"[{g['id']}] {g['state']} (by {g.get('killed_by', '?')}): {g['text']}")
        if not self._graveyard():
            lines.append("(空)")
        lines.append("")
        lines.append("== constraints ==")
        for c in self.state["constraints"]:
            lines.append(f"- [{c['source']}] {c['text']}")
        return "\n".join(lines)

    def claim_view(self, h: str) -> dict[str, Any]:
        """给 grill 攻击者的视图：claim + 证据，不含提出者的推理与辩护理由。"""
        self._reload_if_stale()
        self._require_claim(h)
        c = self.state["claims"][h]
        evidence = [
            e for e in self.state["evidence"] if e.get("claim") == h
        ]
        landed = []
        for pid, p in self.state["probes"].items():
            if p.get("claim") == h and p.get("state") in ("LANDED", "TRIAGE"):
                landed.append(
                    {
                        "pid": pid,
                        "metric": p.get("result", {}).get("metric"),
                        "branch": p.get("result", {}).get("branch"),
                        "bands": [b.get("band") for b in p.get("predictions", [])],
                    }
                )
        return {
            "id": h,
            "kind": c["kind"],
            "state": c["state"],
            "claim": c["text"],
            "arbor4": {
                k: c.get(k, "")
                for k in ("mechanism", "hypothesis", "observable", "conflicts")
            },
            "predicts": c["predicts"],
            "landed_probes": landed,
            "attached_evidence": evidence,
        }

    def stale(self) -> dict[str, Any]:
        """欠账清单：heartbeat 每 30 分钟指向这里；有任何 owed 就先还账再做别的。"""
        self._reload_if_stale()
        owed: list[str] = []
        for cid, c in self._alive_claims().items():
            has_probe = any(
                p.get("claim") == cid
                and ProbeState(p["state"]) in (ProbeState.PREREG, ProbeState.RUNNING, ProbeState.LANDED, ProbeState.TRIAGE)
                for p in self.state["probes"].values()
            )
            if not has_probe:
                owed.append(f"H 未检验：{cid} 处于 {c['state']} 且没有任何 prereg/落地的 probe")
        for con in self.state["constraints"]:
            if con.get("owed"):
                owed.append(f"欠账未还：{con['text']}")
        for pid, p in self.state["probes"].items():
            if ProbeState(p["state"]) is ProbeState.RUNNING:
                owed.append(f"probe 在 RUNNING：{pid}（若 artifact 已写好则 land()，否则重跑或处理失败）")
        return {
            "owed": owed,
            "in_flight_probes": [
                pid for pid, p in self.state["probes"].items()
                if ProbeState(p["state"]) is ProbeState.RUNNING
            ],
            "alive_claims": sorted(self._alive_claims()),
            "now": utc_now_iso(),
        }

    def __repr__(self) -> str:  # noqa: D105 - 锚点本身就是文档
        return self.anchor()

    def anchor(self) -> str:
        """ORIENT 锚点：有界（≤ ANCHOR_MAX_CHARS）。信念状态常驻，轨迹不常驻。"""
        self._reload_if_stale()
        st = self.state
        lines = [
            f"# REGISTER · {st.get('case') or '(case 未设)'} · {utc_now_iso()}",
        ]
        if st.get("thesis"):
            thesis = st["thesis"]
            lines.append(f"thesis: {thesis[:220]}{'…' if len(thesis) > 220 else ''}")
        lines.append("")
        lines.append("id   state      kind        claim")
        order = {
            ClaimState.LIVE: 0, ClaimState.CONTESTED: 1, ClaimState.SCOPED: 2,
            ClaimState.DEMOTED: 3, ClaimState.PROPOSED: 4,
            ClaimState.SUPPORTED: 5, ClaimState.ARTIFACT: 6, ClaimState.REFUTED: 7,
        }
        claims = sorted(
            st["claims"].items(),
            key=lambda kv: (order.get(ClaimState(kv[1]["state"]), 9), kv[0]),
        )
        for cid, c in claims[:12]:
            text = c["text"][:90] + ("…" if len(c["text"]) > 90 else "")
            lines.append(f"{cid:<4} {c['state']:<10} {c['kind']:<11} {text}")
        if len(claims) > 12:
            lines.append(f"(共 {len(claims)} 条 claim，锚点只列前 12，其余见 R.claim_view)")
        lines.append("")
        probes = [
            f"{pid}:{p['state']}"
            for pid, p in sorted(st["probes"].items())
        ]
        lines.append("probes: " + (" ".join(probes[-12:]) if probes else "(无)"))
        graveyard = [g["id"] + "=" + g["state"] for g in self._graveyard()]
        lines.append("graveyard: " + (" ".join(graveyard) if graveyard else "(空)"))
        recent = self.state["constraints"][-5:]
        lines.append("constraints(最近5): " + ("; ".join(c["text"][:70] for c in recent) if recent else "(无)"))
        anchor = "\n".join(lines)
        if len(anchor) > ANCHOR_MAX_CHARS:
            anchor = anchor[: ANCHOR_MAX_CHARS - 20] + "\n…(截断)"
        return anchor

    # ---------- 元信息 ----------

    def set_case(self, name: str) -> None:
        self._reload_if_stale()
        self.state["case"] = name
        self._save()
        self.journal.append("set_case", True, case=name)

    def set_thesis(self, text: str) -> None:
        self._reload_if_stale()
        self.state["thesis"] = text
        self._save()
        self.journal.append("set_thesis", True, sha=hashlib.sha256(text.encode()).hexdigest()[:16])

    # ---------- claim 移动 ----------

    def _require_claim(self, h: str, alive: bool = False) -> dict[str, Any]:
        if h not in self.state["claims"]:
            raise RefusalError(f"未知 claim: {h}")
        c = self.state["claims"][h]
        if alive and ClaimState(c["state"]) not in ALIVE_CLAIM_STATES:
            raise RefusalError(f"{h} 已终态（{c['state']}），不能参与该操作；终态进 graveyard，重提须换可区分的新假设")
        return c

    def _validate_abduce(self, claim: str, kind: str, predicts: list[str], conflicts: str) -> None:
        if not str(claim).strip():
            raise RefusalError("claim 文本不能为空")
        if kind not in CLAIM_KINDS:
            raise RefusalError(f"kind 必须是 {CLAIM_KINDS} 之一，得到 {kind!r}")
        if not predicts or not all(str(p).strip() for p in predicts):
            raise RefusalError("predicts 必须是非空字符串列表（ Arbor 的 Observable 行）")
        new_set = {str(p).strip() for p in predicts}
        # distinctness：新假设至少要预言某个"现有任一 live H 都没有预言过的可观察量"，
        # 否则与某个 live H 不可区分（预测集是其子集）→ 拒绝
        for cid, c in self._alive_claims().items():
            old_set = {str(p).strip() for p in c["predicts"]}
            if new_set <= old_set:
                diff_hint = sorted(old_set - new_set)
                raise RefusalError(
                    f"distinctness: 与 live 假设 {cid} 不可区分——你的 predicts 是它的子集"
                    f"（{cid} 还预言了 {diff_hint[:3]}）"
                )
        # Arbor 纪律：graveyard 非空时，conflicts 必须点名回应至少一个已死假设
        graveyard_ids = [g["id"] for g in self._graveyard()]
        if graveyard_ids and not any(gid in str(conflicts) for gid in graveyard_ids):
            raise RefusalError(
                f"conflicts 必须回应 graveyard（提及 {graveyard_ids} 中至少一个 id，说明本假设如何不同/为何复活有据）"
            )
        norm = _norm_text(claim)
        for cid, c in self.state["claims"].items():
            if ClaimState(c["state"]) not in ALIVE_CLAIM_STATES and _norm_text(c["text"]) == norm:
                raise RefusalError(f"re-proposal: 与 graveyard 中 {cid}（{c['state']}）文本相同；换一个可区分的新假设")

    def abduce(
        self,
        claim: str,
        kind: str,
        predicts: list[str],
        conflicts: str,
        mechanism: str = "",
        hypothesis: str = "",
        observable: str = "",
    ) -> str:
        self._reload_if_stale()
        try:
            self._validate_abduce(claim, kind, predicts, conflicts)
        except RefusalError as exc:
            self.journal.append("abduce", False, claim=str(claim)[:120], reason=str(exc))
            raise
        h = self._next_id("H")
        self.state["claims"][h] = {
            "id": h,
            "text": str(claim),
            "kind": kind,
            "predicts": [str(p) for p in predicts],
            "conflicts": str(conflicts),
            "mechanism": str(mechanism),
            "hypothesis": str(hypothesis),
            "observable": str(observable),
            "state": ClaimState.LIVE.value,
            "history": [{"ts": utc_now_iso(), "to": ClaimState.LIVE.value, "via": "abduce"}],
            "evidence": [],
        }
        self._save()
        self.journal.append("abduce", True, claim=h, kind=kind, predicts=list(map(str, predicts)))
        return h

    def _text_move(self, h: str, target: ClaimState, why: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        self._require_claim(h)
        c = self.state["claims"][h]
        current = ClaimState(c["state"])
        allowed = TEXT_MOVES.get(current, frozenset())
        if target not in allowed:
            raise RefusalError(
                f"{h} 当前 {current.value}，文本移动只允许 {sorted(s.value for s in allowed)}；终态只能经 land() 达成"
            )
        if not str(why).strip():
            raise RefusalError("文本移动必须写明 why（落 journal，供 gate 审计）")
        c["state"] = target.value
        entry = {"ts": utc_now_iso(), "to": target.value, "via": "text", "why": str(why)}
        entry.update(extra or {})
        c["history"].append(entry)
        self._save()
        return {"claim": h, "state": target.value}

    def demote(self, h: str, why: str) -> dict[str, Any]:
        self._reload_if_stale()
        try:
            result = self._text_move(h, ClaimState.DEMOTED, why)
        except RefusalError as exc:
            self.journal.append("demote", False, claim=h, reason=str(exc))
            raise
        self.journal.append("demote", True, claim=h, why=str(why)[:300])
        return result

    def scope(self, h: str, to: str, why: str) -> dict[str, Any]:
        self._reload_if_stale()
        try:
            result = self._text_move(h, ClaimState.SCOPED, why, {"scoped_to": str(to)})
        except RefusalError as exc:
            self.journal.append("scope", False, claim=h, reason=str(exc))
            raise
        self.journal.append("scope", True, claim=h, to=str(to), why=str(why)[:300])
        return result

    def promote(self, h: str, why: str) -> dict[str, Any]:
        self._reload_if_stale()
        try:
            result = self._text_move(h, ClaimState.LIVE, why)
        except RefusalError as exc:
            self.journal.append("promote", False, claim=h, reason=str(exc))
            raise
        self.journal.append("promote", True, claim=h, why=str(why)[:300])
        return result

    # ---------- prereg / land ----------

    def _validate_prereg_predictions(self, predictions: list[dict[str, Any]]) -> None:
        if not predictions or not isinstance(predictions, list):
            raise RefusalError("predictions 必须是非空列表（每个分支一个频段 + on_hit 动作）")
        bands: list[list[float]] = []
        for i, br in enumerate(predictions):
            try:
                lo, hi = float(br["band"][0]), float(br["band"][1])
            except (KeyError, TypeError, ValueError, IndexError) as exc:
                raise RefusalError(f"分支 {i} 的 band 必须是 [lo, hi] 数值对") from exc
            if lo > hi:
                raise RefusalError(f"分支 {i} 的 band lo>hi")
            on_hit = br.get("on_hit") or {}
            for key in on_hit:
                if key not in ON_HIT_KEYS:
                    raise RefusalError(f"分支 {i} 的 on_hit 含未知动作 {key!r}（允许: {ON_HIT_KEYS}）")
            bands.append([lo, hi])
        # lethality：≥1 对不重叠频段，且 ≥1 分支 kill/scope 了某个 claim
        overlapped_pair = any(
            bands[i][1] < bands[j][0] or bands[j][1] < bands[i][0]
            for i in range(len(bands))
            for j in range(i + 1, len(bands))
        )
        if not overlapped_pair:
            raise RefusalError(
                "lethality: 所有预测频段两两重叠——无论结果如何都落在某个分支里，"
                "这是装饰性实验；至少要有一对互斥频段"
            )
        lethal = any(
            (br.get("on_hit") or {}).get("kill") or (br.get("on_hit") or {}).get("scope")
            for br in predictions
        )
        if not lethal:
            raise RefusalError(
                "lethality: 没有任何分支 kill/scope 某个 claim——结果不会改变信念状态，拒绝预登记"
            )

    def prereg(
        self,
        claim: str,
        tests: str,
        predictions: list[dict[str, Any]],
        rule: dict[str, Any],
        controls: list[str],
        severity: str,
        eval_cmd: str,
        recompute: dict[str, Any],
        timeout_s: int = 600,
        notes: str = "",
        outputs: list[str] | None = None,
    ) -> str:
        self._reload_if_stale()
        try:
            self._require_claim(claim, alive=True)
            if not str(tests).strip():
                raise RefusalError("tests 必须写明要跑什么")
            if not controls:
                raise RefusalError("controls 不能为空（先对照后置信）")
            if not str(severity).strip():
                raise RefusalError("severity 必须写明（这个检验有多重的判别力）")
            if not str(eval_cmd).strip():
                raise RefusalError("eval_cmd 不能为空")
            self._validate_prereg_predictions(predictions)
            validate_spec(recompute)
        except RefusalError as exc:
            self.journal.append("prereg", False, claim=claim, reason=str(exc))
            raise
        pid = self._next_id("P")
        prereg_path = os.path.join(self.run_dir, "prereg", f"{pid}.json")
        payload = {
            "pid": pid,
            "claim": claim,
            "tests": str(tests),
            "predictions": predictions,
            "rule": rule,
            "controls": [str(c) for c in controls],
            "severity": str(severity),
            "eval_cmd": str(eval_cmd),
            "eval_cmd_hash": hashlib.sha256(str(eval_cmd).encode()).hexdigest(),
            "recompute": recompute,
            "timeout_s": int(timeout_s),
            "notes": str(notes),
            "outputs": [str(o) for o in (outputs or [])],
            "prereg_ts": utc_now_iso(),
            "unix_prereg_ts": time.time(),
        }
        atomic_write_json(prereg_path, payload)  # launch 之前落盘——precedence 的根基
        self.state["probes"][pid] = {
            "id": pid,
            "claim": claim,
            "state": ProbeState.PREREG.value,
            "prereg_path": os.path.relpath(prereg_path, self.run_dir),
            "prereg_sha": _sha256_file(prereg_path),
            "unix_prereg_ts": payload["unix_prereg_ts"],
            "result": None,
        }
        self._save()
        self.journal.append(
            "prereg", True, pid=pid, claim=claim,
            bands=[br.get("band") for br in predictions],
        )
        return pid

    def mark_running(self, pid: str) -> None:
        """由 probe.run 调用：PREREG → RUNNING。"""
        self._reload_if_stale()
        self._transition_probe(pid, ProbeState.RUNNING, "probe.run")

    def _transition_probe(self, pid: str, target: ProbeState, via: str) -> None:
        if pid not in self.state["probes"]:
            raise RefusalError(f"未知 probe: {pid}")
        p = self.state["probes"][pid]
        current = ProbeState(p["state"])
        if target not in PROBE_TRANSITIONS.get(current, frozenset()):
            raise RefusalError(f"{pid} 当前 {current.value}，不允许迁到 {target.value}")
        p["state"] = target.value
        self._save()
        self.journal.append("probe_transition", True, pid=pid, to=target.value, via=via)

    def land(self, pid: str) -> dict[str, Any]:
        """重算指标并机械应用 rule。四道防线里有三道在这里：precedence / provenance / recompute。"""
        self._reload_if_stale()
        try:
            return self._land(pid)
        except RefusalError as exc:
            self.journal.append("land", False, pid=pid, reason=str(exc))
            raise

    def _land(self, pid: str) -> dict[str, Any]:
        if pid not in self.state["probes"]:
            raise RefusalError(f"未知 probe: {pid}")
        p = self.state["probes"][pid]
        if ProbeState(p["state"]) is not ProbeState.RUNNING:
            raise RefusalError(f"{pid} 状态 {p['state']}，只有 RUNNING 可 land（先 probe.run）")
        prereg_path = os.path.join(self.run_dir, p["prereg_path"])
        # precedence：哈希一致 + prereg 文件未被事后改动（mtime 不晚于登记时刻的宽限）
        if not os.path.exists(prereg_path):
            raise RefusalError(f"prereg 文件缺失: {p['prereg_path']}")
        current_sha = _sha256_file(prereg_path)
        if current_sha != p["prereg_sha"]:
            raise RefusalError("precedence: prereg 文件内容与登记哈希不符（事后篡改？）")
        if os.path.getmtime(prereg_path) > p["unix_prereg_ts"] + 5:
            raise RefusalError("precedence: prereg 文件修改时间晚于登记时间戳")
        with open(prereg_path, encoding="utf-8") as fh:
            spec = json.load(fh)
        # provenance：结果目录必须由 probe.run 产出
        result_dir = os.path.join(self.run_dir, "results", pid)
        prov_path = os.path.join(result_dir, "provenance.json")
        if not os.path.exists(prov_path):
            raise RefusalError(f"provenance: 缺 {os.path.relpath(prov_path, self.run_dir)}（结果必须经 probe.run 产出）")
        with open(prov_path, encoding="utf-8") as fh:
            prov = json.load(fh)
        if prov.get("produced_by") != "probe.run":
            raise RefusalError("provenance: produced_by != 'probe.run'，拒绝手工制品")
        if prov.get("eval_cmd_hash") != spec["eval_cmd_hash"]:
            raise RefusalError("provenance: 实际执行的 eval 命令哈希与 prereg 登记不符")
        started = float(prov.get("unix_started", 0))
        if started <= float(p["unix_prereg_ts"]):
            raise RefusalError("precedence: 结果开始时间不晚于 prereg 登记时间（先登记后执行）")
        raw_dir = os.path.join(result_dir, "raw")
        if not os.path.isdir(raw_dir):
            raise RefusalError(f"provenance: 缺 raw/ 目录（{os.path.relpath(raw_dir, self.run_dir)}）")
        # recompute：从原始文件重算，绝不采信任何报告值
        try:
            metric = run_spec(spec["recompute"], raw_dir)
        except RecomputeError as exc:
            raise RefusalError(f"recompute 失败: {exc}") from exc
        claimed = prov.get("claimed_metric")
        if claimed is not None:
            try:
                if abs(float(claimed) - metric) > 1e-9 * max(1.0, abs(metric)):
                    raise RefusalError(
                        f"provenance: 制品声称指标 {claimed} 与原始文件重算值 {metric} 不一致——拒绝落地"
                    )
            except (TypeError, ValueError) as exc:
                raise RefusalError(f"provenance: claimed_metric 非数值 {claimed!r}") from exc
        # rule 应用：首个命中的频段（first-hit），机械执行 on_hit
        hit = None
        for br in spec["predictions"]:
            lo, hi = float(br["band"][0]), float(br["band"][1])
            if lo <= metric <= hi:
                hit = br
                break
        if hit is None:
            p["state"] = ProbeState.TRIAGE.value
            p["result"] = {"metric": metric, "branch": None, "landed_ts": utc_now_iso()}
            owed = f"{pid} TRIAGE：指标 {metric} 落在所有预测频段之外——欠一次强制 abduce（解释或换假设）"
            self.state["constraints"].append(
                {"ts": utc_now_iso(), "source": f"triage:{pid}", "text": owed, "owed": True}
            )
            self._save()
            self.journal.append("land", True, pid=pid, metric=metric, branch=None, triage=True)
            return {"pid": pid, "metric": metric, "branch": None, "probe_state": "TRIAGE", "owed": owed}
        on_hit = hit.get("on_hit") or {}
        applied: dict[str, list[str]] = {}
        for action, target_state in (
            ("kill", ClaimState.REFUTED),
            ("support", ClaimState.SUPPORTED),
            ("artifact", ClaimState.ARTIFACT),
            ("contest", ClaimState.CONTESTED),
        ):
            for target in on_hit.get(action, []) or []:
                self._land_settle(target, target_state, pid)
                applied.setdefault(action, []).append(target)
        for target in on_hit.get("scope", []) or []:
            c = self._require_claim(target, alive=True)
            c["state"] = ClaimState.SCOPED.value
            c["history"].append({"ts": utc_now_iso(), "to": "SCOPED", "via": f"land:{pid}"})
            applied.setdefault("scope", []).append(target)
        p["state"] = ProbeState.LANDED.value
        p["result"] = {
            "metric": metric,
            "branch": hit.get("branch"),
            "landed_ts": utc_now_iso(),
            "applied": applied,
        }
        self._save()
        self.journal.append("land", True, pid=pid, metric=metric, branch=hit.get("branch"), applied=applied)
        return {"pid": pid, "metric": metric, "branch": hit.get("branch"), "applied": applied}

    def _land_settle(self, h: str, target: ClaimState, pid: str) -> None:
        c = self._require_claim(h, alive=True)
        if target not in LAND_MOVABLE:
            raise RefusalError(f"land 不可将 claim 置为 {target.value}")
        c["state"] = target.value
        c["killed_by"] = pid
        c["history"].append({"ts": utc_now_iso(), "to": target.value, "via": f"land:{pid}"})

    # ---------- grill 攻击的登记与落地 ----------

    def add_attack(self, claim: str, prompt: str) -> str:
        """grill 发起攻击时登记；prompt 摘要落 journal。"""
        self._reload_if_stale()
        self._require_claim(claim, alive=True)
        gid = self._next_id("G")
        self.state["attacks"][gid] = {
            "gid": gid,
            "claim": claim,
            "status": "in_flight",
            "prompt_sha": hashlib.sha256(prompt.encode()).hexdigest()[:16],
            "created": utc_now_iso(),
        }
        self._save()
        self.journal.append("attack", True, gid=gid, claim=claim, prompt_sha=self.state["attacks"][gid]["prompt_sha"])
        return gid

    def record_attack(self, gid: str, payload: dict[str, Any]) -> dict[str, Any]:
        """grill 结果必须是 typed entry：new_h（走同一套 abduce 验证器）/ constraint / no_change。
        建议性散文一律拒绝。"""
        self._reload_if_stale()
        if gid not in self.state["attacks"]:
            raise RefusalError(f"未知攻击: {gid}")
        g = self.state["attacks"][gid]
        if g["status"] != "in_flight":
            raise RefusalError(f"{gid} 已处理（{g['status']}）")
        t = payload.get("type")
        if t == "new_h":
            try:
                new_h = self.abduce(
                    payload["claim"], payload.get("kind", "mechanism"),
                    payload["predicts"], payload.get("conflicts", ""),
                    mechanism=payload.get("mechanism", ""),
                    hypothesis=payload.get("hypothesis", ""),
                    observable=payload.get("observable", ""),
                )
            except RefusalError as exc:
                g["status"] = "rejected_by_validator"
                g["reason"] = str(exc)
                self._save()
                self.journal.append("record_attack", False, gid=gid, type=t, reason=str(exc))
                return {"gid": gid, "type": t, "accepted": False, "reason": str(exc)}
            g["status"] = "resolved"
            g["spawned"] = new_h
            self._save()
            self.journal.append("record_attack", True, gid=gid, type=t, spawned=new_h)
            return {"gid": gid, "type": t, "accepted": True, "spawned": new_h}
        if t == "constraint":
            text = str(payload.get("text", "")).strip()
            if not text:
                g["status"] = "rejected_malformed"
                self._save()
                self.journal.append("record_attack", False, gid=gid, type=t, reason="constraint 缺 text")
                return {"gid": gid, "type": t, "accepted": False, "reason": "constraint 缺 text"}
            self.state["constraints"].append(
                {"ts": utc_now_iso(), "source": f"grill:{gid}", "text": text, "owed": False}
            )
            g["status"] = "resolved"
            self._save()
            self.journal.append("record_attack", True, gid=gid, type=t, constraint=text[:300])
            return {"gid": gid, "type": t, "accepted": True}
        if t == "no_change":
            reason = str(payload.get("reason", "")).strip()
            if not reason:
                g["status"] = "rejected_malformed"
                self._save()
                self.journal.append("record_attack", False, gid=gid, type=t, reason="no_change 缺 reason")
                return {"gid": gid, "type": t, "accepted": False, "reason": "no_change 缺 reason"}
            g["status"] = "resolved"
            g["reason"] = reason
            self._save()
            self.journal.append("record_attack", True, gid=gid, type=t, reason=reason[:300])
            return {"gid": gid, "type": t, "accepted": True}
        g["status"] = "rejected_malformed"
        self._save()
        reason = f"攻击结果必须是 new_h / constraint / no_change 之一，得到 {t!r}；建议性散文不被接受"
        self.journal.append("record_attack", False, gid=gid, reason=reason)
        raise RefusalError(reason)

    # ---------- 证据挂接（figure 等） ----------

    def attach(self, claim: str, entry: dict[str, Any], kind: str = "figure") -> str:
        self._reload_if_stale()
        self._require_claim(claim, alive=True)
        if kind == "figure":
            for field in ("observation", "axes", "values_read", "caveats", "simulated"):
                if field not in entry:
                    raise RefusalError(f"figure 证据缺字段 {field}（须由 figure.read 产出）")
        eid = self._next_id("E")
        record = {"eid": eid, "claim": claim, "kind": kind, "ts": utc_now_iso(), **entry}
        self.state["evidence"].append(record)
        self.state["claims"][claim]["evidence"].append(eid)
        self._save()
        self.journal.append("attach", True, eid=eid, claim=claim, kind=kind)
        return eid

    def add_constraint(self, text: str, source: str = "human", owed: bool = False) -> None:
        self._reload_if_stale()
        if not str(text).strip():
            raise RefusalError("constraint 文本不能为空")
        self.state["constraints"].append(
            {"ts": utc_now_iso(), "source": source, "text": str(text), "owed": owed}
        )
        self._save()
        self.journal.append("add_constraint", True, source=source, text=str(text)[:300])
