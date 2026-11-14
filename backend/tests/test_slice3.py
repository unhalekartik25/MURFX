"""Slice 3 test suite: Time bin stacking, SNR improvement verification, center flux sparkline, and mask overlays.

Specification: docs/ROADMAP.md Slice 3.
"""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.cache import disk_cache
from backend.app.main import app
from backend.app.processing import (
    ProcessedFrame,
    compute_center_value,
    stack_time_bins,
)
from backend.app.render import render_flags_png

client = TestClient(app)


def test_snr_improvement_with_stacking() -> None:
    """Acceptance Test: Stacking synthetic frames with known noise improves S/N by approximately sqrt(N).

    Tolerance: Within 25% of theoretical sqrt(N) due to finite pixel sample variance.
    """
    np.random.seed(42)
    n_frames = 16
    h, w = 64, 64
    signal = 10.0
    true_sigma = 2.0
    true_variance = true_sigma**2

    frames: list[ProcessedFrame] = []
    base_mjd = 60800.0

    for i in range(n_frames):
        # Generate independent Gaussian noise
        noise = np.random.normal(loc=0.0, scale=true_sigma, size=(h, w)).astype(np.float32)
        frame_data = (signal + noise).astype(np.float32)
        var_data = np.full((h, w), true_variance, dtype=np.float32)

        frames.append(
            ProcessedFrame(
                data=frame_data,
                variance=var_data,
                mjd=base_mjd + i * 0.5,  # all within a 30-day bin
                wavelength_um=4.0,
                detector=5,
                n_exposures=1,
                obs_id=f"exp_{i}",
                obs_ids=None,
                version="v1",
                flag_fraction=0.0,
                center_value=compute_center_value(frame_data),
            )
        )

    # 1. Measure single-frame standard deviation and S/N
    single_stds = [float(np.std(f.data)) for f in frames]
    mean_single_std = float(np.mean(single_stds))
    single_snr = signal / mean_single_std

    # 2. Stack all frames into a single time bin (bin_days = 30)
    stacked = stack_time_bins(frames, bin_days=30.0)
    assert len(stacked) == 1
    stacked_frame = stacked[0]

    # 3. Measure stacked frame standard deviation and S/N
    stacked_std = float(np.std(stacked_frame.data))
    stacked_snr = signal / stacked_std

    # Theoretical expected noise reduction and SNR gain is sqrt(N) = sqrt(16) = 4.0
    expected_gain = np.sqrt(n_frames)
    actual_gain = stacked_snr / single_snr

    # Assert gain is within 25% of theoretical sqrt(N)
    assert np.isclose(actual_gain, expected_gain, rtol=0.25), (
        f"Expected SNR gain ~{expected_gain:.2f}, got {actual_gain:.2f}"
    )
    assert stacked_std < mean_single_std


def test_compute_center_value() -> None:
    """Verify central 3x3 pixel mean calculation."""
    h, w = 10, 10
    data = np.zeros((h, w), dtype=np.float32)
    cy, cx = h // 2, w // 2  # 5, 5
    # Central 3x3: rows 4, 5, 6 and cols 4, 5, 6
    data[4:7, 4:7] = 8.5

    center_val = compute_center_value(data)
    assert center_val is not None
    assert np.isclose(center_val, 8.5)


def test_flags_mask_overlay_rendering() -> None:
    """Verify render_flags_png produces a valid RGBA PNG."""
    mask = np.zeros((32, 32), dtype=bool)
    mask[5:10, 5:10] = True  # bad patch

    png_bytes = render_flags_png(mask)
    assert len(png_bytes) > 0

    from PIL import Image
    import io
    img = Image.open(io.BytesIO(png_bytes))
    assert img.mode == "RGBA"
    arr = np.array(img)
    # Flipped vertically in PNG: bad patch is near bottom in FITS (5..10), so near top in PNG
    assert np.any(arr[:, :, 3] > 0)  # non-zero alpha on bad pixels


def test_flags_png_endpoint() -> None:
    """Verify GET /api/v1/sequences/{key}/frames/{index}/flags.png endpoint."""
    test_key = "a" * 32
    mask = np.zeros((16, 16), dtype=bool)
    mask[2, 2] = True
    png_bytes = render_flags_png(mask)
    disk_cache.put_frame_flags_png(test_key, 0, png_bytes)

    res = client.get(f"/api/v1/sequences/{test_key}/frames/0/flags.png")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert "max-age=86400" in res.headers["cache-control"]
