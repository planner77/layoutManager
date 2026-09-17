# Release 0.21.0

기준일: 2026-09-17

## 릴리스 범위

- GitHub Issue #10 `도면 확인 화면의 도면 뷰어 전체 화면 보기 지원`을 구현했다.
- PR #13 `feat: 도면 뷰어 전체 화면 보기 지원`을 squash merge했다.
- 도면 Viewer에서 표준 Fullscreen API를 우선 사용하고, API가 제한되거나 거부되는 환경에서는 CSS fixed viewport fallback을 사용한다.
- 전체 화면에서도 확대·축소·이동·화면 맞춤을 유지하고 `Escape` 또는 `전체 화면 종료`로 복귀한다.
- 전체 화면 전환 시 Viewer/Canvas를 재생성하지 않아 기존 view state를 불필요하게 초기화하지 않는다.
- DB schema, API contract, 외부 의존성 버전은 변경하지 않았다.

## 버전 / 소스 / 병합

- 애플리케이션 버전: `0.21.0`
- 버전 단일 기준: `src/package.json`
- PR: #13
- 병합 방식: squash merge
- `main` 병합 commit: `4fcca920422a0d2477b14203c4070ef1e86acd6e`
- 작업 branch `feature/issue-10-viewer-fullscreen`은 저장소의 merge 후 branch 자동 삭제 정책에 의해 삭제되었음을 확인했다.
- Issue #10은 PR의 `Closes #10`에 의해 `completed` 상태로 종료되었음을 확인했다.

## PR CI

최종 문서 변경까지 포함한 PR CI는 GitHub Actions run `35212248134`에서 통과했다.

- Node.js 22.14.0 / `npm ci`: PASS
- Prisma Client 생성: PASS
- TypeScript: PASS
- ESLint: PASS
- Unit / Integration: **22 files / 100 tests PASS**
- Production build: PASS
- Playwright Chromium E2E: **33 / 33 PASS**

초기 run `35210713169`에서는 native fullscreen 상태에서 Playwright의 합성 `Escape`가 브라우저 UI의 실제 fullscreen 해제를 자동으로 발생시키지 않아 DXF 두 renderer의 ESC 회귀 2건이 실패했다(31/33 PASS). ESC keydown에서 native/fallback 모두 명시적으로 종료하도록 보강했고 이후 기능 CI와 최종 문서 포함 CI가 통과했다.

`npm ci`는 기존 의존성에 대해 high severity audit 경고 4건을 표시하지만 이번 변경에서 의존성 버전을 변경하지 않았으며 해당 경고는 CI 실패 조건이 아니다.

## 태그

Docker 게시 workflow가 annotated tag `v0.21.0`을 생성했다.

- Tag: `v0.21.0`
- Annotated tag object: `a047c3744b987d0c3540225f36c00143e8066c8b`
- Tag 대상 commit: `4fcca920422a0d2477b14203c4070ef1e86acd6e`
- Tag message: `Release v0.21.0`

따라서 `v0.21.0`은 PR #13의 실제 squash merge source를 가리킨다.

## GHCR 게시

GitHub Actions `Build and publish Docker image` run `35212679068`이 성공했다.

- 플랫폼: `linux/amd64`
- Version image: `ghcr.io/planner77/layoutmanager:0.21.0`
- Latest image: `ghcr.io/planner77/layoutmanager:latest`
- 두 tag의 게시 digest: `sha256:1dd5002d03dd2834c1f44c1c6b299a6ed31a3cf49ef2d0754f928d68be31a124`
- OCI `org.opencontainers.image.revision`: `4fcca920422a0d2477b14203c4070ef1e86acd6e`
- OCI `org.opencontainers.image.version`: `0.21.0`
- workflow는 게시 전 `0.21.0` image가 존재하지 않음을 확인하고 신규 build/push를 수행했다.

`0.21.0`과 `latest`가 같은 manifest-list digest로 게시되었으며, source revision label도 병합 commit과 일치한다.

## 추적 문서

- 요구사항·설계·Acceptance Criteria·CI 원인 분석: `out/Issue10.md`
- 사용자/운영 안내: `README.md`
- 버전 변경 이력: `out/ChangeLog.md`
- 에이전트 진입 및 상세 문서 참조 규칙: `AGENTS.md`

## 검증 범위 / 제한

- 자동 브라우저 회귀는 Playwright Chromium에서 수행했다.
- Fullscreen API가 거부되거나 사용할 수 없는 환경은 CSS fallback으로 기능 contract를 유지한다.
- 다른 데스크톱 브라우저별 native fullscreen 정책 차이는 이번 GitHub Actions 자동 브라우저 행렬에서 별도로 실행하지 않았다.
- 실제 운영 서버 재배포는 이 릴리스의 GHCR 게시 범위에 포함하지 않는다.
