# Issue #28 — Docker 운영 이미지 경량화 및 Migration 분리

## 요구·설계/AC (2026-10-16)

현재 0.25.0 `main` (`d534ca8a58ae6f13fd9c5321ab8c5392559aa872`)을 기준으로 0.26.0의 운영 이미지 패키징을 개선한다. **30% 비압축 이미지 절감은 초기 목표(soft target)이며 실제 수치는 CI 실행 전 미확정**이다. 기존 /data SQLite·CAD 원본·hash·Version/Current, DXF/DWG Viewer·글꼴·WASM, local/S3 locator, non-root UID 10001, health endpoint, Secret/DB 이미지 제외는 불변조건이다.

### 구조·단계

1. **기준선**: PR CI가 원래 base commit Dockerfile을 같은 PR 소스·linux/amd64로 빌드하여 baseline을 측정한다. `docker image inspect`의 비압축 bytes, `docker history --no-trunc`, `docker system df -v`, `du`, `docker save | gzip -1`의 압축 tar *프록시*를 구별해 기록한다. tar gzip 수치는 GHCR OCI 압축 레이어와 동일하지 않다. digest는 게시 후 확인한다.
2. **Phase1**: `src/Dockerfile --target phase1`은 전체 소스/테스트/문서를 runtime에서 제거하되 기존 DB CLI·node_modules를 유지하는 비교 전용(비게시) 이미지다.
3. **Phase2**: `next.config.ts`에서 standalone 및 Prisma/native tracing을 설정한다. 빌드시 public Nanum TTF/OFL/파생 typeface, LibreDWG ESM/WASM, .next/static을 standalone에 모은다. `scripts/run.mjs start --port`는 PORT를 전달해 `server.js`를 실행한다. 기본 `runtime`은 standalone 및 네이티브 SQLite package만 복사하고 Prisma CLI·tsx·tests를 제외한다.
4. **독립 migrator**: 별도 `migrator` image는 기존 `prisma migrate deploy` → 삭제 비밀번호 backfill을 수행하는 일회성 job이다. Compose는 `service_completed_successfully` 이후에만 새 app을 시작하며 하나의 /data volume을 공유한다. Migration job에는 S3 Secret을 전달하지 않는다.
5. **GHCR/Compose**: 신규 설치 `docker compose up -d` 흐름을 유지한다. 동일 release에서 앱 `:0.26.0`/`:latest`, migration `:0.26.0-migrate`/`:latest-migrate`를 발행한다. `GHCR_IMAGE` tag에 기본 `-migrate` suffix를 사용하며 digest pin은 `GHCR_MIGRATION_IMAGE`를 명시한다.

### 업그레이드·실패 보호

운영 업그레이드는 DB/local CAD/S3를 **동일 시점 백업**하고 새 이미지 pull 후 **구 앱을 stop**한 다음 `docker compose up --no-build --force-recreate migrate`가 exit 0인 경우에만 `up -d --no-build app`를 실행한다. 구 앱 가동 중 migration 실행은 SQLite 동시 writer/스키마 불일치 위험이 있으므로 금지한다. 실패 시 앱 재기동을 차단하고 migrate 로그와 DB backup을 확인한다. 0.25.0 이전의 비호환 schema로 되돌릴 때는 과거 app과 **동일 시점 DB/CAD/S3 백업**을 함께 복원하며 `down -v` 사용을 금지한다. 운영 데이터에 대해 이 작업을 실행하지 않는다.

### 인수 기준과 검증 추적

| ID | 요구사항 | 테스트 및 증거 | 현재 |
| --- | --- | --- | --- |
| IMG-01 | baseline/phase1/runtime 이미지의 원시·gzip proxy size/레이어/플랫폼/절감률 | Docker `measure-images.sh` + PR CI Summary | 측정 전 |
| IMG-02 | web standalone/Native SQLite, static·Nanum font/license·DWG WASM·두 DXF viewer | TC-IMAGE-001/002; Docker curl/health; Browser E2E | CI 전 |
| IMG-03 | 빈 DB·기존 DB migration+backfill 성공 후 시작, 실패 시 차단, 재실행 | TC-IMAGE-003~007; Docker compose/legacy migration E2E | CI 전 |
| IMG-04 | local/S3 DB·파일/Current/hash와 보안 경계 유지 | 기존 unit/integration/E2E/S3; 운영 전 실제 볼륨 확인 | 운영 미검증 |
| IMG-05 | UID 10001, no secrets/tests/dev tools in app, GHCR paired tag/digest | Docker runtime/native/compose smoke; publish workflow | 게시 전 |

- 기준 문서: `AGENTS.md`, `Requirements.md`, `Architecture.md`, `Decisions.md`, `Operation.md`, `TestPlan.md`, `TestReport.md`, `ChangeLog.md`.
- 독립 QA 전용 모델 실행 권한이 없어 별도 QA 결과를 기록하지 않는다. 작성된 코드는 PR CI를 실행해 판정해야 한다.
