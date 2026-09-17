# Release 0.21.1

기준일: 2026-09-18

## 릴리스 범위

- GitHub Issue #14 `사설 IP HTTP 환경에서 전역 로딩의 crypto.randomUUID 호출로 도면 Viewer가 열리지 않음`을 수정했다.
- PR #15 `fix: 사설 IP HTTP 환경의 Viewer 로딩 회귀 수정`을 squash merge했다.
- 전역 로딩 작업 ID 생성에서 `crypto.randomUUID()` 의존성을 제거하고 `GlobalLoadingProvider` 수명 안의 sequence 기반 ID를 사용한다.
- `crypto.randomUUID`가 없는 조건에서도 Viewer의 `/api/cad-files/{versionId}/content` 요청이 시작되고 `dxf-viewer`, `three-dxf-viewer`가 표시 완료 상태에 도달하도록 회귀 테스트를 추가했다.
- DB schema, CAD 원본 저장 구조, API contract, 외부 dependency는 변경하지 않았다.

## 버전 / 소스 / 병합

- 애플리케이션 버전: `0.21.1`
- 버전 단일 기준: `src/package.json`
- PR: #15
- 병합 방식: squash merge
- `main` 병합 commit: `642bde71f9d9c0e1205df66c3828489ff2d4078f`
- 작업 branch `fix/issue-14-insecure-randomuuid`는 저장소의 merge 후 branch 자동 삭제 정책에 의해 삭제되었음을 확인했다.
- Issue #14는 PR의 `Closes #14`에 의해 `completed` 상태로 종료되었음을 확인했다.

## PR CI

PR CI는 GitHub Actions run `35231047884`에서 최종 통과했다.

- Node.js 22.14.0 / `npm ci`: PASS
- Prisma Client 생성: PASS
- TypeScript: PASS
- ESLint: PASS
- Unit / Integration: **22 files / 100 tests PASS**
- Production build: PASS
- Playwright Chromium E2E: **34 / 34 PASS**

신규 `TC-ISSUE14-001`은 페이지 초기화 시 `crypto.randomUUID`를 제거하여 비-Secure Context에서 나타나는 핵심 실패 조건을 결정적으로 모사하고, 콘텐츠 요청 발생·두 DXF renderer 표시 완료·global loading overlay 해제를 검증한다.

`npm ci`는 기존 의존성에 대해 high severity audit 경고 4건을 표시하지만 이번 변경에서 dependency 버전은 변경하지 않았으며 해당 경고는 CI 실패 조건이 아니다.

## 태그

Docker 게시 workflow가 annotated tag `v0.21.1`을 생성했다.

- Tag: `v0.21.1`
- Annotated tag object: `fb5eca8c9b9e70cca870ed37a2b2ab88093da336`
- Tag 대상 commit: `642bde71f9d9c0e1205df66c3828489ff2d4078f`
- Tag message: `Release v0.21.1`

따라서 `v0.21.1`은 PR #15의 실제 squash merge source를 가리킨다.

## GHCR 게시

GitHub Actions `Build and publish Docker image` run `35263308541`이 성공했다.

- 플랫폼: `linux/amd64`
- Version image: `ghcr.io/planner77/layoutmanager:0.21.1`
- Latest image: `ghcr.io/planner77/layoutmanager:latest`
- 두 tag의 게시 digest: `sha256:fbb7b21ab81250a3d0a47fa963683895f57e8c02a9f4ceac57f37170469be451`
- OCI `org.opencontainers.image.revision`: `642bde71f9d9c0e1205df66c3828489ff2d4078f`
- OCI `org.opencontainers.image.version`: `0.21.1`
- workflow는 게시 전 `0.21.1` image가 존재하지 않음을 확인하고 신규 build/push를 수행했다.

`0.21.1`과 `latest`는 동일 manifest-list digest로 게시되었으며 source revision label도 병합 commit과 일치한다.

## 추적 문서

- 요구사항·원인 분석·설계·Acceptance Criteria·검증 상태: `out/Issue14.md`
- 버전 변경 이력: `out/ChangeLog.md`
- 이전 릴리스 기록: `out/Release-0.21.0.md`

## 검증 범위 / 제한

- 자동 브라우저 회귀는 Playwright Chromium에서 수행했다.
- CI는 localhost 기반이므로 실제 사설 IP HTTP 접속 대신 `crypto.randomUUID` 부재를 주입하여 문제의 직접 원인을 재현했다.
- 실제 운영 환경의 `0.19.2` 데이터 volume을 `0.21.1` 이미지에 연결하고 `http://<사설 IP>:<port>`로 접속하는 현장 smoke test는 GitHub Actions에서 수행하지 않았다. 운영 배포 시 별도 확인 대상으로 유지한다.
- 실제 운영 서버 재배포는 이 릴리스의 GHCR 게시 범위에 포함하지 않는다.
