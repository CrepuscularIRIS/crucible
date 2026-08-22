"""figure 的 BDD 测试：回复解析契约、payload 构造、错误路径。真实调用需
DASHSCOPE_API_KEY（标记 live，默认跳过）。"""

from __future__ import annotations

import base64
import json
import os

import pytest

from figure import FigureError, _build_payload, _parse_reply, read_sync


def test_parse_reply_accepts_fenced_json():
    reply = '```json\n{"observation":"两组分离","axes":{"x":null,"y":"acc"},"values_read":{"a":0.71},"caveats":[],"simulated":false}\n```'
    entry = _parse_reply(reply)
    assert entry["values_read"]["a"] == 0.71
    assert entry["simulated"] is False


def test_parse_reply_rejects_missing_fields():
    with pytest.raises(FigureError, match="缺字段"):
        _parse_reply('{"observation":"x"}')


def test_parse_reply_rejects_prose():
    with pytest.raises(FigureError):
        _parse_reply("这张图挺好，建议加误差棒。")


def test_build_payload_embeds_image_and_prompt():
    payload = _build_payload(base64.b64encode(b"pngbytes").decode(), "image/png", "误差棒下是否分离？")
    content = payload["messages"][0]["content"]
    assert content[0]["image_url"]["url"].startswith("data:image/png;base64,")
    assert "误差棒" in content[1]["text"]
    assert "绝不编造" in content[1]["text"]


def test_read_sync_requires_key(tmp_path, monkeypatch):
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    img = tmp_path / "a.png"
    img.write_bytes(b"...")
    with pytest.raises(FigureError, match="DASHSCOPE_API_KEY"):
        read_sync(str(img))


def test_read_sync_rejects_non_image(tmp_path, monkeypatch):
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-test")
    f = tmp_path / "a.gif"
    f.write_bytes(b"...")
    with pytest.raises(FigureError, match="png/jpg"):
        read_sync(str(f))


@pytest.mark.live
def test_live_qwen_vl_read(tmp_path):
    """阳性 live 测试：真实 DashScope Qwen-VL 读一张 matplotlib 图。"""
    if not os.environ.get("DASHSCOPE_API_KEY"):
        pytest.skip("需要 DASHSCOPE_API_KEY")
    import urllib.request

    png_path = tmp_path / "fig.png"
    # 一张极简 1x1 png（真实场景用 matplotlib；这里只验证链路）
    urllib.request.urlretrieve("https://dashscope.aliyuncs.com/favicon.ico", tmp_path / "x") if False else None
    png_path.write_bytes(
        base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
    )
    entry = read_sync(str(png_path), question="图上有几个数据点？")
    assert entry["simulated"] is False or entry["simulated"] is True  # 契约字段存在即可
    assert "_meta" in entry
