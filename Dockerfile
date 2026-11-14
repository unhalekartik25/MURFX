# Base image: Python 3.12 slim for reliable C-extension wheels and light image footprint
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CACHE_DIR=/tmp/cache \
    PORT=8000

# Install build/system dependencies if needed, then clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root app user
RUN useradd -m -u 1000 appuser && \
    mkdir -p /tmp/cache && \
    chown -R appuser:appuser /tmp/cache /app

# Copy application code and assets
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY scripts/ ./scripts/

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/v1/health || exit 1

# Single uvicorn worker per docs/ARCHITECTURE.md and docs/DEPLOYMENT.md
CMD ["sh", "-c", "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --no-server-header"]
