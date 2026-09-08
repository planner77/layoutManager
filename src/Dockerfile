# syntax=docker/dockerfile:1

# Node/배포 OS를 고정해 better-sqlite3와 Prisma native 구성의 재현성을 유지한다.
FROM node:22.14.0-bookworm-slim AS dependencies
WORKDIR /app/src
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY src/package.json src/package-lock.json ./
RUN npm ci

# Prisma Client, 한글 글꼴 JSON, LibreDWG ESM/WASM과 Next production bundle을 생성한다.
# 임시 경로는 build에만 쓰며 실제 DB/CAD 원본을 이미지에 포함하지 않는다.
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

# Prisma migration CLI와 native SQLite adapter가 필요하므로 검증된 node_modules를 함께 옮긴다.
# 앱 실행 계정은 영속 /data와 Next runtime cache만 쓰고 나머지 애플리케이션 파일은 읽는다.
FROM node:22.14.0-bookworm-slim AS runtime
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
    && mkdir -p /data/db /data/cad \
    && chown -R cad:cad /data
COPY --from=builder /app/src /app/src
RUN mkdir -p /app/src/.next/cache \
    && chown -R cad:cad /app/src/.next/cache
USER cad
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

# migration 성공 뒤에만 모든 인터페이스에서 production 서버를 연다.
CMD ["sh", "-c", "npm run db:deploy && npm run start -- --port 3000"]
