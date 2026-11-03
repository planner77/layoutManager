## #218 / CI #525 — 중복 browser 초기화 RegExp 오류와 재사용 경로 구분 (2026-11-03)

[PR CI #525](https://github.com/planner77/layoutManager/actions/runs/41567538237)에서 `BROWSER_MAJOR_153` 뒤 `SYNTAX_INVALID_REGEXP`이 재발, 기존 RegExp/버전 가설을 수정. 원본 error pattern/소스는 로그 redaction으로 미확정; 실제 DXF 파싱까지 가지 않았다. 신규 A2 harness는 기존 `scene-poc-browser.ts`의 DXFViewer/serializer/restore 코드를 CPU proof 안에서 사용하고, 허용된 `A2_HOST_PHASE` milestone, Source/DTO/node/geometry/latency 등 **공개 합성 데이터 기반 계측만** 출력. 실제 CAD bytes/원본 SHA/경로·Browser error 전문/로그 stack/자격정보는 노출하지 않는다. 이 Test 로그는 운영 requestId/JobId/G7 Audit의 대체가 아니며 기존 READY 후보 검증 계약을 완화하지 않는다.

---

## #218 / CI #506 — Browser SyntaxError 안전 진단 구체화 (2026-11-03)

[PR CI #506](https://github.com/planner77/layoutManager/actions/runs/41561632191) A2 Job에서 `HARNESS_SCRIPT_REQUESTED` 이후 `PAGEERROR_SYNTAX`가 기록되어 브라우저 번들 실행 단계에서 Fail-closed. 원본 JavaScript 에러 문장/stack은 보안상 기록하지 않아 SyntaxError 실제 토큰은 미확정. 신규 계측은 `SYNTAX_HTML_AS_SCRIPT/UNEXPECTED_EXPORT/MODULE_MISMATCH/TRUNCATED_SCRIPT/DUPLICATE_IDENTIFIER/INVALID_REGEXP/UNEXPECTED_IDENTIFIER/INVALID_TOKEN/UNEXPECTED_TOKEN/OTHER_SYNTAX` allowlist 및 *synthetic JS URL `__a2.js`와 일치하는* 숫자 line/column만 출력. `vm.Script` compile-only 실패는 `A2_BUNDLE_STATIC_SYNTAX_INVALID`; UI/Error 텍스트나 실제 CAD·URL·SHA/포맷·로그 원문은 누설 금지. 운영 JobLogContext·S3/Scene Audit와 독립이며 CI PASS/GO 동등 증거 아님.

---
## #218 P1-A2 — CI #495 시작 시 PAGEERROR_OTHER를 즉시 안전 실패로 보고 (2026-11-03)

[Run41558698574](https://github.com/planner77/layoutManager/actions/runs/41558698574)에서는 Chromium launched 후 `HARNESS_NAVIGATE_START → PAGEERROR_OTHER → A2_TIMEOUT:HARNESS_READY`; 모호한 OTHER만 남고 DXF parser에는 진입하지 않았다. 수리로 pageerror 발생 시 `A2_HARNESS_PAGEERROR:<allowlisted-category>`를 Playwright Host의 `Promise.race`로 즉시 FAIL 전달. `CRYPTO_RANDOMUUID/INSECURE_CONTEXT/MODULE_SHIM/WEBGL/TYPE/SYNTAX/REFERENCE/OTHER`만 출력, Error 원문·stack·URL·DXF bytes/handle/SHA·font/보안 값 노출 금지. `HARNESS_SCRIPT_REQUESTED`, SecureContext/UUID assertion 및 기존 phase/timing, CPU cgroup 제한을 유지. 이 로깅은 실험적 합성 Proof 진단이며 운영 JobLogContext/G7 감사/실질 GO 증거가 아니다.

---

## #218 P1-A2 — CI #485 내부 단계 미관측 timeout을 안전 phase 진단으로 보완 (2026-11-03)

[Run41555129727](https://github.com/planner77/layoutManager/actions/runs/41555129727) CPU proof에서 180s timeout이 발생했지만 기존 합성 DXF 처리 내부 단계는 stdout에 없었다. 원인 파악을 위한 실험성 `A2_HOST_PHASE`와 `A2_PHASE` 마커를 allowlisted SOURCE/WEBGL/DXF_PARSE/SCENE_PREFLIGHT/TAG/TEXT_INDEX/CUSTOM_DTO/FULL_VALIDATOR/RESTORE/RENDER 단계로만 출력한다. Node watchdog은 launch/navigation/evaluate 기한 초과 시 `A2_TIMEOUT:NAME:LAST_PHASE=...` 안전 오류로 실패한다. PageError는 클래스만, resource 실패는 allowlisted 범주만 보고하고 **원본 DXF·소스 SHA·Font bytes·임의 URL·내부 예외/Stack은 출력하지 않는다**.

현재 실제 hang 위치 미확인, 새 CI 미실행. 이 마커는 `SceneBuildJob` 영속 단계 로그나 운영 JobId/requestId/Audit가 아니며 P1-A2 GO 근거로 단독 사용 금지. Deadline/비동기 오류를 없애거나 READY로 간주하는 의미가 아니다. [Issue218](Issue218.md), [FailureLedger](FailureLedger.md).

---

## #218 P1-A2 — 합성 Headless 실행 증거와 운영 Job 로그 분리 (2026-11-03)

A2 전용 시험은 성공 시 synthetic-only entity/node count, DTO byte length, elapsed parse/serialize, SwiftShader renderer 식별 및 late pageerror count를 출력한다. 실제 CAD bytes/SHA/원본 문장/내부 파일 경로·토큰·세션·사용자 식별정보를 출력하지 않는다. `pageerror`를 600ms 창에서 수집하지만 이것만으로 모든 잠복 unhandled rejection·프로세스 종료 이후 오류를 배제할 수 없다. 타임아웃/컨테이너 실패/검증 불일치는 CI 실패로 남기고 숨기거나 PASS 처리하지 않는다. 실제 로깅 수치와 RUN/HEAD는 실행 후만 원장에 반영.

P1-A1의 [CI #457](https://github.com/planner77/layoutManager/actions/runs/41520729471) Node direct async 4건 NO-GO는 기존 기록 그대로 유지. 현재 `JobLogContext`, requestId↔jobId, lease/attempt 오류 추적, Actor revoke 및 logs:read 공개 정책은 production P1-B/C 책임으로 미구현. [Issue218](Issue218.md), [FailureLedger](FailureLedger.md).

---

## #208 CI #457 — Promise 완료와 unhandled rejection을 구분한 Scene 진단 계약 (2026-11-03)

`three-dxf-viewer@1.0.44`의 직접 Node `getFromPath`가 962 assertion PASS 상태에서도 WMF/RTF 관련 `window is not defined` 4개의 **unhandled rejection**을 Vitest에 남겼다. 이 비동기 오류는 기존 try/catch의 밖이므로 `ARTIFACT_READY`/DTO SHA만으로 Server Worker's 실제 READY를 주장하지 않는다. `probeNodeScene`은 Node에서 upstream 호출 전에 `DXF_PARSE/SCENE_CONVERTER_UNAVAILABLE`의 안전한 코드로 fail-closed. UI/운영 로그에는 raw stack, Source/CAD/Handle/path/token/글꼴 bytes를 노출하지 않는다.

후속 Headless/Node 파서 실증에서는 작업 종료 후 비동기 오류, 지연된 exception, abort/cancel/timeout·OOM까지 Worker Job의 결과/첫 실패·stage/elapsedMs와 연결해야 하며, subprocess crash/async failure를 성공 ACK로 전환하지 않는다. 현재 JobLogContext/업로드 Job ID/server state 연결과 P1-B/C 구현 없음. 이전 #212 브라우저 SceneBuildTracker는 별도이며 실제 서버 `CurrentScene READY`는 저장 데이터 검증만으로 결정. [Issue208](Issue208.md), [TestReport](TestReport.md), [FailureLedger](FailureLedger.md).

---

## #208 P1-A — 서버 변환 실험의 오류·로그 경계

Node PoC는 `NodeScenePocError.phase/code`만 반환하고 upstream exception, CAD 원문·개인/사이트·Source SHA·font path·stack을 출력하지 않는다. `scene-build-job.ts`는 단일 버전 taxonomy/allowlist 및 UNKNOWN 보존을 제공한다. 실험 코드가 Worker Job log/성능 metric을 구현했다는 뜻이 아니다. P1-B 이후에만 JobLogContext의 requestId↔jobId, stage 시작/종료 UTC·elapsedMs, mandatory/optional warning, bounded attempt history/오류 원인 분류를 기존 로거와 연계한다. 공개 목록은 jobId/actor/error 원문 비노출, 운영 raw timeline은 logs:read 유지. [Issue208](Issue208.md).

---

## #212 — 수동 브라우저 Scene 단계 진단 (2026-11-02)

`ViewerMetric.sceneBuild`는 browser-local `status/phase/steps{phase,outcome,elapsedMs}/stats`의 **정제된 숫자/코드**만 추가한다. `adapter-load:LOAD` 대신 검증된 `SceneBuildError`는 allowlisted `SCENE_*` reasonCode와 실제 phase를 표시한다. `getFromPath`는 font fetch, parse, geometry가 결합되어 있으므로 generic `SCENE_CONVERTER_UNAVAILABLE`로만 기록; 원인을 특정하지 않는다. `OPTIONAL_OUTLINE_INDEX` timeout은 warning이고 Scene Artifact의 필수 성공·실패와 분리한다. Client Error.cause 원문/stack/파일명/원본 텍스트/Handle/SHA/site/token은 metric·download JSON·Log API로 전달하지 않는다. Browser client metric은 서버 `RequestLogContext`/operation JobLog가 아니고 `requestId/jobId`를 추정·생성하지 않는다. 서버 #208 전용 영속 Job 시도/로그/상관 ID는 별도 구현. [Issue212](Issue212.md).

---

## 0.54.1 UI 타임라인 오류 복구 — Epic #50

운영 로그 화면에서 목록 조회와 동일 requestId/jobId Timeline 조회는 별개로 권한 확인을 받는다. Timeline 요청만 410 cursor 만료이거나 503 LOG_STORE_UNAVAILABLE로 확인된 경우 이전 타임라인 단계 및 페이지를 제거하고 오류를 표시하며, 성공·인가 완료된 메인 목록은 유지하여 사용자가 상관 ID를 다시 조회할 수 있도록 한다.

401/403 인증·권한 실패, G7_RUNTIME_UNAVAILABLE 및 분류 불가/응답 이상/네트워크 오류는 기존처럼 메인 목록·상세·타임라인을 전부 제거한다. 이 분리는 사용자 편의/UI 표시 정책만 변경하며 서버의 권한 재검사, 접근 감사, 캐시 차단, 원시 로그 수집 범위 및 저장소 보존 정책을 변경하지 않는다. 실제 자동 시험은 TestReport 확인 전 NOT VERIFIED.

---

## R1 #60/#61/#62 — 권한 있는 정제 로그 조회 (0.49.0 후보)

`GET /api/operations/logs`는 G7 활성 authority와 HttpOnly 서버 세션, Admin 역할 및 별도 `logs:read` 특별 권한을 기존 G4와 감사로 확인한 뒤만 `/data/logs`를 읽는다. Site CAD 쓰기 권한으로 대체하지 않으며 익명 CAD 읽기 예외를 로그로 확대하지 않는다. `/api/operations/logs/access`는 인가 결과만 반환하고 저장소를 읽지 않는다. `/operations/logs`는 Node Proxy에서 같은 인가를 실행해 직접 URL/RSC/prefetch도 401/403/429/503과 no-store로 거절하며, 허용된 요청은 Page/API에서 다시 확인한다. 과거 HTTP200 안내 제한은 이 구현으로 대체되었다.

기간(from/to UTC), level/event/operation/component/source/outcome/requestId/jobId/errorCode는 AND 조건이다. 기본 1시간, 최대 24시간, limit 기본50/최대100. UI는 현지 시각 입력을 UTC로 변환하며 같은 requestId/jobId의 기간 내 이벤트를 시간순으로 다시 조회한다. 조회/타임라인은 각각 이전 요청을 취소하고 화면 이탈 때 해제한다. 자동 polling/원시 파일·stack·오류 원문·export는 지원하지 않는다. 모든 API 응답은 private,no-store이며 cursor가 인가를 대신하지 않는다.

읽기 상한·snapshot 수명/메모리·손상 행 정책의 단일 설계는 Architecture의 R1 절을 따른다. 조회는 실시간 무한 스트림이 아니며 새 append는 새 검색에서 반영한다. `partial`/skippedLines/scanTruncated는 결과 누락 가능성을 표시한다. 410이면 첫 페이지 재검색이 필요하다. 로그 저장이 꺼져 있을 때 `disabled`이며, 정상 0행·IO 실패와 구분한다. 기존 logger 및 저장소 정책·운영 로그 보관 설정은 그대로 유지한다. 운영 권한 설정/현장 인수·배포는 별도로 수행한다.

# Structured Logging 운영 가이드

## #59 로그 영속 저장 CI 배포 회귀 보완 (2026-10-31)

- [Run 41202514157](https://github.com/planner77/layoutManager/actions/runs/41202514157): 저장소 보안 정책은 `0700` 고정. ENOSPC 합성 테스트에서도 유효한 비공개 디렉터리에서 IO 실패만 재현해야 한다.
- Migrator는 `server/logger.ts`의 정적 `server/logging/store.ts` 의존성을 runtime closure에 명시적으로 포함해야 한다. 후보 Dockerfile·CI 기준 이미지의 source contract를 구분해 검사하고, 신규 성공 검증 전 GHCR / 배포 성공으로 간주하지 않는다. [상세 원장](FailureLedger.md).

## PR #179 — JSONL writer/UploadStage failure correction (2026-10-31)

- Run 41194360963 failed TS2345 in server/http.ts:20: generic RequestLogContext.currentStage is not an UploadStage. UploadDiagnostics receives the explicitly typed upload stage only.
- The writer checks open FD nlink/dev/ino and its pathname to reopen after external pruning; 10000+ rotation suffix remains visible to inventory/read/retention, and prune(0) honors exact maxFiles. Related tests TC-L2-004, TC-L3-007..009. Shared quota and inode check/write are still not cross-process atomic; corrected CI/field volume evidence unverified. See FailureLedger.md.

---


## #58/#59 L2 phase diagnostics and L3 private store (2026-10-31)

The L1 emitter is still the single output owner. New http_request_stage and maintenance_job_* events correlate safe stage/outcome/elapsedMs with server-issued requestId/jobId. Health failure is sampled and recovery recorded once. Only verified 40-hex release commit can be logged as buildRevision. Optional private /data/logs JSONL (Compose enabled) is independent of Docker logs; file 4 MiB, total 64 MiB, 7 days, queue 1 MiB by default; UID10001, directory 0700 and file 0600. The sink drops on IO failure rather than interrupting CAD/DB business processing. No HTTP log-reading API or automatic raw Next/Docker collection. Cross-process aggregate budget is best-effort. Details: [Issues58-59](Issues58-59.md).


## Issue #57 L1 — app 소유 Schema v1·단일 출력 (2026-10-27)

- 기존 `src/server/logger.writeLog`만 구조화 JSON을 stdout/stderr로 출력한다. `UploadDiagnostics`도 `LOG_LEVEL`/`LOG_FORMAT`을 공유한다. `warn→console.warn`, `error→console.error`, `debug/info→console.log`; production은 `LOG_FORMAT=json` 한 줄 권장.
- 필수: `timestamp`, `schemaVersion:1`, `level`, `event`, `component`, `operation`, `appVersion`. 선택: `requestId/jobId/outcome/elapsedMs/httpStatus/errorCode`; 선언 확장: `method/route/stage/backend/recoveryId/status/jobCount/error`. 동적 경로·파일명·Locator/stack/임의 Error message·credentials·CAD bytes는 emit하지 않는다.
- 성공 Health 200의 start/end는 debug로 기록하여 `LOG_LEVEL=info`에서 억제하되 실패 503 error는 보존. 다른 API start/end와 업로드 stage·first failure는 동일 `X-Request-Id`로 상관 분석한다. Next.js/Prisma/Nginx/Docker/Browser/수동 CLI 출력은 별도 소스이고 v1 Schema 준수·웹 조회가 보장되지 않는다. 보관·조회와 권한은 후속 #59~#62.
- 현행 발생 위치 목록, stage별 Event 및 Schema 버전 정책은 [Issue57](Issue57.md), [ADR-054](Decisions.md), [TestPlan](TestPlan.md) 참조.


## Issue #31 P4-D0 — 감사와 운영 로그의 책임 경계 (설계, 2026-10-25)

- Owner는 앱 로컬 계정·서버 세션과 담당 Scope 공동 편집을 작업자 식별·변경 이력 목적으로 선택했다([ADR-048/049](Decisions.md)); 웹 인증/로그 조회 API는 아직 미구현. HTTP 사내 LAN의 전송 위협은 보안·감사 주체 신뢰 수준의 제한이며 앱 로그 자체가 전송 암호화를 제공하지 않는다.
- 향후 `AuditEvent`는 사용자ID/작업종류/대상ID/Site·Version/UTC/before·after revision/결과/requestId 등을 DB의 삭제·업무 변경과 원자적으로 보존한다. 반면 현재 `src/server/logger.ts` 구조화 stdout/stderr은 장애 진단용이며 장기 불변 감사 원장으로 혼동 금지. 원시 CAD Geometry/비밀번호/세션 토큰/검색 내용 로그 금지.
- 감사 보존 기간·조회권한과 로그 `logs:read` 전용 권한은 별도 미확정/이슈 #60 범위다. 해당 승인 및 구현·검증 전 로그 운영자 조회 API/접근을 활성화하지 않는다. 현재 이 문서 변경은 코드·DB·logger 동작을 수정하지 않는다.


기준일: 2026-09-18  
적용 버전: 0.23.0 (`v0.23.0`, GitHub Issue #18 / PR #20)

## 목적

개발 중 상태 확인과 Docker 운영 중 장애 추적을 동일한 로그 구조로 수행한다. 애플리케이션은 stdout/stderr에 한 줄 JSON을 출력하며 Docker `local` logging driver가 이를 보관한다. Loki, OpenSearch 등 중앙 로그 수집기는 이번 범위에 포함하지 않지만 JSON 구조는 후속 수집에 사용할 수 있다.

## 환경 설정

Root `.env`에서 다음 값을 설정한다.

```env
LOG_LEVEL=info
LOG_FORMAT=json
```

- `LOG_LEVEL`: `debug`, `info`, `warn`, `error`. 미지정 또는 잘못된 값은 `info`.
- `LOG_FORMAT`: `json`, `pretty`. Docker/production은 `json` 권장.
- Compose는 값을 앱 컨테이너의 runtime environment로 전달한다. 로그 레벨 변경은 image rebuild가 아니라 container 재생성/재시작으로 적용한다.

운영 기본값은 `info + json`이다. 장기간 `debug` 사용은 로그량을 증가시키므로 재현이 필요한 시간 범위에서만 사용한다.

## 공통 필드

주요 서버 로그는 상황에 따라 다음 필드를 사용한다.

| 필드 | 의미 |
| --- | --- |
| `timestamp` | ISO-8601 UTC 시각 |
| `level` | debug/info/warn/error |
| `event` | 안정적인 이벤트 이름 |
| `appVersion` | `src/package.json` 버전 |
| `requestId` | 서버가 생성한 요청 UUID |
| `component` | 예: api, maintenance |
| `operation` | 예: cad_list, cad_upload, cad_delete |
| `method` / `route` | HTTP method와 pathname. query 원문은 기록하지 않음 |
| `httpStatus` | 응답 상태 |
| `outcome` | started/success/warning/failure |
| `elapsedMs` | 요청 또는 작업 경과 시간 |
| `errorCode` | 애플리케이션이 명시적으로 부여한 안전한 원인 코드 |

모든 필드를 모든 event에 강제하지 않는다. API lifecycle은 `requestId`, method, route, elapsedMs를 중심으로 연결한다.

## 주요 이벤트

- `http_request_started`: 주요 API 요청 진입
- `http_request_completed`: 정상/경고/실패 처리 종료
- `http_request_failed`: API 오류. 공개 응답보다 제한된 내부 진단 정보를 기록
- `cad_upload_*`: 기존 업로드 단계 진단. 공통 API lifecycle과 동일 requestId 사용
- `cad_delete_cleanup_pending`: DB 삭제는 확정됐지만 storage 정리가 지연됨
- `cache_revalidation_failed`: 업무 처리는 확정됐지만 Next cache refresh가 실패함
- `health_check_failed`: readiness 확인 실패
- `storage_cleanup_*`: 삭제 정리 maintenance 작업
- `delete_password_backfill_*`: 삭제 비밀번호 backfill maintenance 작업
- `database_check_*`: DB 연결 확인 maintenance 작업

`warning`은 확정된 핵심 업무 결과를 되돌리지 않지만 후속 조치가 필요한 상황을 의미한다. 예를 들어 삭제 API 202는 목록상의 삭제가 완료됐으나 원본 storage 정리가 대기 중일 수 있다.

## requestId로 장애 추적

API 응답은 `X-Request-Id`를 반환한다. 오류 응답 JSON의 `error.requestId`, 업로드 성공 JSON의 `requestId`, 서버 로그의 `requestId`를 서로 대조한다.

최근 30분 로그를 파일로 수집한다.

```bash
docker compose --env-file .env -f src/docker-compose.yml logs \
  --since 30m --timestamps --no-color app > incident.log 2>&1
```

특정 요청을 검색한다.

```bash
rg '요청-ID' incident.log
```

`rg`가 없으면 다음처럼 확인한다.

```bash
grep -F '요청-ID' incident.log
```

앱에 도달하기 전 Nginx/네트워크 단계에서 실패한 요청은 서버 requestId가 없을 수 있다. 이 경우 발생 시각, Windows Nginx access/error log, Docker app log를 함께 대조한다.

## 장애 발생 시 수집 범위

운영 담당자가 우선 확보할 정보:

1. 발생 시각과 사용자 화면의 안전한 오류 코드
2. `X-Request-Id` 또는 화면의 서버 요청 ID
3. 해당 ID 전후의 app container 로그
4. 필요하면 같은 시간대 Nginx 로그
5. 사용 중인 앱 버전/image tag
6. storage backend(local/S3), HTTP status, 재현 작업 종류

파일 원본, 비밀번호, Cookie, Authorization header, S3 credential, `.env` 전체를 장애 보고서에 첨부하지 않는다.

## 민감정보 보호 규칙

공통 logger는 Password/Authorization/Cookie/Token/Secret/Credential/Access Key 계열 key를 redaction한다. 임의 Error message와 stack/path는 그대로 기록하지 않는다. 긴 문자열과 객체 깊이/항목 수도 제한한다.

다음 값은 로그 필드로 추가하지 않는다.

- 편집/삭제 비밀번호와 hash
- Authorization/Cookie/Token
- GitHub token, `.env` secret
- S3 access/secret/session credential
- CAD file bytes 또는 파일 전체 내용
- 사용자 입력 객체 전체 dump
- SQL 문과 parameter 전체 값
- credential이 포함될 수 있는 URL
- local storage path 또는 사용자 원본 locator

기능별 신규 로그를 추가할 때는 식별자/상태/오류 코드처럼 진단에 필요한 최소 필드만 allowlist 방식으로 선택한다.

## Docker 보존 및 rotation

Compose는 기존 정책을 유지한다.

```yaml
logging:
  driver: local
  options:
    max-size: "10m"
    max-file: "5"
```

따라서 로그는 무제한 보존되지 않는다. 약 10 MiB 단위 최대 5개 파일로 순환하며, Docker가 관리하는 실제 구현 세부사항에 따라 현재 로그가 rotation된다. 장애 분석이 필요하면 container 교체/삭제 전에 필요한 시간 범위를 `docker compose logs`로 별도 export한다.

`docker compose down -v`는 로그뿐 아니라 named volume 데이터 삭제 위험이 있으므로 데이터 삭제 승인 없이 사용하지 않는다.

## JSON 확인

production에서 애플리케이션 structured log 한 줄은 독립 JSON 객체여야 한다. Docker의 `--timestamps` 옵션은 JSON 앞에 Docker timestamp를 붙이므로 순수 JSON parser에 직접 전달하려면 timestamp 옵션을 제외하거나 prefix를 제거한다.

원본 애플리케이션 출력 확인 예:

```bash
docker compose --env-file .env -f src/docker-compose.yml logs --no-color app
```

운영 검색에는 문자열 검색으로 충분하며, 중앙 수집기로 연동할 때는 애플리케이션 JSON 필드를 parser 단계에서 추출한다.

## Docker 배포 예

0.23.0 게시 이미지는 다음과 같이 지정할 수 있다.

```env
GHCR_IMAGE=ghcr.io/planner77/layoutmanager:0.23.0
LOG_LEVEL=info
LOG_FORMAT=json
```

적용 후에는 이미지 digest와 앱 버전을 확인하고, 문제가 발생하면 `X-Request-Id`를 기준으로 동일 요청의 lifecycle을 검색한다. `latest`도 제공되지만 운영에서 재현성과 rollback을 중시하면 명시적 버전 태그를 권장한다.

## 릴리스 검증 근거

- PR: #20 `feat: 공통 구조화 로깅 및 요청 추적 개선`
- 최종 PR CI: run `35272622375` PASS
  - TypeScript / ESLint PASS
  - Unit + Integration: 23 files / 105 tests PASS
  - Production build PASS
  - Chromium E2E 34 / 34 PASS
- `main` merge commit: `cf28a011aef3cd8a7090de6f8f66d3beef168414`
- Release tag: `v0.23.0`
- Docker publish workflow: run `35273102719` PASS
- Image: `ghcr.io/planner77/layoutmanager:0.23.0`, `ghcr.io/planner77/layoutmanager:latest`
- Digest: `sha256:c117020ea781cc9b0119fb82d9aa003c245de0b05bde0d7b5ef8ab004754dffe`
- OCI revision: `cf28a011aef3cd8a7090de6f8f66d3beef168414`

## 제한사항

- 브라우저 console은 서버 구조화 로그와 별도이다. 공개 업로드 진단은 사용자가 볼 수 있는 제한된 진단 객체만 다룬다.
- Next.js/framework 또는 제3자 라이브러리가 자체 stdout/stderr를 출력할 수 있으며 모든 외부 로그가 애플리케이션 JSON schema를 따르는 것은 아니다.
- 로그는 원인 파악을 보조하지만 DB/스토리지의 실제 상태 확인을 대체하지 않는다.
- 중앙 장기 보관과 검색/대시보드는 후속 과제로 분리한다.
