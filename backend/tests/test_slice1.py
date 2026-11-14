"""Slice 1 test suite: Parameter validation, security injections, WCS orientation, masking, and deduplication.

Specification: docs/ROADMAP.md Slice 1, docs/SECURITY.md section 12.
"""

from __future__ import annotations

import numpy as np
import pytest
from astropy.wcs import WCS
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app.config import DETECTOR_MAP, settings
from backend.app.errors import AppError
from backend.app.irsa import build_adql, validate_uri
from backend.app.jobs import job_registry
from backend.app.main import app
from backend.app.processing import (
    build_target_grid,
    mask_flags,
    reproject_frame,
    stretch_frames,
    subtract_background,
)
from backend.app.render import render_to_png_bytes
from backend.app.schemas import SequenceRequest

client = TestClient(app)


def test_sequence_request_validation() -> None:
    """Validate standard bounds, forbid extra fields, forbid NaNs."""
    # Valid request
    req = SequenceRequest(ra=133.795125, dec=-7.245147, fov_arcmin=8.0, detector=5)
    assert req.detector == 5
    key = req.compute_key()
    assert len(key) == 32
    assert all(c in "0123456789abcdef" for c in key)

    # RA out of range [0, 360)
    with pytest.raises(ValidationError):
        SequenceRequest(ra=360.0, dec=0.0)
    with pytest.raises(ValidationError):
        SequenceRequest(ra=-0.001, dec=0.0)

    # Dec out of range [-90, 90]
    with pytest.raises(ValidationError):
        SequenceRequest(ra=10.0, dec=90.1)

    # FOV out of bounds [1, 30]
    with pytest.raises(ValidationError):
        SequenceRequest(ra=10.0, dec=0.0, fov_arcmin=0.5)
    with pytest.raises(ValidationError):
        SequenceRequest(ra=10.0, dec=0.0, fov_arcmin=35.0)

    # Extra fields forbidden
    with pytest.raises(ValidationError):
        SequenceRequest(ra=10.0, dec=0.0, unexpected_field="malicious")  # type: ignore[call-arg]

    # NaN / Inf rejected
    with pytest.raises(ValidationError):
        SequenceRequest(ra=float("nan"), dec=0.0)


def test_adql_injection_prevention() -> None:
    """ADQL query builder accepts only validated numeric floats and mapped detectors."""
    # Valid query
    adql = build_adql(133.795125, -7.245147, 5)
    assert "POINT('ICRS', 133.79512500, -7.24514700)" in adql
    assert "SPHEREx-D5" in adql
    assert "spherex.artifact" in adql

    # Invalid detector rejected
    with pytest.raises(AppError) as exc_info:
        build_adql(100.0, 10.0, 99)
    assert exc_info.value.code == "INVALID_PARAMETER"


def test_uri_validation_security() -> None:
    """Validate that URI filtering strictly enforces security constraints."""
    valid_uri = "ibe/data/spherex/dr1/level2/2025W18_1B/l2b-v27-2026-196/1/level2_spx_l2b.fits"
    assert validate_uri(valid_uri) is True

    # Path traversal attempts
    assert validate_uri("../evil.fits") is False
    assert validate_uri("ibe/data/spherex/../../etc/passwd.fits") is False
    assert validate_uri("ibe/data/spherex/foo/../bar.fits") is False

    # Scheme injection
    assert validate_uri("https://evil.com/ibe/data/spherex/test.fits") is False
    assert validate_uri("file:///etc/passwd") is False

    # Wrong prefix or extension
    assert validate_uri("other/data/spherex/test.fits") is False
    assert validate_uri("ibe/data/spherex/test.exe") is False
    assert validate_uri("ibe/data/spherex/test.fits ") is False  # whitespace


def test_masking_policy_never_masks_source() -> None:
    """Pixel masking must never mask SOURCE (bit 21), even in strict mode."""
    image = np.ones((10, 10), dtype=np.float32) * 5.0
    flags = np.zeros((10, 10), dtype=np.int32)

    # Pixel (2, 2) has SOURCE bit set (1 << 21)
    flags[2, 2] = 1 << 21

    # Pixel (3, 3) has HOT pixel bit set (1 << 10)
    flags[3, 3] = 1 << 10

    # Minimal masking
    cleaned_min, frac_min = mask_flags(image, flags, mask_level="minimal")
    assert not np.isnan(cleaned_min[2, 2])  # SOURCE not masked!
    assert np.isnan(cleaned_min[3, 3])  # HOT is masked

    # Strict masking
    cleaned_strict, frac_strict = mask_flags(image, flags, mask_level="strict")
    assert not np.isnan(cleaned_strict[2, 2])  # SOURCE still not masked!
    assert np.isnan(cleaned_strict[3, 3])


