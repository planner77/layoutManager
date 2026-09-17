# GitHub Issue #18 — 개발·운영 장애 추적용 공통 구조화 로깅

기준일: 2026-09-18

## 요구사항 명확화

- 서버 API와 maintenance 작업은 공통 base schema를 갖는 structured log를 stdout/stderr에 기록한다.
- production/Docker의 기본 형식은 한 줄 JSON이며 `LOG_LEVEL`과 `LOG_FORMAT`으로 런타임 조정한다.
- 주요 API 요청은 서버에서 생성한 UUID `requestId`를 요청 시작부터 완료/실패까지 동일하게 사용하고 응답 헤더 `X-Request-Id`에 반환한다.
- 클라이언트가 전달한 임의 ID는 신뢰 경계를 넘는 correlation ID로 사용하지 않는다.
- 사용자 공개 오류 메시지와 내부 진단 로그를 분리한다.
- Password, Authorization, Cookie, Token, Secret, Credential, Access Key 계열 필드는 공통 logger에서 redaction한다.
- Error message/stack/path 등 임의 문자열은 그대로 출력하지 않고 안전한 코드/이름 중심으로 제한한다.
- 기존 `UploadDiagnostics`의 requestId, stage, elapsed time, 안전한 원인 정제는 유지하며 API lifecycle logger와 동일 requestId로 연결한다.
- 삭제 후 storage cleanup 및 cache revalidation처럼 기존에 best-effort로 삼키던 실패는 warning event로 보존한다.
- Loki/OpenSearch/Grafana 등 중앙 수집기는 범위 밖이며 Docker stdout/stderr JSON 호환성만 보장한다.

## 기존 구조 분석

- `src/server/upload-observability.ts`: 업로드에 한정해 UUID, stage, elapsed time, safe error chain, JSON line 로그가 이미 존재한다.
- `src/server/http.ts`: 일반 API 실패는 별도 UUID를 생성하고 예상하지 못한 오류만 `console.error`로 남긴다.
- 삭제 API는 성공용 UUID와 실패 응답의 UUID 생성 경로가 달라 실패 상관관계가 끊길 수 있었다.
- health route는 DB 실패를 503으로 변환하지만 서버 로그에 원인을 남기지 않았다.
- 삭제 후 storage cleanup 및 revalidate 실패는 `catch {}`로 무시되었다.
- maintenance script 일부는 JSON을 직접 출력하지만 공통 timestamp/version/level/error 정제가 없었다.
- Docker Compose는 `local` driver, `10m × 5` rotation을 이미 사용하고 있어 stdout/stderr JSON 유지가 적절하다.
- 프런트엔드 업로드 진단은 공개 진단 객체를 `console.error`로 출력한다. 브라우저 로그는 서버 공통 logger 범위 밖이며 Secret 원문을 추가하지 않는 기존 공개 진단 계약을 유지한다.

## 설계

### `src/server/logger.ts`

공통 필드:

- `timestamp`
- `level`: debug / info / warn / error
- `event`
- `appVersion`
- `requestId`
- `component`
- `operation`
- `method`
- `route`
- `httpStatus`
- `outcome`
- `elapsedMs`
- `errorCode`

`RequestLogContext`가 API 시작 로그, 동일 requestId, 경과 시간, 응답 헤더 생성을 담당한다.

민감정보는 key 기반 deny/redaction과 문자열 길이 제한을 적용한다. Error message는 내부 상세를 그대로 출력하지 않는다.

### API lifecycle

대상 route:

- `GET /api/cad-files`
- `POST /api/cad-files`
- `DELETE /api/cad-files/:versionId`
- `GET /api/cad-files/:versionId/content`
- `GET /api/cad-locations/:locationId`
- `PUT /api/cad-locations/:locationId/current`
- `GET /api/health`

모든 정상/오류 응답은 `X-Request-Id`를 포함한다. 업로드는 기존 `UploadDiagnostics.requestId`를 `RequestLogContext`에 전달하여 두 로깅 체계를 동일 ID로 연결한다.

### warning 보존

- `cad_delete_cleanup_pending`: DB 삭제는 확정되었으나 원본 정리가 지연된 경우
- `cache_revalidation_failed`: 확정된 업무 결과를 변경하지 않는 cache refresh 실패
- `health_check_failed`: 공개 503 응답과 별도로 안전한 내부 원인 기록

### maintenance

다음 script를 공통 logger로 전환한다.

- `storage-cleanup.ts`
- `backfill-delete-passwords.ts`
- `db-check.ts`

job ID는 운영 추적용 식별자만 기록하고 storage path/SQL/password는 기록하지 않는다.

## 환경 설정

```env
LOG_LEVEL=info
LOG_FORMAT=json
```

- `LOG_LEVEL`: `debug | info | warn | error`, 잘못된 값은 `info`
- `LOG_FORMAT`: `json | pretty`, Docker production 기본은 `json`
- Compose는 두 값을 runtime environment로 전달한다.
- 기존 Docker `local` logging driver와 `max-size=10m`, `max-file=5`는 유지한다.

## 버전

공통 로깅 인프라 및 API 관측성 기능 추가이므로 SemVer MINOR를 적용한다.

- 기존: `0.22.0`
- 변경: `0.23.0`
- DB schema/migration/dependency 변경 없음
- 기존 JSON payload 필드는 유지하며 주요 API 정상 응답에도 `X-Request-Id`가 추가된다.

## 자동 테스트 추가

`src/tests/unit/logger.test.ts`

- `TC-LOG-001`: 한 줄 JSON + base fields
- `TC-LOG-002`: LOG_LEVEL filtering
- `TC-LOG-003`: password/token/access key redaction 및 긴 문자열 제한
- `TC-LOG-004`: RequestLogContext 동일 requestId와 응답 헤더
- `TC-LOG-005`: Error 원문/credential-like 값 비노출

기존 upload observability, delete route, health route 테스트는 회귀 대상으로 유지한다.

## 현재 검증 상태

이 문서 작성 시점에는 작업 브랜치 소스와 테스트 코드 반영 및 GitHub diff 정적 검토까지 완료했다. PR/Actions CI는 아직 실행하지 않았으므로 typecheck/lint/unit/integration/build/E2E를 PASS로 기록하지 않는다. 최종 자동 검증 결과는 후속 PR/CI 단계에서 갱신한다.

## 작업 브랜치

`feature/issue-18-structured-logging`
