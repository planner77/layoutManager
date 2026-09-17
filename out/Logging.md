# Structured Logging 운영 가이드

기준일: 2026-09-18  
적용 버전: 0.23.0 (GitHub Issue #18 작업 브랜치)

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

## 제한사항

- 브라우저 console은 서버 구조화 로그와 별도이다. 공개 업로드 진단은 사용자가 볼 수 있는 제한된 진단 객체만 다룬다.
- Next.js/framework 또는 제3자 라이브러리가 자체 stdout/stderr를 출력할 수 있으며 모든 외부 로그가 애플리케이션 JSON schema를 따르는 것은 아니다.
- 로그는 원인 파악을 보조하지만 DB/스토리지의 실제 상태 확인을 대체하지 않는다.
- 중앙 장기 보관과 검색/대시보드는 후속 과제로 분리한다.
