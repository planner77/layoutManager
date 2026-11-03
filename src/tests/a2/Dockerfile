# syntax=docker/dockerfile:1
# #218 P1-A2 validation image ONLY. Never use as App/Migrator/Worker or publish to GHCR.
# Debian/amd64, CPU-only browser, independent of G7/operational mounts.
FROM node:22.14.0-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    XDG_CONFIG_HOME=/tmp/.config \
    A2_CHROMIUM_EXECUTABLE=/usr/bin/chromium
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates chromium openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/src
COPY src/package.json src/package-lock.json ./
RUN npm ci
COPY src/ ./
RUN groupadd --system --gid 10001 cad \
    && useradd --system --uid 10001 --gid cad --home-dir /tmp --shell /usr/sbin/nologin cad \
    && chmod -R a+rX /app/src
USER 10001:10001
CMD ["./node_modules/.bin/playwright", "test", "--config", "tests/a2/playwright.config.ts"]
