# syntax=docker/dockerfile:1
# Issues #28/#66: reproducible linux/amd64 web and migrator image comparison.
# Keep Debian glibc for Prisma 7 and better-sqlite3; builder tools never enter the web image.
FROM node:22.14.0-bookworm-slim AS dependencies
WORKDIR /app/src
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY src/package.json src/package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY src/ ./
RUN DATABASE_URL=file:/tmp/cad-build.sqlite \
    CAD_STORAGE_PATH=/tmp/cad-build \
    CAD_STORAGE_BACKEND=local \
    npm run db:generate \
    && DATABASE_URL=file:/tmp/cad-build.sqlite \
       CAD_STORAGE_PATH=/tmp/cad-build \
       CAD_STORAGE_BACKEND=local \
       npm run build

# Shared non-root runtime environment. /data is the only durable writable mount.
FROM node:22.14.0-bookworm-slim AS runtime-base
WORKDIR /app/src
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/data/db/cad.sqlite \
    CAD_STORAGE_PATH=/data/cad \
    CAD_STORAGE_BACKEND=local \
    MAX_UPLOAD_SIZE_MB=100
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 cad \
    && useradd --system --uid 10001 --gid cad --home-dir /app --shell /usr/sbin/nologin cad \
    && mkdir -p /data/db /data/cad /data/logs \
    && chown -R cad:cad /data \
    && chmod 0700 /data/logs
VOLUME ["/data"]

# Measurement-only phase 1: remove application source/tests from the full-dependency image.
# This target is not published and MUST NOT be used as the production app image.
FROM runtime-base AS phase1
COPY --from=dependencies /app/src/node_modules ./node_modules
COPY --from=builder /app/src/package.json ./package.json
COPY --from=builder /app/src/.next ./.next
COPY --from=builder /app/src/public ./public
COPY --from=builder /app/src/generated ./generated
COPY --from=builder /app/src/prisma ./prisma
COPY --from=builder /app/src/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src/scripts ./scripts
COPY --from=builder /app/src/server ./server
COPY --from=builder /app/src/domain ./domain
RUN mkdir -p /app/src/.next/cache && chown -R cad:cad /app/src/.next/cache
USER cad
CMD ["sh", "-c", "node scripts/run.mjs deploy && node .next/standalone/server.js"]

# One-shot migration/backfill: prune the pinned FULL build dependency tree to
# a dedicated runtime closure. No network/resolution during pruning; dev+peer
# packages used only by Studio/Next/browser must not be copied to this image.
FROM dependencies AS migrator-dependencies
COPY src/scripts/prepare-migrator-package.mjs ./scripts/prepare-migrator-package.mjs
RUN node scripts/prepare-migrator-package.mjs \
    && npm prune --omit=dev --offline --legacy-peer-deps --no-audit --no-fund \
    && node scripts/prepare-migrator-package.mjs --verify

