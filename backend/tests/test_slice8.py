"""Unit and integration tests for Slice 8: AllWISE 15-Year Epoch Overlay, Multi-Band Detector Matrix, and Sequence Export.

Specification: docs/ROADMAP.md Slice 8, docs/PROJECT_BRIEF.md, docs/DATA_SOURCES.md.
"""

from __future__ import annotations

import io
import re
from pathlib import Path
import numpy as np
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from backend.app.cache import disk_cache
from backend.app.catalogs import query_wise
from backend.app.config import settings
from backend.app.main import app
from backend.app.render import render_animation_gif, render_to_png_bytes

client = TestClient(app)


def test_render_animation_gif_looping() -> None:
    """Verify animated GIF rendering compiles multiple frames into a looping GIF."""
    # Generate 3 synthetic PNG frames
    png_list: list[bytes] = []
    for i in range(3):
        arr = np.ones((30, 30), dtype=np.uint8) * (50 * i)
        mask = np.ones((30, 30), dtype=bool)
        png_list.append(render_to_png_bytes(arr, mask))

    gif_bytes = render_animation_gif(png_list, fps=4)
    assert len(gif_bytes) > 0

    img = Image.open(io.BytesIO(gif_bytes))
    assert img.format == "GIF"
    assert getattr(img, "is_animated", False) is True
    assert img.n_frames == 3


def test_export_gif_endpoint_invalid_key() -> None:
    """Invalid sequence key must return 404 NOT_FOUND."""
    resp = client.get("/api/v1/sequences/not-valid-hex/export.gif")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_export_gif_endpoint_success() -> None:
    """Verify GIF export endpoint returns image/gif with attachment headers."""
    test_key = "f" * 32
    seq_dir = settings.cache_dir / "sequences" / test_key
    seq_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "n_frames": 2,
        "n_available": 2,
        "truncated": False,
        "n_failed_downloads": 0,
        "grid": {"width": 20, "height": 20, "pixscale_arcsec": 3.08, "native_pixscale_arcsec": 6.16, "upsample": 2, "orientation": "north-up, east-left, row 0 = north", "wcs": {}},
        "stretch": {"mode": "global", "function": "asinh", "vmin": 0.0, "vmax": 10.0, "unit": "MJy/sr"},
        "frames": [{"index": 0}, {"index": 1}],
        "warnings": [],
    }
    disk_cache.put_sequence_meta(test_key, meta)

    arr0 = np.ones((20, 20), dtype=np.uint8) * 40
    arr1 = np.ones((20, 20), dtype=np.uint8) * 120
    mask = np.ones((20, 20), dtype=bool)

    disk_cache.put_frame_png(test_key, 0, render_to_png_bytes(arr0, mask))
    disk_cache.put_frame_png(test_key, 1, render_to_png_bytes(arr1, mask))

    try:
        resp = client.get(f"/api/v1/sequences/{test_key}/export.gif?fps=4")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/gif"
        assert 'attachment; filename="spherex_' in resp.headers.get("content-disposition", "")

        img = Image.open(io.BytesIO(resp.content))
        assert img.format == "GIF"
        assert img.n_frames == 2

    finally:
        import shutil
        if seq_dir.exists():
            shutil.rmtree(seq_dir, ignore_errors=True)


def test_wise_catalog_query() -> None:
    """Verify AllWISE historical 2010 catalog queries."""
    res = query_wise(133.795125, -7.245147, 8.0)
    assert res["catalog"] == "AllWISE (2010)"
    assert res["epoch"] == "J2010.0"
    assert res["count"] >= 1
    assert len(res["sources"]) >= 1

    src = res["sources"][0]
    assert "designation" in src
    assert "w1_mag" in src
    assert "w2_mag" in src

    # HTTP endpoint test
    resp = client.get("/api/v1/catalog/wise?ra=133.795&dec=-7.245&radius_arcmin=8")
    assert resp.status_code == 200
    data = resp.json()
    assert data["catalog"] == "AllWISE (2010)"
    assert data["count"] >= 1


def test_frontend_zero_innerhtml_compliance() -> None:
    """Verify that frontend/ strictly contains zero innerHTML usage."""
    frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
    for js_path in frontend_dir.glob("*.js"):
        content = js_path.read_text(encoding="utf-8")
        matches = [m.start() for m in re.finditer(r"\.innerHTML\s*=", content)]
        assert len(matches) == 0, f"Forbidden innerHTML found in {js_path.name}"
