# Release 0.23.0

기준일: 2026-09-18

## 릴리스 범위

GitHub Issue #18의 개발·운영 장애 추적을 위한 공통 구조화 로깅 체계를 릴리스한다.

- 애플리케이션 버전: `0.23.0`
- 버전 단일 기준: `src/package.json`
- 이전 버전: `0.22.0`
- SemVer: 공통 로깅/관측성 기능 추가이므로 MINOR
- DB schema/migration 변경 없음
- 외부 dependency 버전 변경 없음

주요 변경:

- 서버 공통 structured logger와 `debug/info/warn/error` 정책
- production/Docker 한 줄 JSON 기본 출력
- `LOG_LEVEL`, `LOG_FORMAT` 런타임 설정
- Password/Authorization/Cookie/Token/Secret/Credential/Access Key 계열 redaction
- 주요 API의 서버 생성 requestId lifecycle 및 `X-Request-Id` 응답 헤더
- 기존 `UploadDiagnostics`와 공통 API logger의 동일 requestId 연결
- 삭제 storage cleanup 및 cache revalidation best-effort 실패 warning 보존
- health 실패의 안전한 내부 진단
- storage cleanup/delete password backfill/DB check maintenance logging 통합
- 운영용 `out/Logging.md` 추가

## PR 및 CI

- PR: #20 `feat: 공통 구조화 로깅 및 요청 추적 개선`
- 최종 PR head: `e811b3394ba328fe5738f6a5980a842d6b5aea19`
- 최종 PR CI: run `35272622375` PASS

최종 CI 결과:

- Node.js 22.14.0 / `npm ci`: PASS
- Prisma Client 생성: PASS
- TypeScript: PASS
- ESLint: PASS
- Vitest Unit / Integration: **23 files / 105 tests PASS**
- Production build: PASS
- Chromium Playwright E2E: **34 / 34 PASS**

CI에서 두 차례 사전 결함을 발견해 수정했다.

1. run `35272211298`: 기존 OBS 회귀 테스트가 warning을 `console.error`로 기대해 2건 실패했다. 새 정책인 `warn → console.warn`에 테스트를 정렬했다.
2. run `35272399422`: Unit/Integration 105건은 통과했으나 Next.js production build가 `/api/health` Route Handler의 optional Request 인자를 거부했다. `GET(request: Request)` 계약으로 복구하고 unit test가 명시적 Request를 전달하도록 수정했다.

`npm ci` 및 Docker build는 기존 dependency에 대해 high severity audit 경고 4건을 표시했다. Issue #18에서는 dependency 버전을 변경하지 않았으며 해당 경고는 CI 실패 조건이 아니다.

## 병합

- 병합 방식: squash merge
- PR #20 merge commit: `cf28a011aef3cd8a7090de6f8f66d3beef168414`
- merge commit은 GitHub verified commit
- 작업 branch: `feature/issue-18-structured-logging`
- 저장소의 merge 후 branch 자동 삭제 정책으로 작업 branch 삭제 확인

## Tag 및 GHCR

`main` 병합 후 `Build and publish Docker image` workflow가 실행되었다.

- Workflow run: `35273102719` PASS
- Release tag: `v0.23.0`
- Annotated tag target: `cf28a011aef3cd8a7090de6f8f66d3beef168414`
- Platform: `linux/amd64`
- GHCR tags:
  - `ghcr.io/planner77/layoutmanager:0.23.0`
  - `ghcr.io/planner77/layoutmanager:latest`
- Digest: `sha256:c117020ea781cc9b0119fb82d9aa003c245de0b05bde0d7b5ef8ab004754dffe`
- OCI source: `https://github.com/planner77/layoutManager`
- OCI revision: `cf28a011aef3cd8a7090de6f8f66d3beef168414`
- OCI version: `0.23.0`

버전 태그와 `latest`는 동일 digest를 가리킨다.

## 운영 적용

운영에서는 명시적 버전 태그 사용을 권장한다.

```env
GHCR_IMAGE=ghcr.io/planner77/layoutmanager:0.23.0
LOG_LEVEL=info
LOG_FORMAT=json
```

Compose의 기존 Docker `local` logging driver와 `max-size=10m`, `max-file=5` rotation은 유지된다. 장애 발생 시 응답의 `X-Request-Id`를 기준으로 `docker compose logs`에서 관련 요청 lifecycle을 검색한다.

상세 설정·event 정의·민감정보 취급·로그 export 절차는 [Structured Logging 운영 가이드](Logging.md)를 기준으로 한다.

## 추적 관계

- 요구사항/분석/Acceptance Criteria: [Issue18](Issue18.md)
- 운영 절차: [Logging](Logging.md)
- 구현 PR: GitHub PR #20
- CI 근거: GitHub Actions run `35272622375`
- 배포 근거: GitHub Actions run `35273102719`
- 릴리스 소스: merge commit `cf28a011aef3cd8a7090de6f8f66d3beef168414`
