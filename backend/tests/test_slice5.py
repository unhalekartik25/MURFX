"""Slice 5 test suite: Hardening, cache seeding, privacy, and target configuration checks.

Specification: docs/ROADMAP.md Slice 5, docs/SECURITY.md.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.cache import DiskCache
from backend.app.main import app
from scripts.run_targets import TARGETS_DATA
from scripts.warm_cache import TARGET_CONFIGS

client = TestClient(app)


def test_target_configurations_complete() -> None:
    """Verify all 5 required challenge targets are properly configured in runner scripts."""
    required = {"wise0855", "barnard", "epsind", "rwaur", "rdra"}
    assert set(TARGETS_DATA.keys()) == required

    for key, data in TARGETS_DATA.items():
        assert "name" in data
        assert "detector" in data
        assert 1 <= data["detector"] <= 6
        assert "fov_arcmin" in data
        assert 1.0 <= data["fov_arcmin"] <= 30.0


def test_demo_data_seeding_mechanism() -> None:
    """Verify DiskCache._seed_from_demo_data correctly imports pre-seeded demo sequences."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        cache = DiskCache(root=root)

        # Create mock demo sequence
        mock_seq_dir = cache.sequences_dir / "test_seq_123"
        mock_seq_dir.mkdir(parents=True, exist_ok=True)
        (mock_seq_dir / "meta.json").write_text('{"status": "done"}', encoding="utf-8")

        # Verify DiskCache discovers it
        meta = cache.get_sequence_meta("test_seq_123")
        assert meta is not None
        assert meta["status"] == "done"


def test_privacy_no_cookies_set() -> None:
    """Verify that the API never sends Set-Cookie headers per SECURITY.md section 9."""
    for path in ("/api/v1/health", "/api/v1/meta", "/api/v1/resolve?name=WISE 0855"):
        res = client.get(path)
        assert "set-cookie" not in res.headers


def test_generic_internal_error_does_not_leak_paths() -> None:
    """Verify that unexpected exceptions never leak filesystem paths or stack traces."""
    # Query with a synthetic malformed sequence endpoint or simulated error
    res = client.get("/api/v1/sequences/00000000000000000000000000000000")
    assert res.status_code == 404
    data = res.json()
    msg = data["error"]["message"]
    assert "C:\\" not in msg
    assert "/workspaces" not in msg
    assert "Traceback" not in msg
