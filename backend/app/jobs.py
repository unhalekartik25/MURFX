"""In-memory job registry and background worker execution.

Specification: docs/ARCHITECTURE.md section 6, docs/SECURITY.md section 4.
"""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any
from fastapi import status

from backend.app.cache import disk_cache
from backend.app.config import settings
from backend.app.errors import AppError
from backend.app.pipeline import run_sequence
from backend.app.schemas import SequenceRequest, SequenceResult, SequenceStatus

logger = logging.getLogger("spherex.jobs")


class JobEntry:
    """Tracking state for a background sequence generation job."""

    def __init__(self, key: str, request: SequenceRequest, client_ip: str) -> None:
        self.key = key
        self.request = request
        self.client_ip = client_ip
        self.status: str = "queued"
        self.stage: str | None = None
        self.progress: dict[str, int] | None = None
        self.result: SequenceResult | None = None
        self.error: dict[str, str] | None = None
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.finished_at: str | None = None
        self.created_time = time.monotonic()


class JobRegistry:
    """Thread-safe registry for single-process uvicorn worker."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, JobEntry] = {}
        self._executor = ThreadPoolExecutor(
            max_workers=settings.job_workers,
            thread_name_prefix="seq-worker",
        )

    def submit_sequence(self, req: SequenceRequest, client_ip: str) -> tuple[SequenceStatus, bool]:
        """Submit a sequence request. Returns (SequenceStatus, is_new_job).

        Handles deduplication and checks on-disk cache first.
        """
        key = req.compute_key()

        # 1. Check if complete on disk
        cached_meta = disk_cache.get_sequence_meta(key)
        if cached_meta:
            result = SequenceResult(**cached_meta)
            status_obj = SequenceStatus(
                key=key,
                status="done",
                stage=None,
                progress={"done": result.n_frames, "total": result.n_frames},
                request=req.normalized_dict(),
                result=result,
                created_at=datetime.now(timezone.utc).isoformat(),
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            return status_obj, False

        with self._lock:
            # 2. Check deduplication: active job in memory
            existing = self._jobs.get(key)
            if existing and existing.status in ("queued", "running"):
                return self._to_schema(existing), False

            # 3. Check queue capacity
            active_count = sum(
                1 for j in self._jobs.values() if j.status in ("queued", "running")
            )
            if active_count >= settings.max_queued_jobs:
                raise AppError(
                    "BUSY",
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "Server is busy processing tasks. Please retry in a few moments.",
                    headers={"Retry-After": "30"},
                )

            # 4. Enqueue new job
            job = JobEntry(key, req, client_ip)
            self._jobs[key] = job
            self._executor.submit(self._run_job, job)
            return self._to_schema(job), True

    def get_status(self, key: str) -> SequenceStatus | None:
        """Get status for a sequence key from memory or disk cache."""
        with self._lock:
            job = self._jobs.get(key)
            if job:
                return self._to_schema(job)

        # Check disk cache
        cached_meta = disk_cache.get_sequence_meta(key)
        if cached_meta:
            result = SequenceResult(**cached_meta)
            return SequenceStatus(
                key=key,
                status="done",
                stage=None,
                progress={"done": result.n_frames, "total": result.n_frames},
                request={},
                result=result,
                created_at="",
                finished_at="",
            )

        return None

    def _run_job(self, job: JobEntry) -> None:
        """Worker thread entrypoint."""
        job.status = "running"
        job.stage = "query"

        def progress_callback(stage: str, done: int, total: int) -> None:
            job.stage = stage  # type: ignore[assignment]
            job.progress = {"done": done, "total": total}

        try:
            result = run_sequence(job.request, job.key, progress_cb=progress_callback)
            job.result = result
            job.status = "done"
            job.stage = None
        except AppError as e:
            job.status = "failed"
            job.error = {"code": e.code, "message": e.message}
            logger.warning("Sequence job %s failed with AppError: %s", job.key, e.message)
        except Exception as e:
            job.status = "failed"
            job.error = {"code": "INTERNAL", "message": "An unexpected error occurred while processing."}
            logger.exception("Sequence job %s crashed: %s", job.key, e)
        finally:
            job.finished_at = datetime.now(timezone.utc).isoformat()
            self._cleanup_old_jobs()

    def _cleanup_old_jobs(self) -> None:
        """Evict jobs older than JOB_TTL_S from memory."""
        now = time.monotonic()
        with self._lock:
            expired = [
                k
                for k, j in self._jobs.items()
                if j.status in ("done", "failed")
                and (now - j.created_time) > settings.job_ttl_s
            ]
            for k in expired:
                del self._jobs[k]

    def _to_schema(self, job: JobEntry) -> SequenceStatus:
        return SequenceStatus(
            key=job.key,
            status=job.status,  # type: ignore[arg-type]
            stage=job.stage,  # type: ignore[arg-type]
            progress=job.progress,
            request=job.request.normalized_dict(),
            result=job.result,
            error=job.error,
            created_at=job.created_at,
            finished_at=job.finished_at,
        )


job_registry = JobRegistry()
