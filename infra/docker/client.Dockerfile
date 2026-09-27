# Client image — the Next.js website (standalone output).
#
# NEXT_STANDALONE=1 turns on Next's standalone tracing, which walks the pnpm
# workspace and emits a self-contained server bundle. That flag lives in the
# config, not the Dockerfile, so a local build or a turborepo run keeps the
# plain output instead of paying for a bundle nothing reads.
#
# Build context is the REPOSITORY ROOT:
#   docker build -f infra/docker/client.Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/client ./apps/client
ENV NEXT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @rheoson/client build

FROM node:22-alpine AS runtime
RUN corepack enable \
 && addgroup -g 10001 -S client \
 && adduser -S -u 10001 -G client client
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone tree mirrors the workspace: the entrypoint sits under apps/client.
COPY --from=build --chown=client:client /repo/apps/client/.next/standalone ./
COPY --from=build --chown=client:client /repo/apps/client/.next/static ./apps/client/.next/static
COPY --from=build --chown=client:client /repo/apps/client/public ./apps/client/public

USER client
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

CMD ["node", "apps/client/server.js"]
