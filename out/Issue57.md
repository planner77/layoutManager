# Issue #57 — 공통 Logger·업로드 진단 출력 단일화 (L1)

- Parent: [#50](https://github.com/planner77/layoutManager/issues/50); predecessor: [#18](https://github.com/planner77/layoutManager/issues/18), PR #20; source baseline `main@338e1097` (2026-10-27).
- `DESIGN.md`는 저장소에 존재하지 않는다. `AGENTS.md`, `out/{Architecture,Decisions,Requirements,Logging,TestPlan,Operation}.md`와 #50/#57을 기준으로 한다.
- L1은 **기존 구조화 Logger 재사용**만 수행한다. DB/로그 보관·조회 API/UI(#59/#61/#62), 접근 제어(#60), API/maintenance 전체 계측 확장(#58), 원시 로그 수집(#63), CAD/Viewer/Prisma/G7 운영 변경은 제외한다.

## 1. 발생 위치 및 변경 영향 범위

| 분류 | 위치 | 기존/변경 |
| --- | --- | --- |
| app-owned emitter | `src/server/logger.ts` | 기존 `writeLog`만 stdout/stderr 출력; v1 schema/필드 허용목록·error 재정제 적용 |
| 업로드 단계 | `src/server/upload-observability.ts` | 별도 console JSON 삭제→`writeLog` 사용; 동일 ID·첫 실패·stage/elapsed/category/recoveryId/backend 유지 |
| API | `src/app/api/cad-files/{route.ts,[versionId]/route.ts,[versionId]/content/route.ts}` | GET/POST/DELETE/Content 모두 `RequestLogContext`; POST만 `UploadDiagnostics` 연동; 응답 계약 불변 |
| API | `src/app/api/cad-locations/[locationId]/{route,current/route,reclassify/route}.ts` | Detail/Current/Reclassify `RequestLogContext` 유지 |
| API | `src/app/api/masters/{route,[type]/[id]/route}.ts` | Master GET/POST/PATCH/DELETE `RequestLogContext` 유지 |
| API | `src/app/api/health/route.ts`, `src/server/http.ts` | Health 정상(200) 시작·종료 debug로 억제, 503 error 보존; `failure` 공개 DTO 및 `X-Request-Id` 불변 |
| Service/Storage | `src/server/services/upload.ts`, `src/server/storage/{cad-storage,s3-storage,configured-storage}.ts` | DI `UploadDiagnostics.record` 호출; console 직출력 없음, 최초 stage 실패 우선 |
| maintenance | `src/scripts/{db-check,storage-cleanup,backfill-delete-passwords}.ts` | 기존 `writeLog` 유지, jobId/jobCount 안전한 정형 필드 |
| 수동 실행/CI CLI | `src/scripts/{run,g5-preview-smoke,measure-ghcr-pair}.mjs` | 일부 catch에서 원시 Error/메시지 console 출력→고정 오류 텍스트로 보완; 앱 JSON emitter 대상은 아님 |
| 수동 실행/CI CLI | `src/scripts/{dwg-samples,prepare-migrator-package,test-s3,auth-g2-isolated,g6-evidence,g7-s2-readiness,g7-staging-admin,g7-staging-prepare,verify-outline-acceptance}.*` | 작업 결과·격리 증거·실행 환경용 CLI stdout; app runtime 수집 아님. 비공개 경로/근거는 GitHub/CI artifact로 반출 금지 |
| 외부/Client | Next.js, Prisma, 타사 라이브러리 원시 stdout, Windows Nginx, Docker, 브라우저 `console` | 앱 JSON Schema v1 범위 밖. 중앙 수집 및 인증된 조회는 후속 #59~#63 |

## 2. 이벤트·필드 계약 (Schema v1)

모든 **app-owned JSON** 이벤트는 한 줄 JSON이다. 필수: `timestamp` (UTC ISO8601), `schemaVersion:1`, `level`(debug/info/warn/error), `event`(snake_case), `component`, `operation`, `appVersion` (배포 `package.json` 버전). 선택 공통: `requestId`, `jobId`(서버 UUIDv4), `outcome`(started/success/warning/failure), `elapsedMs`(정수 ms, 0~86,400,000), `httpStatus`(100~599), `errorCode`(안전하게 선언된 머신 코드).

| 승인된 확장 | 값 | 누락/유출 차단 |
| --- | --- | --- |
| `method` | GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS | 기타 메서드 무시 |
| `route` | 알려진 API route 템플릿; 미지 route는 `/api/other` | 실제 UUID/파일명·query 원문 없음 |
| `stage` | 업로드 단계 10종 | 임의 문자열 거절 |
| `backend` | local/s3 | 버킷/Locator 생략 |
| `recoveryId` | UUIDv4 | Storage locator 자체 생략 |
| `status` | 100~599 | 기존 업로드 stage 이벤트 호환용 |
| `jobCount` | 0~1,000,000 정수 | 집계값만 |
| `error` | name, 안전 error code/category/message, 선택 httpStatus/recoveryId/최대 2중첩 cause | 원시 Error.message/stack/path/bytes 및 임의 개체 필드 폐기 |

- emitter가 `timestamp`, `level`, `event`, `schemaVersion`, `appVersion` 값을 소유한다. 주입 필드로 덮어쓰기 불가. 선언되지 않은 속성은 emit하지 않는다. 알 수 없는 error category/message와 임의 Error stack은 폐기하고 정적 error catalog에서 재생성.
- `http_request_started`/`http_request_completed`/`http_request_failed`는 HTTP lifecycle; `cad_upload_request`/`cad_upload_stage`/`cad_upload_completed`는 업로드 단계 및 최종 원인이다. 용도가 다른 이벤트를 잘못 중복으로 간주하여 삭제하지 않는다. 반면 동일 업로드 실패 stage는 한 번만 기록, 첫 실패가 `cad_upload_completed`까지 유지된다.
- `LOG_LEVEL=warn`에서 `debug/info` 생략, `warn→console.warn`, `error→console.error`. `LOG_FORMAT=json`은 JSONL, `pretty`는 진단용 한 줄. 정상 Health 200은 debug-only; 다른 API start/end는 info 유지.
- **버전 전략:** 영속 reader(#59/#61)는 `schemaVersion`을 기준으로 파싱하며 미지원 버전은 거부/격리한다. 안전한 옵션 필드 추가는 문서와 reader/test 계약 검토, 기존 필드 의미·타입 변경은 새로운 version이 필요하다. 원시 Next/Nginx/Browser 로그는 v1로 간주하지 않는다.

## 3. 수용 기준 연결

| AC | 자동 점검 | L1에서 미수행/보류 |
| --- | --- | --- |
| AC1 RequestId/API DTO 무회귀 | TC-LOG-004, TC-OBS-001~007, Upload/Delete/Health tests | 실제 현장 2대 PC·Docker smoke |
| AC2 단일 emitter/LOG_LEVEL/FORMAT | TC-L1-001, TC-L1-003~004, 기존 logger tests | 실 운영 적용 |
| AC3 한 줄 JSON/필드 규약/coverage 구분 | TC-LOG-001, TC-L1-002, 위 발생 위치 표 | Next/Nginx raw capture |
| AC4 비밀·Error·경로·bytes 차단 | TC-L1-002/003, TC-LOG-003/005 및 Upload sanitizer | 실제 비공개 CAD/Secret 입력 금지 |
| AC5 기능/DB 불변 | 기존 Unit/Integration/E2E·Typecheck/Lint/Build, changed paths review | DB migration/Viewer/G7 Auth 직접 변경 없음 |

테스트와 PR CI 실행 여부/결과를 구분한다. Source 작성만으로 PASS가 아니다. 실패한 Run/Job 또는 실제 review/thread/충돌 해결 시 `out/FailureLedger.md` 누적 기록; 미관측 실패를 만들어 기록하지 않는다.

## 4. PR #134 최초 Docker CI 실패·축소 Migrator 의존성 계약 (2026-10-27)

- [Run 40418875931](https://github.com/planner77/layoutManager/actions/runs/40418875931), HEAD `1a5c265`: Verify success, Docker Step 16 failure. Prisma SQL은 실행됐지만 후속 `backfill-delete-passwords.ts`가 Logger import 도중 축소 이미지에서 `upload-error-catalog.ts`를 찾지 못해 `ERR_MODULE_NOT_FOUND`·backfill exit 1. [Codex P1](https://github.com/planner77/layoutManager/pull/134#discussion_r4383549858)은 같은 누락을 지적.
- **배포 불변식:** `server/logger.ts`에서 상대 모듈 import 추가 시 `src/Dockerfile` Migrator stage에 해당 모듈을 명시적으로 COPY해야 한다. `TC-LOG-MIG-001` 정적 import closure와 Migrator build/PR CI 실제 Node+tsx import 사전검증을 통해 DB/Compose 이전에 누락을 차단한다. 전체 Server 복사·기존 migration 활성화·G7 운영 변경 없음.
- 재시도 최신 HEAD의 CI 완료/성공은 별도 확인 전 `NOT VERIFIED`. 최초 실패 Run과 조치는 [FailureLedger](FailureLedger.md), 시험 매핑은 [TestPlan](TestPlan.md)를 따른다.
