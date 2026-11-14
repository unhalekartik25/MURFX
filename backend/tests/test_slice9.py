"""Unit and integration tests for Slice 9: Variable Star Light Curves, Invert Contrast, and Scientific Stacked FITS Export.

Specification: docs/ROADMAP.md Slice 9, docs/PROJECT_BRIEF.md, docs/API_SPEC.md.
"""

from __future__ import annotations

import io
import re
from pathlib import Path
import numpy as np
import pytest
from astropy.io import fits
from fastapi.testclient import TestClient

from backend.app.cache import disk_cache
from backend.app.config import settings
from backend.app.main import app

client = TestClient(app)


def test_fits_export_endpoint_invalid_key() -> None:
    """Invalid sequence key must return 404 NOT_FOUND."""
    resp = client.get("/api/v1/sequences/not-valid-hex/stack.fits")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_fits_export_endpoint_missing_sequence() -> None:
    """Missing sequence must return 404 NOT_FOUND."""
    dummy_key = "1" * 32
    resp = client.get(f"/api/v1/sequences/{dummy_key}/stack.fits")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_fits_export_endpoint_success() -> None:
    """Verify calibrated scientific FITS export produces valid primary HDU with WCS and BUNIT headers."""
    test_key = "2" * 32
    seq_dir = settings.cache_dir / "sequences" / test_key
    seq_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "n_frames": 2,
        "n_available": 2,
        "truncated": False,
        "n_failed_downloads": 0,
        "request": {"ra": 133.795125, "dec": -7.245147},
        "grid": {
            "width": 30,
            "height": 30,
            "pixscale_arcsec": 3.08,
            "native_pixscale_arcsec": 6.16,
            "upsample": 2,
            "orientation": "north-up, east-left, row 0 = north",
            "wcs": {
                "ctype": ["RA---TAN", "DEC--TAN"],
                "crval": [133.795125, -7.245147],
                "crpix": [15.5, 15.5],
                "cdelt_deg": [-0.000856, 0.000856],
            },
        },
        "stretch": {"mode": "global", "function": "asinh", "vmin": 0.0, "vmax": 10.0, "unit": "MJy/sr"},
        "frames": [{"index": 0}, {"index": 1}],
        "warnings": [],
    }
    disk_cache.put_sequence_meta(test_key, meta)

    # Save mock cube with known flux
    cube_data = np.ones((2, 30, 30), dtype=np.float32) * 4.2
    cube_var = np.ones((2, 30, 30), dtype=np.float32) * 0.05
    disk_cache.put_sequence_cube(test_key, cube_data, cube_var, [1.5, 2.5], [60800.0, 60810.0], [2, 3])

    try:
        resp = client.get(f"/api/v1/sequences/{test_key}/stack.fits")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/fits"
        assert 'attachment; filename="spherex_' in resp.headers.get("content-disposition", "")
        assert resp.headers.get("cache-control") == "public, max-age=86400"

        # Verify FITS parsing with astropy
        hdul = fits.open(io.BytesIO(resp.content))
        assert len(hdul) >= 1
        primary = hdul[0]

        assert primary.header["BUNIT"] == "MJy/sr"
        assert primary.header["TELESCOP"] == "SPHEREx"
        assert primary.header["CTYPE1"] == "RA---TAN"
        assert primary.header["CTYPE2"] == "DEC--TAN"
        assert abs(primary.header["CRVAL1"] - 133.795125) < 1e-4
        assert abs(primary.header["CRVAL2"] - (-7.245147)) < 1e-4

        # Array shape and values
        assert primary.data.shape == (30, 30)
        assert np.allclose(primary.data, 4.2)

        hdul.close()

    finally:
        import shutil
        if seq_dir.exists():
            shutil.rmtree(seq_dir, ignore_errors=True)


def test_frontend_zero_innerhtml_compliance() -> None:
    """Verify that frontend/ strictly contains zero innerHTML usage."""
    frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
    for js_path in frontend_dir.glob("*.js"):
        content = js_path.read_text(encoding="utf-8")
        matches = [m.start() for m in re.finditer(r"\.innerHTML\s*=", content)]
        assert len(matches) == 0, f"Forbidden innerHTML found in {js_path.name}"
