# Relay image — a static Go binary on Alpine. No libc, no runtime, ~10 MB.
#
# Build context is the REPOSITORY ROOT:
#   docker build -f infra/docker/relay.Dockerfile .

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY apps/services/go/go.mod ./
RUN go mod download
COPY apps/services/go/ ./
# -trimpath keeps host paths out of the binary; -s -w drops symbols it never uses.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/relay ./cmd/relay

FROM alpine:3.21
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 -h /home/relay relay \
 && mkdir -p /cache && chown relay:relay /cache
COPY --from=build /out/relay /usr/local/bin/relay

USER relay
ENV RELAY_PORT=8080 \
    CACHE_DIR=/cache
EXPOSE 8080

# The health shape the server probes. wget is busybox's, already present.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${RELAY_PORT}/relay/health" >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/relay"]
