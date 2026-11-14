"""Unit and integration tests for Slice 10: Citizen Science Candidate Logger, Motion Ruler, and Guided Tour.

Specification: docs/ROADMAP.md Slice 10, docs/PROJECT_BRIEF.md, docs/API_SPEC.md.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.cache import disk_cache
from backend.app.config import settings
from backend.app.main import app
from backend.app.schemas import CandidateFinding

client = TestClient(app)


def test_candidate_finding_schema_validation() -> None:
    """Validate CandidateFinding model rules and defaults."""
    # Valid finding
    finding = CandidateFinding(
        name="Planet-X-01",
        sequence_key="a" * 32,
        ra=133.795,
        dec=-7.245,
        classification="Planet X Candidate",
        motion_rate_arcsec_yr=8.12,
        position_angle_deg=78.5,
        notes="High proper motion source in D5/D6",
    )
    assert finding.name == "Planet-X-01"
    assert finding.classification == "Planet X Candidate"
    assert finding.motion_rate_arcsec_yr == 8.12
    assert finding.position_angle_deg == 78.5

    # Out of range coordinates should fail validation
    with pytest.raises(Exception):
        CandidateFinding(
            name="BadCoord",
            sequence_key="a" * 32,
            ra=365.0,  # invalid RA
            dec=-7.245,
        )

    with pytest.raises(Exception):
        CandidateFinding(
            name="BadDec",
            sequence_key="a" * 32,
            ra=133.795,
            dec=-95.0,  # invalid Dec
        )


def test_candidate_cache_persistence_and_filtering(tmp_path: Path) -> None:
    """Test saving and retrieving candidates via DiskCache."""
    candidates_file = disk_cache.root / "candidates.json"
    original_data = candidates_file.read_bytes() if candidates_file.exists() else None

    try:
        if candidates_file.exists():
            candidates_file.unlink()

        # Initially empty
        assert disk_cache.get_candidates() == []

        cand1 = {
            "name": "Candidate A",
            "sequence_key": "1111" * 8,
            "ra": 100.0,
            "dec": 10.0,
            "classification": "Brown Dwarf",
            "motion_rate_arcsec_yr": 4.5,
            "position_angle_deg": 120.0,
            "notes": "Test A",
            "created_at": "2026-05-01T12:00:00Z",
        }
        cand2 = {
            "name": "Candidate B",
            "sequence_key": "2222" * 8,
            "ra": 200.0,
            "dec": -20.0,
            "classification": "Near-Earth Asteroid",
            "motion_rate_arcsec_yr": 15.2,
            "position_angle_deg": 45.0,
            "notes": "Test B",
            "created_at": "2026-05-01T13:00:00Z",
        }

        disk_cache.save_candidate(cand1)
        disk_cache.save_candidate(cand2)

        # Retrieve all
        all_cands = disk_cache.get_candidates()
        assert len(all_cands) == 2

        # Retrieve filtered by sequence_key
        filtered_1 = disk_cache.get_candidates(sequence_key="1111" * 8)
        assert len(filtered_1) == 1
        assert filtered_1[0]["name"] == "Candidate A"

        filtered_none = disk_cache.get_candidates(sequence_key="3333" * 8)
        assert filtered_none == []

    finally:
        if original_data is not None:
            candidates_file.write_bytes(original_data)
        elif candidates_file.exists():
            candidates_file.unlink()


def test_candidates_api_endpoints() -> None:
    """Test POST /api/v1/candidates and GET /api/v1/candidates."""
    test_key = "abc123" + "0" * 26
    payload = {
        "name": "Citizen-Finder-99",
        "sequence_key": test_key,
        "ra": 269.452,
        "dec": 4.693,
        "classification": "Planet X Candidate",
        "motion_rate_arcsec_yr": 10.3,
        "position_angle_deg": 355.8,
        "notes": "Fastest motion star test",
    }

    # POST candidate
    post_resp = client.post("/api/v1/candidates", json=payload)
    assert post_resp.status_code == 201
    saved_data = post_resp.json()
    assert saved_data["name"] == "Citizen-Finder-99"
    assert saved_data["sequence_key"] == test_key
    assert "created_at" in saved_data
    assert saved_data["created_at"] is not None

    # GET candidate filtered by sequence_key
    get_resp = client.get(f"/api/v1/candidates?sequence_key={test_key}")
    assert get_resp.status_code == 200
    findings = get_resp.json()
    assert isinstance(findings, list)
    assert any(f["name"] == "Citizen-Finder-99" for f in findings)


def test_motion_ruler_mathematics() -> None:
    """Verify angular separation, position angle, and motion rate formulas."""
    # Point 1: (0, 0), Point 2: (0, 10/3600 deg = 10 arcsec North)
    ra1, dec1 = 0.0, 0.0
    ra2, dec2 = 0.0, 10.0 / 3600.0  # +10 arcsec Dec

    cos_dec = math.cos(math.radians(dec1))
    d_ra_arcsec = (ra2 - ra1) * cos_dec * 3600.0
    d_dec_arcsec = (dec2 - dec1) * 3600.0
    sep_arcsec = math.sqrt(d_ra_arcsec**2 + d_dec_arcsec**2)
    assert abs(sep_arcsec - 10.0) < 1e-4

    # Position angle: Due North should be 0 degrees
    pa_deg = (math.degrees(math.atan2(d_ra_arcsec, d_dec_arcsec)) + 360.0) % 360.0
    assert abs(pa_deg - 0.0) < 1e-4

    # Point Due East: ra2 = 10/3600 deg, dec2 = 0
    ra3, dec3 = 10.0 / 3600.0, 0.0
    d_ra_east = (ra3 - ra1) * cos_dec * 3600.0
    d_dec_east = (dec3 - dec1) * 3600.0
    pa_east = (math.degrees(math.atan2(d_ra_east, d_dec_east)) + 360.0) % 360.0
    assert abs(pa_east - 90.0) < 1e-4

    # Motion rate: 10 arcsec over 182.625 days (0.5 years) -> 20 arcsec/yr
    delta_days = 182.625
    delta_years = delta_days / 365.25
    motion_rate = sep_arcsec / delta_years
    assert abs(motion_rate - 20.0) < 1e-4


def test_no_innerhtml_in_frontend() -> None:
    """Enforce strict AGENT_RULES.md constraint: zero innerHTML in frontend source files."""
    frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
    for js_file in frontend_dir.glob("*.js"):
        content = js_file.read_text(encoding="utf-8")
        # Match .innerHTML = or element.innerHTML without comment
        for line_no, line in enumerate(content.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            assert "innerHTML" not in stripped, f"Illegal innerHTML found in {js_file.name}:{line_no}: {line}"
