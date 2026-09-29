# Build stage. Its output is static files, the same for every platform: it
# runs once, natively, and each platform's image copies it.
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN corepack enable && pnpm build

# Runtime stage
FROM caddy:2-alpine
COPY --from=builder /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
# Caddy's admin API answers once the config is loaded, whatever SITE_ADDRESS
# the site listens on.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:2019/config/ || exit 1
