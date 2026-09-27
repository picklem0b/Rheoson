# Engine image — Python, ffmpeg and yt-dlp.
#
# ffmpeg comes from the distro (it is the one binary that must be the OS's own
# build); yt-dlp is installed with pip so the toolchain's pip-upgrade repair
# path works exactly as it does on a Termux host. That parity matters: yt-dlp
# ages out and must be updatable in place.
#
# Build context is the REPOSITORY ROOT:
#   docker build -f infra/docker/engine.Dockerfile .

FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir uv

WORKDIR /srv

# Dependencies first: this layer survives every source edit.
COPY apps/services/py/pyproject.toml apps/services/py/README.md ./
RUN uv pip install --system --no-cache "fastapi>=0.115" "uvicorn[standard]>=0.32" "httpx>=0.27" "structlog>=24.4" yt-dlp

COPY apps/services/py/app ./app

# The shared DCCNN registry, read at boot. The source of truth is the
# TypeScript registry; this is its exported artifact, so a mismatch is
# impossible rather than merely unlikely.
COPY packages/shared/generated/error-codes.json ./error-codes.json
ENV ERROR_CODES_PATH=/srv/error-codes.json

RUN adduser --system --uid 10001 --group engine \
 && mkdir -p /data && chown engine:engine /data
USER engine

ENV ENGINE_PORT=8081 \
    ENGINE_DATA_DIR=/data \
    PYTHONUNBUFFERED=1
EXPOSE 8081

# yt-dlp lives at /usr/local/bin after pip; the toolchain finds it on PATH.
# Exec form so the port comes from the same env the app reads, with no shell
# quoting games inside a Dockerfile.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ['ENGINE_PORT']+'/health',timeout=3)"]

CMD ["python", "-m", "app.main"]
