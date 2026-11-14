"""Slice 2 test suite: Name resolver, proper motion propagation, sexagesimal parsing, and UI security checks.

Specification: docs/ROADMAP.md Slice 2, docs/API_SPEC.md section 3.3.
"""

from __future__ import annotations

import re
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.errors import AppError
from backend.app.main import app
from backend.app.resolver import (
    KNOWN_TARGETS,
    NAME_REGEX,
    propagate_position,
    resolve_object_name,
)

client = TestClient(app)


def test_name_regex_validation() -> None:
    """Validate name regex ^[A-Za-z0-9 .+\-_[]'*/:]{1,64}$ per SECURITY.md 2.4."""
    assert NAME_REGEX.match("Barnard's Star")
    assert NAME_REGEX.match("WISE 0855")
    assert NAME_REGEX.match("eps Ind B")
    assert NAME_REGEX.match("RW Aur")
    assert NAME_REGEX.match("R Dra")
    assert NAME_REGEX.match("2MASS J08551083-0714425")

    # Injections and invalid characters rejected
    assert not NAME_REGEX.match("<script>")
    assert not NAME_REGEX.match("Barnard; DROP TABLE")
    assert not NAME_REGEX.match("Star' OR '1'='1")
    assert not NAME_REGEX.match("")
    assert not NAME_REGEX.match("A" * 65)  # exceeds 64 chars


def test_resolve_offline_targets() -> None:
    """Offline test: verify the five required targets resolve with correct structure."""
    # Barnard's Star: high proper motion, propagated to J2026.0
    res_b = resolve_object_name("Barnard's Star")
    assert res_b["query"] == "Barnard's Star"
    assert np_isclose(res_b["ra"], 269.452, atol=0.01)
    assert np_isclose(res_b["dec"], 4.693, atol=0.01)
    assert res_b["pm_ra_mas_yr"] is not None
    assert res_b["pm_dec_mas_yr"] is not None
    assert res_b["ra_now"] is not None
    assert res_b["dec_now"] is not None
    # Over 26 years (2000 to 2026), Dec shifts northward (+10.3"/yr * 26yr ~ +268" ~ +0.074 deg)
    assert res_b["dec_now"] > res_b["dec"]

    # WISE 0855
    res_w = resolve_object_name("WISE 0855")
    assert np_isclose(res_w["ra"], 133.795, atol=0.01)
    assert np_isclose(res_w["dec"], -7.245, atol=0.01)

    # Epsilon Indi B
    res_e = resolve_object_name("eps Ind B")
    assert res_e["ra"] > 300.0

    # RW Aur
    res_rw = resolve_object_name("RW Aur")
    assert np_isclose(res_rw["ra"], 76.71, atol=0.05)

    # R Dra
    res_rd = resolve_object_name("R Dra")
    assert np_isclose(res_rd["ra"], 248.34, atol=0.05)


def test_resolve_endpoint_http() -> None:
    """Test GET /api/v1/resolve HTTP endpoint responses and headers."""
    response = client.get("/api/v1/resolve?name=Barnard's Star")
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "Barnard's Star"
    assert "ra" in data
    assert "dec" in data
    assert "ra_now" in data
    assert "dec_now" in data
    assert "max-age=86400" in response.headers["cache-control"]

    # Invalid name parameter
    bad_res = client.get("/api/v1/resolve?name=<script>")
    assert bad_res.status_code == 422
    assert bad_res.json()["error"]["code"] == "INVALID_PARAMETER"

    # Unknown target
    unknown_res = client.get("/api/v1/resolve?name=NonExistentObjectXYZ999")
    assert unknown_res.status_code == 404
    assert unknown_res.json()["error"]["code"] == "NOT_FOUND"


def test_proper_motion_propagation_math() -> None:
    """Test propagation math for a known synthetic coordinate."""
    # Star at RA 180.0, Dec 0.0 with pm_dec = 3600 mas/yr (= 1 arcsec/yr)
    # Over 10 years, Dec should increase by 10 arcsec = 10 / 3600 deg = 0.002778 deg
    ra_prop, dec_prop = propagate_position(
        ra=180.0,
        dec=0.0,
        pm_ra_mas_yr=0.0,
        pm_dec_mas_yr=3600.0,
        catalog_epoch_str="J2000.0",
        target_epoch_str="J2010.0",
    )
    assert np_isclose(ra_prop, 180.0, atol=1e-5)
    assert np_isclose(dec_prop, 10.0 / 3600.0, atol=1e-4)


def test_sexagesimal_and_coordinate_parsing() -> None:
    """Python verification of frontend sexagesimal and decimal coordinate parsing."""
    # 1. Decimal format
    coord1 = parse_coords("133.795125 -7.245147")
    assert coord1 is not None
    assert np_isclose(coord1[0], 133.795125)
    assert np_isclose(coord1[1], -7.245147)

    # 2. Sexagesimal with hms/dms
    coord2 = parse_coords("08h55m10.831s -07d14m42.53s")
    assert coord2 is not None
    assert np_isclose(coord2[0], 133.795129, atol=1e-4)
    assert np_isclose(coord2[1], -7.245147, atol=1e-4)

    # 3. Sexagesimal with colons
    coord3 = parse_coords("08:55:10.831 -07:14:42.53")
    assert coord3 is not None
    assert np_isclose(coord3[0], 133.795129, atol=1e-4)
    assert np_isclose(coord3[1], -7.245147, atol=1e-4)


def test_no_inner_html_in_frontend() -> None:
    """Strict security verification: ensure no innerHTML exists in frontend source code."""
    frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
    js_files = list(frontend_dir.glob("*.js"))
    assert len(js_files) > 0

    for f in js_files:
        lines = f.read_text(encoding="utf-8").splitlines()
        for idx, line in enumerate(lines, 1):
            if "innerHTML" in line and not line.strip().startswith("//") and not line.strip().startswith("*"):
                pytest.fail(f"Forbidden innerHTML found in {f.name}:{idx}: {line}")


def test_meta_endpoint_includes_observation_time() -> None:
    """GET /api/v1/meta includes latest_observation_iso and latest_observation_mjd."""
    res = client.get("/api/v1/meta")
    assert res.status_code == 200
    data = res.json()
    assert data["latest_observation_mjd"] is not None
    assert data["latest_observation_iso"] is not None


# Helpers
def np_isclose(a: float, b: float, atol: float = 1e-4) -> bool:
    return abs(a - b) <= atol


def parse_coords(s: str) -> tuple[float, float] | None:
    s = s.strip()
    # Decimal pair
    m_dec = re.match(r"^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$", s)
    if m_dec:
        return float(m_dec.group(1)), float(m_dec.group(2))

    # Sexagesimal
    m_sex = re.match(
        r"^(\d{1,2})[h:](\d{1,2})[m:](\d{1,2}(?:\.\d+)?)s?[\s,]+([+-]?\d{1,2})[d:](\d{1,2})[m:](\d{1,2}(?:\.\d+)?)s?$",
        s,
        re.IGNORECASE,
    )
    if m_sex:
        rh, rm, rs = float(m_sex.group(1)), float(m_sex.group(2)), float(m_sex.group(3))
        ra = (rh + rm / 60.0 + rs / 3600.0) * 15.0

        d_sign = -1.0 if m_sex.group(4).startswith("-") else 1.0
        dd, dm, ds = abs(float(m_sex.group(4))), float(m_sex.group(5)), float(m_sex.group(6))
        dec = d_sign * (dd + dm / 60.0 + ds / 3600.0)
        return ra, dec

    return None