def test_wcs_orientation_north_up_east_left() -> None:
    """Unit test with synthetic WCS verifying Row 0 of PNG is North and East is left."""
    target_ra = 180.0
    target_dec = 0.0
    grid_wcs, w, h, pixscale, upsample = build_target_grid(
        ra=target_ra,
        dec=target_dec,
        fov_arcmin=6.0,
        native_pixscale_arcsec=6.2,
        upsample=2,
    )

    # CDELT signs: CDELT1 < 0 (East left), CDELT2 > 0 (North up)
    assert grid_wcs.wcs.cdelt[0] < 0
    assert grid_wcs.wcs.cdelt[1] > 0

    # Check center coordinate lands at central pixel
    center_px, center_py = grid_wcs.all_world2pix(target_ra, target_dec, 0)
    assert np.isclose(center_px, w / 2.0, atol=1.0)
    assert np.isclose(center_py, h / 2.0, atol=1.0)

    # Point North of target (same RA, higher Dec)
    north_ra = target_ra
    north_dec = target_dec + 0.02
    nx, ny = grid_wcs.all_world2pix(north_ra, north_dec, 0)
    # In FITS WCS, North has higher Y
    assert ny > center_py

    # Point East of target (higher RA, same Dec)
    east_ra = target_ra + 0.02
    east_dec = target_dec
    ex, ey = grid_wcs.all_world2pix(east_ra, east_dec, 0)
    # In East-left WCS, higher RA (East) has smaller X
    assert ex < center_px

    # In PNG rendering (np.flipud), row index 0 is top (North)
    # Let's verify that a peak at ny (North) becomes a small row index in PNG
    data = np.zeros((h, w), dtype=np.uint8)
    data[int(ny), int(nx)] = 255  # North peak in FITS
    valid = np.ones((h, w), dtype=bool)

    png_bytes = render_to_png_bytes(data, valid)
    assert len(png_bytes) > 0

    # Read back and inspect orientation
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(png_bytes)).convert("LA")
    arr = np.array(img)
    # Channel 0 is grayscale
    gray = arr[:, :, 0]
    peak_row, peak_col = np.unravel_index(np.argmax(gray), gray.shape)
    # The North peak should appear in the upper half of the PNG (peak_row < h / 2)
    assert peak_row < (h / 2.0)


def test_background_subtraction() -> None:
    """Test background subtraction modes: none, median, zodi."""
    data = np.full((10, 10), 10.0, dtype=np.float32)
    zodi = np.full((10, 10), 4.0, dtype=np.float32)

    assert np.allclose(subtract_background(data, background="none"), 10.0)
    assert np.allclose(subtract_background(data, background="median"), 0.0)
    assert np.allclose(subtract_background(data, zodi=zodi, background="zodi"), 0.0)


def test_job_deduplication() -> None:
    """Two requests with the same parameters must reuse the job in memory."""
    req = SequenceRequest(ra=133.795125, dec=-7.245147, fov_arcmin=8.0, detector=5)
    key = req.compute_key()

    status1, is_new1 = job_registry.submit_sequence(req, "127.0.0.1")
    assert status1.key == key

    # Submit second time: should return existing job without creating a new worker
    status2, is_new2 = job_registry.submit_sequence(req, "127.0.0.1")
    assert status2.key == key
    assert is_new2 is False


def test_path_traversal_on_sequence_key() -> None:
    """Sequence key must match regex ^[0-9a-f]{32}$ or return 404."""
    # Invalid keys containing path traversal
    for bad_key in ("../", "..%2f", "0123456789abcdef", "xyz", "0" * 31, "0" * 33):
        res = client.get(f"/api/v1/sequences/{bad_key}")
        assert res.status_code == 404


@pytest.mark.network
def test_wise0855_live_tap_coverage() -> None:
    """Live network test: Query IRSA TAP for WISE 0855 and verify >= 10 frames found."""
    from backend.app.irsa import query_images
    images = query_images(ra=133.795125, dec=-7.245147, detector=5, fov_arcmin=8.0)
    assert len(images) >= 10
    assert all(img.uri.startswith("ibe/data/spherex/") for img in images)
    assert all(img.uri.endswith(".fits") for img in images)
