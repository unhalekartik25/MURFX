"""Caching layer: atomic disk cache with LRU eviction and memory TTL cache.

Specification: docs/ARCHITECTURE.md section 4 & 7.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from cachetools import TTLCache

from backend.app.config import settings

logger = logging.getLogger("spherex.cache")

# In-memory TTL cache for IRSA TAP query results (max 256 entries, TTL 6 hours)
tap_query_cache: TTLCache[tuple[float, float, int], list[dict[str, Any]]] = TTLCache(
    maxsize=256, ttl=settings.tap_cache_ttl_s
)


class DiskCache:
    """Manages disk caching under settings.cache_dir with atomic writes and LRU eviction."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or settings.cache_dir
        self.cutouts_dir = self.root / "cutouts"
        self.sequences_dir = self.root / "sequences"
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        self.cutouts_dir.mkdir(parents=True, exist_ok=True)
        self.sequences_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _url_to_path(url: str, directory: Path, suffix: str = ".fits") -> Path:
        url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return directory / f"{url_hash}{suffix}"

    def get_cutout(self, url: str) -> bytes | None:
        """Retrieve cached cutout FITS bytes if present."""
        path = self._url_to_path(url, self.cutouts_dir, ".fits")
        if path.exists():
            try:
                # Update mtime for LRU
                os.utime(path, None)
                return path.read_bytes()
            except Exception as e:
                logger.warning("Error reading cached cutout %s: %e", path.name, e)
        return None

    def put_cutout(self, url: str, data: bytes) -> Path:
        """Atomically write cutout FITS bytes and evict if cache size exceeded."""
        path = self._url_to_path(url, self.cutouts_dir, ".fits")
        self._atomic_write_bytes(path, data)
        self.evict_cutouts_if_needed()
        return path

    def get_sequence_meta(self, key: str) -> dict[str, Any] | None:
        """Retrieve sequence meta.json if it exists and is not expired."""
        meta_path = self.sequences_dir / key / "meta.json"
        if meta_path.exists():
            try:
                # Check expiration against seq_cache_ttl_s
                mtime = meta_path.stat().st_mtime
                if (time.time() - mtime) > settings.seq_cache_ttl_s:
                    return None
                return json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning("Error reading sequence meta %s: %s", key, e)
        return None

    def put_sequence_meta(self, key: str, meta: dict[str, Any]) -> None:
        """Atomically write sequence meta.json."""
        seq_dir = self.sequences_dir / key
        seq_dir.mkdir(parents=True, exist_ok=True)
        meta_path = seq_dir / "meta.json"
        content = json.dumps(meta, indent=2).encode("utf-8")
        self._atomic_write_bytes(meta_path, content)

    def get_frame_png_path(self, key: str, index: int) -> Path | None:
        """Get path to a rendered frame PNG if it exists."""
        png_path = self.sequences_dir / key / f"{index}.png"
        return png_path if png_path.exists() else None

    def put_frame_png(self, key: str, index: int, data: bytes) -> Path:
        """Atomically write a rendered frame PNG."""
        seq_dir = self.sequences_dir / key
        seq_dir.mkdir(parents=True, exist_ok=True)
        png_path = seq_dir / f"{index}.png"
        self._atomic_write_bytes(png_path, data)
        return png_path

    def _atomic_write_bytes(self, destination: Path, data: bytes) -> None:
        """Write to a temporary file in the same directory, then atomically replace destination."""
        dest_dir = destination.parent
        dest_dir.mkdir(parents=True, exist_ok=True)
        fd, tmp_path_str = tempfile.mkstemp(dir=str(dest_dir), prefix="tmp_")
        tmp_path = Path(tmp_path_str)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            tmp_path.replace(destination)
        except Exception:
            if tmp_path.exists():
                tmp_path.unlink()
            raise

    def evict_cutouts_if_needed(self) -> None:
        """Evict oldest accessed cutouts when total size exceeds CACHE_MAX_BYTES."""
        try:
            files: list[tuple[float, int, Path]] = []
            total_size = 0
            for p in self.cutouts_dir.glob("*.fits"):
                stat = p.stat()
                files.append((stat.st_mtime, stat.st_size, p))
                total_size += stat.st_size

            if total_size <= settings.cache_max_bytes:
                return

            # Sort by access/modification time ascending (oldest first)
            files.sort(key=lambda x: x[0])
            for mtime, size, path in files:
                try:
                    path.unlink()
                    total_size -= size
                    if total_size <= int(settings.cache_max_bytes * 0.85):
                        break
                except Exception as e:
                    logger.warning("Failed to evict cache file %s: %s", path.name, e)
        except Exception as e:
            logger.error("Error during cache eviction: %s", e)


disk_cache = DiskCache()
