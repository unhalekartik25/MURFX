"""Unit and integration tests for Slice 6: Pixel Spectrum Extraction & Web Audio Sonification.

Specification: docs/API_SPEC.md section 3.8 and AGENT_RULES.md.
"""

from __future__ import annotations

import io
import json
import re
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.cache import disk_cache
from backend.app.config import settings
from backend.app.main import app
from backend.app.schemas import SpectrumPoint, SpectrumResult

client = TestClient(app)


def test_spectrum_schemas() -> None:
    """Verify SpectrumPoint and SpectrumResult validation."""
    pt = SpectrumPoint(
        wavelength_um=2.45,
        flux_mjy_sr=1.85,
        sigma=0.08,
        mjd=60820.5,
        detector=3,
    )
    assert pt.wavelength_um == 2.45
    assert pt.detector == 3

    res = SpectrumResult(
        key="0123456789abcdef0123456789abcdef",
        x=50.0,
        y=50.0,
        radius_px=1,
        n_points=1,
        points=[pt],
    )
    assert res.n_points == 1
    assert len(res.points) == 1

    # Extra fields must be forbidden
    with pytest.raises(Exception):
        SpectrumPoint(
            wavelength_um=2.45,
            flux_mjy_sr=1.85,
            sigma=0.08,
            mjd=60820.5,
            detector=3,
            unknown_field=123,  # type: ignore[call-arg]
        )


def test_spectrum_endpoint_invalid_key() -> None:
    """Invalid sequence key must return 404 NOT_FOUND."""
    # Bad key format (not 32 hex chars)
    resp = client.get("/api/v1/spectrum?key=badkey123&x=10&y=10")
    assert resp.status_code == 404
    data = resp.json()
    assert data["error"]["code"] == "NOT_FOUND"


def test_spectrum_endpoint_missing_sequence() -> None:
    """Non-existent sequence key must return 404 NOT_FOUND."""
    dummy_key = "a" * 32
    resp = client.get(f"/api/v1/spectrum?key={dummy_key}&x=10&y=10")
    assert resp.status_code == 404
    data = resp.json()
    assert data["error"]["code"] == "NOT_FOUND"


def test_spectrum_extraction_and_variance() -> None:
    """Test spectrum extraction from synthetic spectral cube."""
    test_key = "c" * 32
    seq_dir = settings.cache_dir / "sequences" / test_key
    seq_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create mock metadata
    meta = {
        "n_frames": 4,
        "n_available": 4,
        "truncated": False,
        "n_failed_downloads": 0,
        "grid": {
            "width": 40,
            "height": 40,
            "pixscale_arcsec": 3.08,
            "native_pixscale_arcsec": 6.16,
            "upsample": 2,
            "orientation": "north-up, east-left, row 0 = north",
            "wcs": {
                "ctype": ["RA---TAN", "DEC--TAN"],
                "crval": [133.795, -7.245],
                "crpix": [20.5, 20.5],
                "cdelt_deg": [-0.000856, 0.000856],
            },
        },
        "stretch": {
            "mode": "global",
            "function": "asinh",
            "vmin": 0.0,
            "vmax": 10.0,
            "unit": "MJy/sr",
        },
        "frames": [],
        "warnings": [],
    }
    disk_cache.put_sequence_meta(test_key, meta)

    # 2. Create mock cube: 4 frames of 40x40
    # Wavelengths unsorted to verify automatic ascending sort
    wls = [4.5, 1.2, 3.8, 2.1]
    mjds = [60803.0, 60800.0, 60802.0, 60801.0]
    dets = [5, 2, 4, 3]

    data = np.zeros((4, 40, 40), dtype=np.float32)
    var = np.ones((4, 40, 40), dtype=np.float32) * 0.04  # variance = 0.04 -> sigma = 0.2

    # Put distinctive flux at center pixel (y=20, x=20)
    data[0, 20, 20] = 12.0  # at wl=4.5
    data[1, 20, 20] = 3.0   # at wl=1.2
    data[2, 20, 20] = 9.0   # at wl=3.8
    data[3, 20, 20] = 6.0   # at wl=2.1

    disk_cache.put_sequence_cube(test_key, data, var, wls, mjds, dets)

    try:
        # Test out-of-bounds coordinates
        resp_oob = client.get(f"/api/v1/spectrum?key={test_key}&x=45&y=20")
        assert resp_oob.status_code == 422
        assert resp_oob.json()["error"]["code"] == "INVALID_PARAMETER"

        # Test successful spectrum extraction at (20, 20)
        resp = client.get(f"/api/v1/spectrum?key={test_key}&x=20&y=20&radius_px=1")
        assert resp.status_code == 200
        result = resp.json()

        assert result["key"] == test_key
        assert result["x"] == 20.0
        assert result["y"] == 20.0
        assert result["n_points"] == 4

        points = result["points"]
        # Must be sorted by wavelength ascending: 1.2, 2.1, 3.8, 4.5
        assert [p["wavelength_um"] for p in points] == [1.2, 2.1, 3.8, 4.5]
        assert [p["flux_mjy_sr"] for p in points] == [3.0, 6.0, 9.0, 12.0]
        assert [p["detector"] for p in points] == [2, 3, 4, 5]

        # Verify sigma
        for p in points:
            assert abs(p["sigma"] - 0.2) < 1e-4

        # Test radius=2 (3x3 aperture around 20, 20)
        resp_r2 = client.get(f"/api/v1/spectrum?key={test_key}&x=20&y=20&radius_px=2")
        assert resp_r2.status_code == 200
        r2_pts = resp_r2.json()["points"]
        # Aperture has 1 bright center pixel and remaining 0 pixels, mean flux should be non-zero
        assert len(r2_pts) == 4
        assert r2_pts[0]["wavelength_um"] == 1.2
        assert r2_pts[0]["flux_mjy_sr"] < 3.0  # averaged over aperture

    finally:
        # Clean up test files
        import shutil
        if seq_dir.exists():
            shutil.rmtree(seq_dir, ignore_errors=True)


def test_frontend_zero_innerhtml_compliance() -> None:
    """Verify that frontend/ strictly contains zero innerHTML usage."""
    frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
    for js_path in frontend_dir.glob("*.js"):
        content = js_path.read_text(encoding="utf-8")
        # Ensure innerHTML is not used as an assignment or method
        matches = [m.start() for m in re.finditer(r"\.innerHTML\s*=", content)]
        assert len(matches) == 0, f"Forbidden innerHTML found in {js_path.name}"