# The web runtime is unchanged. Both images share one version and /data volume.
FROM runtime-base AS migrator
COPY --from=migrator-dependencies --chown=cad:cad /app/src/node_modules ./node_modules
COPY --from=migrator-dependencies --chown=cad:cad /app/src/package.json ./package.json
COPY --from=builder /app/src/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/prisma ./prisma
COPY --from=builder /app/src/generated ./generated
COPY --from=builder /app/src/scripts/deploy.ts ./scripts/deploy.ts
COPY --from=builder /app/src/scripts/backfill-delete-passwords.ts ./scripts/backfill-delete-passwords.ts
COPY --from=builder /app/src/scripts/env.mjs ./scripts/env.mjs
COPY --from=builder /app/src/scripts/storage-config.mjs ./scripts/storage-config.mjs
COPY --from=builder /app/src/server/db.ts ./server/db.ts
COPY --from=builder /app/src/server/backfill-delete-passwords.ts ./server/backfill-delete-passwords.ts
COPY --from=builder /app/src/server/password.ts ./server/password.ts
COPY --from=builder /app/src/server/logger.ts ./server/logger.ts
# Keep the migrator's tsx relative-import closure explicit and auditable.
COPY --from=builder /app/src/server/logging/store.ts ./server/logging/store.ts
COPY --from=builder /app/src/server/upload-error-catalog.ts ./server/upload-error-catalog.ts
COPY --from=builder /app/src/domain/cad.ts ./domain/cad.ts
# #153 explicit operator entrypoint only; default CMD still applies six CAD
# migrations. Signed Runtime authority is required before G2 writes anything.
COPY --from=builder /app/src/scripts/g7-greenfield.ts ./scripts/g7-greenfield.ts
COPY --from=builder /app/src/scripts/g7-greenfield-authority.ts ./scripts/g7-greenfield-authority.ts
COPY --from=builder /app/src/scripts/g7-runtime-admin.ts ./scripts/g7-runtime-admin.ts
COPY --from=builder /app/src/scripts/g7-runtime-rehearsal.ts ./scripts/g7-runtime-rehearsal.ts
COPY --from=builder /app/src/server/auth ./server/auth
COPY --from=builder /app/src/server/g7-staging/g1-store.ts ./server/g7-staging/g1-store.ts
COPY --from=builder /app/src/server/g7-staging/g2-store.ts ./server/g7-staging/g2-store.ts
COPY --from=builder /app/src/server/g7-staging/g4-store.ts ./server/g7-staging/g4-store.ts
# #98/#83: exact Greenfield business DDL belongs to the migrator's runtime closure.
COPY --from=builder /app/src/server/cad-business/schema-ddl.ts ./server/cad-business/schema-ddl.ts
COPY --from=builder /app/src/server/cad-business/anchor-ddl.ts ./server/cad-business/anchor-ddl.ts
COPY --from=builder /app/src/server/cad-business/memo-feature-ddl.ts ./server/cad-business/memo-feature-ddl.ts
COPY --from=builder /app/src/server/g7-operational/greenfield-schema.ts ./server/g7-operational/greenfield-schema.ts
COPY --from=builder /app/src/server/g7-operational/greenfield-install.ts ./server/g7-operational/greenfield-install.ts
COPY --from=builder /app/src/server/g7-operational/greenfield-auto.ts ./server/g7-operational/greenfield-auto.ts
COPY --from=builder /app/src/server/g7-operational/greenfield-gate.ts ./server/g7-operational/greenfield-gate.ts
COPY --from=builder /app/src/server/g7-operational/greenfield-authority.ts ./server/g7-operational/greenfield-authority.ts
COPY --from=builder /app/src/server/g7-operational/runtime-admin.ts ./server/g7-operational/runtime-admin.ts
COPY --from=builder /app/src/server/g7-operational/runtime-gate.ts ./server/g7-operational/runtime-gate.ts
COPY --from=builder /app/src/server/g7-operational/runtime-db.ts ./server/g7-operational/runtime-db.ts
COPY --from=builder /app/src/server/g7-operational/runtime-migration.ts ./server/g7-operational/runtime-migration.ts
COPY --from=builder /app/src/server/g7-operational/disposable-target.ts ./server/g7-operational/disposable-target.ts
COPY --from=builder /app/src/server/g7-operational/preflight.ts ./server/g7-operational/preflight.ts
COPY --from=builder /app/src/deploy/g7-s3 ./deploy/g7-s3
COPY --from=builder /app/src/deploy/scene-assets ./deploy/scene-assets
COPY --from=builder /app/src/deploy/g7-runtime ./deploy/g7-runtime
COPY --from=builder /app/src/domain/auth.ts ./domain/auth.ts
USER cad
RUN ./node_modules/.bin/prisma --version >/dev/null \
    && ./node_modules/.bin/tsx --version >/dev/null \
    && node -e "const Database=require('better-sqlite3'); new Database(':memory:').close()" \
    && test -f /app/src/server/logging/store.ts \
    && node --import tsx --input-type=module -e 'import { writeLog } from "./server/logger.ts"; if (typeof writeLog !== "function") process.exit(1);' \
    && node --import tsx --input-type=module -e 'import { CAD_BUSINESS_DDL } from "./server/cad-business/schema-ddl.ts"; if (CAD_BUSINESS_DDL.length !== 11) process.exit(1);' \
    && node --import tsx --input-type=module -e 'import { CAD_ANCHOR_DDL } from "./server/cad-business/anchor-ddl.ts"; if (CAD_ANCHOR_DDL.length !== 3) process.exit(1);' \
    && node --import tsx --input-type=module -e 'import { CAD_MEMO_FEATURE_DDL } from "./server/cad-business/memo-feature-ddl.ts"; if (CAD_MEMO_FEATURE_DDL.length !== 6) process.exit(1);' \
    && node --import tsx --input-type=module -e 'import { OUTLINE_TYPE_DDL,LATEST_CAD_OUTLINE_DDL } from "./server/cad-business/schema-ddl.ts"; if (OUTLINE_TYPE_DDL.length !== 9 || !LATEST_CAD_OUTLINE_DDL.includes("outline_type_id") || !LATEST_CAD_OUTLINE_DDL.includes("OutlineType")) process.exit(1);' \
    && node --import tsx --input-type=module -e 'import { CAD_OUTLINE_RECEIPT_DDL } from "./server/cad-business/schema-ddl.ts"; if (CAD_OUTLINE_RECEIPT_DDL.length !== 6) process.exit(1);'
CMD ["./node_modules/.bin/tsx", "scripts/deploy.ts"]

# Default production image: Next.js standalone traced dependencies and static assets only.
FROM runtime-base AS runtime
ENV HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=cad:cad /app/src/.next/standalone ./
# better-sqlite3 and its glibc-linked native .node are traced into standalone
# by next.config.ts; a second explicit COPY would repeat the same paths in a
# new layer. Missing trace must fail image build, not trigger a full copy.
RUN test -f /app/src/node_modules/better-sqlite3/build/Release/better_sqlite3.node \
    && mkdir -p /app/src/.next/cache \
    && chown -R cad:cad /app/src/.next/cache \
    && node -e "const db=require('better-sqlite3');new db(':memory:').close()"
USER cad
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
