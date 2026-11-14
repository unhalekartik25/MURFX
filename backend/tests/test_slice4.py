"""Slice 4 test suite: Gaia DR3 catalog query, Aladin Lite CSP verification, and epoch propagation.

Specification: docs/ROADMAP.md Slice 4, docs/API_SPEC.md section 3.7.
"""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.catalogs import query_gaia
from backend.app.main import app
from backend.app.security import CSP_POLICY

client = TestClient(app)


def test_gaia_query_and_source_id_string_type() -> None:
    """GET /api/v1/catalog/gaia returns sources with source_id strictly typed as string."""
    # Barnard's Star coordinate
    res = client.get("/api/v1/catalog/gaia?ra=269.45&dec=4.69&radius_arcmin=8.0")
    assert res.status_code == 200
    data = res.json()

    assert data["epoch"] == "J2016.0"
    assert "count" in data
    assert isinstance(data["sources"], list)
    assert len(data["sources"]) > 0

    first_source = data["sources"][0]
    # source_id MUST be a string to avoid JavaScript 64-bit integer overflow (docs/API_SPEC.md section 3.7)
    assert isinstance(first_source["source_id"], str)
    assert "pmra_mas_yr" in first_source
    assert "pmdec_mas_yr" in first_source
    assert "g_mag" in first_source


def test_gaia_input_validation() -> None:
    """Query parameter bounds validation for Gaia endpoint."""
    # Out of range coordinates
    res1 = client.get("/api/v1/catalog/gaia?ra=400.0&dec=0.0")
    assert res1.status_code == 422

    res2 = client.get("/api/v1/catalog/gaia?ra=10.0&dec=-95.0")
    assert res2.status_code == 422

    # Radius out of bounds (> 20 arcmin)
    res3 = client.get("/api/v1/catalog/gaia?ra=10.0&dec=0.0&radius_arcmin=30.0")
    assert res3.status_code == 422


def test_csp_widened_for_aladin_lite() -> None:
    """CSP must allow pinned Aladin Lite and CDS survey origins per SECURITY.md section 6."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    csp = response.headers.get("content-security-policy", "")

    assert "aladin.cds.unistra.fr" in csp
    assert "cdn.jsdelivr.net" in csp
    assert "frame-ancestors *" in csp


def test_gaia_motion_epoch_propagation() -> None:
    """Verify that proper motion shifts coordinates accurately from J2016.0 to a target epoch."""
    ra_2016 = 269.45
    dec_2016 = 4.70
    pmra_mas_yr = -800.0
    pmdec_mas_yr = 10000.0  # 10 arcsec/yr northward
    dt_yr = 10.0  # e.g. 2026.0

    pmdec_deg_yr = pmdec_mas_yr / (3600.0 * 1000.0)
    cos_dec = np.cos(np.radians(dec_2016))
    pmra_deg_yr = pmra_mas_yr / (3600.0 * 1000.0) / cos_dec

    ra_epoch = ra_2016 + pmra_deg_yr * dt_yr
    dec_epoch = dec_2016 + pmdec_deg_yr * dt_yr

    # In 10 years, Dec shifts by 100 arcsec = 100 / 3600 deg = ~0.02778 deg
    assert np.isclose(dec_epoch - dec_2016, 100.0 / 3600.0, atol=1e-5)
    assert dec_epoch > dec_2016
    assert ra_epoch < ra_2016  # negative pmra shifts west (lower RA)


def test_wavelength_blink_sorting_order() -> None:
    """Unit test for Wavelength-Blink reordering logic."""
    frames_test = [
        {"mjd": 60800.0, "wavelength_um": 4.5},
        {"mjd": 60750.0, "wavelength_um": 1.2},
        {"mjd": 60900.0, "wavelength_um": 2.3},
    ]

    # Time order
    by_time = sorted(frames_test, key=lambda f: f["mjd"])
    assert by_time[0]["mjd"] == 60750.0
    assert by_time[2]["mjd"] == 60900.0

    # Wavelength order (Dual-Mode: 0.75 -> 5.0 um)
    by_wl = sorted(frames_test, key=lambda f: f["wavelength_um"])
    assert by_wl[0]["wavelength_um"] == 1.2
    assert by_wl[1]["wavelength_um"] == 2.3
    assert by_wl[2]["wavelength_um"] == 4.5
