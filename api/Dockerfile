# ── Stage 1: Build ───────────────────────────────────────────
# Install all Python dependencies in a throw-away builder image so
# the final image doesn't include compilers, headers, or pip cache.
FROM python:3.13-slim AS builder

WORKDIR /build

# Install system libraries required by some Python packages
# (e.g. mutagen for ID3 tags, ffmpeg for yt-dlp post-processing).
# These are build-time only — we'll copy just the installed packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only the dependency manifest first — Docker caches this layer
# as long as pyproject.toml hasn't changed, so rebuilds are fast.
COPY pyproject.toml .
COPY app/ app/

# Install the project and all its dependencies into a known prefix
# so we can copy just that folder into the final image.
RUN pip install --prefix=/install --no-cache-dir -e .


# ── Stage 2: Runtime ─────────────────────────────────────────
FROM python:3.13-slim

# ffmpeg is needed at runtime by yt-dlp for audio conversion.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from the builder stage only — no compilers
# or build tools make it into the final image, keeping it smaller.
COPY --from=builder /install /usr/local

WORKDIR /app
COPY app/ app/

# Run as a non-root user — best practice for any production container.
# The user needs write access to music/downloads dirs (mounted at runtime).
RUN adduser --disabled-password --gecos "" shulker
USER shulker

# Expose the API port (Render injects $PORT at runtime; default to 8000
# for local Docker usage where PORT isn't set).
EXPOSE 8000

# ── Startup ───────────────────────────────────────────────────
# IMPORTANT:
#  - Entry point is `app.main:socket_app`, NOT `app.main:app`.
#    Using `app` skips the Socket.IO ASGI wrapper, which breaks all
#    real-time download progress events.
#  - NO --reload flag. --reload is for development only. In production
#    it watches the filesystem constantly, wastes CPU, and can cause
#    the server to restart mid-request.
#  - --workers 1: Socket.IO's in-memory state (download jobs, WS
#    connections) can't be shared across multiple worker processes
#    without a message broker. Keep at 1 until Redis/pub-sub is added.
CMD uvicorn app.main:socket_app \
    --host 0.0.0.0 \
    --port ${PORT:-8000} \
    --workers 1 \
    --log-level info \
    --access-log