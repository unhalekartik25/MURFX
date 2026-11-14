"""IRSA TAP queries and cutout URL generation.

Specification: docs/DATA_SOURCES.md section 2 & 3, docs/SECURITY.md section 2 & 3.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import re
from dataclasses import dataclass
from typing import Any
import httpx

from backend.app.cache import tap_query_cache
from backend.app.config import DETECTOR_MAP, settings
from backend.app.errors import AppError

logger = logging.getLogger("spherex.irsa")

IRSA_TAP_SYNC_URL = "https://irsa.ipac.caltech.edu/TAP/sync"
IRSA_BASE_URL = "https://irsa.ipac.caltech.edu/"

# Regex for validating returned a.uri per docs/SECURITY.md section 3.2:
# starts with ibe/data/spherex/, ends with .fits, no .., no ://, no whitespace, length <= 300
URI_REGEX = re.compile(r"^ibe/data/spherex/[a-zA-Z0-9_\-\./]+\.fits$")


@dataclass(frozen=True)
class ImageRef:
    """One SPHEREx exposure that covers the target (docs/ARCHITECTURE.md section 4)."""

    uri: str
    mjd: float
    url: str


def build_adql(ra: float, dec: float, detector: int) -> str:
    """Build the verified TAP ADQL query per docs/DATA_SOURCES.md section 2.

    Only validated floats formatted with .8f and mapped detector names reach ADQL.
    """
    if detector not in DETECTOR_MAP:
        raise AppError("INVALID_PARAMETER", 422, f"Invalid detector: {detector}. Must be 1-6.")

    band_name = DETECTOR_MAP[detector]

    # Exactly formatted floats prevent any injection
    query = (
        "SELECT a.uri, p.time_bounds_lower "
        "FROM spherex.artifact a "
        "JOIN spherex.plane p ON a.planeid = p.planeid "
        f"WHERE 1 = CONTAINS(POINT('ICRS', {ra:.8f}, {dec:.8f}), p.poly) "
        f"  AND p.energy_bandpassname = '{band_name}' "
        "ORDER BY p.time_bounds_lower"
    )
    return query


def validate_uri(uri: str) -> bool:
    """Validate a.uri against security rules from docs/SECURITY.md section 3.2."""
    if not uri or len(uri) > 300:
        return False
    if ".." in uri or "://" in uri or any(c.isspace() for c in uri):
        return False
    return bool(URI_REGEX.match(uri))


def build_cutout_url(uri: str, ra: float, dec: float, fov_arcmin: float) -> str:
    """Construct full cutout URL using validated URI and target position."""
    # Add a 15% margin to cutout size so reprojected grid doesn't have missing edge pixels
    size_deg = (fov_arcmin / 60.0) * 1.15
    return f"{IRSA_BASE_URL}{uri}?center={ra:.6f},{dec:.6f}&size={size_deg:.6f}"


def query_images(ra: float, dec: float, detector: int, fov_arcmin: float) -> list[ImageRef]:
    """Query IRSA TAP for all SPHEREx exposures covering (ra, dec) for the specified detector.

    Uses in-memory TTL caching and strict output validation.
    """
    cache_key = (round(ra, 6), round(dec, 6), detector)
    cached_rows = tap_query_cache.get(cache_key)

    if cached_rows is None:
        adql = build_adql(ra, dec, detector)
        logger.info("Executing TAP query for (%s, %s, det=%s)", ra, dec, detector)

        try:
            # Query TAP service requesting JSON or CSV format
            with httpx.Client(
                timeout=settings.tap_timeout_s,
                headers={"User-Agent": settings.user_agent},
            ) as client:
                resp = client.post(
                    IRSA_TAP_SYNC_URL,
                    data={
                        "REQUEST": "doQuery",
                        "LANG": "ADQL",
                        "FORMAT": "json",
                        "QUERY": adql,
                    },
                )

                if resp.status_code == 200:
                    try:
                        json_data = resp.json()
                        # JSON TAP format: {"data": [[uri, time_bounds_lower], ...]}
                        rows = json_data.get("data", [])
                        cached_rows = [
                            {"uri": str(row[0]), "mjd": float(row[1])}
                            for row in rows
                            if len(row) >= 2
                        ]
                    except Exception:
                        # Fallback parsing if JSON schema differs
                        cached_rows = []
                elif resp.status_code in (502, 503, 504):
                    raise AppError(
                        "UPSTREAM_UNAVAILABLE",
                        502,
                        "IRSA TAP service is currently unavailable. Please try again shortly.",
                    )
                else:
                    logger.warning("TAP query failed with HTTP %s: %s", resp.status_code, resp.text[:200])
                    # Try CSV format if JSON was rejected
                    csv_resp = client.post(
                        IRSA_TAP_SYNC_URL,
                        data={
                            "REQUEST": "doQuery",
                            "LANG": "ADQL",
                            "FORMAT": "csv",
                            "QUERY": adql,
                        },
                    )
                    if csv_resp.status_code == 200:
                        reader = csv.DictReader(io.StringIO(csv_resp.text))
                        cached_rows = []
                        for r in reader:
                            uri_val = r.get("uri")
                            time_val = r.get("time_bounds_lower")
                            if uri_val and time_val:
                                try:
                                    cached_rows.append({"uri": uri_val, "mjd": float(time_val)})
                                except ValueError:
                                    continue
                    else:
                        raise AppError(
                            "UPSTREAM_UNAVAILABLE",
                            502,
                            f"IRSA query failed with upstream status {resp.status_code}",
                        )

            tap_query_cache[cache_key] = cached_rows or []

        except httpx.TimeoutException:
            raise AppError("UPSTREAM_TIMEOUT", 504, "IRSA TAP query timed out. Please try again.")
        except AppError:
            raise
        except Exception as e:
            logger.exception("Error contacting IRSA TAP: %s", e)
            raise AppError("UPSTREAM_UNAVAILABLE", 502, "Failed to connect to IRSA archive.")

    if not cached_rows:
        raise AppError(
            "NO_COVERAGE",
            404,
            f"No SPHEREx images cover coordinates ({ra:.4f}, {dec:.4f}) in detector {DETECTOR_MAP[detector]}.",
        )

    # Validate URIs and construct ImageRefs
    results: list[ImageRef] = []
    for item in cached_rows:
        uri = item["uri"]
        mjd = item["mjd"]
        if validate_uri(uri):
            url = build_cutout_url(uri, ra, dec, fov_arcmin)
            results.append(ImageRef(uri=uri, mjd=mjd, url=url))
        else:
            logger.warning("Rejected suspicious or invalid URI from TAP: %s", uri)

    if not results:
        raise AppError("NO_COVERAGE", 404, "No valid SPHEREx cutouts found after validation.")

    return results
