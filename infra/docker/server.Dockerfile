# Server image — the Fastify API.
#
# The server runs TypeScript directly (tsx). That is deliberate for this
# milestone: a tsc emit step would add a build artifact whose only job is to
# undo type stripping, and the node runtime here is the same one the tests
# ran against. Dev dependencies are therefore installed in the image — tsx is
# a runtime requirement under this design, not a development convenience.
#
# Build context is the REPOSITORY ROOT:
#   docker build -f infra/docker/server.Dockerfile .

FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo
# Manifest layer first so a source edit does not re-resolve the lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /repo/apps/client/node_modules ./apps/client/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

RUN addgroup -g 10001 -S server \
 && adduser -S -u 10001 -G server server \
 && chown -R server:server /repo
USER server

ENV PORT=4000
EXPOSE 4000

# The API's own liveness probe: no session required by design.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

WORKDIR /repo/apps/server
CMD ["pnpm", "start"]
