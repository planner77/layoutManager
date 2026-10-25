# Issue #66 — GHCR migrator 전용 의존성 경량화 (2026-10-25)

## PR #78 / 첫 CI 실패·보완 (2026-10-25)

- 첫 [Run 40167191799](https://github.com/planner77/layoutManager/actions/runs/40167191799) HEAD `45389a4661d`에서 Unit `TC-IMAGE-003` **1 FAIL/187 PASS**: 구 migrator `node scripts/run.mjs deploy` CMD 고정 문자열 기대가 새 단일 실행기 `tsx scripts/deploy.ts`와 충돌. 코드 기능 실패 아님(Docker Job 별도 성공). 기존 Unit을 stage/entrypoint/Compose 계약 기반으로 갱신하고 `TC-IMG66-010` Prisma→Backfill 순서 검증 추가. 수정 HEAD 재실행 결과는 아직 **미확인**.
- Docker Job `121090554257`는 전체 성공. **비압축 baseline 1,336,572,597 → optimized 578,862,325 bytes(56.69%)**, gzip proxy **462,720,650 → 212,574,989 bytes**. OCI GHCR 압축 층/다운로드 크기 아님. native/UID, 마이그레이션 신규+멱등, DB 쓰기 불가/invalid SQL 실패 및 app health 200 검증. Verify의 OCI parser·Build·Chromium E2E·Legacy는 **SKIPPED**.
- 실패 Run/Job/HEAD/수정/잔여 증거는 [FailureLedger](FailureLedger.md)에 누적 기록, [TestPlan](TestPlan.md)/[TestReport](TestReport.md)에 추적. GHCR 게시·운영 DB 복구·Legacy 검증은 미완이므로 Issue 유지.


**상태:** 첫 PR CI Unit 실패와 Docker Job 성공을 분리 기록하고 테스트를 보완하는 단계. 새 PR CI 결과, 운영 수용, GHCR 게시 결과는 **NOT VERIFIED**. 이 문서는 #28의 이전 웹 이미지 경량화와 구별되는 후속 이슈 추적 문서다. 기능 변경이 아닌 빌드 최적화 패치 버전은 `0.37.1`.

## 배경 및 기준선

- #28은 Next.js standalone 웹과 migrator 분리를 완료했다. #66은 **이미 분리된 migrator 이미지**에 전체 `node_modules`가 복사되는 문제만 다룬다.
- 선행 [CI 40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531) 관측값 migrator 약 **1.34 GB** 및 `node_modules` COPY 약 **1.1 GB**는 **linux/amd64 로컬 비압축 이미지**의 과거 스냅샷이다. 실제 GHCR OCI 압축 계층/다운로드량이 아니다. #66 PR CI Run 40167191799에서 같은 소스·Node·플랫폼의 재현 비교를 실제 수행했다(상단 실측 참고).
- 과거 #28의 **2,054,848,814 bytes**는 분리 **이전 웹 baseline**이다. migrator 절감률 분모로 쓰지 않는다.
- `src/scripts/deploy.ts`가 `prisma migrate deploy`와 `tsx scripts/backfill-delete-passwords.ts`를 순차 실행. backfill의 import closure는 `server/db.ts` → generated Prisma Client + `@prisma/adapter-better-sqlite3`/SQLite native, `server/backfill-delete-passwords.ts` → `server/password.ts` → `domain/cad.ts`, `server/logger.ts` → `package.json`; `scripts/env.mjs` → `dotenv`/`storage-config.mjs`. Prisma CLI의 `prisma/config`과 migrations/schema를 남겨야 한다.

## 설계 및 구현

1. `dependencies` 스테이지는 원래 `src/package-lock.json`으로 전체 `npm ci`하여 기존 web `builder/runtime`을 **불변**으로 유지한다. 새 `migrator-dependencies` 스테이지에서 `prepare-migrator-package.mjs`가 앱 package/lock에 고정된 정확한 버전으로 일회성 migrator `package.json`을 **파생**한다. 생성 manifest에는 `prisma`, `tsx`, `typescript`(Prisma peer 및 TS config), `@prisma/client`, `@prisma/adapter-better-sqlite3`, `better-sqlite3`(lock의 native 버전), `dotenv`만 직접 선언한다. 임의 `npm install`이나 별도 드리프트되는 lockfile은 사용하지 않는다.
2. 생성 manifest를 바탕으로 `npm prune --omit=dev --offline --legacy-peer-deps`를 실행한다. 기존 lock의 전이 의존성으로 유지하되 Prisma Studio의 migration 불필요 React peer를 자동 재설치하지 않도록 한다. Prisma CLI 자체가 내부 의존하는 `@prisma/studio-core` 등은 임의 삭제하지 않는다. `npm prune` 성공과 실제 CLI·SQLite 실행은 별도로 검증한다. 최초 `npm ci`에는 npm registry/cache가 필요하지만 **런타임/프루닝 시 추가 네트워크는 필요하지 않음**; 폐쇄망 이미지 Pull은 GHCR pair로 수행한다.
3. 최종 `migrator`는 이 단계의 node_modules/manifest와 **실제 실행에 필요한 서버·스크립트 파일만** 복사하고, 웹 `.next`, public/WASM, Viewer/Playwright/Vitest/Next/React/ESLint/CAD 모듈을 제외한다. Entrypoint `tsx scripts/deploy.ts`는 기존 migrator `deploy`와 동일하게 migration 성공 → backfill 성공일 때만 exit 0. native SQLite/Prisma CLI는 `USER cad`(UID 10001)에서 이미지 빌드 시 검사한다.
4. PR CI Docker Job은 `PR base Dockerfile --target migrator`와 새 migrator를 **같은 HEAD source**, Node 22.14.0, linux/amd64로 빌드해 `docker inspect Size` 비압축 bytes·`docker history --no-trunc`·`du` 및 top package·`docker save|gzip` proxy를 기록한다. **30% 감소는 soft target**, 미달 시 실제 측정으로 분석하고 기능/보안 게이트는 우회하지 않는다.
5. `measure-ghcr-pair.mjs`는 공개 **고정 version tag** 앱/migrator의 `docker buildx imagetools inspect --raw`에서 `linux/amd64` manifest만 선택한다. OCI **압축 layer.size의 단순 합**과 두 이미지 **digest 중복 제거 합/공유량**을 Main release Job Summary에 기록한다. `unknown/unknown` attestation, OCI index/manifest/config descriptor는 컨테이너 이미지 다운로드량에 합산하지 않는다. `docker save gzip`는 별도 proxy다.
6. `migrate` Compose 서비스, 성공 의존 `service_completed_successfully`, `/data` volume, 10001, Debian glibc/OpenSSL/CA, S3 credential 미전달, tagless/digest pairing 및 candidate→pair digest 검증→공개 tag 순서는 변경하지 않는다. Prisma Schema/DB Migration, CAD 원본, API·Viewer는 **수정하지 않는다**.

## AC / Test Trace

| AC | 테스트·증거 | 현재 |
| --- | --- | --- |
| 66-01 전후 비압축·상위 패키지·history/du·gzip proxy | TC-IMG66-001, CI Docker Summary | 1차 Docker PASS (56.69%), 후속 HEAD 미검증 |
| 66-02 공개 GHCR linux/amd64 layer 합·중복 제거 | TC-IMG66-002, manifest parser Node test, Main publish step | Parser 테스트 실행 전 / 게시 전 |
| 66-03 불필요 dev/web/browser 제외+필수 CLI/native | TC-IMG66-003, stage `--verify`, Docker UID/파일/SQLite | 1차 Docker PASS, 후속 HEAD 미검증 |
| 66-04 빈 DB 설치·health 200·재실행 멱등 | TC-IMG66-004, Compose fresh install/smoke 재사용 | 1차 Docker PASS, 후속 HEAD 미검증 |
| 66-05 기존 schema upgrade/Version·Current·hash 보존 | TC-IMG66-005, 기존 Legacy Migration E2E + 격리 DB 검증 | NOT RUN; 운영 DB 실측 별도 |
| 66-06 쓰기 불가·잘못된 SQL exit nonzero, 앱 기동 차단 | TC-IMG66-006~007, `/proc`/임시 invalid migration/Compose dependency | 1차 Docker PASS, 후속 HEAD 미검증 |
| 66-07 /data, CA, UID, Secret 경계 | TC-IMG66-008, Dockerfile/Compose + 네이티브 Smoke | 1차 Docker native/UID/Compose PASS; 운영 CA 실증 미완 |
| 66-08 OCI paired version/latest/digest/rollback | TC-IMG66-009, release Job 및 Compose shell 검증 | NOT RUN |

## 개발 검증과 운영 안전

- 코드 작성만으로 절감률·Prisma CLI 동작·Docker build 성공·GHCR 게시 성공을 주장하지 않는다. 현 접속 환경의 로컬 재현 환경은 실행하지 않았으며 **PR CI 결과**와 **릴리스 후 GHCR manifest 관측**이 각각 필요하다.
- 기존 운영 데이터/원본은 변경하지 않는다. 업그레이드 시 **동일 시점 DB/CAD/S3 백업·복구 점검 → 구 앱 writer 정지 → 동일 버전 migrator exit 0 → 앱 기동/health 확인**. 실패하면 앱 기동 보류, 로그/backup 점검. 이전 app+과거 DB 스키마 조합으로 임의 재시작 금지, `docker compose down -v` 금지.
- `0.37.1` GHCR 두 version tag 및 두 최신 별칭은 Main CI가 실제로 candidate pair 승격할 때만 존재한다고 판정할 수 있다. PR CI 성공만으로 게시·이슈 종료하지 않는다.
- 재현·복구 명령과 롤백 기준: [Operation](Operation.md). 이전 baseline 정의: [Issue28](Issue28.md). 중요 설계 판단: [ADR-043](Decisions.md).
