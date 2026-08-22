#!/usr/bin/env python3
"""viewer —— 把 artifacts/$RUN 渲染成一张静态 HTML（评委侧无执行路径）。

内容：register 表（状态+历史）· 每 probe 的 prereg-vs-result 面板（时间戳可见，
这就是 gate red→green 时间线的原材料）· grill 攻击 · 证据（含 Qwen-VL 读图条目）·
journal 时间线 · 宿主三道 gate 结果与 ledger（which-bound-ended）· report.md。
只用标准库；输出零脚本、纯 HTML+CSS。
"""

from __future__ import annotations

import base64
import html
import json
import os
import re
import sys

STATE_COLORS = {
    "LIVE": "#2563eb", "PROPOSED": "#6b7280", "DEMOTED": "#92400e", "SCOPED": "#92400e",
    "CONTESTED": "#b45309", "REFUTED": "#b91c1c", "ARTIFACT": "#7c3aed", "SUPPORTED": "#15803d",
}
OK_COLOR = {"pass": "#15803d", "fail": "#b91c1c"}


def esc(s: object) -> str:
    return html.escape(str(s), quote=True)


def render_markdown(text: str) -> str:
    out: list[str] = []
    in_code = False
    for line in text.splitlines():
        if line.startswith("```"):
            in_code = not in_code
            out.append("</pre>" if not in_code else "<pre>")
            continue
        if in_code:
            out.append(esc(line))
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            out.append(f"<h{len(m.group(1))+1}>{esc(m.group(2))}</h{len(m.group(1))+1}>")
            continue
        line = esc(line)
        line = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", line)
        line = re.sub(r"`(.+?)`", r"<code>\1</code>", line)
        out.append(line + "<br>")
    return "\n".join(out)


def read_json(path: str):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    return None


