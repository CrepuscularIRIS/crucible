"""Shared helper: a `sha256sum -c`-compatible manifest of a staged tree."""

from __future__ import annotations

import hashlib
from pathlib import Path

MANIFEST_NAME = "MANIFEST.sha256"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_sha_manifest(root: Path) -> Path:
    """Hash every file under root (except the manifest itself), sorted by path."""
    files = sorted(p for p in root.rglob("*") if p.is_file() and p.name != MANIFEST_NAME)
    lines = [f"{sha256_file(p)}  {p.relative_to(root).as_posix()}" for p in files]
    out = root / MANIFEST_NAME
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out


def require_empty(out_dir: Path) -> None:
    if out_dir.exists() and any(out_dir.iterdir()):
        raise ValueError(f"workspace {out_dir} is not empty; stage into a fresh directory")
