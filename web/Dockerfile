# ── Stage 1: Build the React app ─────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (separate layer — only re-runs when
# package.json or lockfile changes, not on every source code change).
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source and build.
# VITE_API_URL is injected at build time — the value baked into the
# JS bundle must match the actual API URL the browser will call.
COPY . .
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build


# ── Stage 2: Serve with nginx ─────────────────────────────────
# The final image contains only the compiled static files and nginx —
# no Node.js, no source code, no build tools. Much smaller (~25 MB
# vs ~400 MB for a Node image).
FROM nginx:alpine

# Copy the compiled frontend from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config for a React SPA: serve index.html for every route that
# doesn't match a static file, so client-side routing (react-router)
# works correctly when the user refreshes on a nested route like /library.
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    gzip on; \
    gzip_types text/plain text/css application/javascript application/json image/svg+xml; \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80