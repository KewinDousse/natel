# Baïkal from its release archive (ADR 063). BAIKAL_SHA256 is the digest
# GitHub lists for that archive.
FROM php:8.6.0RC5-apache@sha256:9a83d59508239dfcb5bfc4b2824ad49c920c3f5cf79a61ce72cc25747f35c882
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
