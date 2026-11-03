# syntax=docker/dockerfile:1
# #218 P1-A2 validation image ONLY. Never use as App/Migrator/Worker or publish to GHCR.
# Debian/amd64, CPU-only browser, independent of G7/operational mounts.
FROM node:22.14.0-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    XDG_CONFIG_HOME=/tmp/.config \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
    A2_BROWSER_EXPECTED_MAJOR=153
# CI #514: the production project's Playwright E2E passed the real DXF
# scene-poc under Chromium 153. The Debian apt Chromium 156 in isolated A2
# rejected the separately bundled script with SYNTAX_INVALID_REGEXP.
# Pin the proof browser to the *same exact npm-lock Playwright build*, without
# changing the Debian/UID10001/runtime --network none resource boundary.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/src
COPY src/package.json src/package-lock.json ./
RUN npm ci \
    && ./node_modules/.bin/playwright install --with-deps chromium \
    && chmod -R a+rX /opt/ms-playwright
COPY src/ ./
RUN groupadd --system --gid 10001 cad \
    && useradd --system --uid 10001 --gid cad --home-dir /tmp --shell /usr/sbin/nologin cad \
    && chmod -R a+rX /app/src
USER 10001:10001
CMD ["./node_modules/.bin/playwright", "test", "--config", "tests/a2/playwright.config.ts"]