def render_run(run_dir: str) -> str:
    run_id = os.path.basename(os.path.abspath(run_dir))
    reg = read_json(os.path.join(run_dir, "register.json")) or {}
    ledger = read_json(os.path.join(run_dir, "ledger.json")) or {}
    parts: list[str] = []

    # ── 头部：结局 ──
    bound = ledger.get("bound", "(运行中/未记录)")
    parts.append(
        f"<header><h1>Crucible 研究战役 · {esc(run_id)}</h1>"
        f"<div class='bound'>结局: <b>{esc(bound)}</b>"
        + (f" · 容器退出码 {ledger.get('container_exit')} · 快照 sha256 <code>{esc(ledger.get('artifacts_sha256',''))[:16]}</code>" if ledger else "")
        + "</div>"
        + (f"<div class='thesis'>thesis: {esc(reg.get('thesis',''))}</div>" if reg.get("thesis") else "")
        + "</header>"
    )

    # ── 宿主 gate 结果 ──
    gates_html = []
    for g in ("prereg", "reconcile", "review"):
        log = os.path.join(run_dir, f"gate-{g}.host.log")
        status = "—"
        if os.path.exists(log):
            tail = open(log, encoding="utf-8").read().strip().splitlines()
            status = "pass" if any("PASS" in l for l in tail) else "fail"
        gates_html.append(
            f"<span class='gate gate-{status}' style='color:{OK_COLOR.get(status, '#6b7280')}'>"
            f"{esc(g)}: {esc(status)}</span>"
        )
    parts.append("<section><h2>宿主裁决（容器退出后重跑）</h2>" + " ".join(gates_html) + "</section>")

    # ── claim 表 ──
    rows = []
    for cid, c in sorted(reg.get("claims", {}).items()):
        color = STATE_COLORS.get(c.get("state"), "#6b7280")
        hist = " → ".join(h.get("to", "?") for h in c.get("history", []))
        rows.append(
            f"<tr><td><b>{esc(cid)}</b></td>"
            f"<td><span class='state' style='color:{color}'>{esc(c.get('state'))}</span></td>"
            f"<td>{esc(c.get('kind'))}</td><td>{esc(c.get('text'))}</td>"
            f"<td class='mono small'>{esc(hist)}</td>"
            f"<td>{esc(c.get('killed_by') or '')}</td></tr>"
        )
    parts.append(
        "<section><h2>Claim 寄存器</h2><table><tr><th>id</th><th>状态</th><th>kind</th>"
        f"<th>主张</th><th>状态历史</th><th>终审 probe</th></tr>{''.join(rows)}</table></section>"
    )

    # ── probe 面板：prereg 时间戳 vs 结果（red→green 时间线原材料） ──
    panels = []
    for pid, p in sorted(reg.get("probes", {}).items()):
        spec = read_json(os.path.join(run_dir, p.get("prereg_path", "prereg/x.json"))) or {}
        res = p.get("result") or {}
        bands = "; ".join(
            f"{esc(b.get('branch'))}: [{b.get('band',[('?','?')])[0]}, {b.get('band',[0,'?'])[1]}]"
            for b in spec.get("predictions", [])
        )
        hit = res.get("branch")
        metric = res.get("metric")
        line = (
            f"<div class='probe'><h3>{esc(pid)} · claim {esc(p.get('claim'))} · {esc(p.get('state'))}</h3>"
            f"<div class='mono small'>prereg 登记: {esc(spec.get('prereg_ts','?'))}（先于执行，precedence 的根基）</div>"
            f"<div>频段: {bands}</div>"
            + (f"<div>重算指标: <b>{metric}</b> → 命中分支 <b>{esc(hit)}</b>"
               f"（applied: {esc(json.dumps(res.get('applied',{}), ensure_ascii=False))}）</div>" if metric is not None else "")
            + "</div>"
        )
        panels.append(line)
    parts.append("<section><h2>Probe：预登记 vs 结果</h2>" + "".join(panels) + "</section>")

    # ── grill 攻击 ──
    attacks = [
        f"<li><b>{esc(gid)}</b> → {esc(a.get('claim'))} · {esc(a.get('status'))}"
        + (f" · 派生 {esc(a.get('spawned'))}" if a.get("spawned") else "")
        + (f" · 拒因: {esc(a.get('reason',''))[:120]}" if a.get("reason") else "")
        + "</li>"
        for gid, a in sorted(reg.get("attacks", {}).items())
    ]
    parts.append("<section><h2>Grill 攻击（prompt-blinded，非结构隔离）</h2><ul>"
                 + "".join(attacks) + "</ul></section>")

    # ── 证据（含 figure）──
    evidence = []
    for e in reg.get("evidence", []):
        if e.get("kind") == "figure":
            evidence.append(
                f"<li><b>{esc(e.get('eid'))}</b> → {esc(e.get('claim'))}（figure）: "
                f"{esc(e.get('observation','')[:200])} <span class='small'>simulated={esc(e.get('simulated'))} "
                f"values_read={esc(json.dumps(e.get('values_read',{}), ensure_ascii=False))}</span></li>"
            )
        else:
            evidence.append(f"<li><b>{esc(e.get('eid'))}</b> → {esc(e.get('claim'))}: {esc(e.get('kind'))}</li>")
    figs = ""
    fig_dir = os.path.join(run_dir, "figures")
    if os.path.isdir(fig_dir):
        for name in sorted(os.listdir(fig_dir)):
            if name.endswith((".png", ".jpg")):
                b64 = base64.b64encode(open(os.path.join(fig_dir, name), "rb").read()).decode()
                figs += f"<img src='data:image/png;base64,{b64}' alt='{esc(name)}'>"
    parts.append("<section><h2>证据</h2><ul>" + "".join(evidence) + "</ul>" + figs + "</section>")

    # ── journal 时间线 ──
    jpath = os.path.join(run_dir, "journal.jsonl")
    jlines = []
    if os.path.exists(jpath):
        for line in open(jpath, encoding="utf-8"):
            if not line.strip():
                continue
            e = json.loads(line)
            mark = "✓" if e.get("ok") else "✗"
            color = "#15803d" if e.get("ok") else "#b91c1c"
            jlines.append(
                f"<li class='mono small'><span style='color:{color}'>{mark}</span> "
                f"{esc(e.get('ts','?'))} {esc(e.get('op'))} "
                f"{esc(json.dumps({k: v for k, v in e.items() if k not in ('ts','unix_ts','op','ok')}, ensure_ascii=False)[:160])}</li>"
            )
    parts.append(f"<section><h2>Journal 时间线（{len(jlines)} 条，含拒绝）</h2><ul class='timeline'>"
                 + "".join(jlines) + "</ul></section>")

    # ── 报告 ──
    rpath = os.path.join(run_dir, "report.md")
    if os.path.exists(rpath):
        parts.append("<section><h2>report.md</h2><div class='report'>"
                     + render_markdown(open(rpath, encoding="utf-8").read()) + "</div></section>")

    css = """
    body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:1080px;margin:24px auto;
         padding:0 16px;color:#1f2937;background:#fafafa}
    h1{font-size:1.4rem} h2{font-size:1.1rem;border-bottom:2px solid #d1d5db;padding-bottom:4px;margin-top:32px}
    table{border-collapse:collapse;width:100%;font-size:.85rem}
    td,th{border:1px solid #d1d5db;padding:4px 8px;text-align:left;vertical-align:top}
    .bound{font-size:1.05rem;margin:6px 0}
    .thesis{color:#4b5563;font-size:.9rem}
    .mono{font-family:ui-monospace,Menlo,monospace} .small{font-size:.78rem;color:#4b5563}
    .probe{border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;margin:8px 0;background:#fff}
    .gate{font-family:ui-monospace,monospace;margin-right:12px}
    .timeline{list-style:none;padding-left:0} .timeline li{margin:2px 0}
    img{max-width:520px;border:1px solid #d1d5db;border-radius:8px;margin:8px 0;background:#fff}
    .report{background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:12px 20px}
    pre{background:#f3f4f6;padding:8px;border-radius:6px;overflow-x:auto}
    """
    return (
        "<!doctype html><html lang='zh'><meta charset='utf-8'>"
        f"<title>Crucible · {esc(run_id)}</title><style>{css}</style><body>"
        + "".join(parts)
        + "<footer class='small'>静态渲染，无脚本 · 数据只来自 artifacts/</footer></body></html>"
    )


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: python viewer.py <RUN_DIR> [-o out.html]")
        return 2
    run_dir = sys.argv[1]
    out = "run.html"
    if "-o" in sys.argv:
        out = sys.argv[sys.argv.index("-o") + 1]
    html_text = render_run(run_dir)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html_text)
    print(f"渲染完成: {out} ({len(html_text)//1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
