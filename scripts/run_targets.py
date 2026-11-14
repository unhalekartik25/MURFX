#!/usr/bin/env python3
"""Pipeline verification script for required targets (WISE 0855, etc.).

Specification: docs/ROADMAP.md Slice 1, docs/TEST_TARGETS.md.
Usage:
    python scripts/run_targets.py [--base-url http://localhost:8000]
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from PIL import Image

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.config import settings
from backend.app.pipeline import run_sequence
from backend.app.schemas import SequenceRequest


def build_contact_sheet(frame_paths: list[Path], output_path: Path, cols: int = 4) -> None:
    """Combine rendered frame PNGs into a contact sheet grid for visual alignment inspection."""
    if not frame_paths:
        return

    images = [Image.open(p) for p in frame_paths]
    w, h = images[0].size
    n = len(images)
    rows = (n + cols - 1) // cols

    sheet = Image.new("RGBA", (cols * w, rows * h), color=(15, 23, 42, 255))
    for idx, img in enumerate(images):
        c = idx % cols
        r = idx // cols
        sheet.paste(img, (c * w, r * h), mask=img.convert("RGBA").split()[3])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, "PNG")
    print(f"Contact sheet saved to: {output_path}")


def run_wise0855_direct() -> bool:
    """Run the pipeline directly in Python for WISE 0855."""
    print("=== Running WISE 0855 Direct Pipeline ===")
    req = SequenceRequest(
        ra=133.795125,
        dec=-7.245147,
        fov_arcmin=8.0,
        detector=5,
        mode="frames",
        background="median",
        mask_level="minimal",
        stretch="global",
        upsample=2,
        max_frames=15,
    )
    key = req.compute_key()
    print(f"Computed sequence key: {key}")

    start_time = time.monotonic()

    def progress(stage: str, done: int, total: int) -> None:
        pct = (done / total * 100) if total > 0 else 0
        print(f"  Stage: {stage.upper():<10} {done}/{total} ({pct:.0f}%)", end="\r", flush=True)

    try:
        result = run_sequence(req, key, progress_cb=progress)
        print()
        elapsed = time.monotonic() - start_time
        print(f"\nPipeline finished in {elapsed:.1f}s")
        print(f"  Available frames: {result.n_available}")
        print(f"  Rendered frames:  {result.n_frames}")
        print(f"  Failed downloads: {result.n_failed_downloads}")
        print(f"  Grid dimensions:  {result.grid.width}x{result.grid.height} (pxscale: {result.grid.pixscale_arcsec}\")")
        print(f"  Stretch range:    [{result.stretch.vmin}, {result.stretch.vmax}] {result.stretch.unit}")

        # Assemble contact sheet
        frame_files = [
            settings.cache_dir / "sequences" / key / f"{f.index}.png"
            for f in result.frames
            if (settings.cache_dir / "sequences" / key / f"{f.index}.png").exists()
        ]
        contact_path = settings.cache_dir / "contact_wise0855.png"
        build_contact_sheet(frame_files, contact_path)

        if result.n_frames >= 2:
            print("SUCCESS: WISE 0855 pipeline completed successfully.")
            return True
        else:
            print("FAILURE: Less than 2 frames produced.")
            return False

    except Exception as e:
        print(f"\nPipeline error: {e}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Run pipeline targets verification")
    parser.add_argument("--base-url", default=None, help="Optional HTTP base URL to test via API")
    args = parser.parse_args()

    if args.base_url:
        print(f"Testing target via API: {args.base_url}")
        # Could query HTTP POST /api/v1/sequences
        import httpx
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                f"{args.base_url}/api/v1/sequences",
                json={"ra": 133.795125, "dec": -7.245147, "fov_arcmin": 8.0, "detector": 5, "max_frames": 15},
            )
            print(f"Response: {resp.status_code}")
            print(resp.json())
    else:
        success = run_wise0855_direct()
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
