"""Security middleware, headers, and rate limiting.

Specification: docs/SECURITY.md section 6 and limits table.
"""

from __future__ import annotations

import re
import time
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from backend.app.config import settings

# Slice 0-3 Strict Content-Security-Policy
# frame-ancestors * is intentional and required for embedding (docs/SECURITY.md section 6)
CSP_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "connect-src 'self'; "
    "frame-ancestors *; "
    "base-uri 'none'; "
    "form-action 'none'; "
    "object-src 'none'"
)

REQUEST_ID_REGEX = re.compile(r"^[0-9a-zA-Z\-_]{1,64}$")
SEQUENCE_KEY_REGEX = re.compile(r"^[0-9a-f]{32}$")


def get_client_ip(request: Request) -> str:
    """Extract client IP, taking last hop of X-Forwarded-For only if TRUST_PROXY=1."""
    if settings.trust_proxy:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            if parts:
                return parts[-1]  # Last hop appended by platform proxy
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Ensure every request has a validated or newly generated X-Request-ID."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming_id = request.headers.get("x-request-id")
        if incoming_id and REQUEST_ID_REGEX.match(incoming_id):
            req_id = incoming_id
        else:
            req_id = uuid.uuid4().hex

        request.state.request_id = req_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Enforce web security headers on all responses per docs/SECURITY.md."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        response.headers["Content-Security-Policy"] = CSP_POLICY
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        # HSTS only when HTTPS or enabled via env
        if settings.enable_hsts or request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000"

        # Explicitly ensure X-Frame-Options is NOT set so embedding works via CSP frame-ancestors *
        if "X-Frame-Options" in response.headers:
            del response.headers["X-Frame-Options"]

        return response


class InMemoryTokenBucket:
    """Thread-safe in-memory token bucket rate limiter for a single uvicorn worker."""

    def __init__(self, rate_per_min: int, burst: int | None = None) -> None:
        self.rate = rate_per_min / 60.0  # tokens per second
        self.capacity = float(burst if burst is not None else rate_per_min)
        self.buckets: dict[str, tuple[float, float]] = {}  # ip -> (tokens, last_time)

    def consume(self, client_ip: str, tokens: float = 1.0) -> tuple[bool, float]:
        """Attempt to consume tokens. Returns (allowed, retry_after_s)."""
        now = time.monotonic()
        current_tokens, last_time = self.buckets.get(client_ip, (self.capacity, now))

        # Refill
        elapsed = now - last_time
        current_tokens = min(self.capacity, current_tokens + elapsed * self.rate)

        if current_tokens >= tokens:
            self.buckets[client_ip] = (current_tokens - tokens, now)
            return True, 0.0
        else:
            needed = tokens - current_tokens
            retry_after = needed / self.rate if self.rate > 0 else 60.0
            self.buckets[client_ip] = (current_tokens, now)
            return False, max(1.0, retry_after)


# Global rate limiter instances (per IP)
general_limiter = InMemoryTokenBucket(rate_per_min=settings.rate_general_per_min)
create_limiter = InMemoryTokenBucket(rate_per_min=settings.rate_create_per_min, burst=settings.rate_create_per_min)
resolve_limiter = InMemoryTokenBucket(rate_per_min=settings.rate_resolve_per_min, burst=settings.rate_resolve_per_min)
frames_limiter = InMemoryTokenBucket(rate_per_min=settings.rate_frames_per_min, burst=100)
deep_health_limiter = InMemoryTokenBucket(rate_per_min=2, burst=2)
