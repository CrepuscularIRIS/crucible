"""figure.read —— 结果图 → Qwen-VL → 结构化证据条目。

只用标准库（urllib），kernel 内外都能跑。条目必须经 register.attach 挂接才进入信念状态。
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import re
import urllib.request
from typing import Any

DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_MODEL = "qwen-vl-max"

REQUIRED_FIELDS = ("observation", "axes", "values_read", "caveats", "simulated")

_PROMPT = """你是实验数据审图员。仔细读这张图，回答为一个 JSON 对象（不要输出别的）：
{
  "observation": "图上实际显示了什么（一段话，只描述可核验的内容）",
  "axes": {"x": "<x 轴含义与单位，读不到写 null>", "y": "<y 轴含义与单位，读不到写 null>"},
  "values_read": {"<序列/柱/点名>": <图上可读的数值，读不到写 null>},
  "caveats": ["读图的不确定性、重叠、分辨率问题等；没有则空数组"],
  "simulated": <true 当且仅当图内有明确迹象表明数据是合成/模拟的，否则 false>
}
规则：读不到就写 null，绝不编造；数值只抄图上确实标注或可从网格精确读出的。"""


def _render_prompt(question: str | None) -> str:
    if not question:
        return _PROMPT
    return _PROMPT + f"\n额外问题（在 observation 里一并回答）：{question}"


class FigureError(Exception):
    pass


def _parse_reply(text: str) -> dict[str, Any]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.DOTALL)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise FigureError(f"Qwen-VL 未返回 JSON：{text[:200]}")
    payload = json.loads(text[start : end + 1])
    missing = [f for f in REQUIRED_FIELDS if f not in payload]
    if missing:
        raise FigureError(f"Qwen-VL 返回缺字段: {missing}")
    if not isinstance(payload["simulated"], bool):
        raise FigureError("simulated 必须是布尔")
    return payload


def _build_payload(image_b64: str, mime: str, question: str | None) -> dict[str, Any]:
    prompt_text = _render_prompt(question)
    return {
        "model": os.environ.get("CRUCIBLE_VL_MODEL", DEFAULT_MODEL),
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
                    {"type": "text", "text": prompt_text},
                ],
            }
        ],
        "max_tokens": 1500,
    }


def read_sync(path: str, question: str | None = None) -> dict[str, Any]:
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise FigureError("未设置 DASHSCOPE_API_KEY")
    if not os.path.isfile(path):
        raise FigureError(f"图不存在: {path}")
    mime = mimetypes.guess_type(path)[0] or "image/png"
    if mime not in ("image/png", "image/jpeg"):
        raise FigureError(f"只支持 png/jpg，得到 {mime}")
    with open(path, "rb") as fh:
        raw = fh.read()
    body = json.dumps(_build_payload(base64.b64encode(raw).decode(), mime, question)).encode()
    url = os.environ.get("DASHSCOPE_BASE_URL", DEFAULT_BASE_URL).rstrip("/") + "/chat/completions"
    req = urllib.request.Request(
        url, data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raise FigureError(f"DashScope HTTP {exc.code}: {exc.read().decode()[:300]}") from exc
    except urllib.error.URLError as exc:
        raise FigureError(f"DashScope 不可达: {exc}") from exc
    text = "".join(
        part.get("text", "")
        for part in data.get("choices", [{}])[0].get("message", {}).get("content", [])
        if isinstance(part, dict)
    ) or data.get("choices", [{}])[0].get("message", {}).get("content", "")
    entry = _parse_reply(text if isinstance(text, str) else json.dumps(text, ensure_ascii=False))
    entry["_meta"] = {
        "model": os.environ.get("CRUCIBLE_VL_MODEL", DEFAULT_MODEL),
        "path": os.path.basename(path),
        "sha256": hashlib.sha256(raw).hexdigest()[:16],
        "bytes": len(raw),
    }
    return entry


async def read(path: str, question: str | None = None) -> dict[str, Any]:
    """kernel 里的异步入口（ipython 内 await figure.read(...)）。"""
    return await asyncio.to_thread(read_sync, path, question)
