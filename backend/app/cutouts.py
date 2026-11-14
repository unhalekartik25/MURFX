"""Download and defensive parsing of SPHEREx multi-extension FITS cutouts.

Specification: docs/DATA_SOURCES.md section 3 & 4, docs/SECURITY.md section 3 & 5.
"""

from __future__ import annotations

import io
import logging
import random
import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse
import httpx
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from backend.app.cache import disk_cache
from backend.app.config import settings
from backend.app.irsa import ImageRef

logger = logging.getLogger("spherex.cutouts")

OBSID_REGEX = re.compile(r"^[A-Za-z0-9._\-]{1,64}$")


@dataclass
class Cutout:
    """Parsed multi-extension FITS cutout (docs/ARCHITECTURE.md section 4)."""

    ref: ImageRef
    image: np.ndarray  # float32 flux array in MJy/sr
    flags: np.ndarray  # int32 bitmask
    variance: np.ndarray  # float32 variance
    zodi: np.ndarray  # float32 modeled zodiacal light
    wcs: WCS  # spatial WCS
    detector: int
    obs_id: str | None
    version: str | None
    wavelength_um: float | None


def download_cutout(url: str, client: httpx.Client | None = None) -> bytes | None:
    """Download cutout FITS bytes with allowlist validation, streaming size cap, and retries."""
    # 1. Check disk cache
    cached = disk_cache.get_cutout(url)
    if cached is not None:
        return cached

    # 2. Host validation per docs/SECURITY.md section 3.3
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in settings.allowed_fetch_hosts:
        logger.error("Outbound host not allowlisted: %s", parsed.hostname)
        return None

    # 3. Retry loop with exponential backoff + jitter
    owns_client = False
    if client is None:
        client = httpx.Client(
            timeout=settings.cutout_timeout_s,
            follow_redirects=False,
            headers={"User-Agent": settings.user_agent},
        )
        owns_client = True

    try:
        for attempt in range(1, settings.download_retries + 1):
            try:
                with client.stream("GET", url) as resp:
                    if resp.status_code == 200:
                        chunks: list[bytes] = []
                        total_bytes = 0
                        for chunk in resp.iter_bytes(chunk_size=65536):
                            chunks.append(chunk)
                            total_bytes += len(chunk)
                            if total_bytes > settings.cutout_max_bytes:
                                logger.warning("Download exceeded size cap (%s bytes): %s", total_bytes, url)
                                return None

                        data = b"".join(chunks)
                        # Cache raw bytes
                        disk_cache.put_cutout(url, data)
                        return data
                    elif resp.status_code in (429, 502, 503, 504):
                        logger.warning("Upstream HTTP %s on attempt %s for %s", resp.status_code, attempt, url)
                    else:
                        logger.warning("HTTP %s for cutout: %s", resp.status_code, url)
                        return None
            except (httpx.TimeoutException, httpx.NetworkError) as e:
                logger.warning("Network error on attempt %s for %s: %s", attempt, url, e)

            if attempt < settings.download_retries:
                backoff = (2 ** (attempt - 1)) + random.uniform(0.1, 0.5)
                time.sleep(backoff)

        return None
    finally:
        if owns_client:
            client.close()


def parse_cutout(
    raw_bytes: bytes,
    ref: ImageRef,
    detector: int,
    target_ra: float,
    target_dec: float,
) -> Cutout | None:
    """Defensively parse cutout FITS bytes per docs/SECURITY.md section 5.

    Reads extensions by name, verifies dimensions, spatial WCS, and calculates target wavelength.
    """
    try:
        with fits.open(io.BytesIO(raw_bytes), memmap=False) as hdul:
            # Verify required extensions by name
            for ext in ("IMAGE", "FLAGS", "VARIANCE", "ZODI"):
                if ext not in hdul:
                    logger.warning("FITS file missing required extension %s", ext)
                    return None

            image_hdu = hdul["IMAGE"]
            flags_hdu = hdul["FLAGS"]
            var_hdu = hdul["VARIANCE"]
            zodi_hdu = hdul["ZODI"]

            # Load data as float32 / int32
            image = np.asarray(image_hdu.data, dtype=np.float32)
            flags = np.asarray(flags_hdu.data, dtype=np.int32)
            variance = np.asarray(var_hdu.data, dtype=np.float32)
            zodi = np.asarray(zodi_hdu.data, dtype=np.float32)

            # Defensive dimension and shape checks
            if image.ndim != 2:
                logger.warning("Image is not 2D: ndim=%s", image.ndim)
                return None

            if image.size > settings.cutout_max_pixels:
                logger.warning("Image pixel count %s exceeds limit %s", image.size, settings.cutout_max_pixels)
                return None

            if not (image.shape == flags.shape == variance.shape == zodi.shape):
                logger.warning("Extension shape mismatch in cutout: %s", image.shape)
                return None

            # Spatial WCS
            spatial_wcs = WCS(image_hdu.header)

            # Header metadata
            obs_id_raw = str(image_hdu.header.get("OBSID", image_hdu.header.get("OBS_ID", ""))).strip()
            obs_id = obs_id_raw if OBSID_REGEX.match(obs_id_raw) else None

            version_raw = str(hdul[0].header.get("VERSION", "")).strip()
            version = version_raw if OBSID_REGEX.match(version_raw) else None

            # Spectral WCS calculation for wavelength at target coordinate
            wavelength_um = None
            try:
                # Find target pixel in cutout coordinates
                px, py = spatial_wcs.all_world2pix(target_ra, target_dec, 0)
                if 0 <= px < image.shape[1] and 0 <= py < image.shape[0]:
                    if "WCS-WAVE" in hdul:
                        spectral_wcs = WCS(header=image_hdu.header, fobj=hdul, key="W")
                        spectral_wcs.sip = None
                        wl, _ = spectral_wcs.pixel_to_world(float(px), float(py))
                        wavelength_um = round(float(wl.to("um").value), 3)
            except Exception as e:
                logger.debug("Could not compute spectral WCS wavelength: %s", e)

            return Cutout(
                ref=ref,
                image=image,
                flags=flags,
                variance=variance,
                zodi=zodi,
                wcs=spatial_wcs,
                detector=detector,
                obs_id=obs_id,
                version=version,
                wavelength_um=wavelength_um,
            )

    except Exception as e:
        logger.warning("Error parsing FITS cutout: %s", e)
        return None
