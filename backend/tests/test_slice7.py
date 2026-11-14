"""Unit and integration tests for Slice 7: Image Subtraction (Difference Imaging), Blink A/B Mode, and CADC NEOSSat Cross-Matching.

Specification: docs/ROADMAP.md Slice 7, docs/PROJECT_BRIEF.md, docs/API_SPEC.md.
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
from backend.app.catalogs import query_cadc_neossat
from backend.app.config import settings
from backend.app.main import app
from backend.app.render import render_difference_png

client = TestClient(app)


def test_render_difference_png_symmetric_stretch() -> None:
    """Verify that difference rendering maps zero to 128 (neutral gray), positive to bright, negative to dark."""
    diff_arr = np.array([
        [-5.0, 0.0, 5.0],
        [0.0, 0.0, 0.0],
        [-10.0, 0.0, 10.0],
    ], dtype=np.float32)
    valid_mask = np.ones((3, 3), dtype=bool)

    png_bytes = render_difference_png(diff_arr, valid_mask, already_flipped=True)
    img = Image.open(io.BytesIO(png_bytes)).convert("LA")
    assert img.mode == "LA"

    arr = np.array(img)
    gray = arr[:, :, 0]
    alpha = arr[:, :, 1]

    # Valid mask gives alpha=255
    assert np.all(alpha == 255)

    # Center pixel (diff = 0) must be 128
    assert gray[1, 1] == 128

    # Positive difference must be > 128
    assert gray[0, 2] > 128
    assert gray[2, 2] > 128

    # Negative difference must be < 128
    assert gray[0, 0] < 128
    assert gray[2, 0] < 128


def test_difference_endpoint_invalid_key() -> None:
    """Invalid sequence key must return 404 NOT_FOUND."""
    resp = client.get("/api/v1/sequences/not-a-valid-hex-key/difference.png?frame_a=0&frame_b=1")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_difference_endpoint_invalid_indices() -> None:
    """Frame indices out of range must return 422 INVALID_PARAMETER."""
    test_key = "d" * 32
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

    try:
        resp = client.get(f"/api/v1/sequences/{test_key}/difference.png?frame_a=0&frame_b=5")
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "INVALID_PARAMETER"
    finally:
        import shutil
        if seq_dir.exists():
            shutil.rmtree(seq_dir, ignore_errors=True)


def test_difference_endpoint_with_cube() -> None:
    """Verify difference generation from cached cube.npz."""
    test_key = "e" * 32
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

    data = np.zeros((2, 20, 20), dtype=np.float32)
    var = np.ones((2, 20, 20), dtype=np.float32) * 0.01

    # Put a star at (10, 10) in frame 0 that moves to (10, 12) in frame 1
    data[0, 10, 10] = 5.0
    data[1, 10, 12] = 5.0

    disk_cache.put_sequence_cube(test_key, data, var, [1.0, 1.2], [60800.0, 60801.0], [2, 2])

    try:
        resp = client.get(f"/api/v1/sequences/{test_key}/difference.png?frame_a=0&frame_b=1")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        assert "max-age=86400" in resp.headers.get("cache-control", "")

        # Open returned PNG
        img = Image.open(io.BytesIO(resp.content)).convert("LA")
        arr = np.array(img)
        gray = arr[:, :, 0]

        # Background pixels without change should be neutral gray 128
        assert gray[0, 0] == 128

        # Old position (10, 10) had flux 5 in frame A and 0 in frame B -> diff < 0 -> dark (< 128)
        assert gray[10, 10] < 128

        # New position (10, 12) had flux 0 in frame A and 5 in frame B -> diff > 0 -> bright (> 128)
        assert gray[10, 12] > 128

    finally:
        import shutil
        if seq_dir.exists():
            shutil.rmtree(seq_dir, ignore_errors=True)


def test_cadc_neossat_catalog_query() -> None:
    """Verify CADC NEOSSat cross-match endpoint and fallback records."""
    # Test WISE 0855 coordinates
    res = query_cadc_neossat(133.795125, -7.245147, 8.0)
    assert res["catalog"] == "NEOSSat (CADC)"
    assert res["count"] >= 1
    assert len(res["observations"]) >= 1

    obs = res["observations"][0]
    assert "observation_id" in obs
    assert "target_name" in obs

    # Test HTTP endpoint
    resp = client.get("/api/v1/catalog/neossat?ra=133.795&dec=-7.245&radius_arcmin=8")
    assert resp.status_code == 200
    data = resp.json()
    assert data["catalog"] == "NEOSSat (CADC)"
    assert data["count"] >= 1


def test_frontend_zero_innerhtml_compliance() -> None:
    """Verify frontend/ strictly maintains zero innerHTML usage."""
    frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
    for js_path in frontend_dir.glob("*.js"):
        content = js_path.read_text(encoding="utf-8")
        matches = [m.start() for m in re.finditer(r"\.innerHTML\s*=", content)]
        assert len(matches) == 0, f"Forbidden innerHTML found in {js_path.name}"
