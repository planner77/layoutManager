# Release 0.22.0

기준일: 2026-09-18

## 릴리스 범위

- GitHub Issue #16 `도면 목록의 '현재 버전' 드롭다운 제거 및 토글 방식으로 단일화`를 반영했다.
- PR #19 `feat: 도면 목록 Current 필터를 토글로 단일화`를 squash merge했다.
- 도면 목록의 `전체 / Current / 이전 버전` 드롭다운을 제거하고 `현재 버전만 표시` 토글을 Current Version 필터의 단일 UI로 유지한다.
- 토글 OFF는 Current 여부와 관계없이 전체 Version, ON은 기존 `current=true` 조회를 사용한다.
- 과거 목록 URL의 `current=false`는 목록 UI에서 오류 없이 토글 OFF/전체 Version으로 정규화한다.
- `/api/cad-files?current=false` 서버 조회 계약, Current 지정/교체 API, Location별 Current 최대 1개 제약은 유지한다.
- DB schema, migration, 외부 dependency는 변경하지 않았다.

## 버전 / 소스 / 병합

- 애플리케이션 버전: `0.22.0`
- 버전 단일 기준: `src/package.json`
- 이전 버전: `0.21.1`
- SemVer 변경: 사용자에게 보이는 목록 UI 기능 변경이므로 MINOR
- PR: #19
- 병합 방식: squash merge
- `main` 병합 commit: `1b52661fc5921de0018da1b9e8a7d86f6209395e`
- 작업 branch `feature/issue-16-remove-current-dropdown`는 저장소의 merge 후 branch 자동 삭제 정책에 의해 삭제되었음을 확인했다.
- Issue #16은 PR의 `Closes #16`에 의해 `completed` 상태로 종료되었음을 확인했다.

## PR CI

PR CI는 GitHub Actions run `35269062967`에서 최종 통과했다.

- Node.js 22.14.0 / `npm ci`: PASS
- Prisma Client 생성: PASS
- TypeScript: PASS
- ESLint: PASS
- Unit / Integration: **22 files / 100 tests PASS**
- Production build: PASS
- Playwright Chromium E2E: **34 / 34 PASS**

회귀 검증에는 다음 동작이 포함된다.

- 목록 검색 영역에 `현재 버전` combobox가 표시되지 않는다.
- `현재 버전만 표시` 토글은 OFF → ON → OFF로 정상 전환한다.
- 토글 전환 시 파일명·사업장 등 기존 검색 조건을 유지한다.
- 과거 `current=false` 목록 URL은 Current/이전 Version을 모두 표시한다.
- `/api/cad-files?current=false`는 계속 이전 Version만 조회한다.
- Current 변경 및 Location별 단일 Current 관련 기존 회귀가 통과한다.

`npm ci`는 기존 의존성에 대해 high severity audit 경고 4건을 표시하지만 이번 변경에서 dependency 버전은 변경하지 않았으며 해당 경고는 CI 실패 조건이 아니다.

## 태그

Docker 게시 workflow가 annotated tag `v0.22.0`을 생성했다.

- Tag: `v0.22.0`
- Annotated tag object: `8adaded9237d49b4860a35e9876f9e9ce8215529`
- Tag 대상 commit: `1b52661fc5921de0018da1b9e8a7d86f6209395e`
- Tag message: `Release v0.22.0`

따라서 `v0.22.0`은 PR #19의 실제 squash merge source를 가리킨다.

## GHCR 게시

GitHub Actions `Build and publish Docker image` run `35269494098`이 성공했다.

- 플랫폼: `linux/amd64`
- Version image: `ghcr.io/planner77/layoutmanager:0.22.0`
- Latest image: `ghcr.io/planner77/layoutmanager:latest`
- 두 tag의 게시 digest: `sha256:26de349a0909a5e23e09b3374edb9671497f56700cdbb696d3c1b8eb9a1e3202`
- OCI `org.opencontainers.image.revision`: `1b52661fc5921de0018da1b9e8a7d86f6209395e`
- OCI `org.opencontainers.image.version`: `0.22.0`
- workflow는 게시 전 `0.22.0` image가 존재하지 않음을 확인하고 신규 build/push를 수행했다.

`0.22.0`과 `latest`는 동일 manifest-list digest로 게시되었으며 source revision label도 병합 commit과 일치한다.

## 추적 문서

- 요구사항·분석·구현·Acceptance Criteria·검증 상태: `out/Issue16.md`
- 이전 토글 도입 근거: `out/Issue8.md`
- 이전 릴리스 기록: `out/Release-0.21.1.md`

## 검증 범위 / 제한

- 자동 브라우저 회귀는 Playwright Chromium에서 수행했다.
- API의 `current=false` 호환은 Integration/E2E에서 검증했으며 목록 UI에는 이를 선택하는 드롭다운을 제공하지 않는다.
- 실제 운영 서버 재배포 및 운영 데이터로의 현장 smoke test는 이번 GitHub 릴리스 게시 범위에 포함하지 않는다.
