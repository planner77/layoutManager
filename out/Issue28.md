# Issue #28 — Docker 운영 이미지 경량화 및 Migration 분리

## #67 후속 — 웹 Standalone better-sqlite3 중복 전달 제거 (2026-10-25 / v0.38.1)

- #28의 `runtime`은 `next.config.ts.outputFileTracingIncludes`에 의해 `better-sqlite3` 전체/native binding을 이미 Standalone에 포함한다. 별도 Docker COPY 중복 가능성을 #67에서 제거하되 native `.node`와 Prisma 등 동적 경로는 build smoke 및 PR CI로 확인한다.
- 비교 기준은 동일 PR HEAD 소스·Node22.14/linux-amd64의 **PR base Dockerfile vs 개선 runtime Dockerfile**이다. 과거 #28 pre-standalone 2.05GB, #66 migrator 1.34GB를 감축률 기준선으로 재사용하지 않는다. `docker inspect .Size`(비압축), 실제 `docker save` TAR layer SHA/중복 raw bytes, `history`, asset raw/gzip(proxy), 출판된 버전+immutable digest의 OCI compressed layers는 별도 지표. 신규 측정/PR CI 전 **NOT VERIFIED**.
- fonts/Hangul glyph/typeface/LibreDWG JS/WASM/.next/static 제거 및 강제 subset 금지, 다른 앱/DB/migrator/Compose/GHCR pairing 불변. [Issue67](Issue67.md), [ADR-045](Decisions.md) 참조.


## #66 후속 — 이미 분리된 migrator만 추가 경량화 (2026-10-25)

- 원래 #28에서 측정한 **2.05GB baseline** 및 81.69% 감소는 **웹 이미지 standalone 최적화**의 당시 비교다. 후속 #66에서는 이를 migrator 절감률 분모로 사용하지 않는다.
- #66은 현재 별도 migrator의 전체 `node_modules` 복사(~1.34GB 로컬 이미지)를 별도 runtime 의존성으로 축소한다. #28에서 도입한 Compose `migrate` 성공 조건·/data·페어 태그/digest 후보 검증·런타임 앱 구성은 불변. 측정 방법/AC/OCI manifest 실제 다운로드량은 [Issue66](Issue66.md)를 기준으로 한다. 신규 PR CI 수치/릴리스 성공 전 NOT VERIFIED.

## 요구·설계/AC (2026-10-16)

현재 0.25.0 `main` (`d534ca8a58ae6f13fd9c5321ab8c5392559aa872`)을 기준으로 0.26.0의 운영 이미지 패키징을 개선한다. **30% 비압축 이미지 절감은 초기 목표(soft target)이며 최초 PR CI #30에서 81.69%를 측정했지만 전체 CI는 실패해 재검증 중**이다. 기존 /data SQLite·CAD 원본·hash·Version/Current, DXF/DWG Viewer·글꼴·WASM, local/S3 locator, non-root UID 10001, health endpoint, Secret/DB 이미지 제외는 불변조건이다.

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
| IMG-01 | baseline/phase1/runtime 이미지의 원시·gzip proxy size/레이어/플랫폼/절감률 | Docker `measure-images.sh` + PR CI Summary | CI #30 측정 PASS(81.69%); 최종 재측정 대기 |
| IMG-02 | web standalone/Native SQLite, static·Nanum font/license·DWG WASM·두 DXF viewer | TC-IMAGE-001/002; Docker curl/health; Browser E2E | CI 전 |
| IMG-03 | 빈 DB·기존 DB migration+backfill 성공 후 시작, 실패 시 차단, 재실행 | TC-IMAGE-003~007; Docker compose/legacy migration E2E | CI 전 |
| IMG-04 | local/S3 DB·파일/Current/hash와 보안 경계 유지 | 기존 unit/integration/E2E/S3; 운영 전 실제 볼륨 확인 | 운영 미검증 |
| IMG-05 | UID 10001, no secrets/tests/dev tools in app, GHCR paired tag/digest | Docker runtime/native/compose smoke; publish workflow | 게시 전 |

- 기준 문서: `AGENTS.md`, `Requirements.md`, `Architecture.md`, `Decisions.md`, `Operation.md`, `TestPlan.md`, `TestReport.md`, `ChangeLog.md`.
- 독립 QA 전용 모델 실행 권한이 없어 별도 QA 결과를 기록하지 않는다. 작성된 코드는 PR CI를 실행해 판정해야 한다.


## PR #29 CI #30 실패 및 P2 리뷰 보완 (2026-10-16)

- **근거**: GitHub Actions PR CI #30, run 38858349603 (head `ab02e281c8d8c70cfe473db7e8c24ed5772ebdfa`). Typecheck/Lint/Unit/Integration/Next Build/Browser E2E/Legacy Migration E2E 성공. Docker baseline/phase1/runtime/migrator 빌드·측정·의도적인 migration 실패 검사는 성공했으며, Docker Compose 신규 DB migrator의 6개 migration + backfill도 로그상 정상 완료.
- **CI 직접 원인**: `docker compose up -d --no-build app` 직후 Node 웹 서버 준비 전에 `curl`이 실행되어 `Recv failure: Connection reset by peer` (curl exit 56). `--retry-connrefused`만 설정한 이전 CI는 56을 재시도하지 않았다. 신규/재기동 health 요청 모두 `--retry-all-errors`, 요청/연결 시간 제한을 적용해 서비스 준비 대기를 보강했다. 이 로그만으로 앱 기능 결함 또는 DB migration 실패로 판정하지 않는다.
- **리뷰 P2 / GHCR**: 앱 정식 공개 태그를 먼저 push한 뒤 migrator target 빌드가 실패하면 두 이미지 릴리스가 엇갈릴 수 있었다. 두 이미지를 `build-<SHA>-app`/`build-<SHA>-migrate` 후보로 push하고 두 digest가 실제 레지스트리에 존재하는 것을 검증한 **다음** version/migrate/latest 별칭을 승격한다. publish workflow의 중간 취소도 방지한다. GHCR에 다중 태그를 일괄 원자적으로 전환하는 기능은 없으므로 운영 배포는 paired version/digest를 pin한다.
- **리뷰 P2 / tagless**: Docker Compose interpolation은 이미지 태그 자체를 인식·보정하지 못한다. `bash src/scripts/compose.sh .env <command>`는 `.env`를 source하지 않고 필요한 두 image 키만 읽으며 tagless app=`:latest` / migrator=`:latest-migrate`로 정규화한다. digest는 명시적 migrator 참조를 요구한다. raw Docker Compose에서 tagless를 사용하려면 `GHCR_MIGRATION_IMAGE`를 명시해야 한다.
- **측정 (비압축, 동일 linux/amd64)**: baseline 2,054,848,814 bytes / phase1 2,053,874,911 bytes / standalone runtime 376,228,092 bytes → **81.69% 감소**. `docker save | gzip -1` proxy: 625,871,345 / 625,636,529 / 139,214,422 bytes. 이는 GHCR OCI compressed size가 아니며 runtime/migrator 두 이미지 합산 전송량도 아니다. GHCR 배포 digest 및 최종 smoke PASS는 미확정이다.
- 신규 TC-IMAGE-010~012 및 release/Compose/운영 지침을 보강했다. **새 CI 실행의 실제 결과는 완료 전 PASS로 기록하지 않는다.**
