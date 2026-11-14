"""Application configuration and security limits.

All limits and constants are defined here and can be overridden via environment variables.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


DETECTOR_MAP: dict[int, str] = {
    1: "SPHEREx-D1",
    2: "SPHEREx-D2",
    3: "SPHEREx-D3",
    4: "SPHEREx-D4",
    5: "SPHEREx-D5",
    6: "SPHEREx-D6",
}

DETECTOR_METADATA: list[dict] = [
    {"id": 1, "name": "SPHEREx-D1", "wavelength_um": [0.75, 1.09]},
    {"id": 2, "name": "SPHEREx-D2", "wavelength_um": [1.10, 1.62]},
    {"id": 3, "name": "SPHEREx-D3", "wavelength_um": [1.63, 2.41]},
    {"id": 4, "name": "SPHEREx-D4", "wavelength_um": [2.42, 3.82]},
    {"id": 5, "name": "SPHEREx-D5", "wavelength_um": [3.83, 4.41]},
    {"id": 6, "name": "SPHEREx-D6", "wavelength_um": [4.42, 5.00]},
]


@dataclass(frozen=True)
class Settings:
    """Application settings with defaults from docs/SECURITY.md limits table."""

    app_version: str = "0.1.0"
    pipeline_version: str = "1"

    # Field of view limits (arcminutes)
    min_fov_arcmin: float = float(os.getenv("MIN_FOV_ARCMIN", "1.0"))
    max_fov_arcmin: float = float(os.getenv("MAX_FOV_ARCMIN", "30.0"))
    default_fov_arcmin: float = float(os.getenv("DEFAULT_FOV_ARCMIN", "6.0"))

    # Frame limits
    max_frames_hard: int = int(os.getenv("MAX_FRAMES_HARD", "150"))
    default_max_frames: int = int(os.getenv("DEFAULT_MAX_FRAMES", "60"))

    # Grid and image limits
    max_grid_px: int = int(os.getenv("MAX_GRID_PX", "512"))
    max_upsample: int = int(os.getenv("MAX_UPSAMPLE", "4"))
    cutout_max_bytes: int = int(os.getenv("CUTOUT_MAX_BYTES", "30000000"))
    cutout_max_pixels: int = int(os.getenv("CUTOUT_MAX_PIXELS", "4000000"))

    # Timeouts (seconds)
    tap_timeout_s: float = float(os.getenv("TAP_TIMEOUT_S", "90.0"))
    cutout_timeout_s: float = float(os.getenv("CUTOUT_TIMEOUT_S", "90.0"))
    job_timeout_s: float = float(os.getenv("JOB_TIMEOUT_S", "600.0"))

    # Concurrency and retries
    download_retries: int = int(os.getenv("DOWNLOAD_RETRIES", "3"))
    download_concurrency: int = int(os.getenv("DOWNLOAD_CONCURRENCY", "8"))
    job_workers: int = int(os.getenv("JOB_WORKERS", "2"))
    max_queued_jobs: int = int(os.getenv("MAX_QUEUED_JOBS", "10"))
    max_active_jobs_per_ip: int = int(os.getenv("MAX_ACTIVE_JOBS_PER_IP", "2"))

    # Rate limits (requests per minute per client IP)
    rate_general_per_min: int = int(os.getenv("RATE_GENERAL_PER_MIN", "60"))
    rate_create_per_min: int = int(os.getenv("RATE_CREATE_PER_MIN", "6"))
    rate_resolve_per_min: int = int(os.getenv("RATE_RESOLVE_PER_MIN", "20"))
    rate_frames_per_min: int = int(os.getenv("RATE_FRAMES_PER_MIN", "600"))

    # Cache TTLs (seconds) and disk cap
    tap_cache_ttl_s: int = int(os.getenv("TAP_CACHE_TTL_S", "21600"))
    seq_cache_ttl_s: int = int(os.getenv("SEQ_CACHE_TTL_S", "86400"))
    job_ttl_s: int = int(os.getenv("JOB_TTL_S", "3600"))
    cache_max_bytes: int = int(os.getenv("CACHE_MAX_BYTES", "1000000000"))
    max_request_body_bytes: int = int(os.getenv("MAX_REQUEST_BODY_BYTES", "4096"))

    # Target epoch for proper-motion propagation
    target_epoch: str = os.getenv("TARGET_EPOCH", "J2026.0")

    # Network allowlists and identity
    allowed_fetch_hosts: frozenset[str] = field(
        default_factory=lambda: frozenset({"irsa.ipac.caltech.edu"})
    )
    contact_email: str = os.getenv("CONTACT_EMAIL", "team@example.com")

    # Paths
    cache_dir: Path = field(
        default_factory=lambda: Path(os.getenv("CACHE_DIR", "./cache"))
    )
    frontend_dir: Path = field(
        default_factory=lambda: Path(os.getenv("FRONTEND_DIR", "frontend"))
    )

    # Flags
    trust_proxy: bool = os.getenv("TRUST_PROXY", "0") in ("1", "true", "True")
    enable_hsts: bool = os.getenv("ENABLE_HSTS", "0") in ("1", "true", "True")
    enable_docs: bool = os.getenv("ENABLE_DOCS", "1") in ("1", "true", "True")

    # Attribution
    attribution: str = (
        "NASA SPHEREx / IPAC / IRSA / Caltech. "
        "NASA Space Apps Challenge 2026 ('Planet X and SPHEREx')."
    )

    @property
    def user_agent(self) -> str:
        return (
            f"spherex-blink-viewer/{self.app_version} "
            f"(NASA Space Apps 2026; contact: {self.contact_email})"
        )


settings = Settings()
