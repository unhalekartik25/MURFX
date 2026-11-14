#!/usr/bin/env python3
"""Cache warming and pre-seeding script for MURFX / SPHEREx Blink Viewer.

Specification: docs/DEPLOYMENT.md section 5, docs/ROADMAP.md Slice 5.
Usage:
    python scripts/warm_cache.py [--base-url http://localhost:8000]
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.config import settings
from backend.app.pipeline import run_sequence
from backend.app.resolver import resolve_object_name
from backend.app.schemas import SequenceRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("warm_cache")

# The 5 challenge test targets
TARGET_CONFIGS = [
    {"name": "WISE 0855", "ra": 133.795125, "dec": -7.245147, "fov": 8.0, "det": 5, "max_frames": 10},
    {"name": "Barnard's Star", "fov": 8.0, "det": 2, "max_frames": 10},
    {"name": "eps Ind B", "fov": 12.0, "det": 3, "max_frames": 10},
    {"name": "RW Aur", "fov": 4.0, "det": 2, "max_frames": 10},
    {"name": "R Dra", "fov": 4.0, "det": 2, "max_frames": 10},
]


def warm_local_cache() -> None:
    """Pre-run the pipeline locally for the 5 challenge targets to seed the disk cache."""
    logger.info("Starting local cache pre-warming for challenge targets...")
    demo_dir = PROJECT_ROOT / "demo_data"
    demo_dir.mkdir(parents=True, exist_ok=True)

    for item in TARGET_CONFIGS:
        name = item["name"]
        logger.info("Warming cache for target: %s", name)
        try:
            if "ra" in item and "dec" in item:
                ra, dec = item["ra"], item["dec"]
            else:
                res = resolve_object_name(name)
                ra = res.get("ra_now") or res["ra"]
                dec = res.get("dec_now") or res["dec"]

            req = SequenceRequest(
                ra=ra,
                dec=dec,
                fov_arcmin=item["fov"],
                detector=item["det"],
                max_frames=item["max_frames"],
            )
            key = req.compute_key()
            logger.info("Target %s -> Key: %s", name, key)

            # Check if already in cache
            seq_cache_dir = settings.cache_dir / "sequences" / key
            if seq_cache_dir.exists() and (seq_cache_dir / "meta.json").exists():
                logger.info("Target %s already cached.", name)
            else:
                run_sequence(req, key)
                logger.info("Target %s warmed successfully.", name)

            # Copy to demo_data for ephemeral container seeding
            target_demo_dir = demo_dir / key
            if seq_cache_dir.exists() and not target_demo_dir.exists():
                shutil.copytree(seq_cache_dir, target_demo_dir, dirs_exist_ok=True)
                logger.info("Seeded %s to demo_data/", key)

        except Exception as e:
            logger.warning("Failed pre-warming for %s: %s", name, e)

    logger.info("Cache pre-warming completed.")


def warm_remote_cache(base_url: str) -> None:
    """Warm a remote deployment via HTTP POST."""
    import httpx
    base_url = base_url.rstrip("/")
    logger.info("Warming remote deployment: %s", base_url)

    with httpx.Client(timeout=180.0) as client:
        for item in TARGET_CONFIGS:
            name = item["name"]
            logger.info("Submitting remote job for: %s", name)
            try:
                if "ra" in item and "dec" in item:
                    ra, dec = item["ra"], item["dec"]
                else:
                    resolve_resp = client.get(f"{base_url}/api/v1/resolve", params={"name": name})
                    if resolve_resp.status_code == 200:
                        res = resolve_resp.json()
                        ra = res.get("ra_now") or res["ra"]
                        dec = res.get("dec_now") or res["dec"]
                    else:
                        logger.warning("Could not resolve %s remotely", name)
                        continue

                post_resp = client.post(
                    f"{base_url}/api/v1/sequences",
                    json={
                        "ra": ra,
                        "dec": dec,
                        "fov_arcmin": item["fov"],
                        "detector": item["det"],
                        "max_frames": item["max_frames"],
                    },
                )
                logger.info("Target %s -> HTTP %s", name, post_resp.status_code)
            except Exception as e:
                logger.warning("Error submitting %s: %s", name, e)


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-warm cache for MURFX test targets")
    parser.add_argument("--base-url", default=None, help="Base URL of deployed service")
    args = parser.parse_args()

    if args.base_url:
        warm_remote_cache(args.base_url)
    else:
        warm_local_cache()


if __name__ == "__main__":
    main()
