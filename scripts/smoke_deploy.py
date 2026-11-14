#!/usr/bin/env python3
"""Smoke test script for deployed or local SPHEREx Blink Viewer instances.

Specification: docs/DEPLOYMENT.md section 6.
Usage:
    python scripts/smoke_deploy.py http://localhost:8000 [--deep]
"""

from __future__ import annotations

import argparse
import sys
import time
import httpx


def smoke_test(base_url: str, deep: bool = False) -> bool:
    """Run smoke checks against the target base URL."""
    base_url = base_url.rstrip("/")
    print(f"Running smoke tests against: {base_url} (deep={deep})")

    with httpx.Client(timeout=10.0) as client:
        # 1. Check frontend root /
        print("1. Checking frontend root (GET /)...", end=" ")
        try:
            res = client.get(f"{base_url}/")
            if res.status_code != 200 or "SPHEREx Wise-Cube & Blink Explorer" not in res.text:
                print(f"FAILED (Status: {res.status_code})")
                return False
            # Verify security headers
            csp = res.headers.get("content-security-policy", "")
            nosniff = res.headers.get("x-content-type-options", "")
            if "default-src 'self'" not in csp or nosniff != "nosniff":
                print("FAILED (Missing required security headers)")
                return False
            print("OK")
        except Exception as e:
            print(f"ERROR: {e}")
            return False

        # 2. Check health endpoint /api/v1/health
        print("2. Checking health endpoint (GET /api/v1/health)...", end=" ")
        try:
            res = client.get(f"{base_url}/api/v1/health")
            if res.status_code != 200:
                print(f"FAILED (Status: {res.status_code})")
                return False
            data = res.json()
            if data.get("status") != "ok":
                print(f"FAILED (Body: {data})")
                return False
            print(f"OK (uptime: {data.get('uptime_s')}s, v{data.get('version')})")
        except Exception as e:
            print(f"ERROR: {e}")
            return False

        # 3. Check metadata endpoint /api/v1/meta
        print("3. Checking meta endpoint (GET /api/v1/meta)...", end=" ")
        try:
            res = client.get(f"{base_url}/api/v1/meta")
            if res.status_code != 200:
                print(f"FAILED (Status: {res.status_code})")
                return False
            data = res.json()
            if len(data.get("detectors", [])) != 6:
                print("FAILED (Expected 6 detectors)")
                return False
            print("OK (6 detectors present)")
        except Exception as e:
            print(f"ERROR: {e}")
            return False

        # 4. Optional deep check: IRSA reachability
        if deep:
            print("4. Deep health check (GET /api/v1/health?deep=1)...", end=" ")
            try:
                res = client.get(f"{base_url}/api/v1/health?deep=1")
                if res.status_code != 200:
                    print(f"FAILED (Status: {res.status_code})")
                    return False
                data = res.json()
                irsa_status = data.get("irsa")
                if irsa_status != "ok":
                    print(f"WARNING: IRSA reported '{irsa_status}'")
                else:
                    print("OK (IRSA reachable)")
            except Exception as e:
                print(f"ERROR: {e}")
                return False

    print("\nAll Slice 0 smoke tests passed successfully!")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke deploy test script")
    parser.add_argument("base_url", help="Base URL of the deployment (e.g. http://localhost:8000)")
    parser.add_argument("--deep", action="store_true", help="Perform deep check including IRSA reachability")
    args = parser.parse_args()

    success = smoke_test(args.base_url, deep=args.deep)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
