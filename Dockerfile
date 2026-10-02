# Base images are pinned by digest; Dependabot moves the digests.
# Build stage. Its output is static files, the same for every platform: it
# runs once, natively, and each platform's image copies it.
FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN corepack enable && pnpm build

# Runtime stage
FROM caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b
# Caddy runs as an unprivileged user, owning what it writes: certificates in
# /data, the autosaved config in /config. Unprivileged ports follow, so the
# binary needs no capability: with one, `cap_drop: ALL` would refuse to run it.
RUN addgroup -S -g 10001 natel && adduser -S -D -H -u 10001 -G natel -s /sbin/nologin natel \
  && chown -R natel:natel /data /config \
  && setcap -r /usr/bin/caddy
COPY --from=builder /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
ENV NATEL_HTTP_PORT=8080 NATEL_HTTPS_PORT=8443 NATEL_ADMIN=127.0.0.1:2019
USER natel
EXPOSE 8080 8443
# Caddy's admin API answers once the config is loaded, whatever SITE_ADDRESS
# the site listens on. The port isn't published.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:2019/config/ || exit 1
