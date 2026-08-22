"""viewer 包出口：实现全在 viewer.py（可直接 `python viewer/viewer.py <RUN_DIR>`）。"""

from .viewer import main, render_run

__all__ = ["render_run", "main"]
