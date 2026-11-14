#!/usr/bin/env python3
"""Pipeline verification script for all five required challenge targets.

Specification: docs/ROADMAP.md Slice 5, docs/TEST_TARGETS.md.
Usage:
    python scripts/run_targets.py [--target all|wise0855|barnard|epsind|rwaur|rdra] [--base-url http://localhost:8000]
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.config import settings
from backend.app.pipeline import run_sequence
from backend.app.resolver import resolve_object_name
from backend.app.schemas import SequenceRequest

TARGETS_DATA = {
    "wise0855": {
        "name": "WISE 0855",
        "ra": 133.795125,
        "dec": -7.245147,
        "fov_arcmin": 8.0,
        "detector": 5,
        "max_frames": 15,
        "phenomenon": "Fast-moving cold brown dwarf (~8\"/yr proper motion)",
    },
    "barnard": {
        "name": "Barnard's Star",
        "resolve_name": "Barnard's Star",
        "fov_arcmin": 8.0,
        "detector": 2,
        "max_frames": 12,
        "phenomenon": "Rapid northward proper motion (~10.3\"/yr) centered on J2026.0",
    },
    "epsind": {
        "name": "Epsilon Indi B",
        "resolve_name": "eps Ind B",
        "fov_arcmin": 12.0,
        "detector": 3,
        "max_frames": 10,
        "phenomenon": "Brown dwarf binary shifting against background stars",
    },
    "rwaur": {
        "name": "RW Aurigae",
        "resolve_name": "RW Aur",
        "fov_arcmin": 4.0,
        "detector": 2,
        "max_frames": 12,
        "phenomenon": "Young irregular variable star brightness changes across epochs",
    },
    "rdra": {
        "name": "R Draconis",
        "resolve_name": "R Dra",
        "fov_arcmin": 4.0,
        "detector": 2,
        "max_frames": 12,
        "phenomenon": "Mira-type large periodic amplitude variability",
    },
}


def build_contact_sheet(frame_paths: list[Path], output_path: Path, cols: int = 4) -> None:
    """Combine rendered frame PNGs into a contact sheet grid for visual inspection."""
    if not frame_paths:
        return

    images = [Image.open(p) for p in frame_paths if p.exists()]
    if not images:
        return

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
    print(f"  Contact sheet saved to: {output_path}")


def run_target_direct(target_key: str) -> bool:
    """Run pipeline directly for one of the challenge targets."""
    info = TARGETS_DATA[target_key]
    print(f"\n=== Running target: {info['name']} ({info['phenomenon']}) ===")

    if "ra" in info and "dec" in info:
        ra = info["ra"]
        dec = info["dec"]
    else:
        resolved = resolve_object_name(info["resolve_name"])
        ra = resolved.get("ra_now") or resolved["ra"]
        dec = resolved.get("dec_now") or resolved["dec"]

    req = SequenceRequest(
        ra=ra,
        dec=dec,
        fov_arcmin=info["fov_arcmin"],
        detector=info["detector"],
        mode="frames",
        max_frames=info["max_frames"],
    )
    key = req.compute_key()

    start_time = time.monotonic()

    def progress(stage: str, done: int, total: int) -> None:
        pct = (done / total * 100) if total > 0 else 0
        print(f"  Stage: {stage.upper():<10} {done}/{total} ({pct:.0f}%)", end="\r", flush=True)

    try:
        result = run_sequence(req, key, progress_cb=progress)
        print()
        elapsed = time.monotonic() - start_time
        print(f"  Completed in:     {elapsed:.1f}s")
        print(f"  Available frames: {result.n_available}")
        print(f"  Rendered frames:  {result.n_frames}")
        print(f"  Grid dimensions:  {result.grid.width}x{result.grid.height}")

        frame_files = [
            settings.cache_dir / "sequences" / key / f"{f.index}.png"
            for f in result.frames
        ]
        contact_path = settings.cache_dir / f"contact_{target_key}.png"
        build_contact_sheet(frame_files, contact_path)

        return result.n_frames >= 2
    except Exception as e:
        print(f"\n  Pipeline error for {info['name']}: {e}")
        return False


def run_target_http(target_key: str, base_url: str) -> bool:
    """Run target verification via deployed HTTP API."""
    import httpx
    info = TARGETS_DATA[target_key]
    base_url = base_url.rstrip("/")
    print(f"\n=== HTTP verification: {info['name']} via {base_url} ===")

    with httpx.Client(timeout=180.0) as client:
        try:
            if "ra" in info and "dec" in info:
                ra, dec = info["ra"], info["dec"]
            else:
                res_resp = client.get(f"{base_url}/api/v1/resolve", params={"name": info["resolve_name"]})
                if res_resp.status_code != 200:
                    print(f"  Resolve failed: HTTP {res_resp.status_code}")
                    return False
                res_data = res_resp.json()
                ra = res_data.get("ra_now") or res_data["ra"]
                dec = res_data.get("dec_now") or res_data["dec"]

            post_resp = client.post(
                f"{base_url}/api/v1/sequences",
                json={
                    "ra": ra,
                    "dec": dec,
                    "fov_arcmin": info["fov_arcmin"],
                    "detector": info["detector"],
                    "max_frames": info["max_frames"],
                },
            )
            print(f"  POST /sequences: HTTP {post_resp.status_code}")
            data = post_resp.json()
            key = data.get("key")
            if not key:
                return False

            # Poll until done
            for _ in range(60):
                time.sleep(2.0)
                status_resp = client.get(f"{base_url}/api/v1/sequences/{key}")
                status_data = status_resp.json()
                st = status_data.get("status")
                if st == "done":
                    n_frames = status_data.get("result", {}).get("n_frames", 0)
                    print(f"  Job {key} completed: {n_frames} frames.")
                    return n_frames >= 2
                elif st == "failed":
                    print(f"  Job {key} failed: {status_data.get('error')}")
                    return False

            print("  Polling timed out.")
            return False
        except Exception as e:
            print(f"  HTTP error for {info['name']}: {e}")
            return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Run MURFX challenge target verification")
    parser.add_argument(
        "--target",
        default="all",
        choices=["all", "wise0855", "barnard", "epsind", "rwaur", "rdra"],
        help="Target to run (default: all)",
    )
    parser.add_argument("--base-url", default=None, help="Base URL of deployed service")
    args = parser.parse_args()

    targets_to_run = list(TARGETS_DATA.keys()) if args.target == "all" else [args.target]
    all_ok = True

    for t in targets_to_run:
        if args.base_url:
            ok = run_target_http(t, args.base_url)
        else:
            ok = run_target_direct(t)
        if not ok:
            all_ok = False

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
