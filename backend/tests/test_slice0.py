"""Slice 0 test suite: API skeleton, security headers, metadata, static mount.

Specification: docs/ROADMAP.md Slice 0.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    """GET /api/v1/health returns 200 with expected schema and no-store header."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"

    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == settings.app_version
    assert data["pipeline_version"] == settings.pipeline_version
    assert isinstance(data["uptime_s"], (int, float))
    assert data["uptime_s"] >= 0


def test_security_headers_present() -> None:
    """Security headers from SECURITY.md section 6 must be present on every response."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200

    headers = response.headers
    # X-Request-ID
    assert "x-request-id" in headers
    assert len(headers["x-request-id"]) > 0

    # Content-Security-Policy
    csp = headers.get("content-security-policy", "")
    assert "default-src 'self'" in csp
    assert "frame-ancestors *" in csp

    # nosniff
    assert headers.get("x-content-type-options") == "nosniff"

    # Referrer-Policy
    assert headers.get("referrer-policy") == "no-referrer"

    # Permissions-Policy
    assert "camera=()" in headers.get("permissions-policy", "")

    # Embedding requirement: X-Frame-Options must NOT be set
    assert "x-frame-options" not in headers


def test_meta_endpoint() -> None:
    """GET /api/v1/meta returns pipeline_version, 6 detectors, limits, attribution."""
    response = client.get("/api/v1/meta")
    assert response.status_code == 200
    assert "max-age=60" in response.headers["cache-control"]

    data = response.json()
    assert data["pipeline_version"] == settings.pipeline_version
    assert len(data["detectors"]) == 6
    assert data["detectors"][0]["name"] == "SPHEREx-D1"
    assert data["detectors"][5]["name"] == "SPHEREx-D6"

    limits = data["limits"]
    assert limits["fov_arcmin"] == [settings.min_fov_arcmin, settings.max_fov_arcmin]
    assert limits["max_frames"] == settings.max_frames_hard
    assert "NASA SPHEREx" in data["attribution"]


def test_static_frontend_mount() -> None:
    """GET / serves the placeholder HTML page."""
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "SPHEREx Wise-Cube & Blink Explorer" in response.text


def test_error_envelope_on_not_found() -> None:
    """404 responses conform to the standard error envelope."""
    response = client.get("/api/v1/nonexistent_endpoint")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "message" in data["error"]
    assert "request_id" in data["error"]


@pytest.mark.network
def test_deep_health_reaches_irsa() -> None:
    """Live network check: ?deep=1 pings IRSA TAP and returns irsa: ok."""
    response = client.get("/api/v1/health?deep=1")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data.get("irsa") == "ok"
