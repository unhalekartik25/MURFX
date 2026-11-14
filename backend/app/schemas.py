"""Pydantic schemas and request/response models for the sequence pipeline.

Specification: docs/API_SPEC.md and docs/ARCHITECTURE.md.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.config import settings


class SequenceRequest(BaseModel):
    """Validated input parameters for creating or fetching a sequence."""

    model_config = ConfigDict(extra="forbid")

    ra: float = Field(..., ge=0.0, lt=360.0, description="Right Ascension in ICRS degrees [0, 360)")
    dec: float = Field(..., ge=-90.0, le=90.0, description="Declination in ICRS degrees [-90, 90]")
    fov_arcmin: float = Field(
        default=settings.default_fov_arcmin,
        ge=settings.min_fov_arcmin,
        le=settings.max_fov_arcmin,
        description="Field of view in arcminutes",
    )
    detector: int = Field(default=2, ge=1, le=6, description="SPHEREx detector array (1 to 6)")
    mode: Literal["frames", "stack"] = Field(default="frames", description="Sequence mode")
    bin_days: float = Field(default=30.0, ge=1.0, le=180.0, description="Time bin duration in days for stack mode")
    background: Literal["none", "median", "zodi"] = Field(
        default="median", description="Background subtraction strategy"
    )
    mask_level: Literal["minimal", "strict"] = Field(
        default="minimal", description="Flagged pixel masking level"
    )
    stretch: Literal["global", "frame"] = Field(
        default="global", description="Asinh stretch scaling mode"
    )
    upsample: int = Field(default=2, ge=1, le=settings.max_upsample, description="Grid upsampling factor")
    max_frames: int = Field(
        default=settings.default_max_frames,
        ge=2,
        le=settings.max_frames_hard,
        description="Maximum number of frames",
    )

    @field_validator("ra", "dec", "fov_arcmin", "bin_days")
    @classmethod
    def validate_finite(cls, v: float) -> float:
        import math
        if math.isnan(v) or math.isinf(v):
            raise ValueError("NaN and Infinity are not allowed")
        return v

    def normalized_dict(self) -> dict[str, Any]:
        """Produce a normalized dictionary with rounded coordinates for caching and hashing."""
        return {
            "ra": round(self.ra, 6),
            "dec": round(self.dec, 6),
            "fov_arcmin": round(self.fov_arcmin, 3),
            "detector": self.detector,
            "mode": self.mode,
            "bin_days": round(self.bin_days, 1),
            "background": self.background,
            "mask_level": self.mask_level,
            "stretch": self.stretch,
            "upsample": self.upsample,
            "max_frames": self.max_frames,
        }

    def compute_key(self) -> str:
        """Compute the canonical 32-hex-char sequence key per ARCHITECTURE.md section 4."""
        norm = self.normalized_dict()
        canonical_str = json.dumps(norm, sort_keys=True, separators=(",", ":"))
        payload = f"{canonical_str}:{settings.pipeline_version}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()[:32]


class FrameInfo(BaseModel):
    """Metadata for one output frame (single exposure or time-bin stack)."""

    index: int
    url: str
    mjd: float
    iso: str
    wavelength_um: float | None = None
    detector: int
    n_exposures: int = 1
    obs_id: str | None = None
    obs_ids: list[str] | None = None
    version: str | None = None
    flag_fraction: float = 0.0
    center_value: float | None = None


class GridInfo(BaseModel):
    """Spatial grid definition."""

    width: int
    height: int
    pixscale_arcsec: float
    native_pixscale_arcsec: float
    upsample: int
    orientation: str = "north-up, east-left, row 0 = north"
    wcs: dict[str, Any]


class StretchInfo(BaseModel):
    """Image stretch metadata."""

    mode: str
    function: str = "asinh"
    vmin: float
    vmax: float
    unit: str = "MJy/sr"


class SequenceResult(BaseModel):
    """Final sequence result payload stored in meta.json and returned when status=done."""

    n_frames: int
    n_available: int
    truncated: bool
    n_failed_downloads: int
    grid: GridInfo
    stretch: StretchInfo
    frames: list[FrameInfo]
    warnings: list[str] = Field(default_factory=list)


class SequenceStatus(BaseModel):
    """Status document returned by POST /sequences and GET /sequences/{key}."""

    key: str
    status: Literal["queued", "running", "done", "failed"]
    stage: Literal["query", "select", "download", "parse", "process", "render"] | None = None
    progress: dict[str, int] | None = None
    request: dict[str, Any]
    result: SequenceResult | None = None
    error: dict[str, str] | None = None
    created_at: str
    finished_at: str | None = None
