# Base images are pinned by digest; Dependabot moves the digests.
# Build stage. Its output is static files, the same for every platform: it
# runs once, natively, and each platform's image copies it.
FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder
WORKDIR /app
# Corepack and pnpm handle installs; the bundled npm is not needed.
RUN apk add --no-cache zlib=1.3.2-r1 \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
ARG NATEL_REVISION
RUN corepack enable && NATEL_REVISION="$NATEL_REVISION" pnpm build

# The session process (ADR 032): a static binary, cross-compiled natively
# for each platform like the build stage above.
FROM --platform=$BUILDPLATFORM golang:1.27-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS session
WORKDIR /src
COPY session/ ./
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /natel-session .

# The official Caddy binary (ADR 033). Caddy listens on unprivileged ports,
# so it needs no capability: with one, `cap_drop: ALL` would refuse to run
# it. It is removed in its own stage because changing the binary in the
# runtime stage would store it twice.
FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f AS caddy
RUN setcap -r /usr/bin/caddy

# Runtime stage: what the official image adds to Alpine, minus curl and
# libcap, which nothing here runs.
FROM alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0
# Caddy runs as an unprivileged user, owning what it writes: certificates in
# /data, the autosaved config in /config.
RUN apk add --no-cache ca-certificates mailcap zlib=1.3.2-r1 \
  && addgroup -S -g 10001 natel && adduser -S -D -H -u 10001 -G natel -s /sbin/nologin natel \
  && mkdir -p /config/caddy /data/caddy /etc/caddy /usr/share/caddy \
  && chmod 1777 /config/caddy /data/caddy \
  && chown -R natel:natel /data /config
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=builder /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=session /natel-session /usr/bin/natel-session
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data \
  NATEL_HTTP_PORT=8080 NATEL_HTTPS_PORT=8443 NATEL_ADMIN=127.0.0.1:2019 \
  NATEL_SESSION_ADDR=127.0.0.1:2020
WORKDIR /srv
USER natel
EXPOSE 8080 8443
# natel-session is PID 1 and runs Caddy as its child: either one exiting
# stops the container.
ENTRYPOINT ["/usr/bin/natel-session"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
# Caddy's admin API answers once the config is loaded, whatever SITE_ADDRESS
# the site listens on. Neither port is published.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:2019/config/ \
  && wget -q -O /dev/null "http://$NATEL_SESSION_ADDR/healthz" || exit 1
