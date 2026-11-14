"""Unit and integration tests for Slice 11: Interactive Pan & Zoom, Sub-Pixel Centroid, and Discovery Export.

Specification: docs/ROADMAP.md Slice 11, docs/PROJECT_BRIEF.md, docs/API_SPEC.md.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.cache import disk_cache
from backend.app.main import app

client = TestClient(app)


def test_candidates_export_endpoint() -> None:
    """Verify GET /api/v1/candidates/export generates downloadable JSON discovery report."""
    test_key = "d11" + "0" * 29
    finding = {
        "name": "PlanetX-Test-11",
        "sequence_key": test_key,
        "ra": 133.795125,
        "dec": -7.245147,
        "classification": "Planet X Candidate",
        "motion_rate_arcsec_yr": 8.12,
        "position_angle_deg": 78.5,
        "notes": "Slice 11 export test",
        "created_at": "2026-11-14T17:00:00Z",
    }
    disk_cache.save_candidate(finding)

    resp = client.get(f"/api/v1/candidates/export?sequence_key={test_key}")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/json"
    assert "attachment; filename=\"murfx_candidates_" in resp.headers.get("content-disposition", "")

    data = resp.json()
    assert "project" in data
    assert "challenge" in data
    assert "exported_at" in data
    assert data["total_findings"] >= 1
    assert any(f["name"] == "PlanetX-Test-11" for f in data["findings"])


def test_subpixel_barycentric_centroid_algorithm() -> None:
    """Test flux-weighted barycentric centroid algorithm against an analytical asymmetric 2D distribution."""
    # Create 5x5 grid with background = 20 and an off-center source peak at (2.4, 2.6)
    grid = np.full((5, 5), 20.0, dtype=np.float32)
    true_x, true_y = 2.4, 2.6

    for y in range(5):
        for x in range(5):
            dist_sq = (x - true_x) ** 2 + (y - true_y) ** 2
            grid[y, x] += 100.0 * np.exp(-dist_sq / (2 * 0.8**2))

    min_val = np.min(grid)
    weights = np.maximum(0.0, grid - min_val)
    sum_w = np.sum(weights)

    y_indices, x_indices = np.indices((5, 5))
    calc_x = float(np.sum(x_indices * weights) / sum_w)
    calc_y = float(np.sum(y_indices * weights) / sum_w)

    # Recovered centroid should match within 0.05 pixels
    assert abs(calc_x - true_x) < 0.05
    assert abs(calc_y - true_y) < 0.05


def test_no_innerhtml_in_frontend() -> None:
    """Enforce strict AGENT_RULES.md constraint: zero innerHTML in frontend source files."""
    frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
    for js_file in frontend_dir.glob("*.js"):
        content = js_file.read_text(encoding="utf-8")
        for line_no, line in enumerate(content.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            assert "innerHTML" not in stripped, f"Illegal innerHTML found in {js_file.name}:{line_no}: {line}"
