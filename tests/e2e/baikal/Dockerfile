# Baïkal from its release archive (ADR 063). BAIKAL_SHA256 is the digest
# GitHub lists for that archive.
FROM php:8.5.12-apache@sha256:08af36df144462d84c7f16190557eec06cb9f656882685610b712a15eec54d46
ARG BAIKAL_VERSION=0.13.0
LABEL org.opencontainers.image.version=$BAIKAL_VERSION
ARG BAIKAL_SHA256=81e74df123230e863f608d228fdd7b9a1a788f60b04d37e6973c302192e83f32
# PharData spares installing unzip, but extracts every file world-writable.
RUN curl -fsSL --retry 3 --retry-connrefused -o /tmp/baikal.zip \
    "https://github.com/sabre-io/Baikal/releases/download/$BAIKAL_VERSION/baikal-$BAIKAL_VERSION.zip" \
  && echo "$BAIKAL_SHA256  /tmp/baikal.zip" | sha256sum -c - \
  && php -r '(new PharData("/tmp/baikal.zip"))->extractTo("/var/www");' \
  && chmod -R go-w /var/www/baikal \
  && rm /tmp/baikal.zip
COPY baikal.conf /etc/apache2/sites-available/000-default.conf
